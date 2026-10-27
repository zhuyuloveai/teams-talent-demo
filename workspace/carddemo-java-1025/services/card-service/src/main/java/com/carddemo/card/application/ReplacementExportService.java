package com.carddemo.card.application;

import com.carddemo.card.domain.exception.BusinessRuleException;
import com.carddemo.card.domain.exception.NotFoundException;
import com.carddemo.card.domain.model.CardPermission;
import com.carddemo.card.domain.model.CardReplacement;
import com.carddemo.card.domain.model.ReplacementExport;
import com.carddemo.card.domain.model.ReplacementStatus;
import com.carddemo.card.domain.model.WriteIdempotency;
import com.carddemo.card.domain.repository.CardReplacementRepository;
import com.carddemo.card.domain.repository.ExportRepository;
import com.carddemo.card.infrastructure.security.CardPrincipal;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * 后台补卡队列导出（C03 / D-19）：服务端生成、脱敏（卡号后 4 位）、留审计、24 小时失效。
 */
@Service
public class ReplacementExportService {

    static final String SCOPE_EXPORT = "replacement-export";

    private final CardReplacementRepository replacements;
    private final ExportRepository exports;
    private final IdempotencyService idempotency;
    private final AccessGuard guard;
    private final AuditService audit;
    private final int maxRows;

    public ReplacementExportService(CardReplacementRepository replacements, ExportRepository exports,
                                    IdempotencyService idempotency, AccessGuard guard, AuditService audit,
                                    @Value("${replacement.export.max-rows:1000}") int maxRows) {
        this.replacements = replacements;
        this.exports = exports;
        this.idempotency = idempotency;
        this.guard = guard;
        this.audit = audit;
        this.maxRows = maxRows;
    }

    @Transactional
    public ExportOutcome create(CardPrincipal principal, String status, String idempotencyKey) {
        guard.requirePermission(principal, CardPermission.REPLACEMENT_READ_ANY);
        String digest = IdempotencyService.digest(status == null ? "" : status);
        Optional<WriteIdempotency> prior = idempotency.find(SCOPE_EXPORT, idempotencyKey);
        if (prior.isPresent()) {
            WriteIdempotency record = prior.get();
            if (!record.getRequestDigest().equals(digest) || !record.getSubjectId().equals(principal.userId())) {
                throw new BusinessRuleException("IDEMPOTENCY_KEY_CONFLICT",
                        "Idempotency key was used with a different request or subject.");
            }
            ReplacementExport existing = exports.findById(record.getResultRef())
                    .orElseThrow(() -> new IllegalStateException("Export vanished"));
            return new ExportOutcome(existing, true);
        }
        idempotency.reserve(SCOPE_EXPORT, idempotencyKey, digest, principal.userId());

        List<ReplacementStatus> statuses = status == null || status.isBlank()
                ? List.of(ReplacementStatus.values())
                : List.of(ReplacementStatus.parse(status));
        List<CardReplacement> rows = replacements.findPage(statuses, 0, Math.min(maxRows, 1000));

        StringBuilder csv = new StringBuilder("replacement_id,old_card_last4,new_card_last4,status,fee_amount,"
                + "fee_status,tracking_no,requested_at,status_updated_at\n");
        for (CardReplacement row : rows) {
            csv.append(row.getReplacementId()).append(',')
                    .append(tail(row.getOldCardNumber())).append(',')
                    .append(tail(row.getNewCardNumber())).append(',')
                    .append(row.getStatus()).append(',')
                    .append(row.getFeeAmount()).append(',')
                    .append(row.getFeeStatus()).append(',')
                    .append(row.getTrackingNo() == null ? "" : row.getTrackingNo()).append(',')
                    .append(row.getRequestedAt()).append(',')
                    .append(row.getStatusUpdatedAt()).append('\n');
        }

        ReplacementExport export = new ReplacementExport(UUID.randomUUID().toString(), principal.userId(),
                status == null || status.isBlank() ? null : status, LocalDateTime.now(), rows.size(),
                csv.toString());
        exports.saveExport(export);
        audit.record(principal.userId(), "REPLACEMENT_EXPORT", "EXPORT", export.getExportId(), null, null,
                null, null, UUID.randomUUID().toString(), "{\"rows\":" + rows.size() + "}");
        idempotency.complete(SCOPE_EXPORT, idempotencyKey, export.getExportId(), 201);
        return new ExportOutcome(export, false);
    }

    @Transactional
    public ExportOutcome download(CardPrincipal principal, String exportId) {
        guard.requirePermission(principal, CardPermission.REPLACEMENT_READ_ANY);
        ReplacementExport export = exports.findById(exportId)
                .orElseThrow(() -> new NotFoundException("EXPORT_NOT_FOUND", "Export not found"));
        if (export.isExpired(LocalDateTime.now())) {
            throw new BusinessRuleException("EXPORT_EXPIRED",
                    "Export file has expired; please create a new export.");
        }
        export.recordAccess();
        exports.saveExport(export);
        audit.record(principal.userId(), "REPLACEMENT_EXPORT_DOWNLOAD", "EXPORT", exportId, null, null,
                null, null, UUID.randomUUID().toString(), "{\"rows\":" + export.getRowCount() + "}");
        return new ExportOutcome(export, false);
    }

    private static String tail(String masked) {
        return masked.substring(masked.length() - 4);
    }

    public record ExportOutcome(ReplacementExport export, boolean replayed) {
    }
}

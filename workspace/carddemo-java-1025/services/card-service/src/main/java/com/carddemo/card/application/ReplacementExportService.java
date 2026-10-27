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
        IdempotencyService.Decision decision = idempotency.begin(SCOPE_EXPORT, idempotencyKey, digest,
                principal.userId());
        if (decision.replayed()) {
            ReplacementExport existing = exports.findById(decision.record().getResultRef())
                    .orElseThrow(() -> new IllegalStateException("Export vanished"));
            return new ExportOutcome(existing, true);
        }

        List<ReplacementStatus> statuses = status == null || status.isBlank()
                ? List.of(ReplacementStatus.values())
                : List.of(ReplacementStatus.parse(status));
        List<CardReplacement> rows = replacements.findPage(statuses, 0, Math.min(maxRows, 1000));

        StringBuilder csv = new StringBuilder("replacement_id,old_card_last4,new_card_last4,status,fee_amount,"
                + "fee_status,tracking_no,requested_at,status_updated_at\n");
        for (CardReplacement row : rows) {
            csv.append(csvField(row.getReplacementId())).append(',')
                    .append(csvField(tail(row.getOldCardNumber()))).append(',')
                    .append(csvField(tail(row.getNewCardNumber()))).append(',')
                    .append(csvField(row.getStatus().name())).append(',')
                    .append(csvField(row.getFeeAmount().toPlainString())).append(',')
                    .append(csvField(row.getFeeStatus().name())).append(',')
                    .append(csvField(row.getTrackingNo())).append(',')
                    .append(csvField(row.getRequestedAt().toString())).append(',')
                    .append(csvField(row.getStatusUpdatedAt().toString())).append('\n');
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
        if (masked == null || masked.length() < 4) {
            return "";
        }
        return masked.substring(masked.length() - 4);
    }

    /**
     * RFC4180 字段转义 + 表格公式注入防护（002-C09）：
     * 含逗号/引号/换行的值加引号并双写内部引号；以 = + - @ 或制表/回车开头的值前置单引号，
     * 使电子表格按文本处理而不是执行公式。
     */
    static String csvField(String value) {
        if (value == null) {
            return "";
        }
        String escaped = value;
        if (!escaped.isEmpty()) {
            char first = escaped.charAt(0);
            if (first == '=' || first == '+' || first == '-' || first == '@' || first == '\t' || first == '\r') {
                escaped = "'" + escaped;
            }
        }
        if (escaped.indexOf(',') >= 0 || escaped.indexOf('"') >= 0 || escaped.indexOf('\n') >= 0
                || escaped.indexOf('\r') >= 0) {
            escaped = "\"" + escaped.replace("\"", "\"\"") + "\"";
        }
        return escaped;
    }

    public record ExportOutcome(ReplacementExport export, boolean replayed) {
    }
}

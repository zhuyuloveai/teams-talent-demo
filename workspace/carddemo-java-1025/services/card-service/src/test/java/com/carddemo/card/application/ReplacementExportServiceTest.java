package com.carddemo.card.application;

import com.carddemo.card.domain.exception.BusinessRuleException;
import com.carddemo.card.domain.model.CardReplacement;
import com.carddemo.card.domain.model.FeeStatus;
import com.carddemo.card.domain.model.ReplacementExport;
import com.carddemo.card.domain.model.WriteIdempotency;
import com.carddemo.card.domain.model.ReplacementStatus;
import com.carddemo.card.domain.repository.CardReplacementRepository;
import com.carddemo.card.domain.repository.ExportRepository;
import com.carddemo.card.infrastructure.security.CardPrincipal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ReplacementExportServiceTest {

    @Mock
    private CardReplacementRepository replacements;
    @Mock
    private ExportRepository exports;
    @Mock
    private IdempotencyService idempotency;
    @Mock
    private AccessGuard guard;
    @Mock
    private AuditService audit;

    private ReplacementExportService service;
    private final CardPrincipal operator = new CardPrincipal("ADMIN002", "A");

    @BeforeEach
    void setUp() {
        service = new ReplacementExportService(replacements, exports, idempotency, guard, audit, 1000);
    }

    private CardReplacement order() {
        return new CardReplacement("REP-1", "334455******9900", "334455******1234", "cipher",
                "00000000006", "000000006", "ADDR-000000006", "LOST", "STANDARD",
                new BigDecimal("50.00"), FeeStatus.CHARGED, LocalDateTime.now(), "repl-1");
    }

    @Test
    void exportCsvIsMaskedAndRecordedWithAudit() {
        when(replacements.findPage(any(), eq(0), eq(1000))).thenReturn(List.of(order()));
        when(exports.saveExport(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ReplacementExportService.ExportOutcome outcome = service.create(operator, null, "export-1");

        assertThat(outcome.export().getRowCount()).isEqualTo(1);
        assertThat(outcome.export().getExpiresAt())
                .isEqualTo(outcome.export().getGeneratedAt().plusHours(24));
        assertThat(outcome.export().getFileRef())
                .contains("9900")
                .doesNotContain("3344556677889900")
                .doesNotContain("3344551234567890");
        verify(guard).requirePermission(operator, "replacement:read:any");
        verify(audit).record(eq("ADMIN002"), eq("REPLACEMENT_EXPORT"), eq("EXPORT"), anyString(), any(),
                any(), any(), any(), anyString(), anyString());
        verify(idempotency).complete(eq("replacement-export"), eq("export-1"), anyString(), eq(201));
    }

    @Test
    void downloadWithin24HoursSucceeds() {
        ReplacementExport export = new ReplacementExport("EXP-1", "ADMIN002", null,
                LocalDateTime.now().minusHours(23).minusMinutes(59), 1, "csv");
        when(exports.findById("EXP-1")).thenReturn(Optional.of(export));

        assertThat(service.download(operator, "EXP-1").export().getAccessCount()).isEqualTo(1);
        verify(exports).saveExport(export);
    }

    @Test
    void downloadAtOrAfter24HoursIsExpired() {
        ReplacementExport export = new ReplacementExport("EXP-1", "ADMIN002", null,
                LocalDateTime.now().minusHours(24), 1, "csv");
        when(exports.findById("EXP-1")).thenReturn(Optional.of(export));

        assertThatThrownBy(() -> service.download(operator, "EXP-1"))
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("EXPORT_EXPIRED");
    }

    @Test
    void replayReturnsTheOriginalExportWithoutRegenerating() {
        ReplacementExport export = new ReplacementExport("EXP-9", "ADMIN002", null, LocalDateTime.now(), 1, "csv");
        WriteIdempotency record = new WriteIdempotency("replacement-export", "export-9",
                IdempotencyService.digest(""), "ADMIN002", LocalDateTime.now());
        record.recordResult("EXP-9", 201);
        when(idempotency.find("replacement-export", "export-9")).thenReturn(Optional.of(record));
        when(exports.findById("EXP-9")).thenReturn(Optional.of(export));

        ReplacementExportService.ExportOutcome outcome = service.create(operator, null, "export-9");

        assertThat(outcome.replayed()).isTrue();
        assertThat(outcome.export().getExportId()).isEqualTo("EXP-9");
        verify(replacements, org.mockito.Mockito.never()).findPage(any(), eq(0), eq(1000));
    }
}

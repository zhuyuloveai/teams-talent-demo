package com.carddemo.card.application;

import com.carddemo.card.domain.model.OpsAlert;
import com.carddemo.card.domain.repository.AccessRepository;
import com.carddemo.card.domain.repository.AlertRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AlertServiceTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 28, 12, 0);

    @Mock
    private AccessRepository access;
    @Mock
    private AlertRepository alerts;

    private AlertService service;

    @BeforeEach
    void setUp() {
        service = new AlertService(access, alerts, 3);
    }

    @Test
    void fourthLossWithinWindowRaisesSingleAlert() {
        when(access.existsAttempt("LOSS", "loss-4")).thenReturn(false);
        when(access.countAttempts(eq("LOSS"), eq("000000006"), any())).thenReturn(4L);
        when(alerts.existsByTypeAndSubjectSince(eq(OpsAlert.LOSS_FREQUENCY), eq("000000006"), any()))
                .thenReturn(false);

        boolean raised = service.registerAttempt("LOSS", "000000006", "loss-4", NOW);

        assertThat(raised).isTrue();
        verify(access).saveAttempt(anyString(), eq("LOSS"), eq("000000006"), eq("loss-4"), eq(NOW));
        ArgumentCaptor<OpsAlert> captor = ArgumentCaptor.forClass(OpsAlert.class);
        verify(alerts).saveAlert(captor.capture());
        assertThat(captor.getValue().getAlertType()).isEqualTo(OpsAlert.LOSS_FREQUENCY);
        assertThat(captor.getValue().getOccurrences()).isEqualTo(4);
    }

    @Test
    void thirdAttemptDoesNotRaiseAlert() {
        when(access.countAttempts(eq("LOSS"), eq("000000006"), any())).thenReturn(3L);

        assertThat(service.registerAttempt("LOSS", "000000006", "loss-3", NOW)).isFalse();
        verify(alerts, never()).saveAlert(any());
    }

    @Test
    void replayDoesNotCountOrAlertAgain() {
        when(access.existsAttempt("LOSS", "loss-1")).thenReturn(true);

        assertThat(service.registerAttempt("LOSS", "000000006", "loss-1", NOW)).isFalse();
        verify(access, never()).saveAttempt(anyString(), anyString(), anyString(), anyString(), any());
        verify(alerts, never()).saveAlert(any());
    }

    @Test
    void replacementBurstRaisesFrequencyAndManualReviewAlertsIndependently() {
        when(access.countAttempts(eq("REPLACEMENT"), eq("334455******9900"), any())).thenReturn(5L);
        when(alerts.existsByTypeAndSubjectSince(eq(OpsAlert.REPLACEMENT_FREQUENCY),
                eq("334455******9900"), any())).thenReturn(false);

        assertThat(service.registerAttempt("REPLACEMENT", "334455******9900", "repl-5", NOW)).isTrue();

        ArgumentCaptor<OpsAlert> captor = ArgumentCaptor.forClass(OpsAlert.class);
        verify(alerts, times(2)).saveAlert(captor.capture());
        List<OpsAlert> saved = captor.getAllValues();
        assertThat(saved).extracting(OpsAlert::getAlertType)
                .containsExactlyInAnyOrder(OpsAlert.REPLACEMENT_FREQUENCY, OpsAlert.MANUAL_REVIEW_REQUIRED);
    }

    @Test
    void trackingAlertIsRaisedOncePerOrder() {
        when(alerts.existsByTypeAndSubjectSince(eq(OpsAlert.TRACKING_MISSING_24H), eq("REP-1"), any()))
                .thenReturn(false);
        LocalDateTime shippedAt = NOW.minusHours(30);

        assertThat(service.raiseTrackingAlert("REP-1", shippedAt, NOW)).isTrue();
        verify(alerts).saveAlert(any());

        when(alerts.existsByTypeAndSubjectSince(eq(OpsAlert.TRACKING_MISSING_24H), eq("REP-1"), any()))
                .thenReturn(true);
        assertThat(service.raiseTrackingAlert("REP-1", shippedAt, NOW)).isFalse();
    }
}

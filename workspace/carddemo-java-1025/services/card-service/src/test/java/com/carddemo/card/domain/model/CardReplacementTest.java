package com.carddemo.card.domain.model;

import com.carddemo.card.domain.exception.BusinessRuleException;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CardReplacementTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 28, 10, 0);

    private CardReplacement replacement(FeeStatus feeStatus) {
        return new CardReplacement("REP-1", "334455******9900", "334455******1234", "cipher", "00000000006",
                "000000006", "ADDR-000000006", "LOST", "STANDARD", new BigDecimal("50.00"), feeStatus,
                NOW, "repl-1");
    }

    @Test
    void startsRequestedWithActiveKey() {
        CardReplacement replacement = replacement(FeeStatus.FEE_PENDING);
        assertThat(replacement.getStatus()).isEqualTo(ReplacementStatus.REQUESTED);
        assertThat(replacement.getActiveKey()).isEqualTo("334455******9900");
    }

    @Test
    void stateMachineAllowsOnlyDocumentedEdges() {
        assertThat(ReplacementStatus.REQUESTED.canTransitionTo(ReplacementStatus.CARD_PRODUCED)).isTrue();
        assertThat(ReplacementStatus.REQUESTED.canTransitionTo(ReplacementStatus.CANCELLED)).isTrue();
        assertThat(ReplacementStatus.REQUESTED.canTransitionTo(ReplacementStatus.ACTIVATED)).isFalse();
        assertThat(ReplacementStatus.CARD_PRODUCED.canTransitionTo(ReplacementStatus.SHIPPED)).isTrue();
        assertThat(ReplacementStatus.CARD_PRODUCED.canTransitionTo(ReplacementStatus.CANCELLED)).isFalse();
        assertThat(ReplacementStatus.SHIPPED.canTransitionTo(ReplacementStatus.ACTIVATED)).isTrue();
        assertThat(ReplacementStatus.ACTIVATED.canTransitionTo(ReplacementStatus.CANCELLED)).isFalse();
        assertThat(ReplacementStatus.CANCELLED.canTransitionTo(ReplacementStatus.ACTIVATED)).isFalse();
    }

    @Test
    void jumpFromRequestedToActivatedIsRejected() {
        CardReplacement replacement = replacement(FeeStatus.WAIVED);
        assertThatThrownBy(() -> replacement.markActivated(NOW))
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("INVALID_STATE_TRANSITION");
    }

    @Test
    void shippedRequiresTrackingAndEstimatedArrivalAtLeastThreeDays() {
        CardReplacement replacement = replacement(FeeStatus.WAIVED);
        replacement.markProduced(NOW);

        assertThatThrownBy(() -> replacement.markShipped(NOW, " ", LocalDate.of(2026, 11, 2)))
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("VALIDATION_FAILED");
        assertThatThrownBy(() -> replacement.markShipped(NOW, "SF123", LocalDate.of(2026, 10, 30)))
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("VALIDATION_FAILED");

        replacement.markShipped(NOW, "SF123", LocalDate.of(2026, 10, 31));
        assertThat(replacement.getStatus()).isEqualTo(ReplacementStatus.SHIPPED);
        assertThat(replacement.getTrackingNo()).isEqualTo("SF123");
    }

    @Test
    void activatedAndCancelledClearActiveKeySoNewOrderMayStart() {
        CardReplacement replacement = replacement(FeeStatus.WAIVED);
        replacement.markCancelled(NOW);
        assertThat(replacement.getActiveKey()).isNull();

        CardReplacement second = replacement(FeeStatus.WAIVED);
        second.markProduced(NOW);
        second.markShipped(NOW, "SF123", LocalDate.of(2026, 10, 31));
        second.markActivated(NOW);
        assertThat(second.getActiveKey()).isNull();
        assertThat(second.getStatus()).isEqualTo(ReplacementStatus.ACTIVATED);
    }

    @Test
    void feeLifecycleChargesRefundsAndStops() {
        CardReplacement charged = replacement(FeeStatus.FEE_PENDING);
        charged.assignFeeBatchId("8000000000000001");
        charged.markCharged();
        assertThat(charged.getFeeStatus()).isEqualTo(FeeStatus.CHARGED);
        charged.assignRefundBatchId("8000000000000002");
        charged.markRefunded();
        assertThat(charged.getFeeStatus()).isEqualTo(FeeStatus.REFUNDED);

        CardReplacement stopped = replacement(FeeStatus.FEE_PENDING);
        stopped.markFeeStopped();
        assertThat(stopped.getFeeStatus()).isEqualTo(FeeStatus.WAIVED);
    }

    @Test
    void chargingWithoutAssignedBatchIsRejected() {
        CardReplacement replacement = replacement(FeeStatus.FEE_PENDING);
        assertThatThrownBy(replacement::markCharged)
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("INVALID_FEE_STATE");
    }
}

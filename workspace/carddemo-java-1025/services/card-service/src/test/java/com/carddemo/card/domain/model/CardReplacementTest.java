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
    private static final String CARD_REF = "a".repeat(64);

    private CardReplacement replacement(FeeStatus feeStatus) {
        return new CardReplacement("REP-1", "334455******9900", CARD_REF, "old-cipher", "00000000006",
                "000000006", "ADDR-000000006", "LOST", "STANDARD", new BigDecimal("50.00"), feeStatus,
                feeStatus == FeeStatus.FEE_PENDING ? "8000000000000001" : null, NOW, "repl-1");
    }

    @Test
    void startsRequestedWithStableCardIdentityAndPendingNumber() {
        CardReplacement replacement = replacement(FeeStatus.FEE_PENDING);
        assertThat(replacement.getStatus()).isEqualTo(ReplacementStatus.REQUESTED);
        // 002-C03：进行中唯一性按稳定卡身份，不使用掩码
        assertThat(replacement.getActiveKey()).isEqualTo(CARD_REF);
        assertThat(replacement.getOldCardNumber()).isEqualTo("334455******9900");
        assertThat(replacement.getNumberStatus()).isEqualTo(NumberStatus.PENDING);
        assertThat(replacement.getNewCardNumber()).isNull();
    }

    @Test
    void assigningNumberIsIdempotentAndWritesMaskedCipherAndRef() {
        CardReplacement replacement = replacement(FeeStatus.FEE_PENDING);
        replacement.assignNewCard("334455******1234", "cipher", "b".repeat(64));
        assertThat(replacement.getNumberStatus()).isEqualTo(NumberStatus.ASSIGNED);
        assertThat(replacement.getNewCardNumber()).isEqualTo("334455******1234");

        replacement.assignNewCard("334455******1234", "cipher", "b".repeat(64));
        assertThat(replacement.getNumberStatus()).isEqualTo(NumberStatus.ASSIGNED);

        assertThatThrownBy(() -> replacement.assignNewCard("334455******9999", "cipher2", "c".repeat(64)))
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("INVALID_STATE_TRANSITION");
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

    /** 002-A002：取消冲回必须经过 REFUND_PENDING，不能从 FEE_PENDING 直接标成已退款。 */
    @Test
    void feeLifecycleChargesRefundsAndStops() {
        CardReplacement charged = replacement(FeeStatus.FEE_PENDING);
        charged.markCharged();
        assertThat(charged.getFeeStatus()).isEqualTo(FeeStatus.CHARGED);

        charged.requestRefund("8000000000000002");
        assertThat(charged.getFeeStatus()).isEqualTo(FeeStatus.REFUND_PENDING);
        assertThat(charged.getRefundBatchId()).isEqualTo("8000000000000002");
        charged.markRefunded();
        assertThat(charged.getFeeStatus()).isEqualTo(FeeStatus.REFUNDED);

        CardReplacement stopped = replacement(FeeStatus.FEE_PENDING);
        stopped.markFeeStopped();
        assertThat(stopped.getFeeStatus()).isEqualTo(FeeStatus.WAIVED);
    }

    /** 收费状态未知（FEE_PENDING）时取消：必须先进入 REFUND_PENDING 由下游核实，不能直接 WAIVED。 */
    @Test
    void refundCanBeRequestedWhileChargeOutcomeIsStillPending() {
        CardReplacement replacement = replacement(FeeStatus.FEE_PENDING);
        replacement.requestRefund("8000000000000003");
        assertThat(replacement.getFeeStatus()).isEqualTo(FeeStatus.REFUND_PENDING);
        replacement.markRefunded();
        assertThat(replacement.getFeeStatus()).isEqualTo(FeeStatus.REFUNDED);
    }

    @Test
    void refundingWaivedFeeIsRejected() {
        CardReplacement waived = replacement(FeeStatus.WAIVED);
        assertThatThrownBy(() -> waived.requestRefund("8000000000000004"))
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("INVALID_FEE_STATE");
    }

    @Test
    void chargingWithoutAssignedBatchIsRejected() {
        CardReplacement replacement = new CardReplacement("REP-2", "334455******9900", CARD_REF, "old-cipher",
                "00000000006", "000000006", "ADDR-000000006", "LOST", "STANDARD", new BigDecimal("50.00"),
                FeeStatus.FEE_PENDING, null, NOW, "repl-2");
        assertThatThrownBy(replacement::markCharged)
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("INVALID_FEE_STATE");
    }
}

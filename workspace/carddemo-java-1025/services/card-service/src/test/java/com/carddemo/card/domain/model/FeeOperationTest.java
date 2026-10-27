package com.carddemo.card.domain.model;

import com.carddemo.card.domain.exception.BusinessRuleException;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 002-A002/A006：持久费用操作的状态机与"待重试"判定。 */
class FeeOperationTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 28, 10, 0);

    private FeeOperation charge() {
        return new FeeOperation(FeeOperation.chargeKey("REP-1"), "REP-1", FeeOperation.KIND_CHARGE,
                "8000000000000001", new BigDecimal("50.00"), "00000000006", "334455******9900", "cipher", NOW);
    }

    @Test
    void keysAndInitialState() {
        FeeOperation operation = charge();
        assertThat(operation.getOperationKey()).isEqualTo("FEE-REP-1");
        assertThat(FeeOperation.refundKey("REP-1")).isEqualTo("REFUND-REP-1");
        assertThat(operation.getState()).isEqualTo(FeeOperation.STATE_PENDING);
        assertThat(operation.needsAttempt()).isTrue();
    }

    @Test
    void sendingCountsAttemptsAndFailureKeepsRetrying() {
        FeeOperation operation = charge();
        operation.markSending(NOW);
        assertThat(operation.getState()).isEqualTo(FeeOperation.STATE_SENT);
        assertThat(operation.getAttempts()).isEqualTo(1);

        operation.markAttemptFailed("downstream timeout", NOW);
        assertThat(operation.getState()).isEqualTo("FAILED");
        assertThat(operation.getLastError()).isEqualTo("downstream timeout");
        assertThat(operation.needsAttempt()).isTrue();
    }

    @Test
    void cancelFenceStopsRetryAndSuccessIsTerminal() {
        FeeOperation operation = charge();
        operation.requestCancel(NOW);
        assertThat(operation.getState()).isEqualTo(FeeOperation.STATE_CANCEL_REQUESTED);
        assertThat(operation.needsAttempt()).isFalse();

        FeeOperation succeeded = charge();
        succeeded.markSending(NOW);
        succeeded.markSucceeded(NOW);
        assertThat(succeeded.needsAttempt()).isFalse();
        // 已成功的收费不能被"取消请求"回退成未收费
        succeeded.requestCancel(NOW);
        assertThat(succeeded.getState()).isEqualTo(FeeOperation.STATE_SUCCEEDED);
    }

    @Test
    void terminalRefundStateDoesNotRetry() {
        FeeOperation refund = new FeeOperation(FeeOperation.refundKey("REP-1"), "REP-1",
                FeeOperation.KIND_REFUND, "8000000000000002", new BigDecimal("50.00"), "00000000006",
                "334455******9900", "cipher", NOW);
        refund.markSending(NOW);
        refund.markRefunded(NOW);
        assertThat(refund.needsAttempt()).isFalse();
        assertThatThrownBy(() -> refund.markSending(NOW))
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("INVALID_FEE_STATE");
    }
}

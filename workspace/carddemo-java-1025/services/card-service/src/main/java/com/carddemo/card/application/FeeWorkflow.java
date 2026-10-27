package com.carddemo.card.application;

import com.carddemo.card.domain.model.CardReplacement;
import com.carddemo.card.domain.model.FeeOperation;
import com.carddemo.card.domain.model.FeeStatus;
import com.carddemo.card.domain.repository.CardReplacementRepository;
import com.carddemo.card.domain.repository.FeeOperationRepository;
import com.carddemo.card.domain.service.CardNumberCipher;
import com.carddemo.card.infrastructure.client.ReplacementFeeClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;

/**
 * 补卡费用执行与恢复（002-A002/A006）：
 * 状态判定与迁移在短事务里完成（行锁），远端调用在事务之外进行，
 * 因此不会把网络等待持在数据库连接上，也不会出现 REQUIRES_NEW 嵌套借连接的问题。
 * <ul>
 *   <li>收费：CANCEL_REQUESTED / 已终态时不再发起；远端返回成功才确认 CHARGED；</li>
 *   <li>退款：拿到"确定未执行"才置 WAIVED；未知保持待重试；已执行则同一身份只退一次；</li>
 *   <li>worker 定期重投 PENDING/SENT/FAILED 与未完成退款，进程重启后继续。</li>
 * </ul>
 */
@Service
public class FeeWorkflow {

    private static final Logger log = LoggerFactory.getLogger(FeeWorkflow.class);

    private final FeeOperationRepository operations;
    private final CardReplacementRepository replacements;
    private final ReplacementFeeClient fees;
    private final CardNumberCipher cipher;
    private final TransactionTemplate tx;
    private final boolean schedulingEnabled;

    public FeeWorkflow(FeeOperationRepository operations, CardReplacementRepository replacements,
                       ReplacementFeeClient fees, CardNumberCipher cipher,
                       PlatformTransactionManager transactionManager,
                       @Value("${card.workers.enabled:true}") boolean schedulingEnabled) {
        this.operations = operations;
        this.replacements = replacements;
        this.fees = fees;
        this.cipher = cipher;
        this.tx = new TransactionTemplate(transactionManager);
        this.schedulingEnabled = schedulingEnabled;
    }

    @Scheduled(fixedDelayString = "${card.fee.retry-interval-ms:5000}",
            initialDelayString = "${card.fee.initial-delay-ms:2000}")
    public void scheduledSweep() {
        if (!schedulingEnabled) {
            return;
        }
        try {
            sweepDueOperations();
        } catch (RuntimeException ex) {
            log.warn("fee recovery round failed: {}", ex.getMessage());
        }
    }

    /** 重投所有仍需要执行的操作（含上轮失败）。 */
    public int sweepDueOperations() {
        int executed = 0;
        for (FeeOperation operation : operations.findRetryable(50)) {
            if (FeeOperation.KIND_CHARGE.equals(operation.getKind())) {
                charge(operation.getReplacementId());
            } else {
                refund(operation.getReplacementId());
            }
            executed++;
        }
        return executed;
    }

    /** 收费（可在创建提交后调用，也可由 worker 重投）；远端按同一 effectId 幂等。 */
    public void charge(String replacementId) {
        String key = FeeOperation.chargeKey(replacementId);
        Boolean claimed = tx.execute(status -> {
            FeeOperation operation = operations.findByKeyForUpdate(key).orElse(null);
            if (operation == null || !operation.needsAttempt()) {
                return false;
            }
            operation.markSending(LocalDateTime.now());
            operations.saveOperation(operation);
            return true;
        });
        if (!Boolean.TRUE.equals(claimed)) {
            return;
        }
        FeeOperation operation = operations.findByKey(key).orElse(null);
        if (operation == null) {
            return;
        }
        try {
            ReplacementFeeClient.FeeResult result = fees.charge(operation.getEffectId(),
                    cipher.decrypt(operation.getCardCipher()), operation.getAmount());
            tx.executeWithoutResult(status -> confirmCharge(replacementId, key, result));
        } catch (RuntimeException ex) {
            tx.executeWithoutResult(status -> recordFailure(key, ex));
        }
    }

    /** 退款（取消提交后调用，也可由 worker 重投）。同一退款身份只产生一次资金效果。 */
    public void refund(String replacementId) {
        String refreshKey = FeeOperation.refundKey(replacementId);
        Boolean claimed = tx.execute(status -> {
            FeeOperation refund = operations.findByKeyForUpdate(refreshKey).orElse(null);
            if (refund == null || !refund.needsAttempt()) {
                return false;
            }
            refund.markSending(LocalDateTime.now());
            operations.saveOperation(refund);
            return true;
        });
        if (!Boolean.TRUE.equals(claimed)) {
            return;
        }
        FeeOperation refund = operations.findByKey(refreshKey).orElse(null);
        FeeOperation charge = operations.findByKey(FeeOperation.chargeKey(replacementId)).orElse(null);
        if (refund == null || charge == null) {
            return;
        }
        try {
            ReplacementFeeClient.FeeResult result = fees.refund(refund.getEffectId(), charge.getEffectId(),
                    refund.getAmount(), cipher.decrypt(charge.getCardCipher()));
            tx.executeWithoutResult(status -> confirmRefund(replacementId, refreshKey, result));
        } catch (RuntimeException ex) {
            tx.executeWithoutResult(status -> recordFailure(refreshKey, ex));
        }
    }

    private void confirmCharge(String replacementId, String key, ReplacementFeeClient.FeeResult result) {
        FeeOperation operation = operations.findByKeyForUpdate(key).orElse(null);
        if (operation == null) {
            return;
        }
        operation.markSucceeded(LocalDateTime.now());
        operations.saveOperation(operation);

        CardReplacement replacement = replacements.findByIdForUpdate(replacementId).orElse(null);
        if (replacement == null) {
            return;
        }
        if (replacement.getFeeStatus() == FeeStatus.FEE_PENDING) {
            replacement.markCharged();
            replacements.saveReplacement(replacement);
        }
    }

    private void confirmRefund(String replacementId, String key, ReplacementFeeClient.FeeResult result) {
        FeeOperation refund = operations.findByKeyForUpdate(key).orElse(null);
        if (refund == null) {
            return;
        }
        CardReplacement replacement = replacements.findByIdForUpdate(replacementId).orElse(null);
        if (!result.executed()) {
            // 下游确认原收费未执行：停收、无资金，并释放退款操作（交易侧已落取消栅栏）。
            refund.markCancelled(LocalDateTime.now());
            operations.saveOperation(refund);
            FeeOperation charge = operations.findByKeyForUpdate(FeeOperation.chargeKey(replacementId)).orElse(null);
            if (charge != null && charge.needsAttempt()) {
                charge.markCancelled(LocalDateTime.now());
                operations.saveOperation(charge);
            }
            if (replacement != null && replacement.getFeeStatus() != FeeStatus.WAIVED) {
                replacement.markFeeStopped();
                replacements.saveReplacement(replacement);
            }
            return;
        }
        refund.markRefunded(LocalDateTime.now());
        operations.saveOperation(refund);
        if (replacement != null && replacement.getFeeStatus() == FeeStatus.REFUND_PENDING) {
            replacement.markRefunded();
            replacements.saveReplacement(replacement);
        }
    }

    private void recordFailure(String key, RuntimeException error) {
        FeeOperation operation = operations.findByKeyForUpdate(key).orElse(null);
        if (operation == null) {
            return;
        }
        // 取消栅栏已竖立时不再重试收费；退款操作保持 FAILED 等待下一轮（未知状态不能当未执行）。
        if (FeeOperation.KIND_CHARGE.equals(operation.getKind())
                && FeeOperation.STATE_CANCEL_REQUESTED.equals(operation.getState())) {
            return;
        }
        operation.markAttemptFailed(error.getMessage(), LocalDateTime.now());
        operations.saveOperation(operation);
        log.warn("fee operation attempt failed: key={} error={}", key, error.getMessage());
    }
}

package com.carddemo.card.domain.model;

import com.carddemo.card.domain.exception.BusinessRuleException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 补卡费用的持久操作（002-A002/A006）：`FEE-<replacementId>` / `REFUND-<replacementId>` 各一行，
 * 携带稳定 effect 身份、金额、账户与卡密文，使收费/退款可在进程重启后按同一身份重投。
 * <p>
 * 状态：PENDING →（发送中）SENT →（下游确认）SUCCEEDED；
 * PENDING/SENT/FAILED →（取消栅栏）CANCEL_REQUESTED →（核实未执行）CANCELLED；
 * 退款行：PENDING/SENT/FAILED → REFUNDED。
 */
@Entity
@Table(name = "fee_operation")
public class FeeOperation {

    public static final String KIND_CHARGE = "CHARGE";
    public static final String KIND_REFUND = "REFUND";

    public static final String STATE_PENDING = "PENDING";
    public static final String STATE_SENT = "SENT";
    public static final String STATE_SUCCEEDED = "SUCCEEDED";
    public static final String STATE_CANCEL_REQUESTED = "CANCEL_REQUESTED";
    public static final String STATE_CANCELLED = "CANCELLED";
    public static final String STATE_REFUNDED = "REFUNDED";

    @Id
    @Column(name = "operation_key", length = 64, nullable = false, updatable = false)
    private String operationKey;

    @Column(name = "replacement_id", length = 32, nullable = false, updatable = false)
    private String replacementId;

    @Column(name = "kind", length = 8, nullable = false, updatable = false)
    private String kind;

    @Column(name = "effect_id", length = 32, nullable = false, updatable = false)
    private String effectId;

    @Column(name = "amount", nullable = false, precision = 12, scale = 2, updatable = false)
    private BigDecimal amount;

    @Column(name = "account_id", length = 11, nullable = false, updatable = false)
    private String accountId;

    @Column(name = "card_number_masked", length = 19, nullable = false, updatable = false)
    private String cardNumberMasked;

    @Column(name = "card_cipher", length = 64, nullable = false, updatable = false)
    private String cardCipher;

    @Column(name = "state", length = 24, nullable = false)
    private String state;

    @Column(name = "attempts", nullable = false)
    private int attempts;

    @Column(name = "last_error", length = 500)
    private String lastError;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected FeeOperation() {
        // for JPA
    }

    public FeeOperation(String operationKey, String replacementId, String kind, String effectId,
                        BigDecimal amount, String accountId, String cardNumberMasked, String cardCipher,
                        LocalDateTime now) {
        this.operationKey = operationKey;
        this.replacementId = replacementId;
        this.kind = kind;
        this.effectId = effectId;
        this.amount = amount;
        this.accountId = accountId;
        this.cardNumberMasked = cardNumberMasked;
        this.cardCipher = cardCipher;
        this.state = STATE_PENDING;
        this.attempts = 0;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public static String chargeKey(String replacementId) {
        return "FEE-" + replacementId;
    }

    public static String refundKey(String replacementId) {
        return "REFUND-" + replacementId;
    }

    public void markSending(LocalDateTime now) {
        if (!STATE_PENDING.equals(state) && !STATE_SENT.equals(state) && !"FAILED".equals(state)) {
            throw new BusinessRuleException("INVALID_FEE_STATE", "Fee operation cannot be sent in state " + state);
        }
        this.state = STATE_SENT;
        this.attempts++;
        this.updatedAt = now;
    }

    public void markSucceeded(LocalDateTime now) {
        this.state = STATE_SUCCEEDED;
        this.lastError = null;
        this.updatedAt = now;
    }

    public void markAttemptFailed(String error, LocalDateTime now) {
        this.state = "FAILED";
        this.lastError = truncate(error);
        this.updatedAt = now;
    }

    public void requestCancel(LocalDateTime now) {
        if (STATE_SUCCEEDED.equals(state) || STATE_CANCELLED.equals(state) || STATE_REFUNDED.equals(state)) {
            return;
        }
        this.state = STATE_CANCEL_REQUESTED;
        this.updatedAt = now;
    }

    public void markCancelled(LocalDateTime now) {
        this.state = STATE_CANCELLED;
        this.updatedAt = now;
    }

    public void markRefunded(LocalDateTime now) {
        this.state = STATE_REFUNDED;
        this.lastError = null;
        this.updatedAt = now;
    }

    /** 是否仍需要尝试（含上一轮失败）。 */
    public boolean needsAttempt() {
        return STATE_PENDING.equals(state) || STATE_SENT.equals(state) || "FAILED".equals(state);
    }

    private static String truncate(String error) {
        if (error == null) {
            return null;
        }
        return error.length() <= 500 ? error : error.substring(0, 500);
    }

    public String getOperationKey() {
        return operationKey;
    }

    public String getReplacementId() {
        return replacementId;
    }

    public String getKind() {
        return kind;
    }

    public String getEffectId() {
        return effectId;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public String getAccountId() {
        return accountId;
    }

    public String getCardNumberMasked() {
        return cardNumberMasked;
    }

    public String getCardCipher() {
        return cardCipher;
    }

    public String getState() {
        return state;
    }

    public int getAttempts() {
        return attempts;
    }

    public String getLastError() {
        return lastError;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
}

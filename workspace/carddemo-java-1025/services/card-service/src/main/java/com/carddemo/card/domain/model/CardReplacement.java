package com.carddemo.card.domain.model;

import com.carddemo.card.domain.exception.BusinessRuleException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 补卡工单聚合（REQ-2026-002 / REQ-LOST-03..06）。
 * 状态迁移只允许 {@link ReplacementStatus#canTransitionTo} 声明的边；
 * feeStatus：FEE_PENDING → CHARGED | WAIVED；CHARGED → REFUND_PENDING → REFUNDED；
 * FEE_PENDING（收费状态未知时已决定冲回）→ REFUND_PENDING。
 * <p>
 * 002-C03：进行中唯一性与工单归属使用 {@code oldCardRef}（{@link com.carddemo.card.domain.service.CardRef}）稳定卡身份，
 * 不再使用"前 6 + 后 4"掩码；掩码列只用于展示。
 * 002-C08：受理时即可落库，新卡号分配为独立步骤（{@link NumberStatus}）。
 */
@Entity
@Table(name = "card_replacement")
public class CardReplacement {

    @Id
    @Column(name = "replacement_id", length = 32, nullable = false, updatable = false)
    private String replacementId;

    @Column(name = "old_card_number", length = 19, nullable = false, updatable = false)
    private String oldCardNumber;

    @Column(name = "old_card_ref", length = 64, updatable = false)
    private String oldCardRef;

    /** 旧卡完整卡号密文（002-C08）：仅用于补号/恢复时的 BIN 与新卡建立，不参与展示。 */
    @Column(name = "old_card_cipher", length = 64, updatable = false)
    private String oldCardCipher;

    @Column(name = "new_card_number", length = 19)
    private String newCardNumber;

    @Column(name = "new_card_ref", length = 64)
    private String newCardRef;

    @Column(name = "new_card_cipher", length = 64)
    private String newCardCipher;

    @Enumerated(EnumType.STRING)
    @Column(name = "number_status", length = 16, nullable = false)
    private NumberStatus numberStatus;

    @Column(name = "account_id", length = 11, nullable = false, updatable = false)
    private String accountId;

    @Column(name = "customer_id", length = 9, nullable = false, updatable = false)
    private String customerId;

    @Column(name = "address_id", length = 32, nullable = false)
    private String addressId;

    @Column(name = "reason", length = 16, nullable = false)
    private String reason;

    @Column(name = "delivery_method", length = 16, nullable = false)
    private String deliveryMethod;

    @Column(name = "fee_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal feeAmount;

    @Enumerated(EnumType.STRING)
    @Column(name = "fee_status", length = 16, nullable = false)
    private FeeStatus feeStatus;

    @Column(name = "fee_batch_id", length = 32)
    private String feeBatchId;

    @Column(name = "refund_batch_id", length = 32)
    private String refundBatchId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 16, nullable = false)
    private ReplacementStatus status;

    @Column(name = "tracking_no", length = 32)
    private String trackingNo;

    @Column(name = "estimated_arrival")
    private LocalDate estimatedArrival;

    @Column(name = "requested_at", nullable = false)
    private LocalDateTime requestedAt;

    @Column(name = "produced_at")
    private LocalDateTime producedAt;

    @Column(name = "shipped_at")
    private LocalDateTime shippedAt;

    @Column(name = "activated_at")
    private LocalDateTime activatedAt;

    @Column(name = "cancelled_at")
    private LocalDateTime cancelledAt;

    @Column(name = "idempotency_key", length = 64, nullable = false, updatable = false)
    private String idempotencyKey;

    /** 进行中唯一约束载体：进行中等于旧卡稳定身份，终态置空（BR-LOST-06）。 */
    @Column(name = "active_key", length = 64)
    private String activeKey;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected CardReplacement() {
        // for JPA
    }

    public CardReplacement(String replacementId, String oldCardNumber, String oldCardRef, String oldCardCipher,
                           String accountId, String customerId, String addressId, String reason,
                           String deliveryMethod, BigDecimal feeAmount, FeeStatus feeStatus, String feeBatchId,
                           LocalDateTime requestedAt, String idempotencyKey) {
        this.replacementId = replacementId;
        this.oldCardNumber = oldCardNumber;
        this.oldCardRef = oldCardRef;
        this.oldCardCipher = oldCardCipher;
        this.accountId = accountId;
        this.customerId = customerId;
        this.addressId = addressId;
        this.reason = reason;
        this.deliveryMethod = deliveryMethod;
        this.feeAmount = feeAmount;
        this.feeStatus = feeStatus;
        this.feeBatchId = feeBatchId;
        this.requestedAt = requestedAt;
        this.idempotencyKey = idempotencyKey;
        this.status = ReplacementStatus.REQUESTED;
        this.numberStatus = NumberStatus.PENDING;
        this.activeKey = oldCardRef;
        this.version = 0;
    }

    /** 新卡号生成成功后写入（可重试）：掩码用于展示，密文用于激活，ref 用于唯一性。 */
    public void assignNewCard(String maskedCardNumber, String cipher, String ref) {
        if (numberStatus == NumberStatus.ASSIGNED) {
            if (maskedCardNumber.equals(newCardNumber) && ref.equals(newCardRef)) {
                return;
            }
            throw new BusinessRuleException("INVALID_STATE_TRANSITION",
                    "A card number has already been assigned to this replacement.");
        }
        this.newCardNumber = maskedCardNumber;
        this.newCardCipher = cipher;
        this.newCardRef = ref;
        this.numberStatus = NumberStatus.ASSIGNED;
    }

    public void markCharged() {
        requireFeeStatus(FeeStatus.FEE_PENDING, "CHARGED");
        if (feeBatchId == null) {
            throw new BusinessRuleException("INVALID_FEE_STATE", "Fee batch must be assigned before charging.");
        }
        this.feeStatus = FeeStatus.CHARGED;
    }

    /** 取消时决定冲回：已确认收费或收费状态未知（账户可能已扣）都必须走退款，不能直接 WAIVED。 */
    public void requestRefund(String refundBatchId) {
        if (feeStatus != FeeStatus.CHARGED && feeStatus != FeeStatus.FEE_PENDING) {
            throw new BusinessRuleException("INVALID_FEE_STATE", "Refund cannot be requested in this state.");
        }
        if (this.refundBatchId != null && !this.refundBatchId.equals(refundBatchId)) {
            throw new BusinessRuleException("INVALID_FEE_STATE", "A refund identity is already assigned.");
        }
        this.refundBatchId = refundBatchId;
        this.feeStatus = FeeStatus.REFUND_PENDING;
    }

    public void markRefunded() {
        requireFeeStatus(FeeStatus.REFUND_PENDING, "REFUNDED");
        this.feeStatus = FeeStatus.REFUNDED;
    }

    /**
     * 取消时确认下游确定未收费：停止补收，费用不产生资金影响（WAIVED 为无资金终态）。
     * 从 FEE_PENDING（尚未收费）或 REFUND_PENDING（已决定冲回、经核实未执行）都可落到 WAIVED。
     */
    public void markFeeStopped() {
        if (feeStatus != FeeStatus.FEE_PENDING && feeStatus != FeeStatus.REFUND_PENDING) {
            throw new BusinessRuleException("INVALID_FEE_STATE", "Only a pending fee can be stopped.");
        }
        this.feeStatus = FeeStatus.WAIVED;
    }

    public void markProduced(LocalDateTime at) {
        transition(ReplacementStatus.CARD_PRODUCED);
        this.producedAt = at;
    }

    /** BR-LOST-08：SHIPPED 必须回填单号，预计到达不早于寄出 + 3 天。 */
    public void markShipped(LocalDateTime at, String trackingNo, LocalDate estimatedArrival) {
        if (trackingNo == null || trackingNo.isBlank()) {
            throw new BusinessRuleException("VALIDATION_FAILED", "Tracking number is required when shipping.");
        }
        if (estimatedArrival == null) {
            throw new BusinessRuleException("VALIDATION_FAILED", "Estimated arrival is required when shipping.");
        }
        if (estimatedArrival.isBefore(at.toLocalDate().plusDays(3))) {
            throw new BusinessRuleException("VALIDATION_FAILED",
                    "Estimated arrival must be at least 3 days after the shipping date.");
        }
        transition(ReplacementStatus.SHIPPED);
        this.trackingNo = trackingNo.trim();
        this.estimatedArrival = estimatedArrival;
        this.shippedAt = at;
    }

    public void markActivated(LocalDateTime at) {
        transition(ReplacementStatus.ACTIVATED);
        this.activatedAt = at;
        this.activeKey = null;
    }

    public void markCancelled(LocalDateTime at) {
        transition(ReplacementStatus.CANCELLED);
        this.cancelledAt = at;
        this.activeKey = null;
    }

    private void transition(ReplacementStatus next) {
        if (!status.canTransitionTo(next)) {
            throw new BusinessRuleException("INVALID_STATE_TRANSITION",
                    "Transition " + status + " -> " + next + " is not allowed.");
        }
        this.status = next;
    }

    private void requireFeeStatus(FeeStatus expected, String target) {
        if (feeStatus != expected) {
            throw new BusinessRuleException("INVALID_FEE_STATE", "Fee state cannot move to " + target + ".");
        }
    }

    public String getReplacementId() {
        return replacementId;
    }

    public String getOldCardNumber() {
        return oldCardNumber;
    }

    public String getOldCardRef() {
        return oldCardRef;
    }

    public String getOldCardCipher() {
        return oldCardCipher;
    }

    public String getNewCardNumber() {
        return newCardNumber;
    }

    public String getNewCardRef() {
        return newCardRef;
    }

    public String getNewCardCipher() {
        return newCardCipher;
    }

    public NumberStatus getNumberStatus() {
        return numberStatus;
    }

    public String getAccountId() {
        return accountId;
    }

    public String getCustomerId() {
        return customerId;
    }

    public String getAddressId() {
        return addressId;
    }

    public String getReason() {
        return reason;
    }

    public String getDeliveryMethod() {
        return deliveryMethod;
    }

    public BigDecimal getFeeAmount() {
        return feeAmount;
    }

    public FeeStatus getFeeStatus() {
        return feeStatus;
    }

    public String getFeeBatchId() {
        return feeBatchId;
    }

    public String getRefundBatchId() {
        return refundBatchId;
    }

    public ReplacementStatus getStatus() {
        return status;
    }

    public String getTrackingNo() {
        return trackingNo;
    }

    public LocalDate getEstimatedArrival() {
        return estimatedArrival;
    }

    public LocalDateTime getRequestedAt() {
        return requestedAt;
    }

    public LocalDateTime getProducedAt() {
        return producedAt;
    }

    public LocalDateTime getShippedAt() {
        return shippedAt;
    }

    public LocalDateTime getActivatedAt() {
        return activatedAt;
    }

    public LocalDateTime getCancelledAt() {
        return cancelledAt;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public String getActiveKey() {
        return activeKey;
    }

    public long getVersion() {
        return version;
    }

    public LocalDateTime getStatusUpdatedAt() {
        if (cancelledAt != null) {
            return cancelledAt;
        }
        if (activatedAt != null) {
            return activatedAt;
        }
        if (shippedAt != null) {
            return shippedAt;
        }
        if (producedAt != null) {
            return producedAt;
        }
        return requestedAt;
    }
}

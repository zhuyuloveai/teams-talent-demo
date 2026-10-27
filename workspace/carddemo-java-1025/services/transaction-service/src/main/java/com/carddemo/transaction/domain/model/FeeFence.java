package com.carddemo.transaction.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 取消栅栏（002-A003）：退款核实到"原收费确定未执行"时落一行，之后任何迟到的同身份收费请求都必须被拒绝，
 * 否则取消后仍可能扣费。与原收费请求共用同一 advisory lock 读写，保证判定与栅栏写入原子。
 */
@Entity
@Table(name = "replacement_fee_fence")
public class FeeFence {

    @Id
    @Column(name = "fee_transaction_id", length = 16, nullable = false, updatable = false)
    private String feeTransactionId;

    @Column(name = "reason", length = 64, nullable = false, updatable = false)
    private String reason;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    protected FeeFence() {
        // for JPA
    }

    public FeeFence(String feeTransactionId, String reason, LocalDateTime createdAt) {
        this.feeTransactionId = feeTransactionId;
        this.reason = reason;
        this.createdAt = createdAt;
    }

    public String getFeeTransactionId() {
        return feeTransactionId;
    }

    public String getReason() {
        return reason;
    }
}

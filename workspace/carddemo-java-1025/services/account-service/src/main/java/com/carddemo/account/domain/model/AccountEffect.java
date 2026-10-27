package com.carddemo.account.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 账户资金作用记录（REQ-2026-002 §4.3）：调用方按稳定 effectId 提交，
 * 同一 effectId 重试只生效一次；FEE 增加欠款，REFUND 减少欠款。
 */
@Entity
@Table(name = "account_effect")
public class AccountEffect {

    @Id
    @Column(name = "effect_id", length = 32, nullable = false, updatable = false)
    private String effectId;

    @Column(name = "account_id", length = 11, nullable = false, updatable = false)
    private String accountId;

    @Column(name = "kind", length = 8, nullable = false, updatable = false)
    private String kind;

    @Column(name = "amount", nullable = false, precision = 12, scale = 2, updatable = false)
    private BigDecimal amount;

    @Column(name = "balance_after", nullable = false, precision = 12, scale = 2)
    private BigDecimal balanceAfter;

    @Column(name = "applied_at", nullable = false, updatable = false)
    private LocalDateTime appliedAt;

    protected AccountEffect() {
        // for JPA
    }

    public AccountEffect(String effectId, String accountId, String kind, BigDecimal amount,
                         BigDecimal balanceAfter, LocalDateTime appliedAt) {
        this.effectId = effectId;
        this.accountId = accountId;
        this.kind = kind;
        this.amount = amount;
        this.balanceAfter = balanceAfter;
        this.appliedAt = appliedAt;
    }

    public String getEffectId() {
        return effectId;
    }

    public String getAccountId() {
        return accountId;
    }

    public String getKind() {
        return kind;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public BigDecimal getBalanceAfter() {
        return balanceAfter;
    }

    public LocalDateTime getAppliedAt() {
        return appliedAt;
    }
}

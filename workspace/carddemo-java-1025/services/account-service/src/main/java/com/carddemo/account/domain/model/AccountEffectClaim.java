package com.carddemo.account.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 稳定 effect 的到达/取消仲裁记录（002-A003-R2）。
 * <p>
 * 资金提交端（account-service）先以独立事务登记 CLAIMED，再在同一行锁内应用资金并置 APPLIED。
 * 取消/退款可以先写 CANCEL_REQUESTED（请求在途）或 CANCELLED（尚无任何资金请求到达），
 * 因此"已到达但尚未提交"的 FEE 请求与取消互斥：要么被取消拦下（不动资金），要么先提交再由退款冲回一次。
 */
@Entity
@Table(name = "account_effect_claim")
public class AccountEffectClaim {

    public static final String STATE_CLAIMED = "CLAIMED";
    public static final String STATE_APPLIED = "APPLIED";
    public static final String STATE_CANCEL_REQUESTED = "CANCEL_REQUESTED";
    public static final String STATE_CANCELLED = "CANCELLED";

    @Id
    @Column(name = "effect_id", length = 32, nullable = false, updatable = false)
    private String effectId;

    @Column(name = "kind", length = 8)
    private String kind;

    @Column(name = "account_id", length = 11)
    private String accountId;

    @Column(name = "amount", precision = 12, scale = 2)
    private BigDecimal amount;

    @Column(name = "state", length = 24, nullable = false)
    private String state;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected AccountEffectClaim() {
        // for JPA
    }

    public AccountEffectClaim(String effectId, String kind, String accountId, BigDecimal amount, String state,
                              LocalDateTime now) {
        this.effectId = effectId;
        this.kind = kind;
        this.accountId = accountId;
        this.amount = amount;
        this.state = state;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public boolean matches(String kind, String accountId, BigDecimal amount) {
        return this.kind != null && this.kind.equals(kind)
                && this.accountId != null && this.accountId.equals(accountId)
                && this.amount != null && this.amount.compareTo(amount) == 0;
    }

    /** 请求到达后、资金提交前登记（或重复登记同一身份）。 */
    public void markClaimed(String kind, String accountId, BigDecimal amount, LocalDateTime now) {
        this.kind = kind;
        this.accountId = accountId;
        this.amount = amount;
        this.state = STATE_CLAIMED;
        this.updatedAt = now;
    }

    public void markApplied(LocalDateTime now) {
        this.state = STATE_APPLIED;
        this.updatedAt = now;
    }

    /** 取消：资金已在途 → CANCEL_REQUESTED（由资金侧在锁内决定放弃），已应用 → 保持 APPLIED 由退款冲回。 */
    public String requestCancel(LocalDateTime now) {
        if (STATE_APPLIED.equals(state)) {
            return state;
        }
        this.state = STATE_CANCELLED.equals(state) ? STATE_CANCELLED : STATE_CANCEL_REQUESTED;
        this.updatedAt = now;
        return state;
    }

    public void markCancelled(LocalDateTime now) {
        this.state = STATE_CANCELLED;
        this.updatedAt = now;
    }

    public boolean isCancellationRequested() {
        return STATE_CANCEL_REQUESTED.equals(state) || STATE_CANCELLED.equals(state);
    }

    public String getEffectId() {
        return effectId;
    }

    public String getKind() {
        return kind;
    }

    public String getAccountId() {
        return accountId;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public String getState() {
        return state;
    }
}

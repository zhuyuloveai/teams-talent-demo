package com.carddemo.account.domain.model;

import com.carddemo.account.domain.exception.BusinessRuleException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Objects;

/**
 * 账户聚合根。对应遗留 VSAM 文件 ACCTDAT，记录布局见 copybook CVACT01Y（RECLN 300）。
 */
@Entity
@Table(name = "account")
public class Account {

    private static final BigDecimal ZERO = new BigDecimal("0.00");

    @Id
    @Column(name = "account_id", length = 11, nullable = false, updatable = false)
    private String accountId;

    @Column(name = "active_status", length = 1, nullable = false)
    private String activeStatus;

    @Column(name = "current_balance", nullable = false, precision = 12, scale = 2)
    private BigDecimal currentBalance;

    @Column(name = "credit_limit", nullable = false, precision = 12, scale = 2)
    private BigDecimal creditLimit;

    @Column(name = "cash_credit_limit", nullable = false, precision = 12, scale = 2)
    private BigDecimal cashCreditLimit;

    @Column(name = "open_date", nullable = false)
    private LocalDate openDate;

    @Column(name = "expiration_date", nullable = false)
    private LocalDate expirationDate;

    @Column(name = "reissue_date", nullable = false)
    private LocalDate reissueDate;

    @Column(name = "current_cycle_credit", nullable = false, precision = 12, scale = 2)
    private BigDecimal currentCycleCredit;

    @Column(name = "current_cycle_debit", nullable = false, precision = 12, scale = 2)
    private BigDecimal currentCycleDebit;

    @Column(name = "address_zip", length = 10)
    private String addressZip;

    @Column(name = "group_id", length = 10)
    private String groupId;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected Account() {
        // for JPA
    }

    public Account(String accountId, AccountDetails details) {
        this.accountId = accountId;
        applyDetails(details);
        this.version = 0;
    }

    /**
     * BR-POST-006：记账。amount 为正表示消费/借款（增加欠款与本期贷方），为负表示还款/冲正。
     */
    public void applyPosting(BigDecimal amount) {
        Objects.requireNonNull(amount, "amount must not be null");
        currentBalance = currentBalance.add(amount);
        if (amount.signum() >= 0) {
            currentCycleCredit = currentCycleCredit.add(amount);
        } else {
            currentCycleDebit = currentCycleDebit.add(amount);
        }
    }

    /**
     * REQ-2026-002 §4.3：补卡费/冲回资金作用。FEE 增加欠款，REFUND 减少欠款（可为负=溢缴）；
     * effectId 幂等由调用方（AccountEffectService）保证。
     */
    public void applyEffect(String kind, BigDecimal amount) {
        if (!"FEE".equals(kind) && !"REFUND".equals(kind)) {
            throw new BusinessRuleException("INVALID_EFFECT_KIND", "Effect kind must be FEE or REFUND.");
        }
        if (amount == null || amount.signum() <= 0) {
            throw new BusinessRuleException("INVALID_EFFECT_AMOUNT", "Effect amount must be greater than zero.");
        }
        applyPosting("FEE".equals(kind) ? amount : amount.negate());
    }

    /**
     * BR-BILL-001/002：账单支付，金额恒等于当前余额，仅减少余额，不改本期贷/借累计。
     */
    public void applyBillPayment(BigDecimal amount) {
        if (amount.signum() <= 0) {
            throw new BusinessRuleException("INVALID_PAYMENT_AMOUNT", "Payment amount must be greater than zero.");
        }
        if (currentBalance.signum() <= 0) {
            throw new BusinessRuleException("NOTHING_TO_PAY", "You have nothing to pay...");
        }
        if (amount.compareTo(currentBalance) > 0) {
            throw new BusinessRuleException("PAYMENT_EXCEEDS_BALANCE",
                    "Payment amount must not exceed the current balance.");
        }
        currentBalance = currentBalance.subtract(amount);
    }

    /**
     * BR-INT-001：月度利息入账，并清零本期贷/借累计（CBACT04C 1050-UPDATE-ACCOUNT）。
     */
    public void accrueInterest(BigDecimal interest) {
        Objects.requireNonNull(interest, "interest must not be null");
        currentBalance = currentBalance.add(interest);
        currentCycleCredit = ZERO;
        currentCycleDebit = ZERO;
    }

    /**
     * NR-REWARD-01：营销返现入账，直接冲减欠款；余额可为负（表示溢缴/贷记）。
     * 幂等由调用方以 rewardId 保证（见 account_service.reward_credit）。
     */
    public void applyCashback(BigDecimal amount) {
        if (amount == null || amount.signum() <= 0) {
            throw new BusinessRuleException("INVALID_CASHBACK_AMOUNT",
                    "Cashback amount must be greater than zero.");
        }
        currentBalance = currentBalance.subtract(amount);
    }

    public boolean matches(AccountDetails details) {
        return activeStatus.equals(details.activeStatus())
                && currentBalance.compareTo(details.currentBalance()) == 0
                && creditLimit.compareTo(details.creditLimit()) == 0
                && cashCreditLimit.compareTo(details.cashCreditLimit()) == 0
                && openDate.equals(details.openDate())
                && expirationDate.equals(details.expirationDate())
                && reissueDate.equals(details.reissueDate())
                && currentCycleCredit.compareTo(details.currentCycleCredit()) == 0
                && currentCycleDebit.compareTo(details.currentCycleDebit()) == 0
                && Objects.equals(addressZip, details.addressZip())
                && Objects.equals(groupId, details.groupId());
    }

    /**
     * R-ACTUP-08/09/10：账户字段校验与更新。
     */
    public void applyDetails(AccountDetails details) {
        Objects.requireNonNull(details, "details must not be null");
        if (!"Y".equals(details.activeStatus()) && !"N".equals(details.activeStatus())) {
            throw new BusinessRuleException("INVALID_ACCOUNT_STATUS", "Account Status must be Y or N.");
        }
        requireAmount(details.currentBalance(), "Current Balance");
        requireAmount(details.creditLimit(), "Credit Limit");
        requireAmount(details.cashCreditLimit(), "Cash Credit Limit");
        requireAmount(details.currentCycleCredit(), "Current Cycle Credit Limit");
        requireAmount(details.currentCycleDebit(), "Current Cycle Debit Limit");
        requireDate(details.openDate(), "Open Date");
        requireDate(details.expirationDate(), "Expiration Date");
        requireDate(details.reissueDate(), "Reissue Date");

        this.activeStatus = details.activeStatus();
        this.currentBalance = details.currentBalance();
        this.creditLimit = details.creditLimit();
        this.cashCreditLimit = details.cashCreditLimit();
        this.openDate = details.openDate();
        this.expirationDate = details.expirationDate();
        this.reissueDate = details.reissueDate();
        this.currentCycleCredit = details.currentCycleCredit();
        this.currentCycleDebit = details.currentCycleDebit();
        this.addressZip = details.addressZip();
        this.groupId = details.groupId();
    }

    private static void requireAmount(BigDecimal value, String field) {
        if (value == null) {
            throw new BusinessRuleException("MISSING_AMOUNT", field + " must be supplied.");
        }
    }

    private static void requireDate(LocalDate value, String field) {
        if (value == null) {
            throw new BusinessRuleException("MISSING_DATE", field + " must be supplied.");
        }
        if (value.getYear() < 1900 || value.getYear() > 2099) {
            throw new BusinessRuleException("INVALID_DATE", field + " : Century is not valid.");
        }
    }

    public String getAccountId() {
        return accountId;
    }

    public String getActiveStatus() {
        return activeStatus;
    }

    public BigDecimal getCurrentBalance() {
        return currentBalance;
    }

    public BigDecimal getCreditLimit() {
        return creditLimit;
    }

    public BigDecimal getCashCreditLimit() {
        return cashCreditLimit;
    }

    public LocalDate getOpenDate() {
        return openDate;
    }

    public LocalDate getExpirationDate() {
        return expirationDate;
    }

    public LocalDate getReissueDate() {
        return reissueDate;
    }

    public BigDecimal getCurrentCycleCredit() {
        return currentCycleCredit;
    }

    public BigDecimal getCurrentCycleDebit() {
        return currentCycleDebit;
    }

    public String getAddressZip() {
        return addressZip;
    }

    public String getGroupId() {
        return groupId;
    }

    public long getVersion() {
        return version;
    }
}

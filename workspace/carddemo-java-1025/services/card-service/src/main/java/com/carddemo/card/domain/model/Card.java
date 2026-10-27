package com.carddemo.card.domain.model;

import com.carddemo.card.domain.exception.BusinessRuleException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Objects;
import java.util.regex.Pattern;

/**
 * 卡片聚合根。对应遗留 VSAM 文件 CARDDATA，记录布局见 copybook CVACT02Y（RECLN 150）。
 * <p>
 * REQ-2026-002（BR-LOST-01/04）：{@code card_status} 表达生命周期（ACTIVE/LOST/FROZEN/CLOSED），
 * {@code active_status} 保留为遗留"可交易"标志（Y/N）。挂失要求两者同时为 ACTIVE/Y；
 * 新卡建立后未激活时 {@code card_status=ACTIVE} 但 {@code active_status=N}，授权按"卡未激活"拒绝。
 */
@Entity
@Table(name = "card")
public class Card {

    private static final String VALIDATION_FAILED = "VALIDATION_FAILED";
    private static final Pattern CARD_NUMBER = Pattern.compile("\\d{16}");
    private static final Pattern ACCOUNT_ID = Pattern.compile("\\d{11}");
    private static final Pattern CUSTOMER_ID = Pattern.compile("\\d{9}");
    private static final Pattern CVV = Pattern.compile("\\d{3}");
    private static final Pattern EMBOSSED_NAME = Pattern.compile("[A-Za-z]+(?: [A-Za-z]+)*");

    public static final String STATUS_ACTIVE = "ACTIVE";
    public static final String STATUS_LOST = "LOST";
    public static final String STATUS_FROZEN = "FROZEN";
    public static final String STATUS_CLOSED = "CLOSED";

    public static final String LEVEL_CLASSIC = "CLASSIC";
    public static final String LEVEL_GOLD = "GOLD";
    public static final String LEVEL_PLATINUM = "PLATINUM";

    @Id
    @Column(name = "card_number", length = 16, nullable = false, updatable = false)
    private String cardNumber;

    @Column(name = "account_id", length = 11, nullable = false, updatable = false)
    private String accountId;

    @Column(name = "customer_id", length = 9, nullable = false, updatable = false)
    private String customerId;

    @Column(name = "cvv", length = 3, nullable = false, updatable = false)
    private String cvv;

    @Column(name = "embossed_name", length = 50, nullable = false)
    private String embossedName;

    @Column(name = "expiration_date", nullable = false)
    private LocalDate expirationDate;

    @Column(name = "active_status", length = 1, nullable = false)
    private String activeStatus;

    @Column(name = "card_status", length = 16, nullable = false)
    private String cardStatus;

    @Column(name = "card_level", length = 16, nullable = false)
    private String cardLevel;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected Card() {
        // for JPA
    }

    public Card(CardRegistration registration) {
        this(registration, STATUS_ACTIVE, LEVEL_CLASSIC);
    }

    public Card(CardRegistration registration, String cardStatus, String cardLevel) {
        Objects.requireNonNull(registration, "registration must not be null");
        this.cardNumber = requireIdentifier(registration.cardNumber(), CARD_NUMBER, 16, "Card Number");
        this.accountId = requireIdentifier(registration.accountId(), ACCOUNT_ID, 11, "Account ID");
        this.customerId = requireIdentifier(registration.customerId(), CUSTOMER_ID, 9, "Customer ID");
        this.cvv = requireCvv(registration.cvv());
        this.embossedName = requireEmbossedName(registration.embossedName());
        this.expirationDate = requireExpirationDate(registration.expirationDate());
        this.activeStatus = requireActiveStatus(registration.activeStatus());
        this.cardStatus = requireCardStatus(cardStatus);
        this.cardLevel = requireCardLevel(cardLevel);
        this.version = 0;
    }

    /**
     * BR-CARD-07/08/09 + NR-CARD-01：卡片维护只改卡面名、状态与到期月/年。
     * 到期日保留原日，该月不存在该日时取该月最后一天；CVV 一律不改写。
     */
    public void applyMaintenance(String embossedName, String activeStatus, int expiryMonth, int expiryYear) {
        String newName = requireEmbossedName(embossedName);
        String newStatus = requireActiveStatus(activeStatus);
        requireExpiryMonth(expiryMonth);
        requireExpiryYear(expiryYear);
        LocalDate newExpiration = expiryDateFor(expiryMonth, expiryYear);
        this.embossedName = newName;
        this.activeStatus = newStatus;
        this.expirationDate = newExpiration;
    }

    /**
     * BR-LOST-01：仅 ACTIVE 且已激活（可交易）的卡可挂失；状态不可回退（BR-LOST-02/04）。
     */
    public void markLost() {
        if (!STATUS_ACTIVE.equals(cardStatus) || !"Y".equals(activeStatus)) {
            throw new BusinessRuleException("CARD_NOT_ACTIVE", "Card status does not support loss.");
        }
        this.cardStatus = STATUS_LOST;
        this.activeStatus = "N";
    }

    /** 补卡工单 ACTIVATED 后新卡启用（BR-LOST-08）。 */
    public void activate() {
        this.cardStatus = STATUS_ACTIVE;
        this.activeStatus = "Y";
    }

    private LocalDate expiryDateFor(int expiryMonth, int expiryYear) {
        int day = Math.min(expirationDate.getDayOfMonth(), YearMonth.of(expiryYear, expiryMonth).lengthOfMonth());
        return LocalDate.of(expiryYear, expiryMonth, day);
    }

    private static String requireIdentifier(String value, Pattern pattern, int length, String field) {
        if (value == null || !pattern.matcher(value).matches()) {
            throw new BusinessRuleException(VALIDATION_FAILED, field + " must be " + length + " digits.");
        }
        return value;
    }

    private static String requireCvv(String value) {
        if (value == null || !CVV.matcher(value).matches()) {
            throw new BusinessRuleException(VALIDATION_FAILED, "CVV must be 3 digits.");
        }
        return value;
    }

    private static String requireEmbossedName(String value) {
        if (value == null || value.isBlank()) {
            throw new BusinessRuleException(VALIDATION_FAILED, "Embossed Name must be supplied.");
        }
        if (value.length() > 50) {
            throw new BusinessRuleException(VALIDATION_FAILED, "Embossed Name must be 50 characters or less.");
        }
        if (!EMBOSSED_NAME.matcher(value).matches()) {
            throw new BusinessRuleException(VALIDATION_FAILED,
                    "Embossed Name must contain letters and spaces only.");
        }
        return value;
    }

    private static LocalDate requireExpirationDate(LocalDate value) {
        if (value == null) {
            throw new BusinessRuleException(VALIDATION_FAILED, "Expiration Date must be supplied.");
        }
        if (value.getYear() < 1950 || value.getYear() > 2099) {
            throw new BusinessRuleException(VALIDATION_FAILED, "Expiration Date : Year is not valid.");
        }
        return value;
    }

    private static String requireActiveStatus(String value) {
        if (!"Y".equals(value) && !"N".equals(value)) {
            throw new BusinessRuleException(VALIDATION_FAILED, "Card Status must be Y or N.");
        }
        return value;
    }

    private static String requireCardStatus(String value) {
        if (value == null || !(STATUS_ACTIVE.equals(value) || STATUS_LOST.equals(value)
                || STATUS_FROZEN.equals(value) || STATUS_CLOSED.equals(value))) {
            throw new BusinessRuleException(VALIDATION_FAILED,
                    "Card Status must be ACTIVE, LOST, FROZEN or CLOSED.");
        }
        return value;
    }

    private static String requireCardLevel(String value) {
        if (value == null || !(LEVEL_CLASSIC.equals(value) || LEVEL_GOLD.equals(value)
                || LEVEL_PLATINUM.equals(value))) {
            throw new BusinessRuleException(VALIDATION_FAILED,
                    "Card Level must be CLASSIC, GOLD or PLATINUM.");
        }
        return value;
    }

    private static void requireExpiryMonth(int expiryMonth) {
        if (expiryMonth < 1 || expiryMonth > 12) {
            throw new BusinessRuleException(VALIDATION_FAILED, "Expiry Month must be between 1 and 12.");
        }
    }

    private static void requireExpiryYear(int expiryYear) {
        if (expiryYear < 1950 || expiryYear > 2099) {
            throw new BusinessRuleException(VALIDATION_FAILED, "Expiry Year must be between 1950 and 2099.");
        }
    }

    public boolean isTradable() {
        return STATUS_ACTIVE.equals(cardStatus) && "Y".equals(activeStatus);
    }

    public String getCardNumber() {
        return cardNumber;
    }

    public String getAccountId() {
        return accountId;
    }

    public String getCustomerId() {
        return customerId;
    }

    public String getCvv() {
        return cvv;
    }

    public String getEmbossedName() {
        return embossedName;
    }

    public LocalDate getExpirationDate() {
        return expirationDate;
    }

    public String getActiveStatus() {
        return activeStatus;
    }

    public String getCardStatus() {
        return cardStatus;
    }

    public String getCardLevel() {
        return cardLevel;
    }

    public long getVersion() {
        return version;
    }
}

package com.carddemo.transaction.domain.model;

import com.carddemo.transaction.domain.exception.BusinessRuleException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 交易聚合根。对应遗留 VSAM TRANSACT（CVTRA05Y，RECLN 350）。
 * 字段校验对应 BR-TRN-03/04/05；交易号由数据库 max + 1 生成（BR-TRN-07）。
 */
@Entity
@Table(name = "transaction")
public class TransactionRecord {

    private static final BigDecimal MAX_AMOUNT = new BigDecimal("99999999.99");

    @Id
    @Column(name = "transaction_id", length = 16, nullable = false, updatable = false)
    private String transactionId;

    @Column(name = "account_id", length = 11, nullable = false)
    private String accountId;

    @Column(name = "card_number", length = 16)
    private String cardNumber;

    @Column(name = "type_code", length = 2, nullable = false)
    private String typeCode;

    @Column(name = "category_code", length = 4, nullable = false)
    private String categoryCode;

    @Column(name = "source", length = 10, nullable = false)
    private String source;

    @Column(name = "description", length = 100, nullable = false)
    private String description;

    @Column(name = "amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    @Column(name = "merchant_id", length = 9, nullable = false)
    private String merchantId;

    @Column(name = "merchant_name", length = 50, nullable = false)
    private String merchantName;

    @Column(name = "merchant_city", length = 50, nullable = false)
    private String merchantCity;

    @Column(name = "merchant_zip", length = 10, nullable = false)
    private String merchantZip;

    @Column(name = "original_timestamp", nullable = false)
    private LocalDateTime originalTimestamp;

    @Column(name = "processed_timestamp", nullable = false)
    private LocalDateTime processedTimestamp;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 10, nullable = false)
    private TransactionStatus status;

    /** 退款单指向的原收费交易号（002-A002）：非空即退款单，数据库唯一约束保证一笔原收费只退一次。 */
    @Column(name = "original_transaction_id", length = 16, updatable = false)
    private String originalTransactionId;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    /** 关联原收费（仅退款单使用）。 */
    public void linkOriginalTransaction(String originalTransactionId) {
        this.originalTransactionId = originalTransactionId;
    }

    protected TransactionRecord() {
        // for JPA
    }

    public TransactionRecord(String transactionId,
                             String accountId,
                             String cardNumber,
                             String typeCode,
                             String categoryCode,
                             String source,
                             String description,
                             BigDecimal amount,
                             String merchantId,
                             String merchantName,
                             String merchantCity,
                             String merchantZip,
                             LocalDateTime originalTimestamp,
                             LocalDateTime processedTimestamp,
                             TransactionStatus status) {
        requireIdentifier(transactionId, "Transaction ID");
        requireText(accountId, "Account ID");
        requireText(typeCode, "Transaction Type");
        requireDigits(typeCode, "Transaction Type");
        requireText(categoryCode, "Transaction Category");
        requireDigits(categoryCode, "Transaction Category");
        requireText(source, "Transaction Source");
        requireText(description, "Transaction Description");
        requireAmount(amount);
        requireText(merchantId, "Merchant ID");
        requireDigits(merchantId, "Merchant ID");
        requireText(merchantName, "Merchant Name");
        requireText(merchantCity, "Merchant City");
        requireText(merchantZip, "Merchant Zip Code");
        if (originalTimestamp == null) {
            throw invalid("Original Timestamp must be supplied.");
        }
        if (processedTimestamp == null) {
            throw invalid("Processed Timestamp must be supplied.");
        }

        this.transactionId = transactionId;
        this.accountId = accountId;
        this.cardNumber = cardNumber;
        this.typeCode = typeCode;
        this.categoryCode = categoryCode;
        this.source = source;
        this.description = description;
        this.amount = amount;
        this.merchantId = merchantId;
        this.merchantName = merchantName;
        this.merchantCity = merchantCity;
        this.merchantZip = merchantZip;
        this.originalTimestamp = originalTimestamp;
        this.processedTimestamp = processedTimestamp;
        this.status = status == null ? TransactionStatus.POSTED : status;
    }

    /**
     * 账单支付的下游记账成功后置为 POSTED（ADR-005）。
     */
    public void markPosted() {
        this.status = TransactionStatus.POSTED;
    }

    private static void requireIdentifier(String value, String field) {
        if (value == null || value.isBlank()) {
            throw invalid(field + " must be supplied.");
        }
        if (value.length() != 16) {
            throw invalid(field + " must be 16 characters.");
        }
    }

    private static void requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw invalid(field + " must be supplied.");
        }
    }

    private static void requireDigits(String value, String field) {
        if (!value.chars().allMatch(Character::isDigit)) {
            throw invalid(field + " must be numeric.");
        }
    }

    private static void requireAmount(BigDecimal value) {
        if (value == null) {
            throw invalid("Transaction Amount must be supplied.");
        }
        if (value.scale() > 2) {
            throw invalid("Transaction Amount must have at most 2 decimal places.");
        }
        if (value.abs().compareTo(MAX_AMOUNT) > 0) {
            throw invalid("Transaction Amount is out of range.");
        }
    }

    private static BusinessRuleException invalid(String message) {
        return new BusinessRuleException("INVALID_TRANSACTION", message);
    }

    public String getTransactionId() {
        return transactionId;
    }

    public String getOriginalTransactionId() {
        return originalTransactionId;
    }

    public String getAccountId() {
        return accountId;
    }

    public String getCardNumber() {
        return cardNumber;
    }

    public String getTypeCode() {
        return typeCode;
    }

    public String getCategoryCode() {
        return categoryCode;
    }

    public String getSource() {
        return source;
    }

    public String getDescription() {
        return description;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public String getMerchantId() {
        return merchantId;
    }

    public String getMerchantName() {
        return merchantName;
    }

    public String getMerchantCity() {
        return merchantCity;
    }

    public String getMerchantZip() {
        return merchantZip;
    }

    public LocalDateTime getOriginalTimestamp() {
        return originalTimestamp;
    }

    public LocalDateTime getProcessedTimestamp() {
        return processedTimestamp;
    }

    public TransactionStatus getStatus() {
        return status;
    }

    public long getVersion() {
        return version;
    }
}

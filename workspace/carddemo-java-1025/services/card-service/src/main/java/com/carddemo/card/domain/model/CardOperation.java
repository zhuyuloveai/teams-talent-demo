package com.carddemo.card.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/** 卡操作流水（原文 §8.1 card_operation）：卡号掩码列存前 6 + 后 4。 */
@Entity
@Table(name = "card_operation")
public class CardOperation {

    @Id
    @Column(name = "operation_id", length = 32, nullable = false, updatable = false)
    private String operationId;

    @Column(name = "card_number", length = 19, nullable = false, updatable = false)
    private String cardNumber;

    /** 稳定卡身份（002-C03）：工单/流水按它关联，掩码列仅用于展示。 */
    @Column(name = "card_ref", length = 64, updatable = false)
    private String cardRef;

    @Column(name = "operation_type", length = 16, nullable = false, updatable = false)
    private String operationType;

    @Column(name = "status", length = 16, nullable = false, updatable = false)
    private String status;

    @Column(name = "reason", length = 16, updatable = false)
    private String reason;

    @Column(name = "actor", length = 64, nullable = false, updatable = false)
    private String actor;

    @Column(name = "idempotency_key", length = 64, nullable = false, updatable = false)
    private String idempotencyKey;

    @Column(name = "staff_ticket_no", length = 32, updatable = false)
    private String staffTicketNo;

    @Column(name = "identity_verification_ref", length = 64, updatable = false)
    private String identityVerificationRef;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "payload", length = 4000, updatable = false)
    private String payload;

    protected CardOperation() {
        // for JPA
    }

    public CardOperation(String operationId, String cardNumber, String cardRef, String operationType, String status,
                         String reason, String actor, String idempotencyKey, String staffTicketNo,
                         String identityVerificationRef, LocalDateTime createdAt, String payload) {
        this.operationId = operationId;
        this.cardNumber = cardNumber;
        this.cardRef = cardRef;
        this.operationType = operationType;
        this.status = status;
        this.reason = reason;
        this.actor = actor;
        this.idempotencyKey = idempotencyKey;
        this.staffTicketNo = staffTicketNo;
        this.identityVerificationRef = identityVerificationRef;
        this.createdAt = createdAt;
        this.payload = payload;
    }

    public String getOperationId() {
        return operationId;
    }

    public String getCardNumber() {
        return cardNumber;
    }

    public String getCardRef() {
        return cardRef;
    }

    public String getOperationType() {
        return operationType;
    }

    public String getStatus() {
        return status;
    }

    public String getReason() {
        return reason;
    }

    public String getActor() {
        return actor;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public String getStaffTicketNo() {
        return staffTicketNo;
    }

    public String getIdentityVerificationRef() {
        return identityVerificationRef;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public String getPayload() {
        return payload;
    }
}

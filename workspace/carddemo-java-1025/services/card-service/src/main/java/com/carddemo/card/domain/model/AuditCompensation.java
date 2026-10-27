package com.carddemo.card.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 审计写入失败时的持久补偿（002-C01）：主流程不回滚，但保留完整可重放载荷
 * （actor/action/资源、掩码卡号、原因、客服工单、核身引用、trace、payload）。
 * {@code compensationId} 即目标审计事件 id，worker 重放时以它作为主键，保证恰好一条。
 */
@Entity
@Table(name = "audit_compensation")
public class AuditCompensation {

    @Id
    @Column(name = "compensation_id", length = 36, nullable = false, updatable = false)
    private String compensationId;

    @Column(name = "actor", length = 64, nullable = false, updatable = false)
    private String actor;

    @Column(name = "action", length = 32, nullable = false, updatable = false)
    private String action;

    @Column(name = "resource_type", length = 32, nullable = false, updatable = false)
    private String resourceType;

    @Column(name = "resource_id", length = 64, nullable = false, updatable = false)
    private String resourceId;

    @Column(name = "masked_card_number", length = 19, updatable = false)
    private String maskedCardNumber;

    @Column(name = "reason", length = 500, updatable = false)
    private String reason;

    @Column(name = "staff_ticket_no", length = 32, updatable = false)
    private String staffTicketNo;

    @Column(name = "identity_verification_ref", length = 64, updatable = false)
    private String identityVerificationRef;

    @Column(name = "trace_id", length = 36, updatable = false)
    private String traceId;

    @Column(name = "payload", length = 4000, updatable = false)
    private String payload;

    @Column(name = "last_error", length = 500)
    private String lastError;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    protected AuditCompensation() {
        // for JPA
    }

    public AuditCompensation(String compensationId, String actor, String action, String resourceType,
                             String resourceId, String maskedCardNumber, String reason, String staffTicketNo,
                             String identityVerificationRef, String traceId, String payload, String lastError,
                             LocalDateTime createdAt) {
        this.compensationId = compensationId;
        this.actor = actor;
        this.action = action;
        this.resourceType = resourceType;
        this.resourceId = resourceId;
        this.maskedCardNumber = maskedCardNumber;
        this.reason = reason;
        this.staffTicketNo = staffTicketNo;
        this.identityVerificationRef = identityVerificationRef;
        this.traceId = traceId;
        this.payload = payload;
        this.lastError = truncate(lastError);
        this.createdAt = createdAt;
    }

    private static String truncate(String error) {
        if (error == null) {
            return null;
        }
        return error.length() <= 500 ? error : error.substring(0, 500);
    }

    public String getCompensationId() {
        return compensationId;
    }

    public String getActor() {
        return actor;
    }

    public String getAction() {
        return action;
    }

    public String getResourceType() {
        return resourceType;
    }

    public String getResourceId() {
        return resourceId;
    }

    public String getMaskedCardNumber() {
        return maskedCardNumber;
    }

    public String getReason() {
        return reason;
    }

    public String getStaffTicketNo() {
        return staffTicketNo;
    }

    public String getIdentityVerificationRef() {
        return identityVerificationRef;
    }

    public String getTraceId() {
        return traceId;
    }

    public String getPayload() {
        return payload;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
}

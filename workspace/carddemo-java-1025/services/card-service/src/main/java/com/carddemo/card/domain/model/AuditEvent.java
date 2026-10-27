package com.carddemo.card.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/** 审计事件（BR-LOST-07）：展示/日志口径仅后 4 位，掩码列在写入前生成。 */
@Entity
@Table(name = "audit_event")
public class AuditEvent {

    @Id
    @Column(name = "event_id", length = 36, nullable = false, updatable = false)
    private String eventId;

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

    @Column(name = "reason", length = 16, updatable = false)
    private String reason;

    @Column(name = "staff_ticket_no", length = 32, updatable = false)
    private String staffTicketNo;

    @Column(name = "identity_verification_ref", length = 64, updatable = false)
    private String identityVerificationRef;

    @Column(name = "trace_id", length = 36, updatable = false)
    private String traceId;

    @Column(name = "payload", length = 4000, updatable = false)
    private String payload;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    protected AuditEvent() {
        // for JPA
    }

    public AuditEvent(String eventId, String actor, String action, String resourceType, String resourceId,
                      String maskedCardNumber, String reason, String staffTicketNo,
                      String identityVerificationRef, String traceId, String payload, LocalDateTime createdAt) {
        this.eventId = eventId;
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
        this.createdAt = createdAt;
    }

    public String getEventId() {
        return eventId;
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

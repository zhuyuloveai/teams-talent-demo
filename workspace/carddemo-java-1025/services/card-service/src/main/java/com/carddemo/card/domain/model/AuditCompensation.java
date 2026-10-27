package com.carddemo.card.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/** 审计写入失败时的本地补偿记录（BR-LOST-15）——主流程不回滚，但失败必须可见。 */
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

    @Column(name = "payload", length = 4000, updatable = false)
    private String payload;

    @Column(name = "reason", length = 500, updatable = false)
    private String reason;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    protected AuditCompensation() {
        // for JPA
    }

    public AuditCompensation(String compensationId, String actor, String action, String resourceType,
                             String resourceId, String payload, String reason, LocalDateTime createdAt) {
        this.compensationId = compensationId;
        this.actor = actor;
        this.action = action;
        this.resourceType = resourceType;
        this.resourceId = resourceId;
        this.payload = payload;
        this.reason = reason;
        this.createdAt = createdAt;
    }

    public String getCompensationId() {
        return compensationId;
    }

    public String getResourceId() {
        return resourceId;
    }

    public String getAction() {
        return action;
    }
}

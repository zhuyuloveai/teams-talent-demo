package com.carddemo.card.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 本地客服协助请求（002-C07）：客户在进度页发起、客服/运营在队列中查看的本地记录。
 * 不接外部客服平台，也不需要外部工单号；客服代客操作仍以 {@link StaffVerification} 的可信记录为前提。
 */
@Entity
@Table(name = "support_request")
public class SupportRequest {

    public static final String STATUS_OPEN = "OPEN";
    public static final String SUBJECT_REPLACEMENT = "REPLACEMENT";
    public static final String SUBJECT_CARD = "CARD";

    @Id
    @Column(name = "request_id", length = 36, nullable = false, updatable = false)
    private String requestId;

    @Column(name = "customer_id", length = 9, nullable = false, updatable = false)
    private String customerId;

    @Column(name = "subject_type", length = 16, nullable = false, updatable = false)
    private String subjectType;

    @Column(name = "subject_ref", length = 64, updatable = false)
    private String subjectRef;

    @Column(name = "note", length = 500, updatable = false)
    private String note;

    @Column(name = "status", length = 16, nullable = false)
    private String status;

    @Column(name = "created_by", length = 64, nullable = false, updatable = false)
    private String createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    protected SupportRequest() {
        // for JPA
    }

    public SupportRequest(String requestId, String customerId, String subjectType, String subjectRef,
                          String note, String createdBy, LocalDateTime createdAt) {
        this.requestId = requestId;
        this.customerId = customerId;
        this.subjectType = subjectType;
        this.subjectRef = subjectRef;
        this.note = note;
        this.status = STATUS_OPEN;
        this.createdBy = createdBy;
        this.createdAt = createdAt;
    }

    public String getRequestId() {
        return requestId;
    }

    public String getCustomerId() {
        return customerId;
    }

    public String getSubjectType() {
        return subjectType;
    }

    public String getSubjectRef() {
        return subjectRef;
    }

    public String getNote() {
        return note;
    }

    public String getStatus() {
        return status;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
}

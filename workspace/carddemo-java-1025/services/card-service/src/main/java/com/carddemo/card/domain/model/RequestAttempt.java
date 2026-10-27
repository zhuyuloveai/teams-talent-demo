package com.carddemo.card.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 请求尝试计数（D-15 / D-20）：每种写请求按 idempotencyKey 唯一，重放不重复计数。
 */
@Entity
@Table(name = "request_attempt")
public class RequestAttempt {

    public static final String KIND_LOSS = "LOSS";
    public static final String KIND_REPLACEMENT = "REPLACEMENT";

    @Id
    @Column(name = "attempt_id", length = 36, nullable = false, updatable = false)
    private String attemptId;

    @Column(name = "kind", length = 16, nullable = false, updatable = false)
    private String kind;

    @Column(name = "subject_id", length = 64, nullable = false, updatable = false)
    private String subjectId;

    @Column(name = "idempotency_key", length = 64, nullable = false, updatable = false)
    private String idempotencyKey;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    protected RequestAttempt() {
        // for JPA
    }

    public RequestAttempt(String attemptId, String kind, String subjectId, String idempotencyKey,
                          LocalDateTime createdAt) {
        this.attemptId = attemptId;
        this.kind = kind;
        this.subjectId = subjectId;
        this.idempotencyKey = idempotencyKey;
        this.createdAt = createdAt;
    }

    public String getKind() {
        return kind;
    }

    public String getSubjectId() {
        return subjectId;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
}

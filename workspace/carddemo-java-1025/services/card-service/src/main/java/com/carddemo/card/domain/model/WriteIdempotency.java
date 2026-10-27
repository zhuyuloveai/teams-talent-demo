package com.carddemo.card.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.Objects;

/**
 * 写操作幂等记录（BR-LOST-17）：(scope, idempotencyKey) 唯一；
 * requestDigest 区分同键不同载荷；subjectId 用于重放时校验权限/归属未被绕过。
 */
@Entity
@Table(name = "write_idempotency")
@IdClass(WriteIdempotency.Key.class)
public class WriteIdempotency {

    @Id
    @Column(name = "scope", length = 32, nullable = false, updatable = false)
    private String scope;

    @Id
    @Column(name = "idempotency_key", length = 64, nullable = false, updatable = false)
    private String idempotencyKey;

    @Column(name = "request_digest", length = 64, nullable = false, updatable = false)
    private String requestDigest;

    @Column(name = "subject_id", length = 64, nullable = false, updatable = false)
    private String subjectId;

    @Column(name = "result_ref", length = 64)
    private String resultRef;

    @Column(name = "result_status")
    private Integer resultStatus;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    protected WriteIdempotency() {
        // for JPA
    }

    public WriteIdempotency(String scope, String idempotencyKey, String requestDigest, String subjectId,
                            LocalDateTime createdAt) {
        this.scope = scope;
        this.idempotencyKey = idempotencyKey;
        this.requestDigest = requestDigest;
        this.subjectId = subjectId;
        this.createdAt = createdAt;
    }

    public void recordResult(String resultRef, int resultStatus) {
        this.resultRef = resultRef;
        this.resultStatus = resultStatus;
    }

    public String getScope() {
        return scope;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public String getRequestDigest() {
        return requestDigest;
    }

    public String getSubjectId() {
        return subjectId;
    }

    public String getResultRef() {
        return resultRef;
    }

    public Integer getResultStatus() {
        return resultStatus;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    /** 复合主键。 */
    public static class Key implements Serializable {

        private String scope;
        private String idempotencyKey;

        public Key() {
        }

        public Key(String scope, String idempotencyKey) {
            this.scope = scope;
            this.idempotencyKey = idempotencyKey;
        }

        @Override
        public boolean equals(Object other) {
            if (this == other) {
                return true;
            }
            if (!(other instanceof Key key)) {
                return false;
            }
            return Objects.equals(scope, key.scope) && Objects.equals(idempotencyKey, key.idempotencyKey);
        }

        @Override
        public int hashCode() {
            return Objects.hash(scope, idempotencyKey);
        }
    }
}

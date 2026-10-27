package com.carddemo.card.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 运营/风控告警记录（D-15 / D-20）：(alertType, subjectId, windowStart) 唯一，重复扫描不重复告警。
 * 告警不阻断业务，也不构成审批流。
 */
@Entity
@Table(name = "ops_alert")
public class OpsAlert {

    public static final String LOSS_FREQUENCY = "LOSS_FREQUENCY";
    public static final String REPLACEMENT_FREQUENCY = "REPLACEMENT_FREQUENCY";
    public static final String MANUAL_REVIEW_REQUIRED = "MANUAL_REVIEW_REQUIRED";
    public static final String TRACKING_MISSING_24H = "TRACKING_MISSING_24H";

    @Id
    @Column(name = "alert_id", length = 36, nullable = false, updatable = false)
    private String alertId;

    @Column(name = "alert_type", length = 32, nullable = false, updatable = false)
    private String alertType;

    @Column(name = "subject_type", length = 16, nullable = false, updatable = false)
    private String subjectType;

    @Column(name = "subject_id", length = 64, nullable = false, updatable = false)
    private String subjectId;

    @Column(name = "window_start", nullable = false, updatable = false)
    private LocalDateTime windowStart;

    @Column(name = "window_end", nullable = false, updatable = false)
    private LocalDateTime windowEnd;

    @Column(name = "occurrences", nullable = false, updatable = false)
    private int occurrences;

    @Column(name = "status", length = 16, nullable = false)
    private String status;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    protected OpsAlert() {
        // for JPA
    }

    public OpsAlert(String alertId, String alertType, String subjectType, String subjectId,
                    LocalDateTime windowStart, LocalDateTime windowEnd, int occurrences,
                    LocalDateTime createdAt) {
        this.alertId = alertId;
        this.alertType = alertType;
        this.subjectType = subjectType;
        this.subjectId = subjectId;
        this.windowStart = windowStart;
        this.windowEnd = windowEnd;
        this.occurrences = occurrences;
        this.status = "OPEN";
        this.createdAt = createdAt;
    }

    public String getAlertId() {
        return alertId;
    }

    public String getAlertType() {
        return alertType;
    }

    public String getSubjectId() {
        return subjectId;
    }

    public LocalDateTime getWindowStart() {
        return windowStart;
    }

    public int getOccurrences() {
        return occurrences;
    }

    public String getStatus() {
        return status;
    }
}

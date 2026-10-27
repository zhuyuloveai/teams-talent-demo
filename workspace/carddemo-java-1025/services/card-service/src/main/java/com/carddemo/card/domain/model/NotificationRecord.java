package com.carddemo.card.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/** 通知投递记录（D-12）：失败不回滚主流程，保留待补发状态。 */
@Entity
@Table(name = "notification_record")
public class NotificationRecord {

    @Id
    @Column(name = "notification_id", length = 36, nullable = false, updatable = false)
    private String notificationId;

    @Column(name = "event_type", length = 32, nullable = false, updatable = false)
    private String eventType;

    @Column(name = "recipient", length = 64, nullable = false, updatable = false)
    private String recipient;

    @Column(name = "channel", length = 16, nullable = false, updatable = false)
    private String channel;

    @Column(name = "template", length = 64, nullable = false, updatable = false)
    private String template;

    @Column(name = "status", length = 16, nullable = false)
    private String status;

    @Column(name = "biz_ref", length = 64, nullable = false, updatable = false)
    private String bizRef;

    @Column(name = "attempts", nullable = false)
    private int attempts;

    @Column(name = "last_error", length = 500)
    private String lastError;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    protected NotificationRecord() {
        // for JPA
    }

    public NotificationRecord(String notificationId, String eventType, String recipient, String channel,
                              String template, String status, String bizRef, LocalDateTime createdAt) {
        this.notificationId = notificationId;
        this.eventType = eventType;
        this.recipient = recipient;
        this.channel = channel;
        this.template = template;
        this.status = status;
        this.bizRef = bizRef;
        this.attempts = 1;
        this.createdAt = createdAt;
        this.updatedAt = createdAt;
    }

    public void markSent() {
        this.status = "SENT";
        this.updatedAt = LocalDateTime.now();
    }

    public void markFailed() {
        this.status = "PENDING_RETRY";
        this.attempts++;
        this.updatedAt = LocalDateTime.now();
    }

    public void markFailed(String error) {
        markFailed();
        this.lastError = error == null || error.length() <= 500 ? error : error.substring(0, 500);
    }

    public void markRetryAttempt() {
        this.attempts++;
        this.updatedAt = LocalDateTime.now();
    }

    public String getLastError() {
        return lastError;
    }

    public String getNotificationId() {
        return notificationId;
    }

    public String getEventType() {
        return eventType;
    }

    public String getStatus() {
        return status;
    }

    public String getBizRef() {
        return bizRef;
    }

    public int getAttempts() {
        return attempts;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
}

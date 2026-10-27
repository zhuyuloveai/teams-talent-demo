package com.carddemo.card.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 通知入队失败的持久补偿（002-C01）：与原通知使用同一 notification_id，
 * 由 worker 重新写入 notification_record 后删除，保证最终恰好一条记录。
 */
@Entity
@Table(name = "notification_retry")
public class NotificationRetry {

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

    @Column(name = "biz_ref", length = 64, nullable = false, updatable = false)
    private String bizRef;

    @Column(name = "last_error", length = 500)
    private String lastError;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    protected NotificationRetry() {
        // for JPA
    }

    public NotificationRetry(String notificationId, String eventType, String recipient, String channel,
                             String template, String bizRef, String lastError, LocalDateTime createdAt) {
        this.notificationId = notificationId;
        this.eventType = eventType;
        this.recipient = recipient;
        this.channel = channel;
        this.template = template;
        this.bizRef = bizRef;
        this.lastError = lastError == null || lastError.length() <= 500 ? lastError : lastError.substring(0, 500);
        this.createdAt = createdAt;
    }

    public String getNotificationId() {
        return notificationId;
    }

    public String getEventType() {
        return eventType;
    }

    public String getRecipient() {
        return recipient;
    }

    public String getChannel() {
        return channel;
    }

    public String getTemplate() {
        return template;
    }

    public String getBizRef() {
        return bizRef;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
}

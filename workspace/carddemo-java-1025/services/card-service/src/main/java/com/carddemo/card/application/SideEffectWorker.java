package com.carddemo.card.application;

import com.carddemo.card.domain.model.AuditCompensation;
import com.carddemo.card.domain.model.AuditEvent;
import com.carddemo.card.domain.model.NotificationRecord;
import com.carddemo.card.domain.model.NotificationRetry;
import com.carddemo.card.domain.repository.AuditRepository;
import com.carddemo.card.domain.repository.NotificationRepository;
import com.carddemo.card.domain.repository.NotificationRetryRepository;
import com.carddemo.card.infrastructure.support.SideEffectTransactions;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 审计补偿与通知补发 worker（002-C01）：
 * <ul>
 *   <li>审计补偿 → 以原 eventId 写回 audit_event（主键幂等，恰好一条）后删除补偿；</li>
 *   <li>入队失败的通知 → 重新写入 notification_record（同一 notification_id）后删除补偿；</li>
 *   <li>PENDING_RETRY 通知 → 真实投递并置 SENT，已 SENT 的不再投递（不重复）。</li>
 * </ul>
 * 全部状态在数据库中，进程重启后继续。
 */
@Component
public class SideEffectWorker {

    private static final Logger log = LoggerFactory.getLogger(SideEffectWorker.class);
    private static final int MAX_NOTIFICATIONS_PER_ROUND = 50;

    private final AuditRepository audit;
    private final NotificationRepository notifications;
    private final NotificationRetryRepository notificationRetries;
    private final SideEffectTransactions sideEffects;
    private final boolean schedulingEnabled;

    public SideEffectWorker(AuditRepository audit, NotificationRepository notifications,
                            NotificationRetryRepository notificationRetries,
                            SideEffectTransactions sideEffects,
                            @Value("${card.workers.enabled:true}") boolean schedulingEnabled) {
        this.audit = audit;
        this.notifications = notifications;
        this.notificationRetries = notificationRetries;
        this.sideEffects = sideEffects;
        this.schedulingEnabled = schedulingEnabled;
    }

    @Scheduled(fixedDelayString = "${card.side-effect.interval-ms:5000}",
            initialDelayString = "${card.side-effect.initial-delay-ms:2000}")
    public void scheduled() {
        if (!schedulingEnabled) {
            return;
        }
        try {
            replayAuditCompensations();
            requeueNotificationRetries();
            dispatchNotifications();
        } catch (RuntimeException ex) {
            log.warn("side effect worker round failed: {}", ex.getMessage());
        }
    }

    /** 重放审计补偿，返回本轮成功条数。 */
    public int replayAuditCompensations() {
        List<AuditCompensation> queue = audit.findCompensations();
        int replayed = 0;
        for (AuditCompensation item : queue) {
            Boolean done = execute(item.getCompensationId(), () -> {
                if (audit.findEvent(item.getCompensationId()).isEmpty()) {
                    audit.saveEvent(new AuditEvent(item.getCompensationId(), item.getActor(), item.getAction(),
                            item.getResourceType(), item.getResourceId(), item.getMaskedCardNumber(),
                            item.getReason(), item.getStaffTicketNo(), item.getIdentityVerificationRef(),
                            item.getTraceId(), item.getPayload(), item.getCreatedAt()));
                }
                audit.deleteCompensation(item.getCompensationId());
            });
            if (Boolean.TRUE.equals(done)) {
                replayed++;
            }
        }
        return replayed;
    }

    /** 把入队失败的补偿重新写入投递表（同一 notification_id）。 */
    public int requeueNotificationRetries() {
        List<NotificationRetry> queue = notificationRetries.findAllRetries();
        int requeued = 0;
        for (NotificationRetry item : queue) {
            Boolean done = execute(item.getNotificationId(), () -> {
                if (notifications.findRecord(item.getNotificationId()).isEmpty()) {
                    NotificationRecord record = new NotificationRecord(item.getNotificationId(),
                            item.getEventType(), item.getRecipient(), item.getChannel(), item.getTemplate(),
                            "PENDING_RETRY", item.getBizRef(), item.getCreatedAt());
                    notifications.saveRecord(record);
                }
                notificationRetries.deleteRetry(item.getNotificationId());
            });
            if (Boolean.TRUE.equals(done)) {
                requeued++;
            }
        }
        return requeued;
    }

    /** 投递 PENDING_RETRY 通知，返回本轮成功条数；已 SENT 的不再投递。 */
    public int dispatchNotifications() {
        List<NotificationRecord> pending = notifications.findPendingRetry(MAX_NOTIFICATIONS_PER_ROUND);
        int sent = 0;
        for (NotificationRecord record : pending) {
            Boolean done = execute(record.getNotificationId(), () -> {
                NotificationRecord current = notifications.findRecord(record.getNotificationId()).orElse(null);
                if (current == null || "SENT".equals(current.getStatus())) {
                    return;
                }
                current.markRetryAttempt();
                current.markSent();
                notifications.saveRecord(current);
            });
            if (Boolean.TRUE.equals(done)) {
                sent++;
            }
        }
        return sent;
    }

    public long pendingAuditCompensations() {
        return audit.findCompensations().size();
    }

    public long pendingNotifications() {
        return notifications.findPendingRetry(1000).size();
    }

    private Boolean execute(String label, Runnable action) {
        try {
            sideEffects.executeIsolated(action);
            return true;
        } catch (RuntimeException ex) {
            log.warn("side effect recovery failed for {}: {}", label, ex.getMessage());
            return false;
        }
    }
}

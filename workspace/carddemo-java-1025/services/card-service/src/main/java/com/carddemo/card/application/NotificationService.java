package com.carddemo.card.application;

import com.carddemo.card.domain.model.NotificationRecord;
import com.carddemo.card.domain.model.NotificationRetry;
import com.carddemo.card.domain.repository.NotificationRepository;
import com.carddemo.card.domain.repository.NotificationRetryRepository;
import com.carddemo.card.infrastructure.support.SideEffectTransactions;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 通知投递（D-12 / A-05、002-C01）：站内信在业务事务提交后以独立事务落库；
 * 渠道关闭或写入失败 → PENDING_RETRY + last_error，由 {@link SideEffectWorker} 真实补发，
 * 入队失败再写持久补偿队列（同一 notification_id），最终恰好一条。
 */
@Service
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    private final NotificationRepository repository;
    private final NotificationRetryRepository retries;
    private final SideEffectTransactions sideEffects;
    private final boolean deliveryEnabled;

    public NotificationService(NotificationRepository repository, NotificationRetryRepository retries,
                               SideEffectTransactions sideEffects,
                               @Value("${card.notification.delivery-enabled:true}") boolean deliveryEnabled) {
        this.repository = repository;
        this.retries = retries;
        this.sideEffects = sideEffects;
        this.deliveryEnabled = deliveryEnabled;
    }

    public void notify(String eventType, String recipient, String template, String bizRef) {
        String notificationId = UUID.randomUUID().toString();
        LocalDateTime now = LocalDateTime.now();
        NotificationRecord record = new NotificationRecord(notificationId, eventType, recipient, "IN_APP",
                template, deliveryEnabled ? "SENT" : "PENDING_RETRY", bizRef, now);
        sideEffects.submit(
                () -> {
                    repository.saveRecord(record);
                    if (!deliveryEnabled) {
                        log.warn("notification channel disabled, queued for retry: event={} bizRef={}",
                                eventType, bizRef);
                    }
                },
                failure -> queueRetry(notificationId, eventType, recipient, template, bizRef, failure, now));
    }

    private void queueRetry(String notificationId, String eventType, String recipient, String template,
                            String bizRef, RuntimeException failure, LocalDateTime now) {
        log.warn("notification write failed, queueing retry: event={} bizRef={}", eventType, bizRef);
        try {
            sideEffects.executeIsolated(() -> retries.saveRetry(new NotificationRetry(notificationId, eventType,
                    recipient, "IN_APP", template, bizRef, failure.getMessage(), now)));
        } catch (RuntimeException ex) {
            log.error("notification retry queue write also failed: event={} bizRef={}", eventType, bizRef, ex);
        }
    }
}

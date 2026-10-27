package com.carddemo.card.application;

import com.carddemo.card.domain.model.NotificationRecord;
import com.carddemo.card.domain.repository.NotificationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 通知投递（D-12 / A-05）：站内信渠道落到投递记录；失败置 PENDING_RETRY，不回滚挂失/补卡主流程。
 */
@Service
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    private final NotificationRepository repository;
    private final boolean deliveryEnabled;

    public NotificationService(NotificationRepository repository,
                               @Value("${card.notification.delivery-enabled:true}") boolean deliveryEnabled) {
        this.repository = repository;
        this.deliveryEnabled = deliveryEnabled;
    }

    public NotificationRecord notify(String eventType, String recipient, String template, String bizRef) {
        NotificationRecord record = new NotificationRecord(UUID.randomUUID().toString(), eventType, recipient,
                "IN_APP", template, deliveryEnabled ? "SENT" : "PENDING_RETRY", bizRef, LocalDateTime.now());
        try {
            NotificationRecord saved = repository.saveRecord(record);
            if (!deliveryEnabled) {
                log.warn("Notification channel disabled, queued for retry: event={} bizRef={}", eventType, bizRef);
            }
            return saved;
        } catch (RuntimeException ex) {
            log.error("Notification write failed: event={} bizRef={}", eventType, bizRef, ex);
            throw ex;
        }
    }
}

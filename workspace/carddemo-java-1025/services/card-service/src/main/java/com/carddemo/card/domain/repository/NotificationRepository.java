package com.carddemo.card.domain.repository;

import com.carddemo.card.domain.model.NotificationRecord;

import java.util.List;
import java.util.Optional;

/** 通知投递记录仓储端口。 */
public interface NotificationRepository {

    NotificationRecord saveRecord(NotificationRecord record);

    Optional<NotificationRecord> findRecord(String notificationId);

    List<NotificationRecord> findByBizRef(String bizRef);

    /** 待补发记录（PENDING_RETRY）：由 worker 真实投递。 */
    List<NotificationRecord> findPendingRetry(int limit);
}

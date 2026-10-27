package com.carddemo.card.domain.repository;

import com.carddemo.card.domain.model.NotificationRetry;

import java.util.List;

/** 通知入队失败补偿仓储端口（002-C01）。 */
public interface NotificationRetryRepository {

    NotificationRetry saveRetry(NotificationRetry retry);

    List<NotificationRetry> findAllRetries();

    void deleteRetry(String notificationId);
}

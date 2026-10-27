package com.carddemo.card.domain.repository;

import com.carddemo.card.domain.model.NotificationRecord;

import java.util.List;

/** 通知投递记录仓储端口。 */
public interface NotificationRepository {

    NotificationRecord saveRecord(NotificationRecord record);

    List<NotificationRecord> findByBizRef(String bizRef);
}

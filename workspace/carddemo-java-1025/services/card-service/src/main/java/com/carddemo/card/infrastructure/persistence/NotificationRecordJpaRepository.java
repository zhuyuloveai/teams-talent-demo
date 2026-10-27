package com.carddemo.card.infrastructure.persistence;

import com.carddemo.card.domain.model.NotificationRecord;
import com.carddemo.card.domain.repository.NotificationRepository;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface NotificationRecordJpaRepository
        extends JpaRepository<NotificationRecord, String>, NotificationRepository {

    List<NotificationRecord> findByBizRefOrderByCreatedAtAsc(String bizRef);

    @Override
    default NotificationRecord saveRecord(NotificationRecord record) {
        return save(record);
    }
}

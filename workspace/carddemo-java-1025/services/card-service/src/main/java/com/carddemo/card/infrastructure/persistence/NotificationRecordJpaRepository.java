package com.carddemo.card.infrastructure.persistence;

import com.carddemo.card.domain.model.NotificationRecord;
import com.carddemo.card.domain.repository.NotificationRepository;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface NotificationRecordJpaRepository
        extends JpaRepository<NotificationRecord, String>, NotificationRepository {

    List<NotificationRecord> findByBizRefOrderByCreatedAtAsc(String bizRef);

    List<NotificationRecord> findByStatusOrderByCreatedAtAsc(String status);

    @Override
    default NotificationRecord saveRecord(NotificationRecord record) {
        return saveAndFlush(record);
    }

    @Override
    default Optional<NotificationRecord> findRecord(String notificationId) {
        return findById(notificationId);
    }

    @Override
    default List<NotificationRecord> findByBizRef(String bizRef) {
        return findByBizRefOrderByCreatedAtAsc(bizRef);
    }

    @Override
    default List<NotificationRecord> findPendingRetry(int limit) {
        List<NotificationRecord> all = findByStatusOrderByCreatedAtAsc("PENDING_RETRY");
        return all.size() > limit ? all.subList(0, limit) : all;
    }
}

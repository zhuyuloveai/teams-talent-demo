package com.carddemo.card.infrastructure.persistence;

import com.carddemo.card.domain.model.NotificationRetry;
import com.carddemo.card.domain.repository.NotificationRetryRepository;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface NotificationRetryJpaRepository
        extends JpaRepository<NotificationRetry, String>, NotificationRetryRepository {

    @Override
    default NotificationRetry saveRetry(NotificationRetry retry) {
        return saveAndFlush(retry);
    }

    @Override
    default List<NotificationRetry> findAllRetries() {
        return findAll();
    }

    @Override
    default void deleteRetry(String notificationId) {
        deleteById(notificationId);
    }
}

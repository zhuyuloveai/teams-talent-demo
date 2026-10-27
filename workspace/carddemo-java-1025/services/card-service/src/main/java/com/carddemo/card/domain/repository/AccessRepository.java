package com.carddemo.card.domain.repository;

import com.carddemo.card.domain.model.CardPermission;

import java.util.List;
import java.util.Optional;

/** 主体归属与后台权限端口。 */
public interface AccessRepository {

    Optional<String> findCustomerIdByUserId(String userId);

    List<CardPermission> findPermissionsByUserId(String userId);

    boolean existsAttempt(String kind, String idempotencyKey);

    long countAttempts(String kind, String subjectId, java.time.LocalDateTime from);

    void saveAttempt(String attemptId, String kind, String subjectId, String idempotencyKey,
                     java.time.LocalDateTime createdAt);
}

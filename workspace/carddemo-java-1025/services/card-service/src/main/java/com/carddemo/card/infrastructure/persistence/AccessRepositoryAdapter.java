package com.carddemo.card.infrastructure.persistence;

import com.carddemo.card.domain.model.CardAccess;
import com.carddemo.card.domain.model.CardPermission;
import com.carddemo.card.domain.model.RequestAttempt;
import com.carddemo.card.domain.repository.AccessRepository;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

interface CardAccessJpaRepository extends JpaRepository<CardAccess, String> {
}

interface CardPermissionJpaRepository extends JpaRepository<CardPermission, CardPermission.Key> {

    List<CardPermission> findByUserId(String userId);
}

interface RequestAttemptJpaRepository extends JpaRepository<RequestAttempt, String> {

    boolean existsByKindAndIdempotencyKey(String kind, String idempotencyKey);

    long countByKindAndSubjectIdAndCreatedAtAfter(String kind, String subjectId, LocalDateTime from);
}

/** 归属/权限/请求计数的仓储实现。 */
@Component
class AccessRepositoryAdapter implements AccessRepository {

    private final CardAccessJpaRepository accesses;
    private final CardPermissionJpaRepository permissions;
    private final RequestAttemptJpaRepository attempts;

    AccessRepositoryAdapter(CardAccessJpaRepository accesses, CardPermissionJpaRepository permissions,
                            RequestAttemptJpaRepository attempts) {
        this.accesses = accesses;
        this.permissions = permissions;
        this.attempts = attempts;
    }

    @Override
    public Optional<String> findCustomerIdByUserId(String userId) {
        return accesses.findById(userId).map(CardAccess::getCustomerId);
    }

    @Override
    public List<CardPermission> findPermissionsByUserId(String userId) {
        return permissions.findByUserId(userId);
    }

    @Override
    public boolean existsAttempt(String kind, String idempotencyKey) {
        return attempts.existsByKindAndIdempotencyKey(kind, idempotencyKey);
    }

    @Override
    public long countAttempts(String kind, String subjectId, LocalDateTime from) {
        return attempts.countByKindAndSubjectIdAndCreatedAtAfter(kind, subjectId, from);
    }

    @Override
    public void saveAttempt(String attemptId, String kind, String subjectId, String idempotencyKey,
                            LocalDateTime createdAt) {
        attempts.save(new RequestAttempt(attemptId, kind, subjectId, idempotencyKey, createdAt));
    }
}

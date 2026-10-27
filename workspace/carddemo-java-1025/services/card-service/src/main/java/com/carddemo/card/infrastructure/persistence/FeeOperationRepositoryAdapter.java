package com.carddemo.card.infrastructure.persistence;

import com.carddemo.card.domain.model.FeeOperation;
import com.carddemo.card.domain.repository.FeeOperationRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

/**
 * 费用操作持久化：新行只用 INSERT（persist），避免 `save()` 对非空主键走 merge 覆盖并发行。
 */
@Component
public class FeeOperationRepositoryAdapter implements FeeOperationRepository {

    private static final List<String> RETRYABLE = List.of(FeeOperation.STATE_PENDING,
            FeeOperation.STATE_SENT, "FAILED");

    @PersistenceContext
    private EntityManager entityManager;

    private final FeeOperationJpaRepository jpa;

    public FeeOperationRepositoryAdapter(FeeOperationJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public Optional<FeeOperation> findByKey(String operationKey) {
        return jpa.findById(operationKey);
    }

    @Override
    public Optional<FeeOperation> findByKeyForUpdate(String operationKey) {
        return jpa.findForUpdate(operationKey);
    }

    @Override
    public FeeOperation saveOperation(FeeOperation operation) {
        if (entityManager.contains(operation)) {
            entityManager.flush();
            return operation;
        }
        if (jpa.existsById(operation.getOperationKey())) {
            return entityManager.merge(operation);
        }
        entityManager.persist(operation);
        entityManager.flush();
        return operation;
    }

    @Override
    public List<FeeOperation> findRetryable(int limit) {
        List<FeeOperation> all = jpa.findByStateInOrderByUpdatedAtAsc(RETRYABLE);
        return all.size() > limit ? all.subList(0, limit) : all;
    }

    @Override
    public long countByState(String state) {
        return jpa.countByState(state);
    }
}

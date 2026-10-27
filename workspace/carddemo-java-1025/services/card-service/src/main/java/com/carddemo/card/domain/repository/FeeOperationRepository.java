package com.carddemo.card.domain.repository;

import com.carddemo.card.domain.model.FeeOperation;

import java.util.List;
import java.util.Optional;

/** 补卡费用操作仓储端口（002-A002/A006）。 */
public interface FeeOperationRepository {

    Optional<FeeOperation> findByKey(String operationKey);

    /** 行锁读取：状态判定与迁移必须在同一临界区内完成。 */
    Optional<FeeOperation> findByKeyForUpdate(String operationKey);

    FeeOperation saveOperation(FeeOperation operation);

    /** 需要（重新）执行的操作：PENDING / SENT / FAILED。 */
    List<FeeOperation> findRetryable(int limit);

    long countByState(String state);
}

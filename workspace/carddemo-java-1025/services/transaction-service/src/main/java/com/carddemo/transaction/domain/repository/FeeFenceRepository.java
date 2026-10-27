package com.carddemo.transaction.domain.repository;

import com.carddemo.transaction.domain.model.FeeFence;

import java.util.Optional;

/** 取消栅栏仓储端口（002-A003）。 */
public interface FeeFenceRepository {

    Optional<FeeFence> findByFeeTransactionId(String feeTransactionId);

    FeeFence saveFence(FeeFence fence);
}

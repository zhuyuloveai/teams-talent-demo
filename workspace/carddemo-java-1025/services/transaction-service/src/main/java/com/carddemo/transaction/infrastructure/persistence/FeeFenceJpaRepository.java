package com.carddemo.transaction.infrastructure.persistence;

import com.carddemo.transaction.domain.model.FeeFence;
import com.carddemo.transaction.domain.repository.FeeFenceRepository;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FeeFenceJpaRepository extends JpaRepository<FeeFence, String>, FeeFenceRepository {

    @Override
    default FeeFence saveFence(FeeFence fence) {
        return save(fence);
    }
}

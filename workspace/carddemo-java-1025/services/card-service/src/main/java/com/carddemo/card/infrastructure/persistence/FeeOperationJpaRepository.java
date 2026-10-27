package com.carddemo.card.infrastructure.persistence;

import com.carddemo.card.domain.model.FeeOperation;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface FeeOperationJpaRepository extends JpaRepository<FeeOperation, String> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from FeeOperation o where o.operationKey = :key")
    Optional<FeeOperation> findForUpdate(@Param("key") String key);

    List<FeeOperation> findByStateInOrderByUpdatedAtAsc(Collection<String> states);

    long countByState(String state);
}

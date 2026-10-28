package com.carddemo.account.infrastructure.persistence;

import com.carddemo.account.domain.model.AccountEffectClaim;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface AccountEffectClaimJpaRepository extends JpaRepository<AccountEffectClaim, String> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from AccountEffectClaim c where c.effectId = :effectId")
    Optional<AccountEffectClaim> findForUpdate(@Param("effectId") String effectId);

    Optional<AccountEffectClaim> findByEffectId(String effectId);
}

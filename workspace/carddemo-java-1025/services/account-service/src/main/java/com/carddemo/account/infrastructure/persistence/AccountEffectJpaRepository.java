package com.carddemo.account.infrastructure.persistence;

import com.carddemo.account.domain.model.AccountEffect;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AccountEffectJpaRepository extends JpaRepository<AccountEffect, String> {
}

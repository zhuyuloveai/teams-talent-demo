package com.carddemo.account.infrastructure.persistence;

import com.carddemo.account.domain.model.AccountEffect;
import com.carddemo.account.domain.repository.AccountEffectRepository;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AccountEffectJpaRepository
        extends JpaRepository<AccountEffect, String>, AccountEffectRepository {

    @Override
    default AccountEffect saveEffect(AccountEffect effect) {
        return save(effect);
    }
}

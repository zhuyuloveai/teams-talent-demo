package com.carddemo.account.domain.repository;

import com.carddemo.account.domain.model.AccountEffect;

import java.util.Optional;

/** 账户资金作用仓储端口。 */
public interface AccountEffectRepository {

    Optional<AccountEffect> findByEffectId(String effectId);

    AccountEffect saveEffect(AccountEffect effect);
}

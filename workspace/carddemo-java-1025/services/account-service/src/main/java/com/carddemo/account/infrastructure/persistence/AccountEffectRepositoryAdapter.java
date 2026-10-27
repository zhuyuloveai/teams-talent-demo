package com.carddemo.account.infrastructure.persistence;

import com.carddemo.account.domain.model.AccountEffect;
import com.carddemo.account.domain.repository.AccountEffectRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * effect 行只允许 INSERT（002-A001）：`save()` 对非空主键走 merge，会把并发已插入的行覆盖成第二次的载荷，
 * 从而在唯一行的情况下再次改变账户余额。这里显式 persist + flush，让同 key 并发由主键冲突暴露出来。
 */
@Component
public class AccountEffectRepositoryAdapter implements AccountEffectRepository {

    @PersistenceContext
    private EntityManager entityManager;

    private final AccountEffectJpaRepository jpa;

    public AccountEffectRepositoryAdapter(AccountEffectJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public Optional<AccountEffect> findByEffectId(String effectId) {
        return jpa.findById(effectId);
    }

    @Override
    public AccountEffect saveEffect(AccountEffect effect) {
        entityManager.persist(effect);
        entityManager.flush();
        return effect;
    }
}

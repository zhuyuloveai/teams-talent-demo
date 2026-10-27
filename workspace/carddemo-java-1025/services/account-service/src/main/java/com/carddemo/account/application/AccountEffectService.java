package com.carddemo.account.application;

import com.carddemo.account.domain.exception.BusinessRuleException;
import com.carddemo.account.domain.exception.NotFoundException;
import com.carddemo.account.domain.model.Account;
import com.carddemo.account.domain.model.AccountEffect;
import com.carddemo.account.domain.repository.AccountEffectRepository;
import com.carddemo.account.domain.repository.AccountRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 稳定 effect 资金作用（REQ-2026-002 §4.3）：同一 effectId 只生效一次；
 * 同 effectId 不同账户/类型/金额视为冲突（409），不产生资金效果。
 * <p>
 * 002-A001 修复：先锁账户行、再在锁内重读 effect，只有确实不存在才改余额；
 * effect 行只用 INSERT（persist），同 key 并发由主键冲突暴露而不是 merge 覆盖。
 */
@Service
public class AccountEffectService {

    private final AccountRepository accounts;
    private final AccountEffectRepository effects;

    public AccountEffectService(AccountRepository accounts, AccountEffectRepository effects) {
        this.accounts = accounts;
        this.effects = effects;
    }

    @Transactional
    public EffectOutcome applyEffect(String accountId, String effectId, String kind, BigDecimal amount) {
        if (effectId == null || effectId.isBlank() || effectId.length() > 32) {
            throw new BusinessRuleException("VALIDATION_FAILED", "effectId must be supplied (max 32).");
        }
        if (!"FEE".equals(kind) && !"REFUND".equals(kind)) {
            throw new BusinessRuleException("VALIDATION_FAILED", "kind must be FEE or REFUND.");
        }
        if (amount == null || amount.signum() <= 0) {
            throw new BusinessRuleException("VALIDATION_FAILED", "amount must be greater than zero.");
        }
        Account account = accounts.findForUpdate(accountId)
                .orElseThrow(() -> new NotFoundException("ACCOUNT_NOT_FOUND",
                        "Account " + accountId + " not found"));

        AccountEffect existing = effects.findByEffectId(effectId).orElse(null);
        if (existing != null) {
            requireSamePayload(existing, accountId, kind, amount);
            return new EffectOutcome(account, true);
        }

        account.applyEffect(kind, amount);
        Account saved = accounts.saveAccount(account);
        try {
            effects.saveEffect(new AccountEffect(effectId, accountId, kind, amount, saved.getCurrentBalance(),
                    LocalDateTime.now()));
        } catch (DataIntegrityViolationException ex) {
            // 同一 effectId 已被另一账户（不同账户锁不互斥）插入：载荷必然不同，按冲突拒绝且不重复改余额。
            throw new BusinessRuleException("EFFECT_CONFLICT",
                    "effectId was already applied with a different account, kind or amount.");
        }
        return new EffectOutcome(saved, false);
    }

    @Transactional(readOnly = true)
    public AccountEffect findEffect(String effectId) {
        return effects.findByEffectId(effectId)
                .orElseThrow(() -> new NotFoundException("EFFECT_NOT_FOUND", "Effect " + effectId + " not found"));
    }

    private static void requireSamePayload(AccountEffect effect, String accountId, String kind, BigDecimal amount) {
        boolean same = effect.getAccountId().equals(accountId)
                && effect.getKind().equals(kind)
                && effect.getAmount().compareTo(amount) == 0;
        if (!same) {
            throw new BusinessRuleException("EFFECT_CONFLICT",
                    "effectId was already applied with a different account, kind or amount.");
        }
    }

    public record EffectOutcome(Account account, boolean replayed) {
    }
}

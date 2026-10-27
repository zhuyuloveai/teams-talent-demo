package com.carddemo.account.application;

import com.carddemo.account.domain.exception.BusinessRuleException;
import com.carddemo.account.domain.exception.NotFoundException;
import com.carddemo.account.domain.model.Account;
import com.carddemo.account.domain.model.AccountEffect;
import com.carddemo.account.domain.repository.AccountEffectRepository;
import com.carddemo.account.domain.repository.AccountRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 稳定 effect 资金作用（REQ-2026-002 §4.3）：同一 effectId 只生效一次；
 * 同 effectId 不同账户/类型/金额视为冲突（409），不产生资金效果。
 */
@Service
@Transactional
public class AccountEffectService {

    private final AccountRepository accounts;
    private final AccountEffectRepository effects;

    public AccountEffectService(AccountRepository accounts, AccountEffectRepository effects) {
        this.accounts = accounts;
        this.effects = effects;
    }

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
        AccountEffect existing = effects.findByEffectId(effectId).orElse(null);
        if (existing != null) {
            boolean same = existing.getAccountId().equals(accountId)
                    && existing.getKind().equals(kind)
                    && existing.getAmount().compareTo(amount) == 0;
            if (!same) {
                throw new BusinessRuleException("EFFECT_CONFLICT",
                        "effectId was already applied with a different account, kind or amount.");
            }
            Account account = get(accountId);
            return new EffectOutcome(account, true);
        }
        Account account = accounts.findForUpdate(accountId)
                .orElseThrow(() -> new NotFoundException("ACCOUNT_NOT_FOUND",
                        "Account " + accountId + " not found"));
        account.applyEffect(kind, amount);
        Account saved = accounts.saveAccount(account);
        effects.saveEffect(new AccountEffect(effectId, accountId, kind, amount, saved.getCurrentBalance(),
                LocalDateTime.now()));
        return new EffectOutcome(saved, false);
    }

    private Account get(String accountId) {
        return accounts.findByAccountId(accountId)
                .orElseThrow(() -> new NotFoundException("ACCOUNT_NOT_FOUND",
                        "Account " + accountId + " not found"));
    }

    public record EffectOutcome(Account account, boolean replayed) {
    }
}

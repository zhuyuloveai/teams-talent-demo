package com.carddemo.account.application;

import com.carddemo.account.domain.exception.BusinessRuleException;
import com.carddemo.account.domain.exception.NotFoundException;
import com.carddemo.account.domain.model.Account;
import com.carddemo.account.domain.model.AccountEffect;
import com.carddemo.account.domain.model.AccountEffectClaim;
import com.carddemo.account.domain.repository.AccountEffectRepository;
import com.carddemo.account.domain.repository.AccountRepository;
import com.carddemo.account.infrastructure.persistence.AccountEffectClaimJpaRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 稳定 effect 资金作用（REQ-2026-002 §4.3）：同一 effectId 只生效一次；
 * 同 effectId 不同账户/类型/金额视为冲突（409），不产生资金效果。
 * <p>
 * 002-A001：先锁账户行、再在锁内重读 effect，effect 行只 INSERT。
 * <p>
 * 002-A003-R2：资金提交端两步仲裁——
 * <ol>
 *   <li>独立事务登记 claim（CLAIMED），使"已到达但未提交"的请求对取消可见；</li>
 *   <li>资金事务锁定 claim 行：若期间取消已置 CANCEL_REQUESTED/CANCELLED → 不动资金；
 *       否则应用资金并置 APPLIED。取消与资金提交因此互斥，不存在点时 404 被当成永远未执行。</li>
 * </ol>
 */
@Service
public class AccountEffectService {

    private final AccountRepository accounts;
    private final AccountEffectRepository effects;
    private final AccountEffectClaimJpaRepository claims;
    @PersistenceContext
    private EntityManager entityManager;
    private final TransactionTemplate claimTransaction;
    private final TransactionTemplate moneyTransaction;

    public AccountEffectService(AccountRepository accounts, AccountEffectRepository effects,
                                AccountEffectClaimJpaRepository claims, PlatformTransactionManager transactionManager) {
        this.accounts = accounts;
        this.effects = effects;
        this.claims = claims;
        this.claimTransaction = new TransactionTemplate(transactionManager);
        this.claimTransaction.setPropagationBehavior(
                org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.moneyTransaction = new TransactionTemplate(transactionManager);
    }

    public EffectOutcome applyEffect(String accountId, String effectId, String kind, BigDecimal amount) {
        validate(effectId, kind, amount);
        // 步骤 1：独立事务登记到达（或读取既有状态）
        AccountEffectClaim claim = claimTransaction.execute(status -> registerClaim(accountId, effectId, kind,
                amount));
        if (claim != null && AccountEffectClaim.STATE_APPLIED.equals(claim.getState())) {
            AccountEffect existing = effects.findByEffectId(effectId)
                    .orElseThrow(() -> new IllegalStateException("Applied claim without effect row: " + effectId));
            requireSamePayload(existing, accountId, kind, amount);
            return new EffectOutcome(get(accountId), true);
        }
        // 步骤 2：资金事务（锁 claim → 锁账户 → 应用）
        return moneyTransaction.execute(status -> applyInMoneyTransaction(accountId, effectId, kind, amount));
    }

    private AccountEffectClaim registerClaim(String accountId, String effectId, String kind, BigDecimal amount) {
        LocalDateTime now = LocalDateTime.now();
        AccountEffectClaim existing = claims.findByEffectId(effectId).orElse(null);
        if (existing == null) {
            try {
                return claims.saveAndFlush(new AccountEffectClaim(effectId, kind, accountId, amount,
                        AccountEffectClaim.STATE_CLAIMED, now));
            } catch (DataIntegrityViolationException ex) {
                existing = claims.findByEffectId(effectId).orElseThrow(() -> ex);
            }
        }
        if (existing.getKind() != null && !existing.matches(kind, accountId, amount)) {
            throw new BusinessRuleException("EFFECT_CONFLICT",
                    "effectId was already applied with a different account, kind or amount.");
        }
        if (AccountEffectClaim.STATE_CANCELLED.equals(existing.getState())
                || AccountEffectClaim.STATE_CANCEL_REQUESTED.equals(existing.getState())) {
            throw new BusinessRuleException("EFFECT_CANCELLED",
                    "effectId was cancelled before the money request completed.");
        }
        if (AccountEffectClaim.STATE_CLAIMED.equals(existing.getState()) && existing.getKind() == null) {
            existing.markClaimed(kind, accountId, amount, now);
            claims.saveAndFlush(existing);
        }
        return existing;
    }

    private EffectOutcome applyInMoneyTransaction(String accountId, String effectId, String kind,
                                                  BigDecimal amount) {
        LocalDateTime now = LocalDateTime.now();
        AccountEffectClaim claim = claims.findForUpdate(effectId)
                .orElseThrow(() -> new IllegalStateException("Claim vanished: " + effectId));
        if (claim.isCancellationRequested()) {
            claim.markCancelled(now);
            claims.saveAndFlush(claim);
            throw new BusinessRuleException("EFFECT_CANCELLED",
                    "effectId was cancelled while the money request was in flight.");
        }
        Account account = accounts.findForUpdate(accountId)
                .orElseThrow(() -> new NotFoundException("ACCOUNT_NOT_FOUND",
                        "Account " + accountId + " not found"));
        // 账户行锁可能是长事务的等待点：拿到锁后必须重新读取 claim，
        // 否则等待期间取消写入的 CANCEL_REQUESTED 会被"提交前已通过"的旧状态覆盖。
        entityManager.refresh(claim);
        if (claim.isCancellationRequested()) {
            claim.markCancelled(now);
            claims.saveAndFlush(claim);
            throw new BusinessRuleException("EFFECT_CANCELLED",
                    "effectId was cancelled while the money request was waiting to commit.");
        }

        AccountEffect existing = effects.findByEffectId(effectId).orElse(null);
        if (existing != null) {
            requireSamePayload(existing, accountId, kind, amount);
            claim.markApplied(now);
            claims.saveAndFlush(claim);
            return new EffectOutcome(account, true);
        }
        account.applyEffect(kind, amount);
        Account saved = accounts.saveAccount(account);
        try {
            effects.saveEffect(new AccountEffect(effectId, accountId, kind, amount, saved.getCurrentBalance(),
                    now));
        } catch (DataIntegrityViolationException ex) {
            throw new BusinessRuleException("EFFECT_CONFLICT",
                    "effectId was already applied with a different account, kind or amount.");
        }
        claim.markApplied(now);
        claims.saveAndFlush(claim);
        return new EffectOutcome(saved, false);
    }

    /**
     * 取消/退款仲裁（002-A003-R2）：返回该 effect 在当前稳定身份下的终态。
     * <ul>
     *   <li>APPLIED：资金已提交，调用方必须退款（至多一次）；</li>
     *   <li>CANCEL_REQUESTED：请求已在途但未提交，取消已拦下；调用方视为未知并重试；</li>
     *   <li>CANCELLED：从未有资金请求到达（或已被取消拦下），调用方可以停收。</li>
     * </ul>
     */
    public FenceOutcome fence(String effectId) {
        if (effectId == null || effectId.isBlank() || effectId.length() > 32) {
            throw new BusinessRuleException("VALIDATION_FAILED", "effectId must be supplied (max 32).");
        }
        LocalDateTime now = LocalDateTime.now();
        return claimTransaction.execute(status -> {
            AccountEffectClaim claim = claims.findForUpdate(effectId).orElse(null);
            if (claim == null) {
                claims.saveAndFlush(new AccountEffectClaim(effectId, null, null, null,
                        AccountEffectClaim.STATE_CANCELLED, now));
                return new FenceOutcome(effectId, AccountEffectClaim.STATE_CANCELLED, null, null, null);
            }
            String state = claim.requestCancel(now);
            claims.saveAndFlush(claim);
            AccountEffect effect = effects.findByEffectId(effectId).orElse(null);
            return new FenceOutcome(effectId, state,
                    effect == null ? claim.getKind() : effect.getKind(),
                    effect == null ? claim.getAccountId() : effect.getAccountId(),
                    effect == null ? claim.getAmount() : effect.getAmount());
        });
    }

    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public AccountEffect findEffect(String effectId) {
        return effects.findByEffectId(effectId)
                .orElseThrow(() -> new NotFoundException("EFFECT_NOT_FOUND", "Effect " + effectId + " not found"));
    }

    private Account get(String accountId) {
        return accounts.findByAccountId(accountId)
                .orElseThrow(() -> new NotFoundException("ACCOUNT_NOT_FOUND",
                        "Account " + accountId + " not found"));
    }

    private static void validate(String effectId, String kind, BigDecimal amount) {
        if (effectId == null || effectId.isBlank() || effectId.length() > 32) {
            throw new BusinessRuleException("VALIDATION_FAILED", "effectId must be supplied (max 32).");
        }
        if (!"FEE".equals(kind) && !"REFUND".equals(kind)) {
            throw new BusinessRuleException("VALIDATION_FAILED", "kind must be FEE or REFUND.");
        }
        if (amount == null || amount.signum() <= 0) {
            throw new BusinessRuleException("VALIDATION_FAILED", "amount must be greater than zero.");
        }
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

    public record FenceOutcome(String effectId, String state, String kind, String accountId, BigDecimal amount) {
    }
}

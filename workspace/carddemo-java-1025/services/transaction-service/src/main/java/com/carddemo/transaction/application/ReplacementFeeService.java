package com.carddemo.transaction.application;

import com.carddemo.transaction.domain.exception.BusinessRuleException;
import com.carddemo.transaction.domain.model.FeeFence;
import com.carddemo.transaction.domain.model.TranCategoryBalance;
import com.carddemo.transaction.domain.model.TransactionRecord;
import com.carddemo.transaction.domain.model.TransactionStatus;
import com.carddemo.transaction.domain.repository.FeeFenceRepository;
import com.carddemo.transaction.domain.repository.TranCategoryBalanceRepository;
import com.carddemo.transaction.domain.repository.TransactionRepository;
import com.carddemo.transaction.infrastructure.client.AccountClient;
import com.carddemo.transaction.infrastructure.client.CardClient;
import com.carddemo.transaction.infrastructure.client.LedgerClient;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 补卡费与冲回过账（REQ-2026-002 / D-10 / §4.3）。
 * <p>
 * 002-A002/A003 修复要点：
 * <ul>
 *   <li>收费与退款对同一原收费身份取 advisory lock 串行，杜绝「核实未执行 → 迟到收费」；</li>
 *   <li>退款前先反查账户 effect：不存在 = 确定未执行（不产生资金效果）；存在 = 已执行，
 *       先把缺失的交易行幂等补齐，再冲回；下游不可达 = 未知，异常上抛由调用方重试，不当未收费；</li>
 *   <li>退款单以 {@code original_transaction_id} 唯一约束绑定原收费，至多一笔；</li>
 *   <li>每笔完成过账后写 ledger 借贷配平分录（entryGroupId 幂等）。</li>
 * </ul>
 */
@Service
@Transactional
public class ReplacementFeeService {

    private static final String FEE_TYPE = "08";
    private static final String FEE_CATEGORY = "0001";
    private static final String REFUND_TYPE = "05";
    private static final String REFUND_CATEGORY = "0001";
    private static final BigDecimal ZERO = new BigDecimal("0.00");

    private final TransactionRepository transactions;
    private final TranCategoryBalanceRepository balances;
    private final CardClient cardClient;
    private final AccountClient accountClient;
    private final LedgerClient ledgerClient;
    private final FeePostingLock postingLock;
    private final FeeFenceRepository fences;

    public ReplacementFeeService(TransactionRepository transactions, TranCategoryBalanceRepository balances,
                                 CardClient cardClient, AccountClient accountClient, LedgerClient ledgerClient,
                                 FeePostingLock postingLock, FeeFenceRepository fences) {
        this.transactions = transactions;
        this.balances = balances;
        this.cardClient = cardClient;
        this.accountClient = accountClient;
        this.ledgerClient = ledgerClient;
        this.postingLock = postingLock;
        this.fences = fences;
    }

    public FeeResult charge(String transactionId, String cardNumber, BigDecimal amount, String description) {
        requireTransactionId(transactionId);
        requireAmount(amount);
        if (cardNumber == null || !cardNumber.matches("\\d{16}")) {
            throw new BusinessRuleException("VALIDATION_FAILED", "Card number must be 16 digits for a charge.");
        }
        postingLock.acquire(transactionId);

        var existing = transactions.findByTransactionId(transactionId);
        if (existing.isPresent()) {
            TransactionRecord record = existing.get();
            if (!FEE_TYPE.equals(record.getTypeCode()) || record.getAmount().compareTo(amount) != 0) {
                throw new BusinessRuleException("IDEMPOTENCY_KEY_CONFLICT",
                        "Transaction id was used by a different transaction type or amount.");
            }
            return new FeeResult(record.getTransactionId(), record.getAccountId(), record.getAmount(), true, false,
                    true, false);
        }
        if (transactions.findByOriginalTransactionId(transactionId).isPresent()
                || fences.findByFeeTransactionId(transactionId).isPresent()) {
            throw new BusinessRuleException("FEE_ALREADY_REFUNDED",
                    "This replacement fee has already been refunded or cancelled.");
        }
        String accountId = cardClient.findCard(cardNumber)
                .orElseThrow(() -> new BusinessRuleException("CARD_NOT_FOUND", "Card not found"))
                .accountId();

        accountClient.applyEffect(accountId, transactionId, "FEE", amount);
        postFee(accountId, cardNumber, transactionId, amount, text(description, "REPLACEMENT FEE"));
        return new FeeResult(transactionId, accountId, amount, false, false, true, false);
    }

    /**
     * 冲回：refundId 为稳定退款身份；originalTransactionId 为原收费身份；cardNumber 用于在
     * 「收费已作用于账户但交易行缺失」时幂等补齐原收费记录。
     */
    public FeeResult refund(String refundId, String originalTransactionId, BigDecimal amount, String cardNumber) {
        requireTransactionId(refundId);
        requireTransactionId(originalTransactionId);
        requireAmount(amount);
        if (cardNumber == null || !cardNumber.matches("\\d{16}")) {
            throw new BusinessRuleException("VALIDATION_FAILED",
                    "Card number must be 16 digits to verify the original fee.");
        }
        postingLock.acquire(originalTransactionId);

        var existingRefund = transactions.findByTransactionId(refundId);
        if (existingRefund.isPresent()) {
            TransactionRecord record = existingRefund.get();
            return new FeeResult(record.getTransactionId(), record.getAccountId(), record.getAmount(), true, true,
                    true, false);
        }

        String accountId;
        String feeCardNumber;
        var original = transactions.findByTransactionId(originalTransactionId);
        if (original.isPresent()) {
            TransactionRecord fee = original.get();
            requireRefundableFee(fee, amount);
            accountId = fee.getAccountId();
            feeCardNumber = fee.getCardNumber();
        } else {
            // 002-A003-R2：由资金提交端仲裁。点时 GET 404 不能代表"永远未执行"——请求可能已到达但未提交。
            AccountClient.FenceState fence = accountClient.fence(originalTransactionId);
            String state = fence.state();
            if (AccountEffectClaimStates.IN_FLIGHT.equals(state)) {
                // 在途：保持未知并可重试，绝不宣告未执行。
                return new FeeResult(refundId, fence.accountId(), ZERO, false, false, false, true);
            }
            if (AccountEffectClaimStates.CANCELLED.equals(state)) {
                // 确定未执行（取消已先于资金提交生效）：落审计栅栏，不产生任何资金效果。
                fences.saveFence(new FeeFence(originalTransactionId, "REFUND_CONFIRMED_NOT_EXECUTED",
                        LocalDateTime.now()));
                return new FeeResult(refundId, null, ZERO, false, false, false, false);
            }
            if (!AccountEffectClaimStates.APPLIED.equals(state)) {
                throw new BusinessRuleException("INVALID_FEE_STATE",
                        "Unexpected account effect state " + state + " for " + originalTransactionId);
            }
            if (fence.kind() == null || !"FEE".equals(fence.kind())
                    || fence.amount() == null || fence.amount().compareTo(amount) != 0) {
                throw new BusinessRuleException("INVALID_ORIGINAL_TRANSACTION",
                        "Original account effect is not a matching replacement fee.");
            }
            accountId = fence.accountId();
            feeCardNumber = cardNumber;
            postFee(accountId, feeCardNumber, originalTransactionId, amount, "REPLACEMENT FEE (recovered)");
        }

        accountClient.applyEffect(accountId, refundId, "REFUND", amount);
        applyCategory(accountId, REFUND_TYPE, REFUND_CATEGORY, amount.negate());
        LocalDateTime now = LocalDateTime.now();
        TransactionRecord refund = new TransactionRecord(refundId, accountId, feeCardNumber,
                REFUND_TYPE, REFUND_CATEGORY, "FEE", "REPLACEMENT FEE REFUND", amount, "999999999",
                "REPLACEMENT FEE", "N/A", "N/A", now, now, TransactionStatus.POSTED);
        refund.linkOriginalTransaction(originalTransactionId);
        try {
            transactions.saveTransaction(refund);
        } catch (DataIntegrityViolationException ex) {
            // 并发退款撞唯一约束：以已存在的那笔为准，绝不产生第二笔。
            TransactionRecord stored = transactions.findByOriginalTransactionId(originalTransactionId)
                    .orElseThrow(() -> ex);
            return new FeeResult(stored.getTransactionId(), stored.getAccountId(), stored.getAmount(), true, true,
                    true, false);
        }
        ledgerClient.postReplacementFeeRefund(refundId, originalTransactionId, amount);
        return new FeeResult(refundId, accountId, amount, false, true, true, false);
    }

    /** 查询原收费/退款是否已过账：POSTED / NOT_EXECUTED。 */
    @Transactional(readOnly = true)
    public FeeState inspect(String transactionId) {
        var record = transactions.findByTransactionId(transactionId);
        if (record.isPresent()) {
            return new FeeState(transactionId, "POSTED", record.get().getTypeCode(), record.get().getAmount());
        }
        return new FeeState(transactionId, "NOT_EXECUTED", null, ZERO);
    }

    private void postFee(String accountId, String cardNumber, String transactionId, BigDecimal amount,
                         String description) {
        applyCategory(accountId, FEE_TYPE, FEE_CATEGORY, amount);
        LocalDateTime now = LocalDateTime.now();
        transactions.saveTransaction(new TransactionRecord(transactionId, accountId, cardNumber, FEE_TYPE,
                FEE_CATEGORY, "FEE", description, amount, "999999999", "REPLACEMENT FEE", "N/A", "N/A", now, now,
                TransactionStatus.POSTED));
        ledgerClient.postReplacementFee(transactionId, amount);
    }

    private static void requireRefundableFee(TransactionRecord fee, BigDecimal amount) {
        if (!FEE_TYPE.equals(fee.getTypeCode())) {
            throw new BusinessRuleException("INVALID_ORIGINAL_TRANSACTION",
                    "Original transaction is not a replacement fee.");
        }
        if (fee.getAmount().compareTo(amount) != 0) {
            throw new BusinessRuleException("REFUND_AMOUNT_MISMATCH",
                    "Refund amount must equal the original replacement fee.");
        }
    }

    private void applyCategory(String accountId, String typeCode, String categoryCode, BigDecimal delta) {
        TranCategoryBalance balance = balances.find(accountId, typeCode, categoryCode)
                .orElseGet(() -> new TranCategoryBalance(accountId, typeCode, categoryCode, ZERO));
        balance.apply(delta);
        balances.saveBalance(balance);
    }

    private static void requireTransactionId(String transactionId) {
        if (transactionId == null || !transactionId.matches("\\d{16}")) {
            throw new BusinessRuleException("VALIDATION_FAILED",
                    "Transaction id must be 16 digits (stable effect id).");
        }
    }

    private static void requireAmount(BigDecimal amount) {
        if (amount == null || amount.signum() <= 0) {
            throw new BusinessRuleException("VALIDATION_FAILED", "Amount must be greater than zero.");
        }
    }

    private static String text(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    /**
     * @param replayed 同一 transactionId 已经过账
     * @param refunded 已执行冲回
     * @param executed 原收费确定已执行（false 且 pending=false 表示确定未执行，可按 WAIVED 处理）
     * @param pending  结果未知（资金请求可能仍在途），调用方必须保持待重试
     */
    public record FeeResult(String transactionId, String accountId, BigDecimal amount, boolean replayed,
                            boolean refunded, boolean executed, boolean pending) {
    }

    /** 账户侧 effect claim 的终态（与 account-service 的 AccountEffectClaim 保持一致）。 */
    static final class AccountEffectClaimStates {
        static final String APPLIED = "APPLIED";
        static final String CANCELLED = "CANCELLED";
        static final String IN_FLIGHT = "CANCEL_REQUESTED";

        private AccountEffectClaimStates() {
        }
    }

    public record FeeState(String transactionId, String state, String typeCode, BigDecimal amount) {
    }
}

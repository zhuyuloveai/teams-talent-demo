package com.carddemo.transaction.application;

import com.carddemo.transaction.domain.exception.BusinessRuleException;
import com.carddemo.transaction.domain.model.TranCategoryBalance;
import com.carddemo.transaction.domain.model.TransactionRecord;
import com.carddemo.transaction.domain.model.TransactionStatus;
import com.carddemo.transaction.domain.repository.TranCategoryBalanceRepository;
import com.carddemo.transaction.domain.repository.TransactionRepository;
import com.carddemo.transaction.infrastructure.client.AccountClient;
import com.carddemo.transaction.infrastructure.client.CardClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 补卡费与冲回过账（REQ-2026-002 / D-10 / §4.3）。
 * <p>
 * 幂等与恢复顺序：先按稳定 effect 身份写入账户（幂等），再落交易与类别累计；
 * 中途失败重试时账户侧不重复生效，交易侧按 transactionId 判定是否已存在，避免双收/双退。
 * 退款必须先确认原收费交易存在（远端可能已成功但响应丢失），否则不产生任何资金效果。
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

    public ReplacementFeeService(TransactionRepository transactions, TranCategoryBalanceRepository balances,
                                 CardClient cardClient, AccountClient accountClient) {
        this.transactions = transactions;
        this.balances = balances;
        this.cardClient = cardClient;
        this.accountClient = accountClient;
    }

    public FeeResult charge(String transactionId, String cardNumber, BigDecimal amount, String description) {
        requireTransactionId(transactionId);
        requireAmount(amount);
        var existing = transactions.findByTransactionId(transactionId);
        if (existing.isPresent()) {
            TransactionRecord record = existing.get();
            if (!FEE_TYPE.equals(record.getTypeCode())) {
                throw new BusinessRuleException("IDEMPOTENCY_KEY_CONFLICT",
                        "Transaction id was used by a different transaction type.");
            }
            return new FeeResult(record.getTransactionId(), record.getAccountId(), record.getAmount(), true, false);
        }
        String accountId = cardClient.findCard(cardNumber)
                .orElseThrow(() -> new BusinessRuleException("CARD_NOT_FOUND", "Card not found"))
                .accountId();

        accountClient.applyEffect(accountId, transactionId, "FEE", amount);
        applyCategory(accountId, FEE_TYPE, FEE_CATEGORY, amount);

        LocalDateTime now = LocalDateTime.now();
        transactions.saveTransaction(new TransactionRecord(transactionId, accountId, cardNumber, FEE_TYPE,
                FEE_CATEGORY, "FEE", text(description, "REPLACEMENT FEE"), amount, "999999999",
                "REPLACEMENT FEE", "N/A", "N/A", now, now, TransactionStatus.POSTED));
        return new FeeResult(transactionId, accountId, amount, false, false);
    }

    public FeeResult refund(String transactionId, String originalTransactionId, BigDecimal amount) {
        requireTransactionId(transactionId);
        requireAmount(amount);
        var existing = transactions.findByTransactionId(transactionId);
        if (existing.isPresent()) {
            TransactionRecord record = existing.get();
            return new FeeResult(record.getTransactionId(), record.getAccountId(), record.getAmount(), true, true);
        }
        var original = transactions.findByTransactionId(originalTransactionId);
        if (original.isEmpty()) {
            // 上游未收费（请求未到达或未成功）：不产生任何退款记录与资金效果。
            return new FeeResult(transactionId, null, ZERO, false, false);
        }
        TransactionRecord fee = original.get();
        if (!FEE_TYPE.equals(fee.getTypeCode())) {
            throw new BusinessRuleException("INVALID_ORIGINAL_TRANSACTION",
                    "Original transaction is not a replacement fee.");
        }
        if (fee.getAmount().compareTo(amount) != 0) {
            throw new BusinessRuleException("REFUND_AMOUNT_MISMATCH",
                    "Refund amount must equal the original replacement fee.");
        }
        String accountId = fee.getAccountId();
        accountClient.applyEffect(accountId, transactionId, "REFUND", amount);
        applyCategory(accountId, REFUND_TYPE, REFUND_CATEGORY, amount.negate());

        LocalDateTime now = LocalDateTime.now();
        transactions.saveTransaction(new TransactionRecord(transactionId, accountId, fee.getCardNumber(),
                REFUND_TYPE, REFUND_CATEGORY, "FEE", "REPLACEMENT FEE REFUND", amount, "999999999",
                "REPLACEMENT FEE", "N/A", "N/A", now, now, TransactionStatus.POSTED));
        return new FeeResult(transactionId, accountId, amount, false, true);
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

    public record FeeResult(String transactionId, String accountId, BigDecimal amount, boolean replayed,
                            boolean refunded) {
    }
}

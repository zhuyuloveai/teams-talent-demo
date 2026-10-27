package com.carddemo.transaction.application;

import com.carddemo.transaction.domain.exception.BusinessRuleException;
import com.carddemo.transaction.domain.model.CardSnapshot;
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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 002-A002/A003：收费/退款的稳定身份、退款一次、未知与未执行区分、取消栅栏。
 */
@ExtendWith(MockitoExtension.class)
class ReplacementFeeServiceTest {

    private static final String CARD = "3344556677889900";
    private static final String FEE_ID = "8000000000000001";
    private static final String REFUND_ID = "8000000000000002";

    @Mock
    private TransactionRepository transactions;
    @Mock
    private TranCategoryBalanceRepository balances;
    @Mock
    private CardClient cardClient;
    @Mock
    private AccountClient accountClient;
    @Mock
    private LedgerClient ledgerClient;
    @Mock
    private FeePostingLock postingLock;
    @Mock
    private FeeFenceRepository fences;

    private ReplacementFeeService service;

    @BeforeEach
    void setUp() {
        service = new ReplacementFeeService(transactions, balances, cardClient, accountClient, ledgerClient,
                postingLock, fences);
        lenient().when(fences.findByFeeTransactionId(anyString())).thenReturn(Optional.empty());
        lenient().when(transactions.findByOriginalTransactionId(anyString())).thenReturn(Optional.empty());
    }

    private TransactionRecord feeRecord() {
        LocalDateTime now = LocalDateTime.now();
        return new TransactionRecord(FEE_ID, "00000000006", CARD, "08", "0001", "FEE", "REPLACEMENT FEE",
                new BigDecimal("50.00"), "999999999", "REPLACEMENT FEE", "N/A", "N/A", now, now,
                TransactionStatus.POSTED);
    }

    private TransactionRecord refundRecord() {
        LocalDateTime now = LocalDateTime.now();
        TransactionRecord record = new TransactionRecord(REFUND_ID, "00000000006", CARD, "05", "0001", "FEE",
                "REPLACEMENT FEE REFUND", new BigDecimal("50.00"), "999999999", "REPLACEMENT FEE", "N/A", "N/A",
                now, now, TransactionStatus.POSTED);
        record.linkOriginalTransaction(FEE_ID);
        return record;
    }

    @Test
    void chargeAppliesAccountEffectPostsLedgerAndMarksFeeTransaction() {
        when(transactions.findByTransactionId(FEE_ID)).thenReturn(Optional.empty());
        when(cardClient.findCard(CARD)).thenReturn(Optional.of(new CardSnapshot(CARD, "00000000006",
                "000000006", "SOFIA MARINO", LocalDate.of(2028, 3, 9), "Y")));
        when(balances.find("00000000006", "08", "0001")).thenReturn(Optional.empty());
        when(transactions.saveTransaction(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ReplacementFeeService.FeeResult result = service.charge(FEE_ID, CARD, new BigDecimal("50.00"), null);

        assertThat(result.replayed()).isFalse();
        assertThat(result.refunded()).isFalse();
        assertThat(result.executed()).isTrue();
        assertThat(result.accountId()).isEqualTo("00000000006");
        verify(postingLock).acquire(FEE_ID);
        verify(accountClient).applyEffect("00000000006", FEE_ID, "FEE", new BigDecimal("50.00"));
        ArgumentCaptor<TransactionRecord> captor = ArgumentCaptor.forClass(TransactionRecord.class);
        verify(transactions).saveTransaction(captor.capture());
        assertThat(captor.getValue().getTypeCode()).isEqualTo("08");
        verify(ledgerClient).postReplacementFee(FEE_ID, new BigDecimal("50.00"));
    }

    @Test
    void duplicateChargeReplaysWithoutSecondAccountEffect() {
        when(transactions.findByTransactionId(FEE_ID)).thenReturn(Optional.of(feeRecord()));

        ReplacementFeeService.FeeResult result = service.charge(FEE_ID, CARD, new BigDecimal("50.00"), null);

        assertThat(result.replayed()).isTrue();
        verify(accountClient, never()).applyEffect(anyString(), anyString(), anyString(), any());
        verify(transactions, never()).saveTransaction(any());
    }

    /** 002-A003：账户已扣但交易行缺失时，退款前先幂等补齐原收费，再冲回一次。 */
    @Test
    void refundCompletesMissingFeePostingFromAccountEffectAndThenReverses() {
        when(transactions.findByTransactionId(REFUND_ID)).thenReturn(Optional.empty());
        when(transactions.findByTransactionId(FEE_ID)).thenReturn(Optional.empty());
        when(accountClient.findEffect(FEE_ID)).thenReturn(Optional.of(new AccountClient.AccountEffectSnapshot(
                FEE_ID, "00000000006", "FEE", new BigDecimal("50.00"), LocalDateTime.now().toString())));
        when(balances.find(anyString(), anyString(), anyString())).thenReturn(Optional.empty());
        when(transactions.saveTransaction(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ReplacementFeeService.FeeResult result = service.refund(REFUND_ID, FEE_ID, new BigDecimal("50.00"), CARD);

        assertThat(result.executed()).isTrue();
        assertThat(result.refunded()).isTrue();
        // 原收费已在账户侧生效（effect 存在），只需补齐交易行，不能再动一次账户
        verify(accountClient, never()).applyEffect("00000000006", FEE_ID, "FEE", new BigDecimal("50.00"));
        verify(accountClient).applyEffect("00000000006", REFUND_ID, "REFUND", new BigDecimal("50.00"));
        verify(ledgerClient).postReplacementFee(FEE_ID, new BigDecimal("50.00"));
        verify(ledgerClient).postReplacementFeeRefund(REFUND_ID, FEE_ID, new BigDecimal("50.00"));
        verify(transactions, times(2)).saveTransaction(any());
    }

    /** 002-A003：账户 effect 不存在 = 确定未执行：不产生资金效果，但必须落取消栅栏阻止迟到收费。 */
    @Test
    void refundWithoutAnyTraceOfChargeProducesNoMoneyAndFencesLateCharge() {
        when(transactions.findByTransactionId(REFUND_ID)).thenReturn(Optional.empty());
        when(transactions.findByTransactionId(FEE_ID)).thenReturn(Optional.empty());
        when(accountClient.findEffect(FEE_ID)).thenReturn(Optional.empty());

        ReplacementFeeService.FeeResult result = service.refund(REFUND_ID, FEE_ID, new BigDecimal("50.00"), CARD);

        assertThat(result.refunded()).isFalse();
        assertThat(result.executed()).isFalse();
        assertThat(result.amount()).isEqualByComparingTo("0.00");
        verify(accountClient, never()).applyEffect(anyString(), anyString(), anyString(), any());
        verify(transactions, never()).saveTransaction(any());
        ArgumentCaptor<FeeFence> fence = ArgumentCaptor.forClass(FeeFence.class);
        verify(fences).saveFence(fence.capture());
        assertThat(fence.getValue().getFeeTransactionId()).isEqualTo(FEE_ID);
    }

    /** 栅栏已存在：迟到的收费请求被拒绝，不产生资金效果。 */
    @Test
    void chargeAfterCancellationFenceIsRejected() {
        when(transactions.findByTransactionId(FEE_ID)).thenReturn(Optional.empty());
        when(fences.findByFeeTransactionId(FEE_ID)).thenReturn(Optional.of(
                new FeeFence(FEE_ID, "REFUND_CONFIRMED_NOT_EXECUTED", LocalDateTime.now())));

        assertThatThrownBy(() -> service.charge(FEE_ID, CARD, new BigDecimal("50.00"), null))
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("FEE_ALREADY_REFUNDED");
        verify(accountClient, never()).applyEffect(anyString(), anyString(), anyString(), any());
    }

    @Test
    void refundAfterChargeReversesOnceAndReplays() {
        when(transactions.findByTransactionId(REFUND_ID)).thenReturn(Optional.empty());
        when(transactions.findByTransactionId(FEE_ID)).thenReturn(Optional.of(feeRecord()));
        when(balances.find("00000000006", "05", "0001")).thenReturn(Optional.empty());
        when(transactions.saveTransaction(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ReplacementFeeService.FeeResult result = service.refund(REFUND_ID, FEE_ID, new BigDecimal("50.00"), CARD);

        assertThat(result.refunded()).isTrue();
        verify(accountClient).applyEffect("00000000006", REFUND_ID, "REFUND", new BigDecimal("50.00"));
        ArgumentCaptor<TranCategoryBalance> balance = ArgumentCaptor.forClass(TranCategoryBalance.class);
        verify(balances).saveBalance(balance.capture());
        assertThat(balance.getValue().getBalance()).isEqualByComparingTo("-50.00");

        when(transactions.findByTransactionId(REFUND_ID)).thenReturn(Optional.of(refundRecord()));
        ReplacementFeeService.FeeResult replay = service.refund(REFUND_ID, FEE_ID, new BigDecimal("50.00"), CARD);
        assertThat(replay.replayed()).isTrue();
        verify(accountClient, times(1))
                .applyEffect("00000000006", REFUND_ID, "REFUND", new BigDecimal("50.00"));
    }

    @Test
    void refundOfNonFeeTransactionIsRejected() {
        LocalDateTime now = LocalDateTime.now();
        when(transactions.findByTransactionId(REFUND_ID)).thenReturn(Optional.empty());
        when(transactions.findByTransactionId(FEE_ID)).thenReturn(Optional.of(new TransactionRecord(FEE_ID,
                "00000000006", CARD, "01", "0001", "POS TERM", "Purchase", new BigDecimal("50.00"),
                "800000001", "Shop", "Springfield", "10001", now, now, TransactionStatus.POSTED)));

        assertThatThrownBy(() -> service.refund(REFUND_ID, FEE_ID, new BigDecimal("50.00"), CARD))
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("INVALID_ORIGINAL_TRANSACTION");
    }

    @Test
    void rejectsNonSixteenDigitEffectIdsAndNonPositiveAmounts() {
        assertThatThrownBy(() -> service.charge("abc", CARD, new BigDecimal("50.00"), null))
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("VALIDATION_FAILED");
        assertThatThrownBy(() -> service.charge(FEE_ID, CARD, BigDecimal.ZERO, null))
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("VALIDATION_FAILED");
        assertThatThrownBy(() -> service.refund(REFUND_ID, FEE_ID, new BigDecimal("50.00"), null))
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("VALIDATION_FAILED");
    }

    @Test
    void inspectDistinguishesPostedFromNotExecuted() {
        when(transactions.findByTransactionId(FEE_ID)).thenReturn(Optional.of(feeRecord()));
        when(transactions.findByTransactionId(REFUND_ID)).thenReturn(Optional.empty());

        assertThat(service.inspect(FEE_ID).state()).isEqualTo("POSTED");
        assertThat(service.inspect(REFUND_ID).state()).isEqualTo("NOT_EXECUTED");
    }
}

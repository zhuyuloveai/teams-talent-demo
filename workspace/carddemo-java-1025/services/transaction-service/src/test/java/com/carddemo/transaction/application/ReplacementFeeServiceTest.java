package com.carddemo.transaction.application;

import com.carddemo.transaction.domain.exception.BusinessRuleException;
import com.carddemo.transaction.domain.model.AccountSnapshot;
import com.carddemo.transaction.domain.model.CardSnapshot;
import com.carddemo.transaction.domain.model.TranCategoryBalance;
import com.carddemo.transaction.domain.model.TransactionRecord;
import com.carddemo.transaction.domain.model.TransactionStatus;
import com.carddemo.transaction.domain.repository.TranCategoryBalanceRepository;
import com.carddemo.transaction.domain.repository.TransactionRepository;
import com.carddemo.transaction.infrastructure.client.AccountClient;
import com.carddemo.transaction.infrastructure.client.CardClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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

    private ReplacementFeeService service;

    @BeforeEach
    void setUp() {
        service = new ReplacementFeeService(transactions, balances, cardClient, accountClient);
    }

    private TransactionRecord feeRecord() {
        LocalDateTime now = LocalDateTime.now();
        return new TransactionRecord(FEE_ID, "00000000006", CARD, "08", "0001", "FEE", "REPLACEMENT FEE",
                new BigDecimal("50.00"), "999999999", "REPLACEMENT FEE", "N/A", "N/A", now, now,
                TransactionStatus.POSTED);
    }

    @Test
    void chargeAppliesAccountEffectAndMarksFeeTransaction() {
        when(transactions.findByTransactionId(FEE_ID)).thenReturn(Optional.empty());
        when(cardClient.findCard(CARD)).thenReturn(Optional.of(new CardSnapshot(CARD, "00000000006",
                "000000006", "SOFIA MARINO", java.time.LocalDate.of(2028, 3, 9), "Y")));
        when(balances.find("00000000006", "08", "0001")).thenReturn(Optional.empty());
        when(transactions.saveTransaction(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ReplacementFeeService.FeeResult result = service.charge(FEE_ID, CARD, new BigDecimal("50.00"), null);

        assertThat(result.replayed()).isFalse();
        assertThat(result.refunded()).isFalse();
        assertThat(result.accountId()).isEqualTo("00000000006");
        verify(accountClient).applyEffect("00000000006", FEE_ID, "FEE", new BigDecimal("50.00"));
        ArgumentCaptor<TransactionRecord> captor = ArgumentCaptor.forClass(TransactionRecord.class);
        verify(transactions).saveTransaction(captor.capture());
        assertThat(captor.getValue().getTypeCode()).isEqualTo("08");
        assertThat(captor.getValue().getCategoryCode()).isEqualTo("0001");
    }

    @Test
    void duplicateChargeReplaysWithoutSecondAccountEffect() {
        when(transactions.findByTransactionId(FEE_ID)).thenReturn(Optional.of(feeRecord()));

        ReplacementFeeService.FeeResult result = service.charge(FEE_ID, CARD, new BigDecimal("50.00"), null);

        assertThat(result.replayed()).isTrue();
        verify(accountClient, never()).applyEffect(anyString(), anyString(), anyString(), any());
        verify(transactions, never()).saveTransaction(any());
    }

    @Test
    void refundWithoutOriginalChargeProducesNoMoneyMovement() {
        when(transactions.findByTransactionId(REFUND_ID)).thenReturn(Optional.empty());
        when(transactions.findByTransactionId(FEE_ID)).thenReturn(Optional.empty());

        ReplacementFeeService.FeeResult result = service.refund(REFUND_ID, FEE_ID, new BigDecimal("50.00"));

        assertThat(result.refunded()).isFalse();
        assertThat(result.amount()).isEqualByComparingTo("0.00");
        verify(accountClient, never()).applyEffect(anyString(), anyString(), anyString(), any());
        verify(transactions, never()).saveTransaction(any());
    }

    @Test
    void refundAfterChargeReversesOnceAndReplays() {
        when(transactions.findByTransactionId(REFUND_ID)).thenReturn(Optional.empty());
        when(transactions.findByTransactionId(FEE_ID)).thenReturn(Optional.of(feeRecord()));
        when(balances.find("00000000006", "05", "0001")).thenReturn(Optional.empty());
        when(transactions.saveTransaction(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ReplacementFeeService.FeeResult result = service.refund(REFUND_ID, FEE_ID, new BigDecimal("50.00"));

        assertThat(result.refunded()).isTrue();
        verify(accountClient).applyEffect("00000000006", REFUND_ID, "REFUND", new BigDecimal("50.00"));
        ArgumentCaptor<TranCategoryBalance> balance = ArgumentCaptor.forClass(TranCategoryBalance.class);
        verify(balances).saveBalance(balance.capture());
        assertThat(balance.getValue().getBalance()).isEqualByComparingTo("-50.00");

        when(transactions.findByTransactionId(REFUND_ID)).thenReturn(Optional.of(
                new TransactionRecord(REFUND_ID, "00000000006", CARD, "05", "0001", "FEE",
                        "REPLACEMENT FEE REFUND", new BigDecimal("50.00"), "999999999", "REPLACEMENT FEE",
                        "N/A", "N/A", LocalDateTime.now(), LocalDateTime.now(), TransactionStatus.POSTED)));
        ReplacementFeeService.FeeResult replay = service.refund(REFUND_ID, FEE_ID, new BigDecimal("50.00"));
        assertThat(replay.replayed()).isTrue();
        verify(accountClient, org.mockito.Mockito.times(1))
                .applyEffect("00000000006", REFUND_ID, "REFUND", new BigDecimal("50.00"));
    }

    @Test
    void refundOfNonFeeTransactionIsRejected() {
        LocalDateTime now = LocalDateTime.now();
        when(transactions.findByTransactionId(REFUND_ID)).thenReturn(Optional.empty());
        when(transactions.findByTransactionId(FEE_ID)).thenReturn(Optional.of(new TransactionRecord(FEE_ID,
                "00000000006", CARD, "01", "0001", "POS TERM", "Purchase", new BigDecimal("50.00"),
                "800000001", "Shop", "Springfield", "10001", now, now, TransactionStatus.POSTED)));

        assertThatThrownBy(() -> service.refund(REFUND_ID, FEE_ID, new BigDecimal("50.00")))
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
    }
}

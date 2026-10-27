package com.carddemo.card.application;

import com.carddemo.card.domain.exception.BusinessRuleException;
import com.carddemo.card.domain.exception.DownstreamUnavailableException;
import com.carddemo.card.domain.exception.ForbiddenException;
import com.carddemo.card.domain.model.Card;
import com.carddemo.card.domain.model.CardRegistration;
import com.carddemo.card.domain.model.CardReplacement;
import com.carddemo.card.domain.model.FeeStatus;
import com.carddemo.card.domain.model.ReplacementStatus;
import com.carddemo.card.domain.model.WriteIdempotency;
import com.carddemo.card.domain.repository.CardReplacementRepository;
import com.carddemo.card.domain.repository.CardRepository;
import com.carddemo.card.domain.service.CardNumberCipher;
import com.carddemo.card.domain.service.CardNumberGenerator;
import com.carddemo.card.domain.service.FeePolicy;
import com.carddemo.card.infrastructure.client.CustomerClient;
import com.carddemo.card.infrastructure.client.ReplacementFeeClient;
import com.carddemo.card.infrastructure.security.CardPrincipal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
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
class ReplacementServiceTest {

    private static final String CARD = "3344556677889900";
    private static final String MASKED = "334455******9900";
    private static final String PLATINUM_CARD = "4000000000009999";
    private static final String FEE_BATCH = "8000000000000001";
    private static final String REFUND_BATCH = "8000000000000002";

    @Mock
    private CardRepository cards;
    @Mock
    private CardReplacementRepository replacements;
    @Mock
    private IdempotencyService idempotency;
    @Mock
    private AccessGuard guard;
    @Mock
    private CustomerClient customers;
    @Mock
    private ReplacementFeeClient fees;
    @Mock
    private AuditService audit;
    @Mock
    private NotificationService notifications;
    @Mock
    private AlertService alerts;

    private ReplacementService service;
    private final CardPrincipal customer = new CardPrincipal("USER0001", "U");
    private final CardPrincipal operator = new CardPrincipal("ADMIN002", "A");

    @BeforeEach
    void setUp() {
        service = new ReplacementService(cards, replacements, idempotency, guard, customers,
                new FeePolicy(new BigDecimal("50.00")), new CardNumberGenerator(), new CardNumberCipher("test-key"),
                fees, audit, notifications, alerts);
    }

    private Card lostCard(String level) {
        Card card = new Card(new CardRegistration(CARD, "00000000006", "000000006", "480", "SOFIA MARINO",
                LocalDate.of(2028, 3, 9), "Y"), Card.STATUS_ACTIVE, level);
        card.markLost();
        return card;
    }

    private CardReplacement replacement(ReplacementStatus status, FeeStatus feeStatus, String feeBatchId) {
        FeeStatus initial = feeBatchId == null ? feeStatus : FeeStatus.FEE_PENDING;
        CardReplacement replacement = new CardReplacement("REP-1", MASKED, "334455******1234", "cipher",
                "00000000006", "000000006", "ADDR-000000006", "LOST", "STANDARD", new BigDecimal("50.00"),
                initial, LocalDateTime.now(), "repl-1");
        if (feeBatchId != null) {
            replacement.assignFeeBatchId(feeBatchId);
            replacement.markCharged();
        }
        if (status == ReplacementStatus.CARD_PRODUCED) {
            replacement.markProduced(LocalDateTime.now());
        }
        return replacement;
    }

    @Test
    void goldCardReplacementChargesFiftyAndCreatesInactiveCard() {
        Card card = lostCard("GOLD");
        when(cards.findByCardNumber(CARD)).thenReturn(Optional.of(card));
        when(idempotency.find("replacement-create", "repl-1")).thenReturn(Optional.empty());
        when(replacements.findByActiveKey(MASKED)).thenReturn(Optional.empty());
        when(replacements.nextEffectId()).thenReturn(FEE_BATCH);
        when(replacements.saveReplacement(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(fees.charge(eq(FEE_BATCH), eq(CARD), any())).thenReturn(
                new ReplacementFeeClient.FeeResult(FEE_BATCH, "00000000006", new BigDecimal("50.00"), false, false));

        ReplacementService.CreateOutcome outcome = service.create(customer, CARD, "ADDR-000000006",
                "STANDARD", "LOST", "repl-1");

        assertThat(outcome.replayed()).isFalse();
        assertThat(outcome.replacement().getFeeAmount()).isEqualByComparingTo("50.00");
        assertThat(outcome.replacement().getFeeStatus()).isEqualTo(FeeStatus.CHARGED);
        assertThat(outcome.replacement().getFeeBatchId()).isEqualTo(FEE_BATCH);
        assertThat(outcome.replacement().getStatus()).isEqualTo(ReplacementStatus.REQUESTED);
        ArgumentCaptor<Card> newCard = ArgumentCaptor.forClass(Card.class);
        verify(cards).saveCard(newCard.capture());
        assertThat(newCard.getValue().getActiveStatus()).isEqualTo("N");
        assertThat(newCard.getValue().getCardStatus()).isEqualTo(Card.STATUS_ACTIVE);
        assertThat(newCard.getValue().getCardNumber()).startsWith("334455").hasSize(16);
        assertThat(CardNumberGenerator.isLuhnValid(newCard.getValue().getCardNumber())).isTrue();
        verify(customers).requireOwnedAddress("000000006", "ADDR-000000006");
        verify(alerts).registerAttempt(eq("REPLACEMENT"), eq(MASKED), eq("repl-1"), any());
        verify(idempotency).complete(eq("replacement-create"), eq("repl-1"), anyString(), eq(201));
    }

    @Test
    void platinumCardIsWaivedWithoutFeePosting() {
        Card card = new Card(new CardRegistration(PLATINUM_CARD, "00000000005", "000000005", "321",
                "MARCUS CHEN", LocalDate.of(2029, 12, 31), "Y"), Card.STATUS_ACTIVE, "PLATINUM");
        card.markLost();
        when(cards.findByCardNumber(PLATINUM_CARD)).thenReturn(Optional.of(card));
        when(idempotency.find("replacement-create", "repl-2")).thenReturn(Optional.empty());
        when(replacements.findByActiveKey("400000******9999")).thenReturn(Optional.empty());
        when(replacements.saveReplacement(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ReplacementService.CreateOutcome outcome = service.create(customer, PLATINUM_CARD, "ADDR-000000005",
                "EXPRESS", "LOST", "repl-2");

        assertThat(outcome.replacement().getFeeAmount()).isEqualByComparingTo("0.00");
        assertThat(outcome.replacement().getFeeStatus()).isEqualTo(FeeStatus.WAIVED);
        assertThat(outcome.replacement().getFeeBatchId()).isNull();
        verify(fees, never()).charge(anyString(), anyString(), any());
    }

    @Test
    void feeDependencyFailureLeavesFeePending() {
        Card card = lostCard("GOLD");
        when(cards.findByCardNumber(CARD)).thenReturn(Optional.of(card));
        when(idempotency.find("replacement-create", "repl-3")).thenReturn(Optional.empty());
        when(replacements.findByActiveKey(MASKED)).thenReturn(Optional.empty());
        when(replacements.nextEffectId()).thenReturn(FEE_BATCH);
        when(replacements.saveReplacement(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(fees.charge(eq(FEE_BATCH), eq(CARD), any()))
                .thenThrow(new DownstreamUnavailableException("FEE_POSTING_FAILED", "transaction down"));

        ReplacementService.CreateOutcome outcome = service.create(customer, CARD, "ADDR-000000006",
                "STANDARD", "LOST", "repl-3");

        assertThat(outcome.replacement().getFeeStatus()).isEqualTo(FeeStatus.FEE_PENDING);
        assertThat(outcome.replacement().getFeeBatchId()).isEqualTo(FEE_BATCH);
    }

    @Test
    void staffCannotCreateReplacement() {
        assertThatThrownBy(() -> service.create(operator, CARD, "ADDR-000000006", "STANDARD", "LOST", "repl-4"))
                .isInstanceOf(ForbiddenException.class)
                .extracting("code").isEqualTo("FORBIDDEN");
        verify(cards, never()).saveCard(any());
    }

    @Test
    void replacementRequiresLostCardAndNoInProgressOrder() {
        Card active = new Card(new CardRegistration(CARD, "00000000006", "000000006", "480", "SOFIA MARINO",
                LocalDate.of(2028, 3, 9), "Y"), Card.STATUS_ACTIVE, "GOLD");
        when(cards.findByCardNumber(CARD)).thenReturn(Optional.of(active));
        when(idempotency.find("replacement-create", "repl-5")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.create(customer, CARD, "ADDR-000000006", "STANDARD", "LOST", "repl-5"))
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("CARD_NOT_ACTIVE");

        Card lost = lostCard("GOLD");
        when(cards.findByCardNumber(CARD)).thenReturn(Optional.of(lost));
        when(replacements.findByActiveKey(MASKED)).thenReturn(Optional.of(replacement(ReplacementStatus.REQUESTED,
                FeeStatus.FEE_PENDING, null)));
        assertThatThrownBy(() -> service.create(customer, CARD, "ADDR-000000006", "STANDARD", "LOST", "repl-6"))
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("REPLACEMENT_EXISTS");
    }

    @Test
    void sameKeyCreateReplayReturnsFirstOrder() {
        Card card = lostCard("GOLD");
        CardReplacement existing = replacement(ReplacementStatus.REQUESTED, FeeStatus.CHARGED, FEE_BATCH);
        when(cards.findByCardNumber(CARD)).thenReturn(Optional.of(card));
        String digest = IdempotencyService.digest(CARD, "ADDR-000000006", "STANDARD", "LOST");
        WriteIdempotency record = new WriteIdempotency("replacement-create", "repl-7", digest, "USER0001",
                LocalDateTime.now());
        record.recordResult(existing.getReplacementId(), 201);
        when(idempotency.find("replacement-create", "repl-7")).thenReturn(Optional.of(record));
        when(replacements.findById(existing.getReplacementId())).thenReturn(Optional.of(existing));

        ReplacementService.CreateOutcome outcome = service.create(customer, CARD, "ADDR-000000006",
                "STANDARD", "LOST", "repl-7");

        assertThat(outcome.replayed()).isTrue();
        assertThat(outcome.replacement().getReplacementId()).isEqualTo(existing.getReplacementId());
        verify(replacements, never()).saveReplacement(any());
    }

    @Test
    void cancellingChargedOrderRefundsExactlyOnce() {
        CardReplacement existing = replacement(ReplacementStatus.REQUESTED, FeeStatus.CHARGED, FEE_BATCH);
        when(replacements.findById("REP-1")).thenReturn(Optional.of(existing));
        when(guard.customerIdOf(customer)).thenReturn("000000006");
        when(idempotency.find("replacement-cancel", "cancel-1")).thenReturn(Optional.empty());
        when(replacements.nextEffectId()).thenReturn(REFUND_BATCH);
        when(replacements.saveReplacement(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(fees.refund(REFUND_BATCH, FEE_BATCH, new BigDecimal("50.00"))).thenReturn(
                new ReplacementFeeClient.FeeResult(REFUND_BATCH, "00000000006", new BigDecimal("50.00"),
                        false, true));

        ReplacementService.CancelOutcome outcome = service.cancel(customer, "REP-1", "cancel-1");

        assertThat(outcome.replacement().getStatus()).isEqualTo(ReplacementStatus.CANCELLED);
        assertThat(outcome.replacement().getFeeStatus()).isEqualTo(FeeStatus.REFUNDED);
        assertThat(outcome.replacement().getRefundBatchId()).isEqualTo(REFUND_BATCH);
        assertThat(outcome.replacement().getActiveKey()).isNull();
        verify(fees).refund(REFUND_BATCH, FEE_BATCH, new BigDecimal("50.00"));
    }

    @Test
    void cancellingPendingFeeReconcilesOriginalChargeBeforeDeciding() {
        CardReplacement existing = replacement(ReplacementStatus.REQUESTED, FeeStatus.FEE_PENDING, null);
        existing.assignFeeBatchId(FEE_BATCH);
        when(replacements.findById("REP-1")).thenReturn(Optional.of(existing));
        when(guard.customerIdOf(customer)).thenReturn("000000006");
        when(idempotency.find("replacement-cancel", "cancel-2")).thenReturn(Optional.empty());
        when(replacements.nextEffectId()).thenReturn(REFUND_BATCH);
        when(replacements.saveReplacement(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(fees.refund(REFUND_BATCH, FEE_BATCH, new BigDecimal("50.00"))).thenReturn(
                new ReplacementFeeClient.FeeResult(REFUND_BATCH, null, new BigDecimal("0.00"), false, false));

        ReplacementService.CancelOutcome outcome = service.cancel(customer, "REP-1", "cancel-2");

        assertThat(outcome.replacement().getFeeStatus()).isEqualTo(FeeStatus.WAIVED);
        assertThat(outcome.replacement().getRefundBatchId()).isNull();
        assertThat(outcome.replacement().getStatus()).isEqualTo(ReplacementStatus.CANCELLED);
    }

    @Test
    void cancellingProducedOrderIsRejected() {
        CardReplacement existing = replacement(ReplacementStatus.CARD_PRODUCED, FeeStatus.CHARGED, FEE_BATCH);
        when(replacements.findById("REP-1")).thenReturn(Optional.of(existing));
        when(guard.customerIdOf(customer)).thenReturn("000000006");
        when(idempotency.find("replacement-cancel", "cancel-3")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.cancel(customer, "REP-1", "cancel-3"))
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("REPLACEMENT_NOT_CANCELLABLE");
        verify(fees, never()).refund(anyString(), anyString(), any());
    }

    @Test
    void sameKeyCancelReplayDoesNotRefundAgain() {
        CardReplacement existing = replacement(ReplacementStatus.CANCELLED, FeeStatus.REFUNDED, FEE_BATCH);
        when(replacements.findById("REP-1")).thenReturn(Optional.of(existing));
        when(guard.customerIdOf(customer)).thenReturn("000000006");
        String digest = IdempotencyService.digest("REP-1");
        when(idempotency.find("replacement-cancel", "cancel-4")).thenReturn(Optional.of(
                new WriteIdempotency("replacement-cancel", "cancel-4", digest, "USER0001",
                        LocalDateTime.now())));

        ReplacementService.CancelOutcome outcome = service.cancel(customer, "REP-1", "cancel-4");

        assertThat(outcome.replayed()).isTrue();
        verify(fees, never()).refund(anyString(), anyString(), any());
    }

    @Test
    void statusUpdateActivatesNewCardAndValidatesShippingWindow() {
        String newCardNumber = "3344551234567897";
        CardReplacement existing = new CardReplacement("REP-1", MASKED, "334455******7897",
                new CardNumberCipher("test-key").encrypt(newCardNumber), "00000000006", "000000006",
                "ADDR-000000006", "LOST", "STANDARD", new BigDecimal("50.00"), FeeStatus.WAIVED,
                LocalDateTime.now(), "repl-8");
        existing.markProduced(LocalDateTime.now());
        when(replacements.findById("REP-1")).thenReturn(Optional.of(existing));
        when(idempotency.find(eq("replacement-status"), anyString())).thenReturn(Optional.empty());
        when(replacements.saveReplacement(any())).thenAnswer(invocation -> invocation.getArgument(0));

        assertThatThrownBy(() -> service.updateStatus(operator, "REP-1", "SHIPPED", "SF1",
                LocalDate.now(), "status-early"))
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("VALIDATION_FAILED");

        service.updateStatus(operator, "REP-1", "SHIPPED", "SF1", LocalDate.now().plusDays(3), "status-1");
        assertThat(existing.getStatus()).isEqualTo(ReplacementStatus.SHIPPED);

        Card newCard = new Card(new CardRegistration(newCardNumber, "00000000006", "000000006", "111",
                "SOFIA MARINO", LocalDate.of(2031, 3, 9), "N"), Card.STATUS_ACTIVE, "GOLD");
        when(cards.findByCardNumber(newCardNumber)).thenReturn(Optional.of(newCard));

        service.updateStatus(operator, "REP-1", "ACTIVATED", null, null, "status-2");
        assertThat(existing.getStatus()).isEqualTo(ReplacementStatus.ACTIVATED);
        assertThat(newCard.isTradable()).isTrue();
    }

    @Test
    void adminQueueRequiresReadPermissionAndClampsPaging() {
        when(replacements.findPage(any(), eq(0), eq(100))).thenReturn(List.of());
        when(replacements.countPage(any())).thenReturn(0L);

        ReplacementService.PageResult page = service.page(operator, null, -3, 500);

        assertThat(page.page()).isZero();
        assertThat(page.size()).isEqualTo(100);
    }
}

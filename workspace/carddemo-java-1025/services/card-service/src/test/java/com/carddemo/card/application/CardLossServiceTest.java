package com.carddemo.card.application;

import com.carddemo.card.domain.exception.BusinessRuleException;
import com.carddemo.card.domain.exception.NotFoundException;
import com.carddemo.card.domain.model.Card;
import com.carddemo.card.domain.model.CardOperation;
import com.carddemo.card.domain.model.CardRegistration;
import com.carddemo.card.domain.model.WriteIdempotency;
import com.carddemo.card.domain.repository.CardOperationRepository;
import com.carddemo.card.domain.repository.CardRepository;
import com.carddemo.card.infrastructure.security.CardPrincipal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CardLossServiceTest {

    private static final String CARD = "3344556677889900";

    @Mock
    private CardRepository cards;
    @Mock
    private CardOperationRepository operations;
    @Mock
    private IdempotencyService idempotency;
    @Mock
    private AccessGuard guard;
    @Mock
    private AuditService audit;
    @Mock
    private NotificationService notifications;
    @Mock
    private AlertService alerts;

    private CardLossService service;
    private Card card;
    private final CardPrincipal customer = new CardPrincipal("USER0001", "U");
    private final CardPrincipal staff = new CardPrincipal("ADMIN001", "A");

    @BeforeEach
    void setUp() {
        service = new CardLossService(cards, operations, idempotency, guard, audit, notifications, alerts);
        card = new Card(new CardRegistration(CARD, "00000000006", "000000006", "480", "SOFIA MARINO",
                LocalDate.of(2028, 3, 9), "Y"), Card.STATUS_ACTIVE, "GOLD");
    }

    @Test
    void cardholderLossMarksCardLostAndWritesOneOperation() {
        when(cards.findByCardNumber(CARD)).thenReturn(Optional.of(card));
        when(idempotency.find("loss", "loss-1")).thenReturn(Optional.empty());

        CardLossService.LossOutcome outcome = service.reportLoss(customer, CARD, "LOST", "9900",
                "loss-1", null, null);

        assertThat(outcome.replayed()).isFalse();
        assertThat(outcome.card().getCardStatus()).isEqualTo(Card.STATUS_LOST);
        assertThat(outcome.card().getActiveStatus()).isEqualTo("N");
        assertThat(outcome.operationId()).startsWith("OP-");
        ArgumentCaptor<CardOperation> captor = ArgumentCaptor.forClass(CardOperation.class);
        verify(operations).saveOperation(captor.capture());
        assertThat(captor.getValue().getCardNumber()).isEqualTo("334455******9900");
        assertThat(captor.getValue().getStatus()).isEqualTo("SUCCESS");
        verify(cards).saveCard(card);
        verify(audit).record(eq("USER0001"), eq("LOSS"), eq("CARD"), eq(CARD), eq("9900"), eq("LOST"),
                any(), any(), anyString(), anyString());
        verify(notifications).notify(eq("CARD_LOST"), eq("000000006"), anyString(), anyString());
        verify(alerts).registerAttempt(eq("LOSS"), eq("000000006"), eq("loss-1"), any());
        verify(idempotency).complete(eq("loss"), eq("loss-1"), anyString(), eq(201));
    }

    @Test
    void sameKeyReplayReturnsFirstResultWithoutSecondOperationOrNotice() {
        card.markLost();
        when(cards.findByCardNumber(CARD)).thenReturn(Optional.of(card));
        String digest = IdempotencyService.digest(CARD, "LOST", "9900", null, null);
        WriteIdempotency record = new WriteIdempotency("loss", "loss-1", digest, "USER0001",
                LocalDateTime.now());
        record.recordResult("OP-existing", 201);
        when(idempotency.find("loss", "loss-1")).thenReturn(Optional.of(record));

        CardLossService.LossOutcome outcome = service.reportLoss(customer, CARD, "LOST", "9900",
                "loss-1", null, null);

        assertThat(outcome.replayed()).isTrue();
        assertThat(outcome.operationId()).isEqualTo("OP-existing");
        verify(operations, never()).saveOperation(any());
        verify(notifications, never()).notify(anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void sameKeyWithDifferentPayloadIsConflict() {
        when(cards.findByCardNumber(CARD)).thenReturn(Optional.of(card));
        WriteIdempotency record = new WriteIdempotency("loss", "loss-1", "other-digest", "USER0001",
                LocalDateTime.now());
        when(idempotency.find("loss", "loss-1")).thenReturn(Optional.of(record));

        assertThatThrownBy(() -> service.reportLoss(customer, CARD, "STOLEN", "9900", "loss-1", null, null))
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("IDEMPOTENCY_KEY_CONFLICT");
        verify(operations, never()).saveOperation(any());
    }

    @Test
    void sameKeyFromAnotherSubjectIsConflict() {
        when(cards.findByCardNumber(CARD)).thenReturn(Optional.of(card));
        String digest = IdempotencyService.digest(CARD, "LOST", "9900", null, null);
        WriteIdempotency record = new WriteIdempotency("loss", "loss-1", digest, "USER0002",
                LocalDateTime.now());
        when(idempotency.find("loss", "loss-1")).thenReturn(Optional.of(record));

        assertThatThrownBy(() -> service.reportLoss(customer, CARD, "LOST", "9900", "loss-1", null, null))
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("IDEMPOTENCY_KEY_CONFLICT");
    }

    @Test
    void staffAssistedLossRequiresTicketAndVerificationEvidence() {
        when(cards.findByCardNumber(CARD)).thenReturn(Optional.of(card));
        when(idempotency.find("loss", "loss-2")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.reportLoss(staff, CARD, "LOST", "9900", "loss-2", null, null))
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("STAFF_VERIFICATION_REQUIRED");
        assertThat(card.getCardStatus()).isEqualTo(Card.STATUS_ACTIVE);
        verify(operations, never()).saveOperation(any());

        CardLossService.LossOutcome outcome = service.reportLoss(staff, CARD, "LOST", "9900", "loss-3",
                "CS-20261028-0007", "IVR-20261028-0042");
        assertThat(outcome.replayed()).isFalse();
        ArgumentCaptor<CardOperation> captor = ArgumentCaptor.forClass(CardOperation.class);
        verify(operations).saveOperation(captor.capture());
        assertThat(captor.getValue().getStaffTicketNo()).isEqualTo("CS-20261028-0007");
        assertThat(captor.getValue().getIdentityVerificationRef()).isEqualTo("IVR-20261028-0042");
    }

    @Test
    void alreadyLostCardWithNewKeyIsConflictAndFrozenCardIsNotActive() {
        card.markLost();
        when(cards.findByCardNumber(CARD)).thenReturn(Optional.of(card));
        when(idempotency.find("loss", "loss-9")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.reportLoss(customer, CARD, "LOST", "9900", "loss-9", null, null))
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("CARD_ALREADY_LOST");

        Card frozen = new Card(new CardRegistration("4000000000008888", "00000000003", "000000003", "654",
                "LARRY HOMENICK", LocalDate.of(2028, 6, 30), "N"), Card.STATUS_FROZEN, "CLASSIC");
        when(cards.findByCardNumber("4000000000008888")).thenReturn(Optional.of(frozen));
        when(idempotency.find("loss", "loss-10")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.reportLoss(customer, "4000000000008888", "LOST", "8888",
                "loss-10", null, null))
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("CARD_NOT_ACTIVE");
    }

    @Test
    void wrongLastFourIsRejectedBeforeAnyChange() {
        when(cards.findByCardNumber(CARD)).thenReturn(Optional.of(card));
        when(idempotency.find("loss", "loss-4")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.reportLoss(customer, CARD, "LOST", "1234", "loss-4", null, null))
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("VALIDATION_FAILED");
        assertThat(card.getCardStatus()).isEqualTo(Card.STATUS_ACTIVE);
    }

    @Test
    void unknownCardIsNotFound() {
        when(cards.findByCardNumber(CARD)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.reportLoss(customer, CARD, "LOST", "9900", "loss-5", null, null))
                .isInstanceOf(NotFoundException.class)
                .extracting("code").isEqualTo("CARD_NOT_FOUND");
    }

    @Test
    void ownershipViolationPropagatesNotFound() {
        when(cards.findByCardNumber(CARD)).thenReturn(Optional.of(card));
        doThrow(new NotFoundException("CARD_NOT_FOUND", "Card not found"))
                .when(guard).requireCardOwner(customer, card);

        assertThatThrownBy(() -> service.reportLoss(customer, CARD, "LOST", "9900", "loss-6", null, null))
                .isInstanceOf(NotFoundException.class);
        verify(operations, never()).saveOperation(any());
    }
}

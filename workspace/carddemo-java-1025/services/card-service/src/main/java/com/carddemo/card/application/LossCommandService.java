package com.carddemo.card.application;

import com.carddemo.card.domain.exception.BusinessRuleException;
import com.carddemo.card.domain.exception.NotFoundException;
import com.carddemo.card.domain.model.Card;
import com.carddemo.card.domain.model.CardOperation;
import com.carddemo.card.domain.model.CardPermission;
import com.carddemo.card.domain.model.StaffVerification;
import com.carddemo.card.domain.repository.CardOperationRepository;
import com.carddemo.card.domain.repository.CardRepository;
import com.carddemo.card.domain.service.CardRef;
import com.carddemo.card.domain.service.Masking;
import com.carddemo.card.infrastructure.security.CardPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 挂失写事务（002-A004/C02/C06/C05）：幂等占位与卡的写入同事务。
 */
@Service
public class LossCommandService {

    private final CardRepository cards;
    private final CardOperationRepository operations;
    private final IdempotencyService idempotency;
    private final AccessGuard guard;
    private final AuditService audit;
    private final NotificationService notifications;
    private final StaffVerificationService staffVerifications;
    private final CardRef cardRefs;

    public LossCommandService(CardRepository cards, CardOperationRepository operations,
                              IdempotencyService idempotency, AccessGuard guard, AuditService audit,
                              NotificationService notifications, StaffVerificationService staffVerifications,
                              CardRef cardRefs) {
        this.cards = cards;
        this.operations = operations;
        this.idempotency = idempotency;
        this.guard = guard;
        this.audit = audit;
        this.notifications = notifications;
        this.staffVerifications = staffVerifications;
        this.cardRefs = cardRefs;
    }

    @Transactional
    public Card reportLoss(CardPrincipal principal, String cardNumber, String reason, String confirmCardLast4,
                           String idempotencyKey, String staffTicketNo, String identityVerificationRef,
                           String digest) {
        Card card = cards.findByCardNumber(cardNumber)
                .orElseThrow(() -> new NotFoundException("CARD_NOT_FOUND", "Card not found"));
        boolean staff = principal.isAdmin();
        if (staff) {
            guard.requirePermission(principal, CardPermission.LOSS_ASSIST);
        } else {
            guard.requireCardOwner(principal, card);
        }

        IdempotencyService.Decision decision = idempotency.begin(CardLossService.SCOPE_LOSS, idempotencyKey,
                digest, principal.userId());
        if (decision.replayed()) {
            return cards.findByCardNumber(cardNumber).orElse(card);
        }

        // 002-C02：客服代客挂失必须命中本地可信工单 + 核身记录，且与卡客户一致。
        StaffVerification verification = staff
                ? staffVerifications.requireValid(card.getCustomerId(), staffTicketNo, identityVerificationRef)
                : null;
        requireCardLast4(cardNumber, confirmCardLast4);

        if (Card.STATUS_LOST.equals(card.getCardStatus())) {
            throw new BusinessRuleException("CARD_ALREADY_LOST", "Card is already reported lost.");
        }
        if (!Card.STATUS_ACTIVE.equals(card.getCardStatus()) || !"Y".equals(card.getActiveStatus())) {
            throw new BusinessRuleException("CARD_NOT_ACTIVE", "Card status does not support loss.");
        }

        card.markLost();
        cards.saveCard(card);

        String cardRef = cardRefs.of(cardNumber);
        String operationId = "OP-" + UUID.randomUUID().toString().substring(0, 29);
        operations.saveOperation(new CardOperation(operationId, Masking.forStorage(cardNumber), cardRef, "LOSS",
                "SUCCESS", reason, principal.userId(), idempotencyKey, staffTicketNo, identityVerificationRef,
                LocalDateTime.now(), "{\"reason\":\"" + reason + "\"}"));

        // 002-C06：资源身份用 CardRef，掩码列只到后 4 位；日志同样不含完整 PAN。
        audit.record(principal.userId(), "LOSS", "CARD", cardRef, Masking.display(cardNumber), reason,
                staffTicketNo, identityVerificationRef, UUID.randomUUID().toString(),
                "{\"operationId\":\"" + operationId + "\",\"staffAssisted\":" + (verification != null) + "}");

        notifications.notify("CARD_LOST", card.getCustomerId(), "CARD_LOSS_NOTICE", operationId);

        idempotency.complete(CardLossService.SCOPE_LOSS, idempotencyKey, operationId, 201);
        return card;
    }

    private static void requireCardLast4(String cardNumber, String confirmCardLast4) {
        if (confirmCardLast4 == null || !confirmCardLast4.matches("\\d{4}")
                || !Masking.last4(cardNumber).equals(confirmCardLast4)) {
            throw new BusinessRuleException("VALIDATION_FAILED", "Last 4 digits do not match.");
        }
    }
}

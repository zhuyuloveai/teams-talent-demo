package com.carddemo.card.application;

import com.carddemo.card.domain.exception.BusinessRuleException;
import com.carddemo.card.domain.exception.NotFoundException;
import com.carddemo.card.domain.model.Card;
import com.carddemo.card.domain.model.CardOperation;
import com.carddemo.card.domain.model.CardPermission;
import com.carddemo.card.domain.model.WriteIdempotency;
import com.carddemo.card.domain.repository.CardOperationRepository;
import com.carddemo.card.domain.repository.CardRepository;
import com.carddemo.card.domain.service.Masking;
import com.carddemo.card.infrastructure.security.CardPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

/**
 * 挂失用例（REQ-LOST-01/02、BR-LOST-01/02/07/09/17/18）。
 * 顺序：主体校验 → 幂等判定（同键同载荷 200 重放 / 同键异载荷 409）→ 客服凭证 → 状态机 → 记录/审计/通知/告警。
 */
@Service
public class CardLossService {

    static final String SCOPE_LOSS = "loss";
    private static final String OPERATION_LOSS = "LOSS";

    private final CardRepository cards;
    private final CardOperationRepository operations;
    private final IdempotencyService idempotency;
    private final AccessGuard guard;
    private final AuditService audit;
    private final NotificationService notifications;
    private final AlertService alerts;

    public CardLossService(CardRepository cards, CardOperationRepository operations,
                           IdempotencyService idempotency, AccessGuard guard, AuditService audit,
                           NotificationService notifications, AlertService alerts) {
        this.cards = cards;
        this.operations = operations;
        this.idempotency = idempotency;
        this.guard = guard;
        this.audit = audit;
        this.notifications = notifications;
        this.alerts = alerts;
    }

    @Transactional
    public LossOutcome reportLoss(CardPrincipal principal, String cardNumber, String reason,
                                 String confirmCardLast4, String idempotencyKey,
                                 String staffTicketNo, String identityVerificationRef) {
        Card card = cards.findByCardNumber(cardNumber)
                .orElseThrow(() -> new NotFoundException("CARD_NOT_FOUND", "Card not found"));

        boolean staff = principal.isAdmin();
        if (staff) {
            guard.requirePermission(principal, CardPermission.LOSS_ASSIST);
        } else {
            guard.requireCardOwner(principal, card);
        }

        String digest = IdempotencyService.digest(cardNumber, reason, confirmCardLast4,
                staffTicketNo, identityVerificationRef);
        Optional<WriteIdempotency> prior = idempotency.find(SCOPE_LOSS, idempotencyKey);
        if (prior.isPresent()) {
            WriteIdempotency record = prior.get();
            if (!record.getRequestDigest().equals(digest) || !record.getSubjectId().equals(principal.userId())) {
                throw new BusinessRuleException("IDEMPOTENCY_KEY_CONFLICT",
                        "Idempotency key was used with a different request or subject.");
            }
            Card current = cards.findByCardNumber(cardNumber).orElse(card);
            return new LossOutcome(current, record.getResultRef(), true);
        }

        if (staff) {
            requireStaffEvidence(staffTicketNo, identityVerificationRef);
        }
        requireCardLast4(cardNumber, confirmCardLast4);

        if (Card.STATUS_LOST.equals(card.getCardStatus())) {
            throw new BusinessRuleException("CARD_ALREADY_LOST", "Card is already reported lost.");
        }
        if (!Card.STATUS_ACTIVE.equals(card.getCardStatus()) || !"Y".equals(card.getActiveStatus())) {
            throw new BusinessRuleException("CARD_NOT_ACTIVE", "Card status does not support loss.");
        }

        idempotency.reserve(SCOPE_LOSS, idempotencyKey, digest, principal.userId());

        card.markLost();
        cards.saveCard(card);

        String operationId = "OP-" + UUID.randomUUID().toString().substring(0, 29);
        String maskedStorage = Masking.forStorage(cardNumber);
        operations.saveOperation(new CardOperation(operationId, maskedStorage, OPERATION_LOSS, "SUCCESS",
                reason, principal.userId(), idempotencyKey, staffTicketNo, identityVerificationRef,
                LocalDateTime.now(), "{\"reason\":\"" + reason + "\"}"));

        audit.record(principal.userId(), OPERATION_LOSS, "CARD", cardNumber, Masking.last4(cardNumber),
                reason, staffTicketNo, identityVerificationRef, UUID.randomUUID().toString(),
                "{\"operationId\":\"" + operationId + "\"}");

        notifications.notify("CARD_LOST", card.getCustomerId(), "CARD_LOSS_NOTICE", operationId);
        alerts.registerAttempt("LOSS", card.getCustomerId(), idempotencyKey, LocalDateTime.now());

        idempotency.complete(SCOPE_LOSS, idempotencyKey, operationId, 201);
        return new LossOutcome(card, operationId, false);
    }

    /** C02：客服代客挂失必须携带工单号与身份核实记录，缺失/非法即拒绝且不写任何记录。 */
    private static void requireStaffEvidence(String staffTicketNo, String identityVerificationRef) {
        if (staffTicketNo == null || staffTicketNo.isBlank() || staffTicketNo.length() > 32
                || !staffTicketNo.matches("[A-Za-z0-9-]{3,32}")) {
            throw new BusinessRuleException("STAFF_VERIFICATION_REQUIRED",
                    "A valid staff ticket number is required for staff-assisted loss.");
        }
        if (identityVerificationRef == null || identityVerificationRef.isBlank()
                || identityVerificationRef.length() > 64
                || !identityVerificationRef.matches("[A-Za-z0-9-]{3,64}")) {
            throw new BusinessRuleException("STAFF_VERIFICATION_REQUIRED",
                    "A valid identity verification reference is required for staff-assisted loss.");
        }
    }

    private static void requireCardLast4(String cardNumber, String confirmCardLast4) {
        if (confirmCardLast4 == null || !confirmCardLast4.matches("\\d{4}")
                || !Masking.last4(cardNumber).equals(confirmCardLast4)) {
            throw new BusinessRuleException("VALIDATION_FAILED", "Last 4 digits do not match.");
        }
    }

    /** 挂失结果（首次 201 / 重放 200）。 */
    public record LossOutcome(Card card, String operationId, boolean replayed) {
    }
}

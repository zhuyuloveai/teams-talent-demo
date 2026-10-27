package com.carddemo.card.application;

import com.carddemo.card.domain.exception.BusinessRuleException;
import com.carddemo.card.domain.exception.NotFoundException;
import com.carddemo.card.domain.model.Card;
import com.carddemo.card.domain.model.CardPermission;
import com.carddemo.card.domain.model.RequestAttempt;
import com.carddemo.card.domain.model.WriteIdempotency;
import com.carddemo.card.domain.repository.CardRepository;
import com.carddemo.card.domain.service.CardRef;
import com.carddemo.card.infrastructure.security.CardPrincipal;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Optional;

/**
 * 挂失用例（REQ-LOST-01/02、BR-LOST-01/02/07/09/17/18）。
 * 请求边界：归属/权限 → 幂等（同键同载荷已完成 200 重放 / 处理中 409 / 异载荷 409）
 * → 请求计数（状态校验之前，独立事务）→ 写事务（客服核身、后 4 位确认、状态机、审计/通知）。
 */
@Service
public class CardLossService {

    static final String SCOPE_LOSS = "loss";

    private final CardRepository cards;
    private final IdempotencyService idempotency;
    private final LossCommandService commands;
    private final AccessGuard guard;
    private final AlertService alerts;
    private final CardRef cardRefs;

    public CardLossService(CardRepository cards, IdempotencyService idempotency, LossCommandService commands,
                           AccessGuard guard, AlertService alerts, CardRef cardRefs) {
        this.cards = cards;
        this.idempotency = idempotency;
        this.commands = commands;
        this.guard = guard;
        this.alerts = alerts;
        this.cardRefs = cardRefs;
    }

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
        if (prior.isPresent() && prior.get().getResultRef() != null) {
            WriteIdempotency record = prior.get();
            if (!record.getRequestDigest().equals(digest) || !record.getSubjectId().equals(principal.userId())) {
                throw new BusinessRuleException("IDEMPOTENCY_KEY_CONFLICT",
                        "Idempotency key was used with a different request or subject.");
            }
            Card current = cards.findByCardNumber(cardNumber).orElse(card);
            return new LossOutcome(current, record.getResultRef(), true);
        }

        // 002-C05：计数在状态机校验之前；被拒绝的新 key 请求同样计入，同键重放不重复计数。
        alerts.registerAttempt(RequestAttempt.KIND_LOSS, card.getCustomerId(), idempotencyKey,
                LocalDateTime.now());

        Card lost = commands.reportLoss(principal, cardNumber, reason, confirmCardLast4, idempotencyKey,
                staffTicketNo, identityVerificationRef, digest);
        String operationId = idempotency.find(SCOPE_LOSS, idempotencyKey)
                .map(WriteIdempotency::getResultRef).orElse(null);
        return new LossOutcome(lost, operationId, false);
    }

    /** 挂失结果（首次 201 / 重放 200）。 */
    public record LossOutcome(Card card, String operationId, boolean replayed) {
    }
}

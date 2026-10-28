package com.carddemo.card.application;

import com.carddemo.card.domain.exception.BusinessRuleException;
import com.carddemo.card.domain.exception.NotFoundException;
import com.carddemo.card.domain.model.Card;
import com.carddemo.card.domain.model.CardLevel;
import com.carddemo.card.domain.model.CardPermission;
import com.carddemo.card.domain.model.CardRegistration;
import com.carddemo.card.domain.model.CardReplacement;
import com.carddemo.card.domain.model.FeeOperation;
import com.carddemo.card.domain.model.FeeStatus;
import com.carddemo.card.domain.model.OpsAlert;
import com.carddemo.card.domain.model.ReplacementStatus;
import com.carddemo.card.domain.repository.CardReplacementRepository;
import com.carddemo.card.domain.repository.CardRepository;
import com.carddemo.card.domain.repository.FeeOperationRepository;
import com.carddemo.card.domain.service.CardNumberCipher;
import com.carddemo.card.domain.service.CardNumberGenerator;
import com.carddemo.card.domain.service.CardRef;
import com.carddemo.card.domain.service.FeePolicy;
import com.carddemo.card.domain.service.Masking;
import com.carddemo.card.infrastructure.security.CardPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 补卡写事务（002-A004/A006/C08）：与请求边界分离，便于在提交后执行远端资金操作。
 * <ul>
 *   <li>幂等占位与业务写同事务：失败不会留下永久占位；</li>
 *   <li>工单先落 REQUESTED，费用与卡号分配是各自可重试的持久步骤；</li>
 *   <li>取消在同一事务里竖立收费栅栏（CANCEL_REQUESTED）+ 创建稳定退款身份。</li>
 * </ul>
 */
@Service
public class ReplacementCommandService {

    static final String SCOPE_CREATE = "replacement-create";
    static final String SCOPE_CANCEL = "replacement-cancel";
    static final String SCOPE_STATUS = "replacement-status";

    private final CardRepository cards;
    private final CardReplacementRepository replacements;
    private final FeeOperationRepository feeOperations;
    private final IdempotencyService idempotency;
    private final AccessGuard guard;
    private final FeePolicy feePolicy;
    private final CardNumberGenerator generator;
    private final CardNumberCipher cipher;
    private final CardRef cardRefs;
    private final AuditService audit;
    private final NotificationService notifications;
    private final AlertService alerts;

    public ReplacementCommandService(CardRepository cards, CardReplacementRepository replacements,
                                     FeeOperationRepository feeOperations, IdempotencyService idempotency,
                                     AccessGuard guard, FeePolicy feePolicy, CardNumberGenerator generator,
                                     CardNumberCipher cipher, CardRef cardRefs, AuditService audit,
                                     NotificationService notifications, AlertService alerts) {
        this.cards = cards;
        this.replacements = replacements;
        this.feeOperations = feeOperations;
        this.idempotency = idempotency;
        this.guard = guard;
        this.feePolicy = feePolicy;
        this.generator = generator;
        this.cipher = cipher;
        this.cardRefs = cardRefs;
        this.audit = audit;
        this.notifications = notifications;
        this.alerts = alerts;
    }

    @Transactional
    public CommandOutcome create(CardPrincipal principal, String cardNumber, String addressId,
                                 String deliveryMethod, String reason, String idempotencyKey, String digest) {
        Card card = cards.findByCardNumber(cardNumber)
                .orElseThrow(() -> new NotFoundException("CARD_NOT_FOUND", "Card not found"));
        if (principal.isAdmin()) {
            throw new com.carddemo.card.domain.exception.ForbiddenException("FORBIDDEN",
                    "Replacement can only be requested by the cardholder.");
        }
        guard.requireCardOwner(principal, card);

        IdempotencyService.Decision decision = idempotency.begin(SCOPE_CREATE, idempotencyKey, digest,
                principal.userId());
        if (decision.replayed()) {
            return new CommandOutcome(replacements.findById(decision.record().getResultRef())
                    .orElseThrow(() -> new IllegalStateException("Replacement vanished")), true);
        }

        if (!Card.STATUS_LOST.equals(card.getCardStatus())) {
            throw new BusinessRuleException("CARD_NOT_ACTIVE", "Card must be reported lost before replacement.");
        }
        String cardRef = cardRefs.of(cardNumber);
        if (replacements.findByActiveKey(cardRef).isPresent()) {
            throw new BusinessRuleException("REPLACEMENT_EXISTS", "An in-progress replacement already exists.");
        }

        CardLevel level = CardLevel.from(card.getCardLevel());
        BigDecimal feeAmount = feePolicy.feeFor(level);
        FeeStatus initialFeeStatus = feePolicy.initialStatusFor(level);
        String replacementId = "REP-" + UUID.randomUUID().toString().substring(0, 28);
        LocalDateTime now = LocalDateTime.now();
        String feeBatchId = initialFeeStatus == FeeStatus.FEE_PENDING ? replacements.nextEffectId() : null;

        CardReplacement replacement = new CardReplacement(replacementId, Masking.forStorage(cardNumber), cardRef,
                cipher.encrypt(cardNumber), card.getAccountId(), card.getCustomerId(), addressId, reason,
                deliveryMethod, feeAmount, initialFeeStatus, feeBatchId, now, idempotencyKey);
        replacements.saveReplacement(replacement);

        if (feeBatchId != null) {
            feeOperations.saveOperation(new FeeOperation(FeeOperation.chargeKey(replacementId), replacementId,
                    FeeOperation.KIND_CHARGE, feeBatchId, feeAmount, card.getAccountId(),
                    Masking.forStorage(cardNumber), cipher.encrypt(cardNumber), now));
        }

        // 002-C08：卡号生成失败不丢工单——受理已落库，退化为 REQUESTED + 号段告警 + worker 重试。
        try {
            assignCardNumber(replacement, card, cardNumber, level);
        } catch (BusinessRuleException ex) {
            alerts.raiseCardNumberFailure(replacementId, ex.getMessage());
        }
        replacements.saveReplacement(replacement);

        audit.record(principal.userId(), "REPLACEMENT_REQUESTED", "REPLACEMENT", replacementId,
                Masking.display(cardNumber), reason, null, null, UUID.randomUUID().toString(),
                "{\"feeStatus\":\"" + replacement.getFeeStatus() + "\",\"numberStatus\":\""
                        + replacement.getNumberStatus() + "\"}");
        notifications.notify("REPLACEMENT_REQUESTED", card.getCustomerId(), "REPLACEMENT_NOTICE", replacementId);

        int status = initialFeeStatus == FeeStatus.FEE_PENDING || replacement.getNumberStatus()
                == com.carddemo.card.domain.model.NumberStatus.PENDING ? 202 : 201;
        idempotency.complete(SCOPE_CREATE, idempotencyKey, replacementId, status);
        return new CommandOutcome(replacement, false);
    }

    /** 分配新卡号（幂等）：生成 → 落新卡 → 写回工单。失败抛出，由调用方保留 REQUESTED 并告警。 */
    @Transactional
    public void assignCardNumber(CardReplacement replacement, Card card, String oldCardNumber, CardLevel level) {
        if (replacement.getNumberStatus() == com.carddemo.card.domain.model.NumberStatus.ASSIGNED) {
            return;
        }
        String newCardNumber = generator.next(oldCardNumber,
                candidate -> cards.existsByCardNumber(candidate)
                        || replacements.existsNewCardRef(cardRefs.of(candidate)));
        String cvv = String.format("%03d", (int) (Math.random() * 1000));
        CardRegistration registration = new CardRegistration(newCardNumber, card.getAccountId(),
                card.getCustomerId(), cvv, card.getEmbossedName(),
                card.getExpirationDate().plusYears(3), "N");
        cards.saveCard(new Card(registration, Card.STATUS_ACTIVE, level.name()));
        replacement.assignNewCard(Masking.forStorage(newCardNumber), cipher.encrypt(newCardNumber),
                cardRefs.of(newCardNumber));
    }

    @Transactional
    public CommandOutcome cancel(CardPrincipal principal, String replacementId, String idempotencyKey) {
        CardReplacement replacement = replacements.findByIdForUpdate(replacementId)
                .orElseThrow(() -> new NotFoundException("REPLACEMENT_NOT_FOUND", "Replacement not found"));
        if (principal.isAdmin()) {
            guard.requirePermission(principal, CardPermission.REPLACEMENT_CANCEL_ASSIST);
        } else {
            requireOwner(principal, replacement);
        }
        IdempotencyService.Decision decision = idempotency.begin(SCOPE_CANCEL, idempotencyKey,
                IdempotencyService.digest(replacementId), principal.userId());
        if (decision.replayed()) {
            return new CommandOutcome(replacements.findById(replacementId).orElse(replacement), true);
        }
        if (replacement.getStatus() != ReplacementStatus.REQUESTED) {
            throw new BusinessRuleException("REPLACEMENT_NOT_CANCELLABLE",
                    "Only a requested replacement can be cancelled.");
        }
        String refundId = null;
        if (replacement.getFeeStatus() != FeeStatus.WAIVED) {
            // 收费栅栏：worker/在途请求在退款裁决前不再发起新收费；退款身份在此确定，重试复用。
            FeeOperation charge = feeOperations.findByKeyForUpdate(FeeOperation.chargeKey(replacementId))
                    .orElse(null);
            if (charge != null) {
                charge.requestCancel(LocalDateTime.now());
                feeOperations.saveOperation(charge);
            }
            refundId = replacement.getRefundBatchId() != null
                    ? replacement.getRefundBatchId() : replacements.nextEffectId();
            replacement.requestRefund(refundId);
            if (feeOperations.findByKey(FeeOperation.refundKey(replacementId)).isEmpty()) {
                feeOperations.saveOperation(new FeeOperation(FeeOperation.refundKey(replacementId),
                        replacementId, FeeOperation.KIND_REFUND, refundId, replacement.getFeeAmount(),
                        replacement.getAccountId(), replacement.getOldCardNumber(),
                        charge != null ? charge.getCardCipher() : "", LocalDateTime.now()));
            }
        }
        replacement.markCancelled(LocalDateTime.now());
        replacements.saveReplacement(replacement);

        audit.record(principal.userId(), "REPLACEMENT_CANCELLED", "REPLACEMENT", replacementId,
                Masking.displayOfStored(replacement.getOldCardNumber()), replacement.getReason(), null, null,
                UUID.randomUUID().toString(), "{\"feeStatus\":\"" + replacement.getFeeStatus() + "\"}");
        notifications.notify("REPLACEMENT_CANCELLED", replacement.getCustomerId(), "REPLACEMENT_CANCEL_NOTICE",
                replacementId);
        idempotency.complete(SCOPE_CANCEL, idempotencyKey, replacementId, 200);
        return new CommandOutcome(replacement, false);
    }

    @Transactional
    public CommandOutcome updateStatus(CardPrincipal principal, String replacementId, ReplacementStatus target,
                                       String trackingNo, LocalDate estimatedArrival, String idempotencyKey,
                                       String digest) {
        guard.requirePermission(principal, CardPermission.REPLACEMENT_STATUS_UPDATE);
        CardReplacement replacement = replacements.findByIdForUpdate(replacementId)
                .orElseThrow(() -> new NotFoundException("REPLACEMENT_NOT_FOUND", "Replacement not found"));
        IdempotencyService.Decision decision = idempotency.begin(SCOPE_STATUS, idempotencyKey, digest,
                principal.userId());
        if (decision.replayed()) {
            return new CommandOutcome(replacements.findById(replacementId).orElse(replacement), true);
        }
        LocalDateTime now = LocalDateTime.now();
        switch (target) {
            case CARD_PRODUCED -> {
                if (replacement.getNumberStatus() != com.carddemo.card.domain.model.NumberStatus.ASSIGNED) {
                    throw new BusinessRuleException("CARD_NUMBER_NOT_ASSIGNED",
                            "The replacement card number is not assigned yet.");
                }
                replacement.markProduced(now);
            }
            case SHIPPED -> replacement.markShipped(now, trackingNo, estimatedArrival);
            case ACTIVATED -> {
                replacement.markActivated(now);
                activateNewCard(replacement);
            }
            default -> throw new BusinessRuleException("INVALID_STATE_TRANSITION", "Unsupported target status.");
        }
        replacements.saveReplacement(replacement);
        audit.record(principal.userId(), "REPLACEMENT_" + target.name(), "REPLACEMENT", replacementId,
                Masking.displayOfStored(replacement.getOldCardNumber()), replacement.getReason(), null, null,
                UUID.randomUUID().toString(), "{\"status\":\"" + target + "\"}");
        notifications.notify("REPLACEMENT_" + target.name(), replacement.getCustomerId(),
                "REPLACEMENT_STATUS_NOTICE", replacementId);
        idempotency.complete(SCOPE_STATUS, idempotencyKey, replacementId, 200);
        return new CommandOutcome(replacement, false);
    }

    private void activateNewCard(CardReplacement replacement) {
        String newCardNumber = cipher.decrypt(replacement.getNewCardCipher());
        Card card = cards.findByCardNumber(newCardNumber).orElseThrow(
                () -> new IllegalStateException("Replacement card is missing"));
        card.activate();
        cards.saveCard(card);
    }

    /** 命令结果：真实反映"首次执行"还是"同键重放"，由 facade 原样传播到 REST 响应的 replayed。 */
    public record CommandOutcome(CardReplacement replacement, boolean replayed) {
    }

    private void requireOwner(CardPrincipal principal, CardReplacement replacement) {
        String customerId = guard.customerIdOf(principal);
        if (customerId == null || !customerId.equals(replacement.getCustomerId())) {
            throw new NotFoundException("REPLACEMENT_NOT_FOUND", "Replacement not found");
        }
    }
}

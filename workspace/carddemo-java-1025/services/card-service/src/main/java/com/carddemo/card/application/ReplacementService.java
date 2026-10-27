package com.carddemo.card.application;

import com.carddemo.card.domain.exception.BusinessRuleException;
import com.carddemo.card.domain.exception.ForbiddenException;
import com.carddemo.card.domain.exception.NotFoundException;
import com.carddemo.card.domain.model.Card;
import com.carddemo.card.domain.model.CardLevel;
import com.carddemo.card.domain.model.CardPermission;
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
import com.carddemo.card.domain.service.Masking;
import com.carddemo.card.infrastructure.client.CustomerClient;
import com.carddemo.card.infrastructure.client.ReplacementFeeClient;
import com.carddemo.card.infrastructure.security.CardPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * 补卡用例（REQ-LOST-03/04/06、REQ-LOST-07）。
 * 补卡申请仅持卡人本人（PRD v1.2 §6.2）：客服可代挂失、查询与协助取消，但不得代创建补卡。
 */
@Service
public class ReplacementService {

    static final String SCOPE_CREATE = "replacement-create";
    static final String SCOPE_CANCEL = "replacement-cancel";
    static final String SCOPE_STATUS = "replacement-status";

    private final CardRepository cards;
    private final CardReplacementRepository replacements;
    private final IdempotencyService idempotency;
    private final AccessGuard guard;
    private final CustomerClient customers;
    private final FeePolicy feePolicy;
    private final CardNumberGenerator generator;
    private final CardNumberCipher cipher;
    private final ReplacementFeeClient fees;
    private final AuditService audit;
    private final NotificationService notifications;
    private final AlertService alerts;

    public ReplacementService(CardRepository cards, CardReplacementRepository replacements,
                              IdempotencyService idempotency, AccessGuard guard, CustomerClient customers,
                              FeePolicy feePolicy, CardNumberGenerator generator, CardNumberCipher cipher,
                              ReplacementFeeClient fees, AuditService audit, NotificationService notifications,
                              AlertService alerts) {
        this.cards = cards;
        this.replacements = replacements;
        this.idempotency = idempotency;
        this.guard = guard;
        this.customers = customers;
        this.feePolicy = feePolicy;
        this.generator = generator;
        this.cipher = cipher;
        this.fees = fees;
        this.audit = audit;
        this.notifications = notifications;
        this.alerts = alerts;
    }

    @Transactional
    public CreateOutcome create(CardPrincipal principal, String cardNumber, String addressId,
                                String deliveryMethod, String reason, String idempotencyKey) {
        if (principal.isAdmin()) {
            throw new ForbiddenException("FORBIDDEN", "Replacement can only be requested by the cardholder.");
        }
        Card card = cards.findByCardNumber(cardNumber)
                .orElseThrow(() -> new NotFoundException("CARD_NOT_FOUND", "Card not found"));
        guard.requireCardOwner(principal, card);

        String digest = IdempotencyService.digest(cardNumber, addressId, deliveryMethod, reason);
        Optional<WriteIdempotency> prior = idempotency.find(SCOPE_CREATE, idempotencyKey);
        if (prior.isPresent()) {
            WriteIdempotency record = prior.get();
            if (!record.getRequestDigest().equals(digest) || !record.getSubjectId().equals(principal.userId())) {
                throw new BusinessRuleException("IDEMPOTENCY_KEY_CONFLICT",
                        "Idempotency key was used with a different request or subject.");
            }
            CardReplacement existing = replacements.findById(record.getResultRef())
                    .orElseThrow(() -> new IllegalStateException("Replacement vanished"));
            return new CreateOutcome(existing, true);
        }

        if (!Card.STATUS_LOST.equals(card.getCardStatus())) {
            throw new BusinessRuleException("CARD_NOT_ACTIVE", "Card must be reported lost before replacement.");
        }
        customers.requireOwnedAddress(card.getCustomerId(), addressId);

        String maskedOld = Masking.forStorage(cardNumber);
        if (replacements.findByActiveKey(maskedOld).isPresent()) {
            throw new BusinessRuleException("REPLACEMENT_EXISTS", "An in-progress replacement already exists.");
        }

        alerts.registerAttempt("REPLACEMENT", maskedOld, idempotencyKey, LocalDateTime.now());

        CardLevel level = CardLevel.from(card.getCardLevel());
        BigDecimal feeAmount = feePolicy.feeFor(level);
        FeeStatus initialFeeStatus = feePolicy.initialStatusFor(level);

        String newCardNumber = generator.next(cardNumber, replacements::existsNewCardNumber);
        String replacementId = "REP-" + UUID.randomUUID().toString().substring(0, 28);
        LocalDateTime now = LocalDateTime.now();

        CardReplacement replacement = new CardReplacement(replacementId, maskedOld,
                Masking.forStorage(newCardNumber), cipher.encrypt(newCardNumber), card.getAccountId(),
                card.getCustomerId(), addressId, reason, deliveryMethod, feeAmount, initialFeeStatus, now,
                idempotencyKey);
        idempotency.reserve(SCOPE_CREATE, idempotencyKey, digest, principal.userId());
        replacements.saveReplacement(replacement);

        cards.saveCard(newCard(card, newCardNumber, level));

        if (initialFeeStatus == FeeStatus.FEE_PENDING) {
            replacement.assignFeeBatchId(replacements.nextEffectId());
            replacements.saveReplacement(replacement);
            try {
                fees.charge(replacement.getFeeBatchId(), cardNumber, feeAmount);
                replacement.markCharged();
                replacements.saveReplacement(replacement);
            } catch (RuntimeException ex) {
                // FEE_PENDING 保留：工单已创建，费用待补收；重试复用同一 feeBatchId。
                audit.record(principal.userId(), "REPLACEMENT_FEE_PENDING", "REPLACEMENT", replacementId,
                        Masking.last4(cardNumber), reason, null, null, UUID.randomUUID().toString(),
                        "{\"feeBatchId\":\"" + replacement.getFeeBatchId() + "\"}");
            }
        }

        audit.record(principal.userId(), "REPLACEMENT_REQUESTED", "REPLACEMENT", replacementId,
                Masking.last4(cardNumber), reason, null, null, UUID.randomUUID().toString(),
                "{\"newCard\":\"" + Masking.display(newCardNumber) + "\",\"feeStatus\":\""
                        + replacement.getFeeStatus() + "\"}");
        notifications.notify("REPLACEMENT_REQUESTED", card.getCustomerId(), "REPLACEMENT_NOTICE", replacementId);
        idempotency.complete(SCOPE_CREATE, idempotencyKey, replacementId, 201);
        return new CreateOutcome(replacement, false);
    }

    private Card newCard(Card old, String newCardNumber, CardLevel level) {
        String cvv = String.format("%03d", (int) (Math.random() * 1000));
        CardRegistration registration = new CardRegistration(newCardNumber, old.getAccountId(),
                old.getCustomerId(), cvv, old.getEmbossedName(),
                old.getExpirationDate().plusYears(3), "N");
        return new Card(registration, Card.STATUS_ACTIVE, level.name());
    }

    @Transactional(readOnly = true)
    public CardReplacement get(CardPrincipal principal, String replacementId) {
        CardReplacement replacement = replacements.findById(replacementId)
                .orElseThrow(() -> new NotFoundException("REPLACEMENT_NOT_FOUND", "Replacement not found"));
        requireVisible(principal, replacement);
        return replacement;
    }

    @Transactional(readOnly = true)
    public List<CardReplacement> listByCard(CardPrincipal principal, String cardNumber) {
        Card card = cards.findByCardNumber(cardNumber)
                .orElseThrow(() -> new NotFoundException("CARD_NOT_FOUND", "Card not found"));
        if (principal.isAdmin()) {
            guard.requirePermission(principal, CardPermission.REPLACEMENT_READ_ANY);
        } else {
            guard.requireCardOwner(principal, card);
        }
        return replacements.findByOldCardNumberOrderByRequestedAtDesc(Masking.forStorage(cardNumber));
    }

    /** 取消（BR-LOST-10/17）：仅 REQUESTED；已收费冲回一次；FEE_PENDING 先核实原收费再决定冲回或停收。 */
    @Transactional
    public CancelOutcome cancel(CardPrincipal principal, String replacementId, String idempotencyKey) {
        CardReplacement replacement = replacements.findById(replacementId)
                .orElseThrow(() -> new NotFoundException("REPLACEMENT_NOT_FOUND", "Replacement not found"));
        if (principal.isAdmin()) {
            guard.requirePermission(principal, CardPermission.REPLACEMENT_CANCEL_ASSIST);
        } else {
            requireOwner(principal, replacement);
        }

        String digest = IdempotencyService.digest(replacementId);
        Optional<WriteIdempotency> prior = idempotency.find(SCOPE_CANCEL, idempotencyKey);
        if (prior.isPresent()) {
            WriteIdempotency record = prior.get();
            if (!record.getRequestDigest().equals(digest) || !record.getSubjectId().equals(principal.userId())) {
                throw new BusinessRuleException("IDEMPOTENCY_KEY_CONFLICT",
                        "Idempotency key was used with a different request or subject.");
            }
            CardReplacement current = replacements.findById(replacementId).orElse(replacement);
            return new CancelOutcome(current, true);
        }

        if (replacement.getStatus() != ReplacementStatus.REQUESTED) {
            throw new BusinessRuleException("REPLACEMENT_NOT_CANCELLABLE",
                    "Only a requested replacement can be cancelled.");
        }
        idempotency.reserve(SCOPE_CANCEL, idempotencyKey, digest, principal.userId());

        String last4 = last4Of(replacement);
        if (replacement.getFeeStatus() == FeeStatus.CHARGED) {
            replacement.assignRefundBatchId(replacements.nextEffectId());
            replacements.saveReplacement(replacement);
            fees.refund(replacement.getRefundBatchId(), replacement.getFeeBatchId(), replacement.getFeeAmount());
            replacement.markRefunded();
        } else if (replacement.getFeeStatus() == FeeStatus.FEE_PENDING) {
            // 先按稳定原收费身份核实：远端确未收费则不产生任何资金效果，已收费则冲回一次。
            ReplacementFeeClient.FeeResult result = fees.refund(replacements.nextEffectId(),
                    replacement.getFeeBatchId(), replacement.getFeeAmount());
            if (result != null && result.refunded()) {
                replacement.assignRefundBatchId(result.transactionId());
                replacement.markRefunded();
            } else {
                replacement.markFeeStopped();
            }
        }
        replacement.markCancelled(LocalDateTime.now());
        replacements.saveReplacement(replacement);

        audit.record(principal.userId(), "REPLACEMENT_CANCELLED", "REPLACEMENT", replacementId, last4,
                replacement.getReason(), null, null, UUID.randomUUID().toString(),
                "{\"feeStatus\":\"" + replacement.getFeeStatus() + "\"}");
        notifications.notify("REPLACEMENT_CANCELLED", replacement.getCustomerId(), "REPLACEMENT_CANCEL_NOTICE",
                replacementId);
        idempotency.complete(SCOPE_CANCEL, idempotencyKey, replacementId, 200);
        return new CancelOutcome(replacement, false);
    }

    /** 运营状态更新（BR-LOST-08/17）：同键重放返回首次结果，不重复激活或审计。 */
    @Transactional
    public StatusOutcome updateStatus(CardPrincipal principal, String replacementId, String status,
                                     String trackingNo, LocalDate estimatedArrival, String idempotencyKey) {
        guard.requirePermission(principal, CardPermission.REPLACEMENT_STATUS_UPDATE);
        CardReplacement replacement = replacements.findById(replacementId)
                .orElseThrow(() -> new NotFoundException("REPLACEMENT_NOT_FOUND", "Replacement not found"));

        String digest = IdempotencyService.digest(replacementId, status, trackingNo,
                estimatedArrival == null ? null : estimatedArrival.toString());
        Optional<WriteIdempotency> prior = idempotency.find(SCOPE_STATUS, idempotencyKey);
        if (prior.isPresent()) {
            WriteIdempotency record = prior.get();
            if (!record.getRequestDigest().equals(digest) || !record.getSubjectId().equals(principal.userId())) {
                throw new BusinessRuleException("IDEMPOTENCY_KEY_CONFLICT",
                        "Idempotency key was used with a different request or subject.");
            }
            return new StatusOutcome(replacements.findById(replacementId).orElse(replacement), true);
        }
        idempotency.reserve(SCOPE_STATUS, idempotencyKey, digest, principal.userId());

        ReplacementStatus target = ReplacementStatus.parse(status);
        LocalDateTime now = LocalDateTime.now();
        switch (target) {
            case CARD_PRODUCED -> replacement.markProduced(now);
            case SHIPPED -> replacement.markShipped(now, trackingNo, estimatedArrival);
            case ACTIVATED -> {
                replacement.markActivated(now);
                activateNewCard(replacement);
            }
            case CANCELLED -> replacement.markCancelled(now);
            default -> throw new BusinessRuleException("INVALID_STATE_TRANSITION", "Unsupported target status.");
        }
        replacements.saveReplacement(replacement);

        audit.record(principal.userId(), "REPLACEMENT_" + target.name(), "REPLACEMENT", replacementId,
                last4Of(replacement), replacement.getReason(), null, null, UUID.randomUUID().toString(),
                "{\"status\":\"" + target + "\"}");
        notifications.notify("REPLACEMENT_" + target.name(), replacement.getCustomerId(),
                "REPLACEMENT_STATUS_NOTICE", replacementId);
        idempotency.complete(SCOPE_STATUS, idempotencyKey, replacementId, 200);
        return new StatusOutcome(replacement, false);
    }

    private void activateNewCard(CardReplacement replacement) {
        String newCardNumber = cipher.decrypt(replacement.getNewCardCipher());
        Card card = cards.findByCardNumber(newCardNumber).orElseThrow(
                () -> new IllegalStateException("Replacement card is missing"));
        card.activate();
        cards.saveCard(card);
    }

    @Transactional(readOnly = true)
    public PageResult page(CardPrincipal principal, String status, int page, int size) {
        guard.requirePermission(principal, CardPermission.REPLACEMENT_READ_ANY);
        List<ReplacementStatus> statuses = status == null || status.isBlank()
                ? List.of(ReplacementStatus.values())
                : List.of(ReplacementStatus.parse(status));
        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), 100);
        List<CardReplacement> items = replacements.findPage(statuses, safePage, safeSize);
        long total = replacements.countPage(statuses);
        return new PageResult(items, safePage, safeSize, total);
    }

    private void requireVisible(CardPrincipal principal, CardReplacement replacement) {
        if (principal.isAdmin()) {
            guard.requirePermission(principal, CardPermission.REPLACEMENT_READ_ANY);
        } else {
            requireOwner(principal, replacement);
        }
    }

    private void requireOwner(CardPrincipal principal, CardReplacement replacement) {
        String customerId = guard.customerIdOf(principal);
        if (customerId == null || !customerId.equals(replacement.getCustomerId())) {
            throw new NotFoundException("REPLACEMENT_NOT_FOUND", "Replacement not found");
        }
    }

    private static String last4Of(CardReplacement replacement) {
        String masked = replacement.getOldCardNumber();
        return masked.substring(masked.length() - 4);
    }

    public record CreateOutcome(CardReplacement replacement, boolean replayed) {
    }

    public record CancelOutcome(CardReplacement replacement, boolean replayed) {
    }

    public record StatusOutcome(CardReplacement replacement, boolean replayed) {
    }

    public record PageResult(List<CardReplacement> items, int page, int size, long total) {
    }
}

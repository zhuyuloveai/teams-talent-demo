package com.carddemo.card.application;

import com.carddemo.card.domain.exception.BusinessRuleException;
import com.carddemo.card.domain.exception.ForbiddenException;
import com.carddemo.card.domain.exception.NotFoundException;
import com.carddemo.card.domain.model.Card;
import com.carddemo.card.domain.model.CardPermission;
import com.carddemo.card.domain.model.CardReplacement;
import com.carddemo.card.domain.model.FeeStatus;
import com.carddemo.card.domain.model.NumberStatus;
import com.carddemo.card.domain.model.ReplacementStatus;
import com.carddemo.card.domain.model.WriteIdempotency;
import com.carddemo.card.domain.repository.CardReplacementRepository;
import com.carddemo.card.domain.repository.CardRepository;
import com.carddemo.card.domain.service.CardRef;
import com.carddemo.card.infrastructure.client.CustomerClient;
import com.carddemo.card.infrastructure.security.CardPrincipal;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/**
 * 补卡用例（REQ-LOST-03/04/06、REQ-LOST-07）。补卡申请仅持卡人本人（PRD v1.2 §6.2）。
 * <p>
 * 请求边界（002-A004/A006/C05/C08）：
 * <ol>
 *   <li>归属/权限与地址校验在事务之外完成（地址校验是远端调用，不占用数据库连接）；</li>
 *   <li>请求计数以独立事务写入，状态机拒绝的请求同样计数；</li>
 *   <li>写事务由 {@link ReplacementCommandService} 完成，提交后才驱动收费/补号等可重试步骤。</li>
 * </ol>
 */
@Service
public class ReplacementService {

    private final CardRepository cards;
    private final CardReplacementRepository replacements;
    private final ReplacementCommandService commands;
    private final IdempotencyService idempotency;
    private final AccessGuard guard;
    private final CustomerClient customers;
    private final AlertService alerts;
    private final FeeWorkflow feeWorkflow;
    private final ReplacementNumberWorker numberWorker;
    private final CardRef cardRefs;

    public ReplacementService(CardRepository cards, CardReplacementRepository replacements,
                              ReplacementCommandService commands, IdempotencyService idempotency,
                              AccessGuard guard, CustomerClient customers, AlertService alerts,
                              FeeWorkflow feeWorkflow, ReplacementNumberWorker numberWorker, CardRef cardRefs) {
        this.cards = cards;
        this.replacements = replacements;
        this.commands = commands;
        this.idempotency = idempotency;
        this.guard = guard;
        this.customers = customers;
        this.alerts = alerts;
        this.feeWorkflow = feeWorkflow;
        this.numberWorker = numberWorker;
        this.cardRefs = cardRefs;
    }

    public CreateOutcome create(CardPrincipal principal, String cardNumber, String addressId,
                                String deliveryMethod, String reason, String idempotencyKey) {
        if (principal.isAdmin()) {
            throw new ForbiddenException("FORBIDDEN", "Replacement can only be requested by the cardholder.");
        }
        Card card = cards.findByCardNumber(cardNumber)
                .orElseThrow(() -> new NotFoundException("CARD_NOT_FOUND", "Card not found"));
        guard.requireCardOwner(principal, card);

        String digest = IdempotencyService.digest(cardNumber, addressId, deliveryMethod, reason);
        Optional<WriteIdempotency> prior = idempotency.find(ReplacementCommandService.SCOPE_CREATE, idempotencyKey);
        if (prior.isPresent() && prior.get().getResultRef() != null) {
            WriteIdempotency record = prior.get();
            if (!record.getRequestDigest().equals(digest) || !record.getSubjectId().equals(principal.userId())) {
                throw new BusinessRuleException("IDEMPOTENCY_KEY_CONFLICT",
                        "Idempotency key was used with a different request or subject.");
            }
            return new CreateOutcome(replacements.findById(record.getResultRef())
                    .orElseThrow(() -> new IllegalStateException("Replacement vanished")), true);
        }

        // 002-C05：计数先于状态机校验；同 kind + 同 key 只计一次。
        alerts.registerAttempt(com.carddemo.card.domain.model.RequestAttempt.KIND_REPLACEMENT,
                cardRefs.of(cardNumber), idempotencyKey, java.time.LocalDateTime.now());
        // 地址归属校验是远端调用，放在事务外，避免事务期间占用连接。
        customers.requireOwnedAddress(card.getCustomerId(), addressId);

        ReplacementCommandService.CommandOutcome created = commands.create(principal, cardNumber, addressId,
                deliveryMethod, reason, idempotencyKey, digest);
        CardReplacement replacement = created.replacement();
        if (created.replayed()) {
            return new CreateOutcome(replacement, true);
        }

        if (replacement.getFeeStatus() == FeeStatus.FEE_PENDING) {
            feeWorkflow.charge(replacement.getReplacementId());
        }
        if (replacement.getNumberStatus() == NumberStatus.PENDING) {
            numberWorker.assignIfPending(replacement.getReplacementId());
        }
        CardReplacement current = replacements.findById(replacement.getReplacementId()).orElse(replacement);
        return new CreateOutcome(current, false);
    }

    /** 取消（BR-LOST-10/17）：仅 REQUESTED；费用由稳定退款身份冲回一次，未确认收费则停收。 */
    public CancelOutcome cancel(CardPrincipal principal, String replacementId, String idempotencyKey) {
        CardReplacement replacement = replacements.findById(replacementId)
                .orElseThrow(() -> new NotFoundException("REPLACEMENT_NOT_FOUND", "Replacement not found"));
        if (principal.isAdmin()) {
            guard.requirePermission(principal, CardPermission.REPLACEMENT_CANCEL_ASSIST);
        } else if (!isOwner(principal, replacement)) {
            throw new NotFoundException("REPLACEMENT_NOT_FOUND", "Replacement not found");
        }

        ReplacementCommandService.CommandOutcome cancelled = commands.cancel(principal, replacementId,
                idempotencyKey);
        if (cancelled.replayed()) {
            // 同键同载荷/主体重放：返回首次结果，不重复退款/通知/审计。
            return new CancelOutcome(replacements.findById(replacementId).orElse(cancelled.replacement()), true);
        }
        if (cancelled.replacement().getFeeStatus() == FeeStatus.REFUND_PENDING) {
            feeWorkflow.refund(replacementId);
        }
        return new CancelOutcome(replacements.findById(replacementId).orElse(cancelled.replacement()), false);
    }

    /**
     * 运营状态更新（BR-LOST-08/17）：CANCELLED 不允许绕过取消权限与费用链（002-A005），
     * 统一走 {@link #cancel} 的权限、幂等与退款/停收流程。
     */
    public StatusOutcome updateStatus(CardPrincipal principal, String replacementId, String status,
                                     String trackingNo, LocalDate estimatedArrival, String idempotencyKey) {
        ReplacementStatus target = ReplacementStatus.parse(status);
        if (target == ReplacementStatus.CANCELLED) {
            // 取消必须复用与持卡人取消相同的权限点（cancel:assist）、幂等与退款/停收链，
            // 不能因为"运营状态更新"权限而绕过（002-A005）。
            CancelOutcome cancelOutcome = cancel(principal, replacementId, idempotencyKey);
            return new StatusOutcome(cancelOutcome.replacement(), cancelOutcome.replayed());
        }
        guard.requirePermission(principal, CardPermission.REPLACEMENT_STATUS_UPDATE);
        String digest = IdempotencyService.digest(replacementId, status, trackingNo,
                estimatedArrival == null ? null : estimatedArrival.toString());
        ReplacementCommandService.CommandOutcome updated = commands.updateStatus(principal, replacementId, target,
                trackingNo, estimatedArrival, idempotencyKey, digest);
        return new StatusOutcome(updated.replacement(), updated.replayed());
    }

    public CardReplacement get(CardPrincipal principal, String replacementId) {
        CardReplacement replacement = replacements.findById(replacementId)
                .orElseThrow(() -> new NotFoundException("REPLACEMENT_NOT_FOUND", "Replacement not found"));
        requireVisible(principal, replacement);
        return replacement;
    }

    public List<CardReplacement> listByCard(CardPrincipal principal, String cardNumber) {
        Card card = cards.findByCardNumber(cardNumber)
                .orElseThrow(() -> new NotFoundException("CARD_NOT_FOUND", "Card not found"));
        if (principal.isAdmin()) {
            guard.requirePermission(principal, CardPermission.REPLACEMENT_READ_ANY);
        } else {
            guard.requireCardOwner(principal, card);
        }
        return replacements.findByOldCardRefOrderByRequestedAtDesc(cardRefs.of(cardNumber));
    }

    public PageResult page(CardPrincipal principal, String status, int page, int size) {
        guard.requirePermission(principal, CardPermission.REPLACEMENT_READ_ANY);
        List<ReplacementStatus> statuses = status == null || status.isBlank()
                ? List.of(ReplacementStatus.values())
                : List.of(ReplacementStatus.parse(status));
        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), 100);
        return new PageResult(replacements.findPage(statuses, safePage, safeSize), safePage, safeSize,
                replacements.countPage(statuses));
    }

    private void requireVisible(CardPrincipal principal, CardReplacement replacement) {
        if (principal.isAdmin()) {
            guard.requirePermission(principal, CardPermission.REPLACEMENT_READ_ANY);
        } else if (!isOwner(principal, replacement)) {
            throw new NotFoundException("REPLACEMENT_NOT_FOUND", "Replacement not found");
        }
    }

    private boolean isOwner(CardPrincipal principal, CardReplacement replacement) {
        String customerId = guard.customerIdOf(principal);
        return customerId != null && customerId.equals(replacement.getCustomerId());
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

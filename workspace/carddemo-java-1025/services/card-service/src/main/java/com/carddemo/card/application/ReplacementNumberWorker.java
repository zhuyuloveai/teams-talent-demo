package com.carddemo.card.application;

import com.carddemo.card.domain.model.Card;
import com.carddemo.card.domain.model.CardLevel;
import com.carddemo.card.domain.model.CardReplacement;
import com.carddemo.card.domain.model.NumberStatus;
import com.carddemo.card.domain.repository.CardReplacementRepository;
import com.carddemo.card.domain.repository.CardRepository;
import com.carddemo.card.domain.service.CardNumberCipher;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 新卡号分配重试（002-C08）：号码生成是持久步骤，号段恢复后由本 worker（或同一工单的幂等重试）
 * 继续为 REQUESTED 工单补号；不会重复建单、不会重复收费。
 */
@Service
public class ReplacementNumberWorker {

    private static final Logger log = LoggerFactory.getLogger(ReplacementNumberWorker.class);

    private final CardReplacementRepository replacements;
    private final CardRepository cards;
    private final ReplacementCommandService commands;
    private final CardNumberCipher cipher;
    private final TransactionTemplate tx;
    private final boolean schedulingEnabled;

    public ReplacementNumberWorker(CardReplacementRepository replacements, CardRepository cards,
                                   ReplacementCommandService commands, CardNumberCipher cipher,
                                   PlatformTransactionManager transactionManager,
                                   @Value("${card.workers.enabled:true}") boolean schedulingEnabled) {
        this.replacements = replacements;
        this.cards = cards;
        this.commands = commands;
        this.cipher = cipher;
        this.tx = new TransactionTemplate(transactionManager);
        this.schedulingEnabled = schedulingEnabled;
    }

    @Scheduled(fixedDelayString = "${card.number.retry-interval-ms:10000}",
            initialDelayString = "${card.number.initial-delay-ms:3000}")
    public void scheduledSweep() {
        if (!schedulingEnabled) {
            return;
        }
        try {
            sweep();
        } catch (RuntimeException ex) {
            log.warn("card number assignment round failed: {}", ex.getMessage());
        }
    }

    public int sweep() {
        int assigned = 0;
        for (CardReplacement pending : replacements.findNumberPending(20)) {
            if (assignIfPending(pending.getReplacementId())) {
                assigned++;
            }
        }
        return assigned;
    }

    /** 尝试为一个工单补号；号段仍不可用时保持 PENDING 并返回 false（不向上抛，调用方已告警）。 */
    public boolean assignIfPending(String replacementId) {
        try {
            return tryAssign(replacementId);
        } catch (com.carddemo.card.domain.exception.BusinessRuleException ex) {
            log.warn("card number still unavailable for {}: {}", replacementId, ex.getCode());
            return false;
        }
    }

    private boolean tryAssign(String replacementId) {
        Boolean assigned = tx.execute(status -> {
            CardReplacement replacement = replacements.findByIdForUpdate(replacementId).orElse(null);
            if (replacement == null || replacement.getNumberStatus() == NumberStatus.ASSIGNED) {
                return false;
            }
            String oldCardNumber = cipher.decrypt(replacement.getOldCardCipher());
            Card oldCard = cards.findByCardNumber(oldCardNumber).orElse(null);
            if (oldCard == null) {
                return false;
            }
            commands.assignCardNumber(replacement, oldCard, oldCardNumber,
                    CardLevel.from(oldCard.getCardLevel()));
            replacements.saveReplacement(replacement);
            return true;
        });
        return Boolean.TRUE.equals(assigned);
    }
}

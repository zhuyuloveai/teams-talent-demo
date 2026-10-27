package com.carddemo.card.application;

import com.carddemo.card.domain.exception.BusinessRuleException;
import com.carddemo.card.domain.exception.NotFoundException;
import com.carddemo.card.domain.model.Card;
import com.carddemo.card.domain.model.CardMaintenance;
import com.carddemo.card.domain.model.CardRegistration;
import com.carddemo.card.domain.model.CardXref;
import com.carddemo.card.domain.repository.CardPage;
import com.carddemo.card.domain.repository.CardRepository;
import com.carddemo.card.domain.repository.CardXrefRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 卡片用例服务。对应遗留程序 COCRDLIC（列表）、COCRDSLC（详情）、COCRDUPC（维护），
 * 并补齐新卡注册（CARD + CARDXREF 同步写入）。
 */
@Service
@Transactional
public class CardApplicationService {

    private final CardRepository cards;
    private final CardXrefRepository xrefs;

    public CardApplicationService(CardRepository cards, CardXrefRepository xrefs) {
        this.cards = cards;
        this.xrefs = xrefs;
    }

    /**
     * BR-CARD-02/03：按卡号升序分页，账户号与客户号过滤条件为 AND。
     */
    @Transactional(readOnly = true)
    public CardPage list(String accountId, String customerId, int page, int size) {
        return cards.findPage(blankToNull(accountId), blankToNull(customerId), page, size);
    }

    @Transactional(readOnly = true)
    public Card get(String cardNumber) {
        return cards.findByCardNumber(cardNumber)
                .orElseThrow(() -> new NotFoundException("CARD_NOT_FOUND",
                        "Card " + cardNumber + " not found"));
    }

    /**
     * 供账户视图组合查询（BR-ACCT-07/08），不分页。
     */
    @Transactional(readOnly = true)
    public List<Card> listByAccount(String accountId) {
        return cards.findByAccountId(accountId);
    }

    /**
     * 新卡注册：卡号唯一，且同一账户下所有卡必须属于同一客户。
     */
    public Card create(CardRegistration registration) {
        if (cards.existsByCardNumber(registration.cardNumber())) {
            throw new BusinessRuleException("CARD_ALREADY_EXISTS",
                    "Card " + registration.cardNumber() + " already exists");
        }
        boolean customerMismatch = cards.findByAccountId(registration.accountId()).stream()
                .anyMatch(card -> !card.getCustomerId().equals(registration.customerId()));
        if (customerMismatch) {
            throw new BusinessRuleException("ACCOUNT_CUSTOMER_MISMATCH",
                    "Account " + registration.accountId() + " belongs to another customer");
        }
        Card card = cards.saveCard(new Card(registration));
        xrefs.saveXref(new CardXref(card.getCardNumber(), card.getCustomerId(), card.getAccountId()));
        return card;
    }

    /**
     * BR-CARD-11 + NR-CARD-01：只改卡面名/状态/到期月年，CVV 与卡号、归属不变。
     * REQ-2026-002：已挂失/已销户的卡不得通过通用维护重新启用（不得绕过旧卡永久失效）。
     */
    public Card update(String cardNumber, CardMaintenance maintenance) {
        Card card = get(cardNumber);
        if ("Y".equals(maintenance.activeStatus())
                && (Card.STATUS_LOST.equals(card.getCardStatus())
                || Card.STATUS_CLOSED.equals(card.getCardStatus()))) {
            throw new BusinessRuleException("CARD_NOT_ACTIVE",
                    "A lost or closed card cannot be re-activated through card maintenance.");
        }
        card.applyMaintenance(maintenance.embossedName(), maintenance.activeStatus(),
                maintenance.expiryMonth(), maintenance.expiryYear());
        return cards.saveCard(card);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}

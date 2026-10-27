package com.carddemo.card.interfaces.rest.dto;

import com.carddemo.card.domain.model.Card;
import com.carddemo.card.domain.service.Masking;

import java.time.LocalDate;

/**
 * 卡片响应。NR-CARD-02：不得返回 CVV。
 * REQ-2026-002：新增业务状态、卡级别与后 4 位；cardNumber 保持既有合同（改动会破坏存量页面与基线测试），
 * 本需求新增接口一律只返回后 4 位。
 */
public record CardResponse(
        String cardNumber,
        String cardNumberLast4,
        String accountId,
        String customerId,
        String embossedName,
        LocalDate expiryDate,
        String activeStatus,
        String cardStatus,
        String cardLevel,
        long version) {

    public static CardResponse from(Card card) {
        return new CardResponse(
                card.getCardNumber(),
                Masking.last4(card.getCardNumber()),
                card.getAccountId(),
                card.getCustomerId(),
                card.getEmbossedName(),
                card.getExpirationDate(),
                card.getActiveStatus(),
                card.getCardStatus(),
                card.getCardLevel(),
                card.getVersion());
    }
}

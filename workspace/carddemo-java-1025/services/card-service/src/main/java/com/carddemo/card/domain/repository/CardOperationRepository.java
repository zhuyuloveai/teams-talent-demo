package com.carddemo.card.domain.repository;

import com.carddemo.card.domain.model.CardOperation;

import java.util.List;

/** 卡操作流水仓储端口。 */
public interface CardOperationRepository {

    CardOperation saveOperation(CardOperation operation);

    List<CardOperation> findByCardNumberOrderByCreatedAtDesc(String cardNumber);
}

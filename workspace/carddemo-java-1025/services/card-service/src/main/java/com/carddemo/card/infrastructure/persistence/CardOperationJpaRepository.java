package com.carddemo.card.infrastructure.persistence;

import com.carddemo.card.domain.model.CardOperation;
import com.carddemo.card.domain.repository.CardOperationRepository;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CardOperationJpaRepository extends JpaRepository<CardOperation, String>, CardOperationRepository {

    List<CardOperation> findByCardNumberOrderByCreatedAtDesc(String cardNumber);

    @Override
    default CardOperation saveOperation(CardOperation operation) {
        return save(operation);
    }
}

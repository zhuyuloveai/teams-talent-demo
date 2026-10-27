package com.carddemo.card.infrastructure.persistence;

import com.carddemo.card.domain.model.WriteIdempotency;
import com.carddemo.card.domain.repository.IdempotencyRepository;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface WriteIdempotencyJpaRepository
        extends JpaRepository<WriteIdempotency, WriteIdempotency.Key>, IdempotencyRepository {

    @Override
    default Optional<WriteIdempotency> find(String scope, String idempotencyKey) {
        return findById(new WriteIdempotency.Key(scope, idempotencyKey));
    }

    @Override
    default WriteIdempotency saveRecord(WriteIdempotency record) {
        return save(record);
    }
}

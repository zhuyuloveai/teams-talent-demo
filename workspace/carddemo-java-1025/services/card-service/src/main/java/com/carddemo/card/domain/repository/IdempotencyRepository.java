package com.carddemo.card.domain.repository;

import com.carddemo.card.domain.model.WriteIdempotency;

import java.util.Optional;

/** 写操作幂等仓储端口。 */
public interface IdempotencyRepository {

    Optional<WriteIdempotency> find(String scope, String idempotencyKey);

    WriteIdempotency saveRecord(WriteIdempotency record);
}

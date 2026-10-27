package com.carddemo.transaction.domain.repository;

import com.carddemo.transaction.domain.model.TransactionRecord;

import java.util.List;
import java.util.Optional;

/**
 * 交易仓储端口。实现见 infrastructure.persistence.TransactionJpaRepository。
 */
public interface TransactionRepository {

    Optional<TransactionRecord> findByTransactionId(String transactionId);

    boolean existsByTransactionId(String transactionId);

    /** 退款单反查：一笔原收费最多一笔退款（002-A002）。 */
    Optional<TransactionRecord> findByOriginalTransactionId(String originalTransactionId);

    TransactionRecord saveTransaction(TransactionRecord transaction);

    /**
     * BR-TRN-07：当前最大交易号，无记录时返回空。
     */
    Optional<String> findMaxTransactionId();

    /**
     * 利息交易号前缀（yyyyMMdd）下的最大交易号。
     */
    Optional<String> findMaxTransactionIdByPrefix(String prefix);

    PageResult<TransactionRecord> search(TransactionFilter filter, int page, int size);

    List<TransactionRecord> searchAll(TransactionFilter filter);
}

package com.carddemo.transaction.infrastructure.persistence;

import com.carddemo.transaction.domain.exception.BusinessRuleException;
import com.carddemo.transaction.domain.model.TransactionRecord;
import com.carddemo.transaction.domain.repository.PageResult;
import com.carddemo.transaction.domain.repository.TransactionFilter;
import com.carddemo.transaction.domain.repository.TransactionRepository;
import jakarta.persistence.criteria.Predicate;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public interface TransactionJpaRepository
        extends JpaRepository<TransactionRecord, String>, JpaSpecificationExecutor<TransactionRecord>,
        TransactionRepository {

    @Override
    default Optional<TransactionRecord> findByTransactionId(String transactionId) {
        return findById(transactionId);
    }

    @Override
    default boolean existsByTransactionId(String transactionId) {
        return existsById(transactionId);
    }

    @Override
    default TransactionRecord saveTransaction(TransactionRecord transaction) {
        try {
            return saveAndFlush(transaction);
        } catch (DataIntegrityViolationException ex) {
            throw new BusinessRuleException("DUPLICATE_TRANSACTION_ID",
                    "Transaction " + transaction.getTransactionId() + " already exists");
        }
    }

    Optional<TransactionRecord> findRecordByOriginalTransactionId(String originalTransactionId);

    @Override
    default Optional<TransactionRecord> findByOriginalTransactionId(String originalTransactionId) {
        return findRecordByOriginalTransactionId(originalTransactionId);
    }

    @Override
    default Optional<String> findMaxTransactionId() {
        return findMaxTransactionIdValue();
    }

    @Override
    default Optional<String> findMaxTransactionIdByPrefix(String prefix) {
        return findMaxTransactionIdValueByPrefix(prefix);
    }

    @Override
    default PageResult<TransactionRecord> search(TransactionFilter filter, int page, int size) {
        Page<TransactionRecord> result = findAll(specification(filter),
                PageRequest.of(page, size, Sort.by(Sort.Direction.ASC, "transactionId")));
        return new PageResult<>(result.getContent(), result.getTotalElements());
    }

    @Override
    default List<TransactionRecord> searchAll(TransactionFilter filter) {
        return findAll(specification(filter), Sort.by(Sort.Direction.ASC, "transactionId"));
    }

    @Query("select max(t.transactionId) from TransactionRecord t")
    Optional<String> findMaxTransactionIdValue();

    @Query("select max(t.transactionId) from TransactionRecord t where t.transactionId like concat(:prefix, '%')")
    Optional<String> findMaxTransactionIdValueByPrefix(@Param("prefix") String prefix);

    private static Specification<TransactionRecord> specification(TransactionFilter filter) {
        return (root, query, builder) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (StringUtils.hasText(filter.idPrefix())) {
                predicates.add(builder.like(root.get("transactionId"), filter.idPrefix() + "%"));
            }
            if (StringUtils.hasText(filter.cardNumber())) {
                predicates.add(builder.equal(root.get("cardNumber"), filter.cardNumber()));
            }
            if (StringUtils.hasText(filter.accountId())) {
                predicates.add(builder.equal(root.get("accountId"), filter.accountId()));
            }
            if (filter.processedFrom() != null) {
                predicates.add(builder.greaterThanOrEqualTo(root.get("processedTimestamp"), filter.processedFrom()));
            }
            if (filter.processedTo() != null) {
                predicates.add(builder.lessThanOrEqualTo(root.get("processedTimestamp"), filter.processedTo()));
            }
            return builder.and(predicates.toArray(new Predicate[0]));
        };
    }
}

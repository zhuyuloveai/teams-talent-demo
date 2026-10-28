package com.carddemo.card.infrastructure.persistence;

import com.carddemo.card.domain.model.CardReplacement;
import com.carddemo.card.domain.model.NumberStatus;
import com.carddemo.card.domain.model.ReplacementStatus;
import com.carddemo.card.domain.repository.CardReplacementRepository;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface CardReplacementJpaRepository
        extends JpaRepository<CardReplacement, String>, CardReplacementRepository {

    Optional<CardReplacement> findByIdempotencyKey(String idempotencyKey);

    Optional<CardReplacement> findByActiveKey(String activeKey);

    List<CardReplacement> findByOldCardRefOrderByRequestedAtDesc(String oldCardRef);

    Page<CardReplacement> findByStatusIn(Collection<ReplacementStatus> statuses, Pageable pageable);

    long countByStatusIn(Collection<ReplacementStatus> statuses);

    List<CardReplacement> findByStatusAndTrackingNoIsNullAndShippedAtBefore(ReplacementStatus status,
                                                                            LocalDateTime threshold);

    boolean existsByNewCardRef(String newCardRef);

    List<CardReplacement> findByNumberStatusAndStatusOrderByRequestedAtAsc(NumberStatus numberStatus,
                                                                          ReplacementStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from CardReplacement r where r.replacementId = :replacementId")
    Optional<CardReplacement> findForUpdate(@Param("replacementId") String replacementId);

    @Override
    default Optional<CardReplacement> findByIdForUpdate(String replacementId) {
        return findForUpdate(replacementId);
    }

    @Override
    default boolean existsNewCardRef(String newCardRef) {
        return existsByNewCardRef(newCardRef);
    }

    @Override
    default long countPage(Collection<ReplacementStatus> statuses) {
        return countByStatusIn(statuses);
    }

    @Override
    default List<CardReplacement> findShippedWithoutTrackingBefore(LocalDateTime threshold) {
        return findByStatusAndTrackingNoIsNullAndShippedAtBefore(ReplacementStatus.SHIPPED, threshold);
    }

    @Override
    default List<CardReplacement> findNumberPending(int limit) {
        // 002-C08：已取消（终态）的工单不再补号，避免取消后新建卡行。
        List<CardReplacement> all = findByNumberStatusAndStatusOrderByRequestedAtAsc(NumberStatus.PENDING,
                ReplacementStatus.REQUESTED);
        return all.size() > limit ? all.subList(0, limit) : all;
    }

    @Query(value = "SELECT nextval('replacement_effect_seq')", nativeQuery = true)
    long nextEffectSequence();

    @Override
    default String nextEffectId() {
        return String.format("%016d", nextEffectSequence());
    }

    @Override
    default List<CardReplacement> findPage(Collection<ReplacementStatus> statuses, int page, int size) {
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Order.desc("requestedAt")));
        return findByStatusIn(statuses, pageable).getContent();
    }

    @Override
    default CardReplacement saveReplacement(CardReplacement replacement) {
        return saveAndFlush(replacement);
    }
}

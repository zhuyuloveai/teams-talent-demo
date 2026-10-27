package com.carddemo.card.infrastructure.persistence;

import com.carddemo.card.domain.model.CardReplacement;
import com.carddemo.card.domain.model.ReplacementStatus;
import com.carddemo.card.domain.repository.CardReplacementRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface CardReplacementJpaRepository
        extends JpaRepository<CardReplacement, String>, CardReplacementRepository {

    Optional<CardReplacement> findByIdempotencyKey(String idempotencyKey);

    Optional<CardReplacement> findByActiveKey(String activeKey);

    List<CardReplacement> findByOldCardNumberOrderByRequestedAtDesc(String oldCardNumber);

    Page<CardReplacement> findByStatusIn(Collection<ReplacementStatus> statuses, Pageable pageable);

    long countByStatusIn(Collection<ReplacementStatus> statuses);

    List<CardReplacement> findByStatusAndTrackingNoIsNullAndShippedAtBefore(ReplacementStatus status,
                                                                            LocalDateTime threshold);

    boolean existsByNewCardNumber(String newCardNumber);

    @Override
    default boolean existsNewCardNumber(String newCardNumber) {
        return existsByNewCardNumber(newCardNumber);
    }

    @Override
    default long countPage(Collection<ReplacementStatus> statuses) {
        return countByStatusIn(statuses);
    }

    @Override
    default List<CardReplacement> findShippedWithoutTrackingBefore(LocalDateTime threshold) {
        return findByStatusAndTrackingNoIsNullAndShippedAtBefore(ReplacementStatus.SHIPPED, threshold);
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
        return save(replacement);
    }
}

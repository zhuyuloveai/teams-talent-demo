package com.carddemo.card.domain.repository;

import com.carddemo.card.domain.model.CardReplacement;
import com.carddemo.card.domain.model.ReplacementStatus;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

/** 补卡工单仓储端口。 */
public interface CardReplacementRepository {

    Optional<CardReplacement> findById(String replacementId);

    Optional<CardReplacement> findByIdempotencyKey(String idempotencyKey);

    Optional<CardReplacement> findByActiveKey(String activeKey);

    List<CardReplacement> findByOldCardNumberOrderByRequestedAtDesc(String oldCardNumber);

    List<CardReplacement> findPage(Collection<ReplacementStatus> statuses, int page, int size);

    long countPage(Collection<ReplacementStatus> statuses);

    List<CardReplacement> findShippedWithoutTrackingBefore(java.time.LocalDateTime threshold);

    CardReplacement saveReplacement(CardReplacement replacement);

    boolean existsNewCardNumber(String newCardNumber);

    /** 稳定的 16 位数字业务引用（费用/退款 effect 身份）。 */
    String nextEffectId();
}

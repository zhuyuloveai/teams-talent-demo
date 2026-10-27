package com.carddemo.card.domain.repository;

import com.carddemo.card.domain.model.CardReplacement;
import com.carddemo.card.domain.model.ReplacementStatus;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

/** 补卡工单仓储端口。 */
public interface CardReplacementRepository {

    Optional<CardReplacement> findById(String replacementId);

    /** 行锁读取：状态机与费用判定必须在同一临界区内。 */
    Optional<CardReplacement> findByIdForUpdate(String replacementId);

    Optional<CardReplacement> findByIdempotencyKey(String idempotencyKey);

    /** 进行中唯一性/归属按稳定卡身份（002-C03）。 */
    Optional<CardReplacement> findByActiveKey(String activeKey);

    List<CardReplacement> findByOldCardRefOrderByRequestedAtDesc(String oldCardRef);

    List<CardReplacement> findPage(Collection<ReplacementStatus> statuses, int page, int size);

    long countPage(Collection<ReplacementStatus> statuses);

    List<CardReplacement> findShippedWithoutTrackingBefore(java.time.LocalDateTime threshold);

    /** 已受理但尚未分配到新卡号的工单（002-C08）。 */
    List<CardReplacement> findNumberPending(int limit);

    CardReplacement saveReplacement(CardReplacement replacement);

    boolean existsNewCardRef(String newCardRef);

    /** 稳定的 16 位数字业务引用（费用/退款 effect 身份）。 */
    String nextEffectId();
}

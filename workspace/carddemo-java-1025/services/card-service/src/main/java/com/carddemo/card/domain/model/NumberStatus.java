package com.carddemo.card.domain.model;

/** 新卡号分配状态（002-C08）：受理即落 REQUESTED，号段不可用时保持 PENDING 并可重试。 */
public enum NumberStatus {
    PENDING,
    ASSIGNED
}

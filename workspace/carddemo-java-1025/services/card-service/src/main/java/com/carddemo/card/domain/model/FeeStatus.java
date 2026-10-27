package com.carddemo.card.domain.model;

/** 补卡费状态（原文 §4.2 + D-13：新增 REFUNDED 表达已冲回）。 */
public enum FeeStatus {
    CHARGED,
    FEE_PENDING,
    WAIVED,
    REFUNDED
}

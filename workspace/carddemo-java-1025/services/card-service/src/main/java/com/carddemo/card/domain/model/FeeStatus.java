package com.carddemo.card.domain.model;

/** 补卡费状态（原文 §4.2 + D-13；002-A002 增加 REFUND_PENDING 表达"已决定冲回、尚未确认"）。 */
public enum FeeStatus {
    CHARGED,
    FEE_PENDING,
    REFUND_PENDING,
    WAIVED,
    REFUNDED
}

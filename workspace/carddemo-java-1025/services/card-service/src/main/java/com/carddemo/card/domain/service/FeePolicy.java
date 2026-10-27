package com.carddemo.card.domain.service;

import com.carddemo.card.domain.model.CardLevel;
import com.carddemo.card.domain.model.FeeStatus;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

/**
 * 补卡费规则（BR-LOST-03）：白金卡免收，其余卡固定 50.00。
 * 数值为本轮模拟值（PRD D-07 / 原文 §12.3-4 投产待确认），通过配置注入并标记 SIMULATION。
 */
@Component
public class FeePolicy {

    private static final BigDecimal ZERO = new BigDecimal("0.00");

    private final BigDecimal standardFee;

    public FeePolicy(@Value("${replacement.fee.amount:50.00}") BigDecimal standardFee) {
        this.standardFee = standardFee.setScale(2, java.math.RoundingMode.HALF_UP);
    }

    public BigDecimal feeFor(CardLevel level) {
        return level == CardLevel.PLATINUM ? ZERO : standardFee.setScale(2);
    }

    public FeeStatus initialStatusFor(CardLevel level) {
        return level == CardLevel.PLATINUM ? FeeStatus.WAIVED : FeeStatus.FEE_PENDING;
    }

    public BigDecimal standardFee() {
        return standardFee;
    }
}

package com.carddemo.card.domain.service;

import com.carddemo.card.domain.model.CardLevel;
import com.carddemo.card.domain.model.FeeStatus;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class MaskingAndFeePolicyTest {

    private final FeePolicy feePolicy = new FeePolicy(new BigDecimal("50.00"));

    @Test
    void storageMaskKeepsFirstSixAndLastFourOnly() {
        assertThat(Masking.forStorage("4000000000005740")).isEqualTo("400000******5740");
        assertThat(Masking.last4("4000000000005740")).isEqualTo("5740");
        assertThat(Masking.display("4000000000005740")).isEqualTo("**** **** **** 5740");
    }

    @Test
    void platinumIsFreeAndWaived() {
        assertThat(feePolicy.feeFor(CardLevel.PLATINUM)).isEqualByComparingTo("0.00");
        assertThat(feePolicy.initialStatusFor(CardLevel.PLATINUM)).isEqualTo(FeeStatus.WAIVED);
    }

    @Test
    void goldAndClassicPayFiftyAndStartPending() {
        assertThat(feePolicy.feeFor(CardLevel.GOLD)).isEqualByComparingTo("50.00");
        assertThat(feePolicy.feeFor(CardLevel.CLASSIC)).isEqualByComparingTo("50.00");
        assertThat(feePolicy.initialStatusFor(CardLevel.GOLD)).isEqualTo(FeeStatus.FEE_PENDING);
    }
}

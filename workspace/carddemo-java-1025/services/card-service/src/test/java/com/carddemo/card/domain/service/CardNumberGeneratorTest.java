package com.carddemo.card.domain.service;

import com.carddemo.card.domain.exception.BusinessRuleException;
import org.junit.jupiter.api.Test;

import java.security.SecureRandom;
import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CardNumberGeneratorTest {

    private final CardNumberGenerator generator = new CardNumberGenerator(true);

    @Test
    void generatesSixteenDigitNumberWithOldBinPrefixAndValidLuhn() {
        String generated = generator.next("3344556677889900", candidate -> false);

        assertThat(generated).hasSize(16).startsWith("334455").isNotEqualTo("3344556677889900");
        assertThat(CardNumberGenerator.isLuhnValid(generated)).isTrue();
    }

    /** 002-C08：号段不可用时明确失败，由调用方保留已受理工单并重试。 */
    @Test
    void unavailableRangeFailsExplicitly() {
        CardNumberGenerator disabled = new CardNumberGenerator(false);
        assertThatThrownBy(() -> disabled.next("3344556677889900", candidate -> false))
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("CARD_NUMBER_GENERATION_FAILED");
    }

    @Test
    void keepsRetryingUntilCandidateIsUnique() {
        Set<String> taken = new HashSet<>();
        for (int i = 0; i < 20; i++) {
            String generated = generator.next("4000000000009999", taken::contains);
            assertThat(taken).doesNotContain(generated);
            taken.add(generated);
        }
        assertThat(taken).hasSize(20);
    }

    @Test
    void luhnRejectsNonNumericAndBadChecksum() {
        assertThat(CardNumberGenerator.isLuhnValid("0500024453765740")).isTrue();
        assertThat(CardNumberGenerator.isLuhnValid("3344556677889900")).isFalse();
        assertThat(CardNumberGenerator.isLuhnValid("334455667788990X")).isFalse();
        assertThat(CardNumberGenerator.isLuhnValid(null)).isFalse();
    }

    @Test
    void rejectsOldCardNumberThatIsNotSixteenDigits() {
        assertThatThrownBy(() -> generator.next("123", candidate -> false))
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("CARD_NUMBER_GENERATION_FAILED");
    }

    @Test
    void deterministicRandomStillProducesValidNumbers() {
        CardNumberGenerator deterministic = new CardNumberGenerator(new SecureRandom() {
            @Override
            public int nextInt(int bound) {
                return 7 % bound;
            }
        });
        String generated = deterministic.next("1122334455667788", candidate -> false);
        assertThat(generated).startsWith("112233");
        assertThat(CardNumberGenerator.isLuhnValid(generated)).isTrue();
    }
}

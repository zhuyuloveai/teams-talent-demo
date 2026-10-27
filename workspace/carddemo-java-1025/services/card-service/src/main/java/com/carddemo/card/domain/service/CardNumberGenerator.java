package com.carddemo.card.domain.service;

import com.carddemo.card.domain.exception.BusinessRuleException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.util.function.Predicate;

/**
 * 新卡号生成（BR-LOST-12 / PRD D-16）：沿用旧卡前 6 位 BIN，16 位、Luhn 校验通过、全库唯一且不同于旧卡。
 * <p>
 * 002-C08：号段不可用时（{@code card.number.generation-enabled=false} 模拟）直接抛
 * {@code CARD_NUMBER_GENERATION_FAILED}，调用方保留已受理工单并告警/重试，而不是丢掉请求。
 * 仅本地测试号段，不构成卡组织认证；正式 BIN 规则见 PRD §12（§12.3-3 待确认）。
 */
@Component
public class CardNumberGenerator {

    private final SecureRandom random;
    private final boolean generationEnabled;

    @org.springframework.beans.factory.annotation.Autowired
    public CardNumberGenerator(@Value("${card.number.generation-enabled:true}") boolean generationEnabled) {
        this(new SecureRandom(), generationEnabled);
    }

    public CardNumberGenerator(SecureRandom random) {
        this(random, true);
    }

    public CardNumberGenerator(SecureRandom random, boolean generationEnabled) {
        this.random = random;
        this.generationEnabled = generationEnabled;
    }

    public String next(String oldCardNumber, Predicate<String> exists) {
        if (!generationEnabled) {
            throw new BusinessRuleException("CARD_NUMBER_GENERATION_FAILED",
                    "The local card number range is currently unavailable.");
        }
        if (oldCardNumber == null || !oldCardNumber.matches("\\d{16}")) {
            throw new BusinessRuleException("CARD_NUMBER_GENERATION_FAILED", "Old card number is not valid.");
        }
        String bin = oldCardNumber.substring(0, 6);
        for (int attempt = 0; attempt < 50; attempt++) {
            StringBuilder body = new StringBuilder(bin);
            for (int i = 0; i < 9; i++) {
                body.append(random.nextInt(10));
            }
            String candidate = body + String.valueOf(checkDigit(body.toString()));
            if (!candidate.equals(oldCardNumber) && !exists.test(candidate)) {
                return candidate;
            }
        }
        throw new BusinessRuleException("CARD_NUMBER_GENERATION_FAILED",
                "Unable to allocate a unique card number in the local test range.");
    }

    /** Luhn 校验通过判定。 */
    public static boolean isLuhnValid(String cardNumber) {
        if (cardNumber == null || !cardNumber.matches("\\d+")) {
            return false;
        }
        int sum = 0;
        boolean doubleDigit = false;
        for (int i = cardNumber.length() - 1; i >= 0; i--) {
            int digit = cardNumber.charAt(i) - '0';
            if (doubleDigit) {
                digit *= 2;
                if (digit > 9) {
                    digit -= 9;
                }
            }
            sum += digit;
            doubleDigit = !doubleDigit;
        }
        return sum % 10 == 0;
    }

    static int checkDigit(String partial) {
        int sum = 0;
        boolean doubleDigit = true;
        for (int i = partial.length() - 1; i >= 0; i--) {
            int digit = partial.charAt(i) - '0';
            if (doubleDigit) {
                digit *= 2;
                if (digit > 9) {
                    digit -= 9;
                }
            }
            sum += digit;
            doubleDigit = !doubleDigit;
        }
        return (10 - (sum % 10)) % 10;
    }
}

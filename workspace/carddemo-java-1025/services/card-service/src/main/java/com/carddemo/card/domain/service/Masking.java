package com.carddemo.card.domain.service;

/**
 * 卡号掩码口径（PRD D-02）：存储掩码列 = 前 6 + 后 4；展示/日志/事件/导出仅后 4 位。
 */
public final class Masking {

    private Masking() {
    }

    /** 存储掩码：前 6 位 + "******" + 后 4 位（19 位定长）。 */
    public static String forStorage(String cardNumber) {
        String digits = requireDigits(cardNumber);
        return digits.substring(0, 6) + "******" + digits.substring(12);
    }

    /** 展示/日志口径：仅后 4 位。 */
    public static String last4(String cardNumber) {
        return requireDigits(cardNumber).substring(12);
    }

    /** 页面展示格式：**** **** **** 1234。 */
    public static String display(String cardNumber) {
        return "**** **** **** " + last4(cardNumber);
    }

    private static String requireDigits(String cardNumber) {
        if (cardNumber == null || !cardNumber.matches("\\d{16}")) {
            throw new IllegalArgumentException("Card number must be 16 digits");
        }
        return cardNumber;
    }
}

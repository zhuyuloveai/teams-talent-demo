package com.carddemo.card.domain.model;

/** 卡级别（D-07，模拟枚举）：仅用于补卡费减免判定。 */
public enum CardLevel {
    CLASSIC,
    GOLD,
    PLATINUM;

    public static CardLevel from(String raw) {
        if (raw == null) {
            return CLASSIC;
        }
        return switch (raw.trim().toUpperCase()) {
            case "PLATINUM" -> PLATINUM;
            case "GOLD" -> GOLD;
            default -> CLASSIC;
        };
    }
}

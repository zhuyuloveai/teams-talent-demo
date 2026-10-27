package com.carddemo.card.domain.model;

import com.carddemo.card.domain.exception.BusinessRuleException;

import java.util.Set;

/**
 * 补卡工单状态（BR-LOST-05/08）。合法边表是唯一依据：
 * REQUESTED→CARD_PRODUCED→SHIPPED→ACTIVATED；REQUESTED→CANCELLED。
 */
public enum ReplacementStatus {
    REQUESTED,
    CARD_PRODUCED,
    SHIPPED,
    ACTIVATED,
    CANCELLED;

    public static final Set<ReplacementStatus> IN_PROGRESS = Set.of(REQUESTED, CARD_PRODUCED, SHIPPED);

    public boolean isInProgress() {
        return IN_PROGRESS.contains(this);
    }

    public boolean canTransitionTo(ReplacementStatus next) {
        return switch (this) {
            case REQUESTED -> next == CARD_PRODUCED || next == CANCELLED;
            case CARD_PRODUCED -> next == SHIPPED;
            case SHIPPED -> next == ACTIVATED;
            case ACTIVATED, CANCELLED -> false;
        };
    }

    public static ReplacementStatus parse(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new BusinessRuleException("VALIDATION_FAILED", "Status must be supplied.");
        }
        try {
            return valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw new BusinessRuleException("VALIDATION_FAILED", "Unknown status: " + raw);
        }
    }
}

package com.carddemo.card.domain.model;

import com.carddemo.card.domain.exception.BusinessRuleException;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** REQ-2026-002 BR-LOST-01/04：卡状态机与可交易判定。 */
class CardStateTest {

    private Card card(String activeStatus, String cardStatus) {
        return new Card(new CardRegistration("3344556677889900", "00000000006", "000000006",
                "480", "SOFIA MARINO", LocalDate.of(2028, 3, 9), activeStatus), cardStatus, "GOLD");
    }

    @Test
    void lossMovesActiveTradableCardToLostAndBlocksTrading() {
        Card card = card("Y", Card.STATUS_ACTIVE);
        card.markLost();

        assertThat(card.getCardStatus()).isEqualTo(Card.STATUS_LOST);
        assertThat(card.getActiveStatus()).isEqualTo("N");
        assertThat(card.isTradable()).isFalse();
    }

    @Test
    void frozenAndClosedCardsCannotBeReportedLost() {
        assertThatThrownBy(() -> card("N", Card.STATUS_FROZEN).markLost())
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("CARD_NOT_ACTIVE");
        assertThatThrownBy(() -> card("N", Card.STATUS_CLOSED).markLost())
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("CARD_NOT_ACTIVE");
    }

    @Test
    void lostCardIsNotTradableEvenIfLegacyFlagSaysYes() {
        Card card = card("Y", Card.STATUS_LOST);
        assertThat(card.isTradable()).isFalse();
        assertThatThrownBy(card::markLost)
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("CARD_NOT_ACTIVE");
    }

    @Test
    void newCardStartsNotTradableAndActivationEnablesTrading() {
        Card card = card("N", Card.STATUS_ACTIVE);
        assertThat(card.isTradable()).isFalse();
        card.activate();
        assertThat(card.isTradable()).isTrue();
    }

    @Test
    void rejectsUnknownCardStatusOrLevel() {
        assertThatThrownBy(() -> new Card(new CardRegistration("3344556677889900", "00000000006",
                "000000006", "480", "SOFIA MARINO", LocalDate.of(2028, 3, 9), "Y"), "PENDING", "GOLD"))
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("VALIDATION_FAILED");
        assertThatThrownBy(() -> new Card(new CardRegistration("3344556677889900", "00000000006",
                "000000006", "480", "SOFIA MARINO", LocalDate.of(2028, 3, 9), "Y"), Card.STATUS_ACTIVE,
                "TITANIUM"))
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("VALIDATION_FAILED");
    }
}

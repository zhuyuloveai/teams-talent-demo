package com.carddemo.card.application;

import com.carddemo.card.domain.model.CardReplacement;
import com.carddemo.card.domain.model.ReplacementStatus;
import com.carddemo.card.domain.repository.CardReplacementRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * SHIPPED 缺快递单号 24 小时告警（C04 / D-20①）：定时扫描历史/异常缺单号记录，产生运营告警；
 * 不回填、不改状态、不阻断业务。
 */
@Component
public class TrackingAlertSweeper {

    private final CardReplacementRepository replacements;
    private final AlertService alerts;

    public TrackingAlertSweeper(CardReplacementRepository replacements, AlertService alerts) {
        this.replacements = replacements;
        this.alerts = alerts;
    }

    @Scheduled(fixedDelayString = "${card.alert.sweep-interval-ms:60000}")
    public void scheduledSweep() {
        sweepAt(LocalDateTime.now());
    }

    @Transactional
    public int sweepAt(LocalDateTime now) {
        List<CardReplacement> stale = replacements.findShippedWithoutTrackingBefore(now.minusHours(24));
        int raised = 0;
        for (CardReplacement replacement : stale) {
            if (alerts.raiseTrackingAlert(replacement.getReplacementId(), replacement.getShippedAt(), now)) {
                raised++;
            }
        }
        return raised;
    }
}

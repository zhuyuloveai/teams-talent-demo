package com.carddemo.card.application;

import com.carddemo.card.domain.model.OpsAlert;
import com.carddemo.card.domain.repository.AccessRepository;
import com.carddemo.card.domain.repository.AlertRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 告警（D-15 / D-20）：挂失与补卡频率分别计数、互不替代；同键重放不重复计数；
 * SHIPPED 缺单号 24 小时告警。告警不阻断业务，也不构成审批流。
 */
@Service
public class AlertService {

    private static final int REPLACEMENT_WINDOW_HOURS = 24;

    private final AccessRepository access;
    private final AlertRepository alerts;
    private final int threshold;

    public AlertService(AccessRepository access, AlertRepository alerts,
                        @Value("${card.alert.frequency-threshold:3}") int threshold) {
        this.access = access;
        this.alerts = alerts;
        this.threshold = threshold;
    }

    /**
     * 记录一次请求尝试并检查阈值。重放（同 kind + 同 idempotencyKey）不重复计数。
     *
     * @return 本次是否新增了频率告警
     */
    public boolean registerAttempt(String kind, String subjectId, String idempotencyKey, LocalDateTime now) {
        if (access.existsAttempt(kind, idempotencyKey)) {
            return false;
        }
        access.saveAttempt(UUID.randomUUID().toString(), kind, subjectId, idempotencyKey, now);
        long count = access.countAttempts(kind, subjectId, now.minusHours(REPLACEMENT_WINDOW_HOURS));
        if (count <= threshold) {
            return false;
        }
        String alertType = "LOSS".equals(kind) ? OpsAlert.LOSS_FREQUENCY : OpsAlert.REPLACEMENT_FREQUENCY;
        if (alerts.existsByTypeAndSubjectSince(alertType, subjectId, now.minusHours(REPLACEMENT_WINDOW_HOURS))) {
            return false;
        }
        LocalDateTime windowStart = now.minusHours(REPLACEMENT_WINDOW_HOURS);
        alerts.saveAlert(new OpsAlert(UUID.randomUUID().toString(), alertType, "CARD_OR_CUSTOMER", subjectId,
                windowStart, now, (int) count, now));
        if (OpsAlert.REPLACEMENT_FREQUENCY.equals(alertType)) {
            alerts.saveAlert(new OpsAlert(UUID.randomUUID().toString(), OpsAlert.MANUAL_REVIEW_REQUIRED,
                    "CARD", subjectId, windowStart, now, (int) count, now));
        }
        return true;
    }

    /** SHIPPED 后 24 小时仍无快递单号：产生运营告警（同一工单只告警一次）。 */
    public boolean raiseTrackingAlert(String replacementId, LocalDateTime shippedAt, LocalDateTime now) {
        if (alerts.existsByTypeAndSubjectSince(OpsAlert.TRACKING_MISSING_24H, replacementId,
                shippedAt.minusHours(24))) {
            return false;
        }
        alerts.saveAlert(new OpsAlert(UUID.randomUUID().toString(), OpsAlert.TRACKING_MISSING_24H,
                "REPLACEMENT", replacementId, shippedAt, now, 1, now));
        return true;
    }
}

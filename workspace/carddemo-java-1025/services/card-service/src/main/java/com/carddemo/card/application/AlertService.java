package com.carddemo.card.application;

import com.carddemo.card.domain.model.OpsAlert;
import com.carddemo.card.domain.repository.AccessRepository;
import com.carddemo.card.domain.repository.AlertRepository;
import com.carddemo.card.infrastructure.support.SideEffectTransactions;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 告警（D-15 / D-20、002-C05）：挂失按客户、补卡按稳定卡身份分别计数、互不替代；
 * 同 kind + 同 idempotencyKey 只计一次；计数在独立事务中写入，故被状态机拒绝（409）的请求同样计入。
 * 告警不阻断业务，也不构成审批流。
 */
@Service
public class AlertService {

    private static final Logger log = LoggerFactory.getLogger(AlertService.class);
    private static final int WINDOW_HOURS = 24;

    private final AccessRepository access;
    private final AlertRepository alerts;
    private final SideEffectTransactions sideEffects;
    private final int threshold;

    public AlertService(AccessRepository access, AlertRepository alerts, SideEffectTransactions sideEffects,
                        @Value("${card.alert.frequency-threshold:3}") int threshold) {
        this.access = access;
        this.alerts = alerts;
        this.sideEffects = sideEffects;
        this.threshold = threshold;
    }

    /**
     * 记录一次请求尝试并检查阈值（独立事务，故业务回滚不会丢失计数）。
     *
     * @return 本次是否新增了频率告警
     */
    public boolean registerAttempt(String kind, String subjectId, String idempotencyKey, LocalDateTime now) {
        try {
            return sideEffects.executeIsolated(() -> recordAttempt(kind, subjectId, idempotencyKey, now));
        } catch (RuntimeException ex) {
            log.warn("request attempt count failed: kind={} error={}", kind, ex.getMessage());
            return false;
        }
    }

    private boolean recordAttempt(String kind, String subjectId, String idempotencyKey, LocalDateTime now) {
        if (access.existsAttempt(kind, idempotencyKey)) {
            return false;
        }
        try {
            access.saveAttempt(UUID.randomUUID().toString(), kind, subjectId, idempotencyKey, now);
        } catch (RuntimeException ex) {
            // 并发同键：另一请求已计入，不重复统计
            return false;
        }
        long count = access.countAttempts(kind, subjectId, now.minusHours(WINDOW_HOURS));
        if (count <= threshold) {
            return false;
        }
        String alertType = "LOSS".equals(kind) ? OpsAlert.LOSS_FREQUENCY : OpsAlert.REPLACEMENT_FREQUENCY;
        if (alerts.existsByTypeAndSubjectSince(alertType, subjectId, now.minusHours(WINDOW_HOURS))) {
            return false;
        }
        LocalDateTime windowStart = now.minusHours(WINDOW_HOURS);
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

    /** 号段不可用/生成碰撞：工单已受理但未分配卡号，产生可观测告警（同一工单一次）。 */
    public boolean raiseCardNumberFailure(String replacementId, String reason) {
        LocalDateTime now = LocalDateTime.now();
        if (alerts.existsByTypeAndSubjectSince(OpsAlert.CARD_NUMBER_GENERATION_FAILED, replacementId,
                now.minusHours(WINDOW_HOURS))) {
            return false;
        }
        alerts.saveAlert(new OpsAlert(UUID.randomUUID().toString(), OpsAlert.CARD_NUMBER_GENERATION_FAILED,
                "REPLACEMENT", replacementId, now, now, 1, now));
        log.warn("card number generation failed, replacement kept REQUESTED: id={} reason={}",
                replacementId, reason);
        return true;
    }
}

package com.carddemo.card.application;

import com.carddemo.card.domain.model.AuditCompensation;
import com.carddemo.card.domain.model.AuditEvent;
import com.carddemo.card.domain.repository.AuditRepository;
import com.carddemo.card.infrastructure.support.SideEffectTransactions;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 审计写入（BR-LOST-07/15、002-C01）：事件在业务事务提交后以独立事务落库；
 * 写入失败不影响主流程，转持久补偿记录（保留完整原因/核身引用），由 {@link SideEffectWorker} 重放。
 * <p>
 * 002-C06：resourceId 只用安全卡身份（CardRef）或工单号，日志只输出动作与掩码后 4 位，不落完整 PAN。
 */
@Service
public class AuditService {

    private static final Logger log = LoggerFactory.getLogger(AuditService.class);

    private final AuditRepository repository;
    private final SideEffectTransactions sideEffects;

    public AuditService(AuditRepository repository, SideEffectTransactions sideEffects) {
        this.repository = repository;
        this.sideEffects = sideEffects;
    }

    public void record(String actor, String action, String resourceType, String resourceId,
                       String maskedCardNumber, String reason, String staffTicketNo,
                       String identityVerificationRef, String traceId, String payload) {
        String eventId = UUID.randomUUID().toString();
        LocalDateTime now = LocalDateTime.now();
        AuditEvent event = new AuditEvent(eventId, actor, action, resourceType, resourceId, maskedCardNumber,
                reason, staffTicketNo, identityVerificationRef, traceId, payload, now);
        sideEffects.submit(
                () -> repository.saveEvent(event),
                failure -> queueCompensation(event, failure));
    }

    /**
     * 补偿写入在另一条独立事务中完成；载荷完整，worker 重放时按同一 eventId 落库（主键幂等）。
     */
    private void queueCompensation(AuditEvent event, RuntimeException failure) {
        log.warn("audit write failed, queueing compensation: action={} resourceType={} last4={}", event.getAction(),
                event.getResourceType(), event.getMaskedCardNumber());
        try {
            sideEffects.executeIsolated(() -> repository.saveCompensation(new AuditCompensation(
                    event.getEventId(), event.getActor(), event.getAction(), event.getResourceType(),
                    event.getResourceId(), event.getMaskedCardNumber(), event.getReason(),
                    event.getStaffTicketNo(), event.getIdentityVerificationRef(), event.getTraceId(),
                    event.getPayload(), failure.getMessage(), event.getCreatedAt())));
        } catch (RuntimeException ex) {
            log.error("audit compensation write also failed: action={} resourceType={}", event.getAction(),
                    event.getResourceType(), ex);
        }
    }

    public List<AuditEvent> eventsOf(String resourceType, String resourceId) {
        return repository.findByResource(resourceType, resourceId);
    }

    public List<AuditCompensation> compensations() {
        return repository.findCompensations();
    }
}

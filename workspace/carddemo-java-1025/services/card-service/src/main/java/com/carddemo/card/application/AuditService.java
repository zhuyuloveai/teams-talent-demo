package com.carddemo.card.application;

import com.carddemo.card.domain.model.AuditCompensation;
import com.carddemo.card.domain.model.AuditEvent;
import com.carddemo.card.domain.repository.AuditRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 审计写入（BR-LOST-07/15）：事件落库；写入失败不影响主流程，转本地补偿记录以便补发与核查。
 */
@Service
public class AuditService {

    private static final Logger log = LoggerFactory.getLogger(AuditService.class);

    private final AuditRepository repository;

    public AuditService(AuditRepository repository) {
        this.repository = repository;
    }

    public AuditEvent record(String actor, String action, String resourceType, String resourceId,
                             String maskedCardNumber, String reason, String staffTicketNo,
                             String identityVerificationRef, String traceId, String payload) {
        AuditEvent event = new AuditEvent(UUID.randomUUID().toString(), actor, action, resourceType, resourceId,
                maskedCardNumber, reason, staffTicketNo, identityVerificationRef, traceId, payload,
                LocalDateTime.now());
        try {
            return repository.saveEvent(event);
        } catch (RuntimeException ex) {
            log.error("Audit write failed, compensation queued: action={} resource={}", action, resourceId, ex);
            try {
                repository.saveCompensation(new AuditCompensation(UUID.randomUUID().toString(), actor, action,
                        resourceType, resourceId, payload, ex.getMessage(), LocalDateTime.now()));
            } catch (RuntimeException nested) {
                log.error("Audit compensation write also failed: action={} resource={}", action, resourceId, nested);
            }
            return event;
        }
    }

    public List<AuditEvent> eventsOf(String resourceType, String resourceId) {
        return repository.findByResource(resourceType, resourceId);
    }

    public List<AuditCompensation> compensations() {
        return repository.findCompensations();
    }
}

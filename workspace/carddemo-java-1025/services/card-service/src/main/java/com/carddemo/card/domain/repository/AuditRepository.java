package com.carddemo.card.domain.repository;

import com.carddemo.card.domain.model.AuditCompensation;
import com.carddemo.card.domain.model.AuditEvent;

import java.util.List;
import java.util.Optional;

/** 审计仓储端口：事件 + 失败补偿（002-C01：补偿可被 worker 重放为真实事件）。 */
public interface AuditRepository {

    AuditEvent saveEvent(AuditEvent event);

    Optional<AuditEvent> findEvent(String eventId);

    AuditCompensation saveCompensation(AuditCompensation compensation);

    List<AuditEvent> findByResource(String resourceType, String resourceId);

    List<AuditCompensation> findCompensations();

    void deleteCompensation(String compensationId);
}

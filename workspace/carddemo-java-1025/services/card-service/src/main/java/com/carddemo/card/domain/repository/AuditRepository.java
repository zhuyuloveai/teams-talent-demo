package com.carddemo.card.domain.repository;

import com.carddemo.card.domain.model.AuditCompensation;
import com.carddemo.card.domain.model.AuditEvent;

import java.util.List;

/** 审计仓储端口：事件 + 失败补偿。 */
public interface AuditRepository {

    AuditEvent saveEvent(AuditEvent event);

    AuditCompensation saveCompensation(AuditCompensation compensation);

    List<AuditEvent> findByResource(String resourceType, String resourceId);

    List<AuditCompensation> findCompensations();
}

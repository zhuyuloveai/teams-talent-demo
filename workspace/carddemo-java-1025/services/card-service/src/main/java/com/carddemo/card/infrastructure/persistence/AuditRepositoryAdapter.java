package com.carddemo.card.infrastructure.persistence;

import com.carddemo.card.domain.model.AuditCompensation;
import com.carddemo.card.domain.model.AuditEvent;
import com.carddemo.card.domain.repository.AuditRepository;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Component;

import java.util.List;

/** 审计事件与补偿记录的仓储实现（两个表通过适配器组合为一个端口）。 */
interface AuditEventJpaRepository extends JpaRepository<AuditEvent, String> {

    List<AuditEvent> findByResourceTypeAndResourceIdOrderByCreatedAtAsc(String resourceType, String resourceId);
}

interface AuditCompensationJpaRepository extends JpaRepository<AuditCompensation, String> {

    List<AuditCompensation> findAllByOrderByCreatedAtDesc();
}

@Component
class AuditRepositoryAdapter implements AuditRepository {

    private final AuditEventJpaRepository events;
    private final AuditCompensationJpaRepository compensations;

    AuditRepositoryAdapter(AuditEventJpaRepository events, AuditCompensationJpaRepository compensations) {
        this.events = events;
        this.compensations = compensations;
    }

    @Override
    public AuditEvent saveEvent(AuditEvent event) {
        return events.save(event);
    }

    @Override
    public AuditCompensation saveCompensation(AuditCompensation compensation) {
        return compensations.save(compensation);
    }

    @Override
    public List<AuditEvent> findByResource(String resourceType, String resourceId) {
        return events.findByResourceTypeAndResourceIdOrderByCreatedAtAsc(resourceType, resourceId);
    }

    @Override
    public List<AuditCompensation> findCompensations() {
        return compensations.findAllByOrderByCreatedAtDesc();
    }
}

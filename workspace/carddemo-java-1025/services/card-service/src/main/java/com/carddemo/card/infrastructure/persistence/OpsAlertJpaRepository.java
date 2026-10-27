package com.carddemo.card.infrastructure.persistence;

import com.carddemo.card.domain.model.OpsAlert;
import com.carddemo.card.domain.repository.AlertRepository;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface OpsAlertJpaRepository extends JpaRepository<OpsAlert, String>, AlertRepository {

    boolean existsByAlertTypeAndSubjectIdAndCreatedAtAfter(String alertType, String subjectId,
                                                            LocalDateTime since);

    List<OpsAlert> findByAlertTypeOrderByCreatedAtDesc(String alertType);

    @Override
    default OpsAlert saveAlert(OpsAlert alert) {
        return save(alert);
    }

    @Override
    default boolean existsByTypeAndSubjectSince(String alertType, String subjectId, LocalDateTime since) {
        return existsByAlertTypeAndSubjectIdAndCreatedAtAfter(alertType, subjectId, since);
    }

    @Override
    default List<OpsAlert> findByType(String alertType) {
        return findByAlertTypeOrderByCreatedAtDesc(alertType);
    }
}

package com.carddemo.card.domain.repository;

import com.carddemo.card.domain.model.OpsAlert;

import java.time.LocalDateTime;
import java.util.List;

/** 告警记录仓储端口。 */
public interface AlertRepository {

    OpsAlert saveAlert(OpsAlert alert);

    boolean existsByTypeAndSubjectSince(String alertType, String subjectId, LocalDateTime since);

    List<OpsAlert> findByType(String alertType);
}

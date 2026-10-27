package com.carddemo.card.domain.repository;

import com.carddemo.card.domain.model.ReplacementExport;

import java.util.Optional;

/** 导出记录仓储端口。 */
public interface ExportRepository {

    ReplacementExport saveExport(ReplacementExport export);

    Optional<ReplacementExport> findById(String exportId);
}

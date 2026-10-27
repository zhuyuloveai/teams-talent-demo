package com.carddemo.card.infrastructure.persistence;

import com.carddemo.card.domain.model.ReplacementExport;
import com.carddemo.card.domain.repository.ExportRepository;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReplacementExportJpaRepository
        extends JpaRepository<ReplacementExport, String>, ExportRepository {

    @Override
    default ReplacementExport saveExport(ReplacementExport export) {
        return save(export);
    }
}

package com.carddemo.card.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/** 后台补卡队列导出（C03/D-19）：24 小时失效，内容脱敏，访问留审计。 */
@Entity
@Table(name = "replacement_export")
public class ReplacementExport {

    @Id
    @Column(name = "export_id", length = 36, nullable = false, updatable = false)
    private String exportId;

    @Column(name = "requested_by", length = 64, nullable = false, updatable = false)
    private String requestedBy;

    @Column(name = "filter_status", length = 16, updatable = false)
    private String filterStatus;

    @Column(name = "generated_at", nullable = false, updatable = false)
    private LocalDateTime generatedAt;

    @Column(name = "expires_at", nullable = false, updatable = false)
    private LocalDateTime expiresAt;

    @Column(name = "row_count", nullable = false, updatable = false)
    private int rowCount;

    @Column(name = "file_ref", length = 8000, nullable = false, updatable = false)
    private String fileRef;

    @Column(name = "access_count", nullable = false)
    private int accessCount;

    protected ReplacementExport() {
        // for JPA
    }

    public ReplacementExport(String exportId, String requestedBy, String filterStatus, LocalDateTime generatedAt,
                            int rowCount, String fileRef) {
        this.exportId = exportId;
        this.requestedBy = requestedBy;
        this.filterStatus = filterStatus;
        this.generatedAt = generatedAt;
        this.expiresAt = generatedAt.plusHours(24);
        this.rowCount = rowCount;
        this.fileRef = fileRef;
        this.accessCount = 0;
    }

    public boolean isExpired(LocalDateTime now) {
        return !now.isBefore(expiresAt);
    }

    public void recordAccess() {
        this.accessCount++;
    }

    public String getExportId() {
        return exportId;
    }

    public String getRequestedBy() {
        return requestedBy;
    }

    public String getFilterStatus() {
        return filterStatus;
    }

    public LocalDateTime getGeneratedAt() {
        return generatedAt;
    }

    public LocalDateTime getExpiresAt() {
        return expiresAt;
    }

    public int getRowCount() {
        return rowCount;
    }

    public String getFileRef() {
        return fileRef;
    }

    public int getAccessCount() {
        return accessCount;
    }
}

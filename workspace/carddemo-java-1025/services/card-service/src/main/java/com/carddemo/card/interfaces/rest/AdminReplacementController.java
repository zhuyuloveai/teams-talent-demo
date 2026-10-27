package com.carddemo.card.interfaces.rest;

import com.carddemo.card.application.ReplacementExportService;
import com.carddemo.card.application.ReplacementService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 后台补卡队列与导出（REQ-LOST-06 / C03）：均要求 replacement:read:any / replacement:status:update。
 */
@RestController
@Validated
public class AdminReplacementController {

    private final ReplacementService replacements;
    private final ReplacementExportService exports;

    public AdminReplacementController(ReplacementService replacements, ReplacementExportService exports) {
        this.replacements = replacements;
        this.exports = exports;
    }

    @GetMapping("/api/v1/admin/replacements")
    public Map<String, Object> list(
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") @Min(value = 0, message = "Page must not be negative.") int page,
            @RequestParam(defaultValue = "20")
            @Min(value = 1, message = "Size must be between 1 and 100.")
            @Max(value = 100, message = "Size must be between 1 and 100.") int size,
            HttpServletRequest httpRequest) {
        ReplacementService.PageResult result = replacements.page(
                CardLossController.principal(httpRequest), status, page, size);
        List<ReplacementController.ReplacementResponse> items = result.items().stream()
                .map(item -> ReplacementController.ReplacementResponse.from(item, false))
                .toList();
        return Map.of("items", items, "page", result.page(), "size", result.size(), "total", result.total());
    }

    @PostMapping("/api/v1/admin/replacements/{replacementId}/status")
    public ReplacementController.ReplacementResponse updateStatus(
            @PathVariable String replacementId,
            @Valid @RequestBody StatusRequest request,
            HttpServletRequest httpRequest) {
        ReplacementService.StatusOutcome outcome = replacements.updateStatus(
                CardLossController.principal(httpRequest), replacementId, request.status(),
                request.trackingNo(), request.estimatedArrival(), request.idempotencyKey());
        return ReplacementController.ReplacementResponse.from(outcome.replacement(), outcome.replayed());
    }

    @PostMapping("/api/v1/admin/replacements/exports")
    public ResponseEntity<Map<String, Object>> createExport(@Valid @RequestBody ExportRequest request,
                                                            HttpServletRequest httpRequest) {
        ReplacementExportService.ExportOutcome outcome = exports.create(
                CardLossController.principal(httpRequest), request.status(), request.idempotencyKey());
        Map<String, Object> body = Map.of(
                "exportId", outcome.export().getExportId(),
                "rowCount", outcome.export().getRowCount(),
                "generatedAt", outcome.export().getGeneratedAt().toString(),
                "expiresAt", outcome.export().getExpiresAt().toString(),
                "replayed", outcome.replayed());
        return ResponseEntity.status(outcome.replayed() ? HttpStatus.OK : HttpStatus.CREATED).body(body);
    }

    @GetMapping("/api/v1/admin/replacements/exports/{exportId}")
    public ResponseEntity<String> download(@PathVariable String exportId, HttpServletRequest httpRequest) {
        ReplacementExportService.ExportOutcome outcome = exports.download(
                CardLossController.principal(httpRequest), exportId);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"replacements.csv\"")
                .contentType(MediaType.parseMediaType("text/csv"))
                .body(outcome.export().getFileRef());
    }

    public record StatusRequest(
            @NotBlank @Size(max = 16) String status,
            @Size(max = 32) String trackingNo,
            LocalDate estimatedArrival,
            @NotBlank @Size(max = 64) String idempotencyKey) {
    }

    public record ExportRequest(String status,
                                @NotBlank @Size(max = 64) String idempotencyKey) {
    }
}

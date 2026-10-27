package com.carddemo.card.interfaces.rest;

import com.carddemo.card.application.ReplacementService;
import com.carddemo.card.domain.model.CardReplacement;
import com.carddemo.card.domain.model.FeeStatus;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 补卡接口（REQ-LOST-03/04）：申请仅持卡人本人；取消仅 REQUESTED；
 * 查询对客户返回本人记录（越权 404），对后台要求 replacement:read:any。
 */
@RestController
@Validated
public class ReplacementController {

    private final ReplacementService replacements;

    public ReplacementController(ReplacementService replacements) {
        this.replacements = replacements;
    }

    @PostMapping("/api/v1/cards/{cardNumber}/replacements")
    public ResponseEntity<ReplacementResponse> create(
            @PathVariable @Pattern(regexp = "\\d{16}", message = "Card Number must be 16 digits.")
            String cardNumber,
            @Valid @RequestBody CreateRequest request,
            HttpServletRequest httpRequest) {

        ReplacementService.CreateOutcome outcome = replacements.create(
                CardLossController.principal(httpRequest), cardNumber, request.addressId(),
                request.deliveryMethod(), request.reason(), request.idempotencyKey());
        ReplacementResponse body = ReplacementResponse.from(outcome.replacement(), outcome.replayed());
        if (outcome.replayed()) {
            return ResponseEntity.ok(body);
        }
        HttpStatus status = outcome.replacement().getFeeStatus() == FeeStatus.FEE_PENDING
                ? HttpStatus.ACCEPTED : HttpStatus.CREATED;
        return ResponseEntity.status(status).body(body);
    }

    @GetMapping("/api/v1/cards/{cardNumber}/replacements")
    public Map<String, List<ReplacementResponse>> list(
            @PathVariable @Pattern(regexp = "\\d{16}", message = "Card Number must be 16 digits.")
            String cardNumber,
            HttpServletRequest httpRequest) {
        List<ReplacementResponse> items = replacements
                .listByCard(CardLossController.principal(httpRequest), cardNumber).stream()
                .map(item -> ReplacementResponse.from(item, false))
                .toList();
        return Map.of("items", items);
    }

    @GetMapping("/api/v1/replacements/{replacementId}")
    public ReplacementResponse get(@PathVariable String replacementId, HttpServletRequest httpRequest) {
        return ReplacementResponse.from(
                replacements.get(CardLossController.principal(httpRequest), replacementId), false);
    }

    @PostMapping("/api/v1/replacements/{replacementId}/cancel")
    public ReplacementResponse cancel(@PathVariable String replacementId,
                                      @Valid @RequestBody CancelRequest request,
                                      HttpServletRequest httpRequest) {
        ReplacementService.CancelOutcome outcome = replacements.cancel(
                CardLossController.principal(httpRequest), replacementId, request.idempotencyKey());
        return ReplacementResponse.from(outcome.replacement(), outcome.replayed());
    }

    public record CreateRequest(
            @NotBlank @Size(max = 32) String addressId,
            @NotBlank @Pattern(regexp = "STANDARD|EXPRESS", message = "Delivery method is not valid.")
            String deliveryMethod,
            @NotBlank @Pattern(regexp = "LOST|STOLEN|DAMAGED", message = "Reason is not valid.")
            String reason,
            @NotBlank @Size(max = 64) String idempotencyKey) {
    }

    public record CancelRequest(@NotBlank @Size(max = 64) String idempotencyKey) {
    }

    /** 补卡响应：仅卡号后 4 位，不返回完整卡号或地址明细。 */
    public record ReplacementResponse(
            String replacementId,
            String oldCardNumberLast4,
            String newCardNumberLast4,
            String status,
            String reason,
            String deliveryMethod,
            String addressId,
            java.math.BigDecimal feeAmount,
            String feeStatus,
            String feeBatchId,
            String refundBatchId,
            String trackingNo,
            LocalDate estimatedArrival,
            LocalDateTime requestedAt,
            LocalDateTime statusUpdatedAt,
            boolean replayed) {

        static ReplacementResponse from(CardReplacement replacement, boolean replayed) {
            return new ReplacementResponse(
                    replacement.getReplacementId(),
                    tail(replacement.getOldCardNumber()),
                    tail(replacement.getNewCardNumber()),
                    replacement.getStatus().name(),
                    replacement.getReason(),
                    replacement.getDeliveryMethod(),
                    replacement.getAddressId(),
                    replacement.getFeeAmount(),
                    replacement.getFeeStatus().name(),
                    replacement.getFeeBatchId(),
                    replacement.getRefundBatchId(),
                    replacement.getTrackingNo(),
                    replacement.getEstimatedArrival(),
                    replacement.getRequestedAt(),
                    replacement.getStatusUpdatedAt(),
                    replayed);
        }

        private static String tail(String masked) {
            return masked.substring(masked.length() - 4);
        }
    }
}

package com.carddemo.transaction.interfaces.rest;

import com.carddemo.transaction.application.ReplacementFeeService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;

/**
 * 补卡费/冲回接口（REQ-2026-002 §7 FEE 过账）。仅由 card-service 调用，属于服务端内部接口。
 */
@RestController
@RequestMapping("/api/v1/replacement-fees")
public class ReplacementFeeController {

    private final ReplacementFeeService service;

    public ReplacementFeeController(ReplacementFeeService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<ReplacementFeeService.FeeResult> post(@Valid @RequestBody FeeRequest request) {
        if ("REFUND".equals(request.direction())) {
            if (request.originalTransactionId() == null || !request.originalTransactionId().matches("\\d{16}")) {
                throw new com.carddemo.transaction.domain.exception.BusinessRuleException(
                        "VALIDATION_FAILED", "originalTransactionId must be 16 digits for refunds.");
            }
            return ResponseEntity.ok(service.refund(request.transactionId(),
                    request.originalTransactionId(), request.amount()));
        }
        return ResponseEntity.ok(service.charge(request.transactionId(), request.cardNumber(),
                request.amount(), request.description()));
    }

    public record FeeRequest(
            @NotNull @Pattern(regexp = "\\d{16}", message = "Transaction id must be 16 digits")
            String transactionId,
            @Pattern(regexp = "\\d{16}", message = "Original transaction id must be 16 digits")
            String originalTransactionId,
            @Pattern(regexp = "\\d{16}", message = "Card Number must be 16 digits")
            String cardNumber,
            @NotNull @DecimalMin(value = "0.01") BigDecimal amount,
            @NotNull @Pattern(regexp = "CHARGE|REFUND", message = "Direction must be CHARGE or REFUND")
            String direction,
            @Size(max = 100) String description) {
    }
}

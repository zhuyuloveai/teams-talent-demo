package com.carddemo.transaction.interfaces.rest;

import com.carddemo.transaction.application.ReplacementFeeService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;

/**
 * 补卡费/冲回接口（REQ-2026-002 §7 FEE 过账）。内部接口：
 * 仅接受 card-service 的服务 token（002-A007），匿名/用户 token 由过滤器直接 401。
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
            return ResponseEntity.ok(service.refund(request.transactionId(), request.originalTransactionId(),
                    request.amount(), request.cardNumber()));
        }
        return ResponseEntity.ok(service.charge(request.transactionId(), request.cardNumber(),
                request.amount(), request.description()));
    }

    /** 收费/退款过账状态（稳定身份反查，供调用方恢复与核查）。 */
    @GetMapping("/{transactionId}")
    public ReplacementFeeService.FeeState inspect(@PathVariable String transactionId) {
        return service.inspect(transactionId);
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

package com.carddemo.account.interfaces.rest.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

/** 费用/退款稳定 effect 请求（REQ-2026-002 §4.3）。 */
public record AccountEffectRequest(
        @NotBlank @Size(max = 32) String effectId,
        @NotBlank @Pattern(regexp = "FEE|REFUND", message = "kind must be FEE or REFUND") String kind,
        @NotNull @DecimalMin(value = "0.01", message = "amount must be greater than zero") BigDecimal amount) {
}

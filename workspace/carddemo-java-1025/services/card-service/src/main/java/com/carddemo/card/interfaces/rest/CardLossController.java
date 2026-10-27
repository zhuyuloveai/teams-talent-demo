package com.carddemo.card.interfaces.rest;

import com.carddemo.card.application.CardLossService;
import com.carddemo.card.domain.exception.ForbiddenException;
import com.carddemo.card.domain.model.Card;
import com.carddemo.card.domain.service.Masking;
import com.carddemo.card.infrastructure.security.CardPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * 挂失接口（REQ-LOST-02）：首次 201，同键重放 200 且返回首次结果。
 */
@RestController
@Validated
public class CardLossController {

    private final CardLossService lossService;

    public CardLossController(CardLossService lossService) {
        this.lossService = lossService;
    }

    @PostMapping("/api/v1/cards/{cardNumber}/loss")
    public ResponseEntity<LossResponse> reportLoss(
            @PathVariable @Pattern(regexp = "\\d{16}", message = "Card Number must be 16 digits.")
            String cardNumber,
            @Valid @RequestBody LossRequest request,
            HttpServletRequest httpRequest) {

        CardLossService.LossOutcome outcome = lossService.reportLoss(principal(httpRequest), cardNumber,
                request.reason(), request.confirmCardLast4(), request.idempotencyKey(),
                request.staffTicketNo(), request.identityVerificationRef());
        LossResponse body = LossResponse.from(outcome);
        return ResponseEntity.status(outcome.replayed() ? HttpStatus.OK : HttpStatus.CREATED).body(body);
    }

    static CardPrincipal principal(HttpServletRequest request) {
        Object attribute = request.getAttribute(CardPrincipal.ATTRIBUTE);
        if (attribute instanceof CardPrincipal principal) {
            return principal;
        }
        throw new ForbiddenException("UNAUTHENTICATED", "Authenticated principal is required");
    }

    /** 挂失请求（原文 §4.2 字段表 + C02 客服条件字段）。 */
    public record LossRequest(
            @NotBlank @Pattern(regexp = "LOST|STOLEN|DAMAGED", message = "Reason is not valid.")
            String reason,
            @NotBlank @Pattern(regexp = "\\d{4}", message = "Last 4 digits must be 4 digits.")
            String confirmCardLast4,
            @NotBlank @Size(max = 64) String idempotencyKey,
            @Size(max = 32) String staffTicketNo,
            @Size(max = 64) String identityVerificationRef) {
    }

    public record LossResponse(String cardNumberLast4, String cardStatus, String operationId, boolean replayed) {

        static LossResponse from(CardLossService.LossOutcome outcome) {
            Card card = outcome.card();
            return new LossResponse(Masking.last4(card.getCardNumber()), card.getCardStatus(),
                    outcome.operationId(), outcome.replayed());
        }
    }
}

package com.carddemo.card.interfaces.rest;

import com.carddemo.card.domain.exception.ForbiddenException;
import com.carddemo.card.domain.exception.NotFoundException;
import com.carddemo.card.domain.model.CardPermission;
import com.carddemo.card.domain.model.SupportRequest;
import com.carddemo.card.infrastructure.persistence.SupportRequestJpaRepository;
import com.carddemo.card.infrastructure.security.CardPrincipal;
import com.carddemo.card.domain.repository.AccessRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 本地客服协助入口（002-C07）：原文只要求"最小可用客服入口"，不接外部客服平台。
 * 客户在补卡进度页提交协助请求 → 落本地 support_request → 客服/运营按 replacement:read:any 在队列中查看。
 * 客服代客挂失/取消仍走各自权限点与可信核身流程，本入口不授予任何写权限。
 */
@RestController
public class SupportRequestController {

    private final SupportRequestJpaRepository supportRequests;
    private final AccessRepository access;

    public SupportRequestController(SupportRequestJpaRepository supportRequests, AccessRepository access) {
        this.supportRequests = supportRequests;
        this.access = access;
    }

    @PostMapping("/api/v1/support-requests")
    public ResponseEntity<SupportRequestView> create(@Valid @RequestBody CreateSupportRequest request,
                                                     HttpServletRequest httpRequest) {
        CardPrincipal principal = CardLossController.principal(httpRequest);
        if (principal.isAdmin()) {
            throw new ForbiddenException("FORBIDDEN", "Support requests are raised by the cardholder.");
        }
        String customerId = access.findCustomerIdByUserId(principal.userId())
                .orElseThrow(() -> new NotFoundException("CUSTOMER_NOT_FOUND", "Customer not found"));
        SupportRequest saved = supportRequests.saveAndFlush(new SupportRequest(
                UUID.randomUUID().toString(), customerId, request.subjectType(), request.subjectRef(),
                request.note(), principal.userId(), LocalDateTime.now()));
        return ResponseEntity.status(HttpStatus.CREATED).body(SupportRequestView.from(saved));
    }

    @GetMapping("/api/v1/support-requests")
    public List<SupportRequestView> listOwn(HttpServletRequest httpRequest) {
        CardPrincipal principal = CardLossController.principal(httpRequest);
        String customerId = access.findCustomerIdByUserId(principal.userId())
                .orElseThrow(() -> new NotFoundException("CUSTOMER_NOT_FOUND", "Customer not found"));
        return supportRequests.findByCustomerIdOrderByCreatedAtDesc(customerId).stream()
                .map(SupportRequestView::from).toList();
    }

    @GetMapping("/api/v1/admin/support-requests")
    public List<SupportRequestView> listForStaff(@RequestParam(required = false) String status,
                                                 HttpServletRequest httpRequest) {
        CardPrincipal principal = CardLossController.principal(httpRequest);
        if (!principal.isAdmin() || access.findPermissionsByUserId(principal.userId()).stream()
                .noneMatch(item -> CardPermission.REPLACEMENT_READ_ANY.equals(item.getPermission()))) {
            throw new ForbiddenException("FORBIDDEN", "Missing permission " + CardPermission.REPLACEMENT_READ_ANY);
        }
        return supportRequests.findAllByOrderByCreatedAtDesc().stream()
                .filter(item -> status == null || status.isBlank() || status.equals(item.getStatus()))
                .map(SupportRequestView::from).toList();
    }

    public record CreateSupportRequest(
            @Pattern(regexp = "REPLACEMENT|CARD", message = "Subject type must be REPLACEMENT or CARD")
            String subjectType,
            @Size(max = 64) String subjectRef,
            @Size(max = 500) String note) {
    }

    public record SupportRequestView(String requestId, String customerId, String subjectType, String subjectRef,
                                     String note, String status, String createdAt) {

        static SupportRequestView from(SupportRequest request) {
            return new SupportRequestView(request.getRequestId(), request.getCustomerId(), request.getSubjectType(),
                    request.getSubjectRef(), request.getNote(), request.getStatus(),
                    request.getCreatedAt().toString());
        }
    }
}

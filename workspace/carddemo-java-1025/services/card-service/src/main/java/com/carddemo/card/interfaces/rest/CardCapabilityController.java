package com.carddemo.card.interfaces.rest;

import com.carddemo.card.domain.model.CardPermission;
import com.carddemo.card.domain.repository.AccessRepository;
import com.carddemo.card.infrastructure.security.CardPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 当前主体的真实能力（002-C07）：前端按此展示可用的写操作，避免"客服看到状态更新、运营看到代客挂失"却后端 403。
 * 只返回能力清单，不改变后端授权（后端仍逐次校验权限点）。
 */
@RestController
public class CardCapabilityController {

    private static final List<String> KNOWN_PERMISSIONS = List.of(CardPermission.LOSS_ASSIST,
            CardPermission.REPLACEMENT_READ_ANY, CardPermission.REPLACEMENT_CANCEL_ASSIST,
            CardPermission.REPLACEMENT_STATUS_UPDATE);

    private final AccessRepository access;

    public CardCapabilityController(AccessRepository access) {
        this.access = access;
    }

    @GetMapping("/api/v1/cards/permissions")
    public CapabilityResponse permissions(HttpServletRequest httpRequest) {
        CardPrincipal principal = CardLossController.principal(httpRequest);
        List<String> permissions = access.findPermissionsByUserId(principal.userId()).stream()
                .map(CardPermission::getPermission)
                .filter(KNOWN_PERMISSIONS::contains)
                .sorted()
                .toList();
        return new CapabilityResponse(principal.userId(), principal.userType(), permissions,
                access.findCustomerIdByUserId(principal.userId()).orElse(null));
    }

    public record CapabilityResponse(String userId, String userType, List<String> permissions,
                                     String customerId) {
    }
}

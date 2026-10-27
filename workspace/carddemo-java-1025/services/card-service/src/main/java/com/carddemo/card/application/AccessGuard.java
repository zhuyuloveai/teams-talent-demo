package com.carddemo.card.application;

import com.carddemo.card.domain.model.Card;
import com.carddemo.card.domain.model.CardLevel;
import com.carddemo.card.domain.model.CardPermission;
import com.carddemo.card.domain.repository.AccessRepository;
import com.carddemo.card.infrastructure.security.CardPrincipal;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 归属与权限校验（BR-LOST-13/18）：客户仅操作本人卡与工单（越权 404，不泄露存在性）；
 * 后台接口要求对应权限点（缺失 403）。重放请求同样经过本校验。
 */
@Component
public class AccessGuard {

    private final AccessRepository access;

    public AccessGuard(AccessRepository access) {
        this.access = access;
    }

    /** 客户自助：必须是卡所属客户；管理员需具备 read:any。 */
    public void requireCardVisible(CardPrincipal principal, Card card) {
        if (principal.isAdmin()) {
            if (!hasPermission(principal.userId(), CardPermission.REPLACEMENT_READ_ANY)) {
                throw new com.carddemo.card.domain.exception.ForbiddenException("FORBIDDEN",
                        "Missing permission " + CardPermission.REPLACEMENT_READ_ANY);
            }
            return;
        }
        String customerId = access.findCustomerIdByUserId(principal.userId()).orElse(null);
        if (customerId == null || !customerId.equals(card.getCustomerId())) {
            throw new com.carddemo.card.domain.exception.NotFoundException("CARD_NOT_FOUND",
                    "Card not found");
        }
    }

    /** 客户自助挂失/补卡：必须是卡所属客户。 */
    public void requireCardOwner(CardPrincipal principal, Card card) {
        String customerId = access.findCustomerIdByUserId(principal.userId()).orElse(null);
        if (customerId == null || !customerId.equals(card.getCustomerId())) {
            throw new com.carddemo.card.domain.exception.NotFoundException("CARD_NOT_FOUND",
                    "Card not found");
        }
    }

    public void requirePermission(CardPrincipal principal, String permission) {
        if (!principal.isAdmin() || !hasPermission(principal.userId(), permission)) {
            throw new com.carddemo.card.domain.exception.ForbiddenException("FORBIDDEN",
                    "Missing permission " + permission);
        }
    }

    public boolean hasPermission(String userId, String permission) {
        List<CardPermission> permissions = access.findPermissionsByUserId(userId);
        return permissions.stream().anyMatch(item -> permission.equals(item.getPermission()));
    }

    public String customerIdOf(CardPrincipal principal) {
        return access.findCustomerIdByUserId(principal.userId()).orElse(null);
    }

    public static CardLevel levelOf(Card card) {
        return CardLevel.from(card.getCardLevel());
    }
}

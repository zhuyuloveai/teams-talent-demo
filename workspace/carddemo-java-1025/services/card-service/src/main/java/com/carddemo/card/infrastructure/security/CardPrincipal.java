package com.carddemo.card.infrastructure.security;

/** 请求主体（来自已验证 token，业务层不读请求体身份）。 */
public record CardPrincipal(String userId, String userType) {

    public static final String ATTRIBUTE = "carddemo.card.principal";

    public boolean isCustomer() {
        return "U".equals(userType);
    }

    public boolean isAdmin() {
        return "A".equals(userType);
    }
}

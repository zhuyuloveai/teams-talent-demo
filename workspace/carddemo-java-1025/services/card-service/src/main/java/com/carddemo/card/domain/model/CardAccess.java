package com.carddemo.card.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 登录用户到客户号的本地映射（ADR-012 先例），用于客户自助归属校验。 */
@Entity
@Table(name = "card_access")
public class CardAccess {

    @Id
    @Column(name = "user_id", length = 16, nullable = false, updatable = false)
    private String userId;

    @Column(name = "customer_id", length = 9, nullable = false, updatable = false)
    private String customerId;

    protected CardAccess() {
        // for JPA
    }

    public String getUserId() {
        return userId;
    }

    public String getCustomerId() {
        return customerId;
    }
}

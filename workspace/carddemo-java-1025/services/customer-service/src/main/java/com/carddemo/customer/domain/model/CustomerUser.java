package com.carddemo.customer.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 客户账号 ↔ 客户号映射（本地权限种子，002-C04）。 */
@Entity
@Table(name = "customer_user")
public class CustomerUser {

    @Id
    @Column(name = "user_id", length = 16, nullable = false, updatable = false)
    private String userId;

    @Column(name = "customer_id", length = 9, nullable = false, updatable = false)
    private String customerId;

    protected CustomerUser() {
        // for JPA
    }

    public String getUserId() {
        return userId;
    }

    public String getCustomerId() {
        return customerId;
    }
}

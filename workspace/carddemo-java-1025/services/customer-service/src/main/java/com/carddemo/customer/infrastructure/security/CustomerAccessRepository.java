package com.carddemo.customer.infrastructure.security;

import com.carddemo.customer.domain.model.CustomerUser;
import com.carddemo.customer.infrastructure.persistence.CustomerUserJpaRepository;
import org.springframework.stereotype.Component;

/** 客户账号 → 客户号查询（002-C04）。 */
@Component
public class CustomerAccessRepository {

    private final CustomerUserJpaRepository users;

    public CustomerAccessRepository(CustomerUserJpaRepository users) {
        this.users = users;
    }

    public String customerIdOf(String userId) {
        return users.findById(userId).map(CustomerUser::getCustomerId).orElse(null);
    }
}

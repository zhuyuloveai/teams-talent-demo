package com.carddemo.customer.infrastructure.persistence;

import com.carddemo.customer.domain.model.CustomerUser;
import org.springframework.data.jpa.repository.JpaRepository;

/** 客户账号 → 客户号映射（002-C04）。 */
public interface CustomerUserJpaRepository extends JpaRepository<CustomerUser, String> {
}

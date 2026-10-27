package com.carddemo.customer.infrastructure.persistence;

import com.carddemo.customer.domain.model.CustomerAddress;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CustomerAddressJpaRepository extends JpaRepository<CustomerAddress, String> {

    List<CustomerAddress> findByCustomerIdOrderByAddressIdAsc(String customerId);

    Optional<CustomerAddress> findByAddressIdAndCustomerId(String addressId, String customerId);
}

package com.carddemo.customer.application;

import com.carddemo.customer.domain.exception.NotFoundException;
import com.carddemo.customer.domain.model.CustomerAddress;
import com.carddemo.customer.infrastructure.persistence.CustomerAddressJpaRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** 收卡地址查询（REQ-2026-002 D-09）。 */
@Service
@Transactional(readOnly = true)
public class CustomerAddressService {

    private final CustomerAddressJpaRepository addresses;

    public CustomerAddressService(CustomerAddressJpaRepository addresses) {
        this.addresses = addresses;
    }

    public List<CustomerAddress> list(String customerId) {
        return addresses.findByCustomerIdOrderByAddressIdAsc(customerId);
    }

    public CustomerAddress get(String customerId, String addressId) {
        return addresses.findByAddressIdAndCustomerId(addressId, customerId)
                .orElseThrow(() -> new NotFoundException("ADDRESS_NOT_FOUND",
                        "Address not found for this customer"));
    }
}

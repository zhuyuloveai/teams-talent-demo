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

    /** 客户本人修改收卡地址（002-C07）：调用方已在过滤器校验"本人"，这里只做归属二次确认。 */
    @Transactional
    public CustomerAddress update(String customerId, String addressId, String line1, String line2, String line3,
                                 String stateCode, String countryCode, String zipCode) {
        CustomerAddress address = get(customerId, addressId);
        address.updateDetails(line1, line2, line3, stateCode, countryCode, zipCode);
        return addresses.saveAndFlush(address);
    }

    public CustomerAddress get(String customerId, String addressId) {
        return addresses.findByAddressIdAndCustomerId(addressId, customerId)
                .orElseThrow(() -> new NotFoundException("ADDRESS_NOT_FOUND",
                        "Address not found for this customer"));
    }
}

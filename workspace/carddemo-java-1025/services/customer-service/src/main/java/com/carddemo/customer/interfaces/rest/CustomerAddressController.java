package com.carddemo.customer.interfaces.rest;

import com.carddemo.customer.application.CustomerAddressService;
import com.carddemo.customer.domain.model.CustomerAddress;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 收卡地址资源（REQ-2026-002 D-09）：补卡申请按 addressId 校验归属与有效性。
 * 只返回地址引用与行政信息，不返回完整地址明细。
 */
@RestController
@RequestMapping("/api/v1/customers/{customerId}/addresses")
public class CustomerAddressController {

    private final CustomerAddressService addresses;

    public CustomerAddressController(CustomerAddressService addresses) {
        this.addresses = addresses;
    }

    @GetMapping
    public Map<String, List<Map<String, Object>>> list(@PathVariable String customerId) {
        return Map.of("items", addresses.list(customerId).stream()
                .map(CustomerAddressController::describe).toList());
    }

    @GetMapping("/{addressId}")
    public ResponseEntity<Map<String, Object>> get(@PathVariable String customerId,
                                                  @PathVariable String addressId) {
        return ResponseEntity.ok(describe(addresses.get(customerId, addressId)));
    }

    private static Map<String, Object> describe(CustomerAddress address) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("addressId", address.getAddressId());
        body.put("customerId", address.getCustomerId());
        body.put("stateCode", address.getStateCode());
        body.put("countryCode", address.getCountryCode());
        body.put("zipCode", address.getZipCode());
        body.put("primary", address.isPrimary());
        return body;
    }
}

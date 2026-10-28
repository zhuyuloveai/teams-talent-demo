package com.carddemo.customer.interfaces.rest;

import com.carddemo.customer.application.CustomerAddressService;
import com.carddemo.customer.domain.model.CustomerAddress;
import org.springframework.http.ResponseEntity;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
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

    /**
     * 客户本人修改收卡地址（002-C07）：只有客户本人 token（U）能写，过滤器已校验路径 customerId 归属；
     * 内部服务身份与运营只读，不能借服务 token 改客户地址。补卡工单仍只保存 addressId。
     */
    @PutMapping("/{addressId}")
    public ResponseEntity<Map<String, Object>> update(@PathVariable String customerId,
                                                     @PathVariable String addressId,
                                                     @Valid @RequestBody UpdateAddressRequest request,
                                                     jakarta.servlet.http.HttpServletRequest httpRequest) {
        String userType = (String) httpRequest.getAttribute(com.carddemo.customer.infrastructure.security
                .AddressAccessFilter.USER_TYPE_ATTRIBUTE);
        if (!"U".equals(userType)) {
            return ResponseEntity.status(org.springframework.http.HttpStatus.FORBIDDEN)
                    .body(Map.of("code", "FORBIDDEN",
                            "message", "Only the cardholder may change the delivery address"));
        }
        return ResponseEntity.ok(describe(addresses.update(customerId, addressId, request.addressLine1(),
                request.addressLine2(), request.addressLine3(), request.stateCode(),
                request.countryCode(), request.zipCode())));
    }

    public record UpdateAddressRequest(
            @jakarta.validation.constraints.Size(max = 50) String addressLine1,
            @jakarta.validation.constraints.Size(max = 50) String addressLine2,
            @jakarta.validation.constraints.Size(max = 50) String addressLine3,
            @jakarta.validation.constraints.Pattern(regexp = "[A-Za-z]{2}") String stateCode,
            @jakarta.validation.constraints.Pattern(regexp = "[A-Za-z]{3}") String countryCode,
            @jakarta.validation.constraints.Pattern(regexp = "\\d{5}(-\\d{4})?") String zipCode) {
    }

    private static Map<String, Object> describe(CustomerAddress address) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("addressId", address.getAddressId());
        body.put("addressLine1", address.getAddressLine1());
        body.put("addressLine3", address.getAddressLine3());
        body.put("customerId", address.getCustomerId());
        body.put("stateCode", address.getStateCode());
        body.put("countryCode", address.getCountryCode());
        body.put("zipCode", address.getZipCode());
        body.put("primary", address.isPrimary());
        return body;
    }
}

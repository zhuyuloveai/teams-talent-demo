package com.carddemo.customer.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * 客户收卡地址（REQ-2026-002 D-09）。addressId = 'ADDR-' + customerId，由客户主地址派生；
 * 只暴露引用，不在补卡工单中冗余地址明细（§8.2 最小化）。
 */
@Entity
@Table(name = "customer_address")
public class CustomerAddress {

    @Id
    @Column(name = "address_id", length = 32, nullable = false, updatable = false)
    private String addressId;

    @Column(name = "customer_id", length = 9, nullable = false, updatable = false)
    private String customerId;

    @Column(name = "address_line1", length = 50, nullable = false)
    private String addressLine1;

    @Column(name = "address_line2", length = 50)
    private String addressLine2;

    @Column(name = "address_line3", length = 50, nullable = false)
    private String addressLine3;

    @Column(name = "state_code", length = 2, nullable = false)
    private String stateCode;

    @Column(name = "country_code", length = 3, nullable = false)
    private String countryCode;

    @Column(name = "zip_code", length = 10, nullable = false)
    private String zipCode;

    @Column(name = "is_primary", length = 1, nullable = false)
    private String primary;

    protected CustomerAddress() {
        // for JPA
    }

    /** 客户本人修改收卡地址（002-C07）：地址身份不变，只更新行政信息。 */
    public void updateDetails(String line1, String line2, String line3, String stateCode, String countryCode,
                              String zipCode) {
        if (line1 != null && !line1.isBlank()) {
            this.addressLine1 = line1.trim();
        }
        if (line2 != null) {
            this.addressLine2 = line2.trim();
        }
        if (line3 != null && !line3.isBlank()) {
            this.addressLine3 = line3.trim();
        }
        if (stateCode != null && !stateCode.isBlank()) {
            this.stateCode = stateCode.trim().toUpperCase();
        }
        if (countryCode != null && !countryCode.isBlank()) {
            this.countryCode = countryCode.trim().toUpperCase();
        }
        if (zipCode != null && !zipCode.isBlank()) {
            this.zipCode = zipCode.trim();
        }
    }

    public String getAddressLine1() {
        return addressLine1;
    }

    public String getAddressLine2() {
        return addressLine2;
    }

    public String getAddressLine3() {
        return addressLine3;
    }

    public String getAddressId() {
        return addressId;
    }

    public String getCustomerId() {
        return customerId;
    }

    public String getStateCode() {
        return stateCode;
    }

    public String getCountryCode() {
        return countryCode;
    }

    public String getZipCode() {
        return zipCode;
    }

    public boolean isPrimary() {
        return "Y".equals(primary);
    }
}

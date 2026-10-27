package com.carddemo.card.infrastructure.client;

import com.carddemo.card.domain.exception.BusinessRuleException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * customer-service 地址读取（D-09）：addressId 必须由真实地址资源解析，失败 → INVALID_ADDRESS。
 * addressId 形如 {@code ADDR-<customerId>}（客户主地址），归属由 customer-service 校验。
 */
@Component
public class CustomerClient {

    private static final String SERVICE = "customer-service";

    private final RestClient restClient;
    private final com.carddemo.card.infrastructure.security.ServiceTokenIssuer tokens;

    public CustomerClient(@Qualifier("customerRestClient") RestClient restClient,
                          com.carddemo.card.infrastructure.security.ServiceTokenIssuer tokens) {
        this.restClient = restClient;
        this.tokens = tokens;
    }

    public void requireOwnedAddress(String customerId, String addressId) {
        try {
            restClient.get()
                    .uri("/api/v1/customers/{customerId}/addresses/{addressId}", customerId, addressId)
                    .header(org.springframework.http.HttpHeaders.AUTHORIZATION, tokens.issue())
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException ex) {
            throw new BusinessRuleException("INVALID_ADDRESS",
                    "Address " + addressId + " is not valid for customer " + customerId);
        }
    }

    public static String primaryAddressId(String customerId) {
        return "ADDR-" + customerId;
    }
}

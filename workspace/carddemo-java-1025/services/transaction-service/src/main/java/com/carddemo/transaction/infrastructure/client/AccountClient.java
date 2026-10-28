package com.carddemo.transaction.infrastructure.client;

import com.carddemo.transaction.domain.exception.BusinessRuleException;
import com.carddemo.transaction.domain.exception.NotFoundException;
import com.carddemo.transaction.domain.exception.RemoteServiceException;
import com.carddemo.transaction.domain.model.AccountSnapshot;
import com.carddemo.transaction.infrastructure.security.ServiceTokenIssuer;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.math.BigDecimal;
import java.util.Optional;

/**
 * account-service 出站适配器。
 * 失败语义（docs/design/03-service-decomposition.md §4）：404 → 实体不存在；409 → 透传下游 code/message；
 * 5xx / 超时 → {@link RemoteServiceException}（HTTP 503 DEPENDENCY_UNAVAILABLE）。
 * 资金 effect 接口是内部接口（002-A007），调用时附带服务 token。
 */
@Component
public class AccountClient {

    private static final String SERVICE = "account-service";

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final ServiceTokenIssuer tokens;

    public AccountClient(@Qualifier("accountRestClient") RestClient restClient, ObjectMapper objectMapper,
                         ServiceTokenIssuer tokens) {
        this.restClient = restClient;
        this.objectMapper = objectMapper;
        this.tokens = tokens;
    }

    public Optional<AccountSnapshot> findAccount(String accountId) {
        try {
            return restClient.get()
                    .uri("/api/v1/accounts/{accountId}", accountId)
                    .exchange((request, response) -> {
                        int status = response.getStatusCode().value();
                        if (status == 404) {
                            return Optional.<AccountSnapshot>empty();
                        }
                        if (!response.getStatusCode().is2xxSuccessful()) {
                            throw new RemoteServiceException(SERVICE + " responded with HTTP " + status);
                        }
                        return Optional.of(objectMapper.readValue(response.getBody(), AccountBody.class).toSnapshot());
                    });
        } catch (RestClientException ex) {
            throw new RemoteServiceException(SERVICE + " is unavailable", ex);
        }
    }

    public AccountSnapshot applyPosting(String accountId, BigDecimal amount) {
        return post(accountId, "postings", amount);
    }

    public AccountSnapshot payBill(String accountId, BigDecimal amount) {
        return post(accountId, "payments", amount);
    }

    public AccountSnapshot accrueInterest(String accountId, BigDecimal amount) {
        return post(accountId, "interest-accruals", amount);
    }

    /**
     * REQ-2026-002 §4.3：账户稳定 effect 资金作用（FEE 增加欠款 / REFUND 减少欠款）。
     * 同 effectId 重试只生效一次，调用方以此实现补卡费与冲回的跨服务幂等。
     */
    public AccountSnapshot applyEffect(String accountId, String effectId, String kind, BigDecimal amount) {
        try {
            return restClient.post()
                    .uri("/api/v1/accounts/{accountId}/effects", accountId)
                    .header(HttpHeaders.AUTHORIZATION, tokens.issue())
                    .body(new EffectBody(effectId, kind, amount))
                    .exchange((request, response) -> {
                        int status = response.getStatusCode().value();
                        if (status == 404) {
                            throw new NotFoundException("ACCOUNT_NOT_FOUND",
                                    "Account " + accountId + " not found");
                        }
                        if (status == 409) {
                            ApiErrorBody error = objectMapper.readValue(response.getBody(), ApiErrorBody.class);
                            throw new BusinessRuleException(
                                    error.code() == null ? "BUSINESS_RULE_VIOLATION" : error.code(),
                                    error.message() == null ? "Account effect rejected" : error.message());
                        }
                        if (!response.getStatusCode().is2xxSuccessful()) {
                            throw new RemoteServiceException(SERVICE + " responded with HTTP " + status);
                        }
                        return objectMapper.readValue(response.getBody(), EffectBodyResponse.class)
                                .account().toSnapshot();
                    });
        } catch (RestClientException ex) {
            throw new RemoteServiceException(SERVICE + " is unavailable", ex);
        }
    }

    /**
     * 取消/退款仲裁（002-A003-R2）：由资金提交端给出该稳定 effect 的终态。
     * APPLIED 需退款一次；CANCEL_REQUESTED 表示请求在途、结果未知（调用方必须重试）；
     * CANCELLED 表示确定无资金。5xx/超时 → {@link RemoteServiceException}（未知，不得当未执行）。
     */
    public FenceState fence(String effectId) {
        try {
            return restClient.post()
                    .uri("/api/v1/accounts/effects/{effectId}/fence", effectId)
                    .header(HttpHeaders.AUTHORIZATION, tokens.issue())
                    .exchange((request, response) -> {
                        if (!response.getStatusCode().is2xxSuccessful()) {
                            throw new RemoteServiceException(SERVICE + " responded with HTTP "
                                    + response.getStatusCode().value());
                        }
                        return objectMapper.readValue(response.getBody(), FenceState.class);
                    });
        } catch (RestClientException ex) {
            throw new RemoteServiceException(SERVICE + " is unavailable", ex);
        }
    }

    public record FenceState(String effectId, String state, String kind, String accountId, BigDecimal amount) {
    }

    record EffectBody(String effectId, String kind, BigDecimal amount) {
    }

    record EffectBodyResponse(AccountBody account, boolean replayed) {
    }

    private AccountSnapshot post(String accountId, String action, BigDecimal amount) {
        try {
            return restClient.post()
                    .uri("/api/v1/accounts/{accountId}/{action}", accountId, action)
                    .body(new AmountBody(amount))
                    .exchange((request, response) -> {
                        int status = response.getStatusCode().value();
                        if (status == 404) {
                            throw new NotFoundException("ACCOUNT_NOT_FOUND",
                                    "Account " + accountId + " not found");
                        }
                        if (status == 409) {
                            ApiErrorBody error = objectMapper.readValue(response.getBody(), ApiErrorBody.class);
                            throw new BusinessRuleException(
                                    error.code() == null ? "BUSINESS_RULE_VIOLATION" : error.code(),
                                    error.message() == null ? "Account operation rejected" : error.message());
                        }
                        if (!response.getStatusCode().is2xxSuccessful()) {
                            throw new RemoteServiceException(SERVICE + " responded with HTTP " + status);
                        }
                        return objectMapper.readValue(response.getBody(), AccountBody.class).toSnapshot();
                    });
        } catch (RestClientException ex) {
            throw new RemoteServiceException(SERVICE + " is unavailable", ex);
        }
    }
}

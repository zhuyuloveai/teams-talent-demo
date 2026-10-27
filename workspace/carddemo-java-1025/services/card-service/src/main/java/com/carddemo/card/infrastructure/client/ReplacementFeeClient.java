package com.carddemo.card.infrastructure.client;

import com.carddemo.card.domain.exception.DownstreamUnavailableException;
import com.carddemo.card.infrastructure.security.ServiceTokenIssuer;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.math.BigDecimal;

/**
 * 补卡费/冲回过账（D-10 / §4.3）：调用 transaction-service 的稳定 effect 入账接口。
 * effect 身份由工单持久化后复用，重试不重复扣款或退款；退款按原收费交易号核实后才产生资金效果。
 * 接口为内部接口（002-A007），调用时附带 card-service 服务 token。
 */
@Component
public class ReplacementFeeClient {

    private static final String SERVICE = "transaction-service";

    private final RestClient restClient;
    private final ServiceTokenIssuer tokens;

    public ReplacementFeeClient(@Qualifier("transactionRestClient") RestClient restClient,
                                ServiceTokenIssuer tokens) {
        this.restClient = restClient;
        this.tokens = tokens;
    }

    public FeeResult charge(String effectId, String cardNumber, BigDecimal amount) {
        return post(new FeeRequest(effectId, null, cardNumber, amount, "CHARGE"));
    }

    public FeeResult refund(String refundId, String originalTransactionId, BigDecimal amount, String cardNumber) {
        return post(new FeeRequest(refundId, originalTransactionId, cardNumber, amount, "REFUND"));
    }

    private FeeResult post(FeeRequest request) {
        try {
            return restClient.post()
                    .uri("/api/v1/replacement-fees")
                    .header("Authorization", tokens.issue())
                    .body(request)
                    .retrieve()
                    .body(FeeResult.class);
        } catch (RestClientException ex) {
            throw new DownstreamUnavailableException("FEE_POSTING_FAILED",
                    SERVICE + " is unavailable for replacement fee posting");
        }
    }

    public record FeeRequest(String transactionId, String originalTransactionId, String cardNumber,
                             BigDecimal amount, String direction) {
    }

    public record FeeResult(String transactionId, String accountId, BigDecimal amount, boolean replayed,
                            boolean refunded, boolean executed) {
    }
}

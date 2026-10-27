package com.carddemo.card.infrastructure.client;

import com.carddemo.card.domain.exception.DownstreamUnavailableException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.math.BigDecimal;

/**
 * 补卡费/冲回过账（D-10 / §4.3）：调用 transaction-service 的稳定 effect 入账接口。
 * effect 身份由工单持久化后复用，重试不重复扣款或退款；退款按原收费交易号核实后才产生资金效果。
 */
@Component
public class ReplacementFeeClient {

    private static final String SERVICE = "transaction-service";

    private final RestClient restClient;

    public ReplacementFeeClient(@Qualifier("transactionRestClient") RestClient restClient) {
        this.restClient = restClient;
    }

    public FeeResult charge(String effectId, String cardNumber, BigDecimal amount) {
        return post(new FeeRequest(effectId, null, cardNumber, amount, "CHARGE"));
    }

    public FeeResult refund(String refundId, String originalTransactionId, BigDecimal amount) {
        return post(new FeeRequest(refundId, originalTransactionId, null, amount, "REFUND"));
    }

    private FeeResult post(FeeRequest request) {
        try {
            return restClient.post()
                    .uri("/api/v1/replacement-fees")
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
                            boolean refunded) {
    }
}

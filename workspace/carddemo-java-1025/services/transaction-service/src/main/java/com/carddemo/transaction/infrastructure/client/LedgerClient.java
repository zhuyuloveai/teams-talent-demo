package com.carddemo.transaction.infrastructure.client;

import com.carddemo.transaction.domain.exception.RemoteServiceException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.math.BigDecimal;
import java.util.List;

/**
 * ledger-service 总账过账客户端（Owner A-03/FEE 合同）：按 entryGroupId 幂等、借贷配平。
 * 科目号为本轮本地验证的固定测试科目，生产科目仍待正式确认。
 */
@Component
public class LedgerClient {

    static final String RECEIVABLE_ACCOUNT = "1100";
    static final String FEE_INCOME_ACCOUNT = "4001";

    private static final String SERVICE = "ledger-service";

    private final RestClient restClient;

    public LedgerClient(@Qualifier("ledgerRestClient") RestClient restClient) {
        this.restClient = restClient;
    }

    /** 收费过账：借应收账款 / 贷手续费收入。 */
    public void postReplacementFee(String transactionId, BigDecimal amount) {
        post("FEE-" + transactionId, "REPLACEMENT_FEE", transactionId, List.of(
                new Line(RECEIVABLE_ACCOUNT, "DEBIT", amount, "replacement fee receivable"),
                new Line(FEE_INCOME_ACCOUNT, "CREDIT", amount, "replacement fee income")));
    }

    /** 冲回过账：借手续费收入 / 贷应收账款。 */
    public void postReplacementFeeRefund(String refundTransactionId, String originalTransactionId,
                                         BigDecimal amount) {
        post("REFUND-" + refundTransactionId, "REPLACEMENT_FEE_REFUND", originalTransactionId, List.of(
                new Line(FEE_INCOME_ACCOUNT, "DEBIT", amount, "replacement fee refund"),
                new Line(RECEIVABLE_ACCOUNT, "CREDIT", amount, "replacement fee refund")));
    }

    private void post(String entryGroupId, String businessType, String referenceId, List<Line> lines) {
        try {
            restClient.post()
                    .uri("/api/v1/journal-entries")
                    .body(new JournalEntry(entryGroupId, businessType, referenceId, lines))
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException ex) {
            throw new RemoteServiceException(SERVICE + " is unavailable for journal posting", ex);
        }
    }

    public record Line(String accountCode, String direction, BigDecimal amount, String memo) {
    }

    public record JournalEntry(String entryGroupId, String businessType, String referenceId, List<Line> lines) {
    }
}

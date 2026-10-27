package com.carddemo.transaction.interfaces.rest;

import com.carddemo.transaction.domain.model.AccountSnapshot;
import com.carddemo.transaction.domain.model.CardSnapshot;
import com.carddemo.transaction.domain.exception.RemoteServiceException;
import com.carddemo.transaction.domain.repository.TransactionRepository;
import com.carddemo.transaction.infrastructure.client.AccountClient;
import com.carddemo.transaction.infrastructure.client.CardClient;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 端到端用例：H2 + Flyway 种子 + MockMvc；card-service / account-service 用 @MockBean 替换。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class TransactionControllerTest {

    private static final String CARD_NUMBER = "0500024453765740";
    private static final String ACCOUNT_ID = "00000000001";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private TransactionRepository transactions;

    @MockBean
    private CardClient cardClient;

    @MockBean
    private AccountClient accountClient;

    @MockBean
    private com.carddemo.transaction.infrastructure.client.MarketingClient marketingClient;

    private final CardSnapshot card = new CardSnapshot(CARD_NUMBER, ACCOUNT_ID, "000000001",
            "IMMANUEL KESSLER", LocalDate.of(2028, 5, 20), "Y");

    private AccountSnapshot account(String accountId, String balance, String creditLimit,
                                    String cycleCredit, String cycleDebit, LocalDate expirationDate) {
        return new AccountSnapshot(accountId, "Y", new BigDecimal(balance), new BigDecimal(creditLimit),
                new BigDecimal("1020.00"), new BigDecimal(cycleCredit), new BigDecimal(cycleDebit),
                expirationDate, "A000000000");
    }

    private JsonNode body(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    @Test
    void listsSixSeededTransactionsInTransactionIdOrder() throws Exception {
        mockMvc.perform(get("/api/v1/transactions"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(6))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(10))
                .andExpect(jsonPath("$.items.length()").value(6))
                .andExpect(jsonPath("$.items[0].transactionId").value("0000000000000001"))
                .andExpect(jsonPath("$.items[0].accountId").value("00000000001"))
                .andExpect(jsonPath("$.items[0].cardNumber").value(CARD_NUMBER))
                .andExpect(jsonPath("$.items[0].typeCode").value("01"))
                .andExpect(jsonPath("$.items[0].typeDescription").value("Purchase"))
                .andExpect(jsonPath("$.items[0].categoryCode").value("0001"))
                .andExpect(jsonPath("$.items[0].categoryDescription").value("Regular Sales Draft"))
                .andExpect(jsonPath("$.items[0].amount").value(50.47))
                .andExpect(jsonPath("$.items[5].transactionId").value("0000000000000006"));
    }

    @Test
    void filtersByIdPrefix() throws Exception {
        mockMvc.perform(get("/api/v1/transactions").param("idPrefix", "0000000000000003"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].transactionId").value("0000000000000003"))
                .andExpect(jsonPath("$.items[0].description").value("BILL PAYMENT - ONLINE"));
    }

    @Test
    void returns404ForUnknownTransaction() throws Exception {
        mockMvc.perform(get("/api/v1/transactions/9999999999999999"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("TRANSACTION_NOT_FOUND"));
    }

    @Test
    void reportsSeptemberTransactionsWithThreeLevelTotals() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/reports/transactions")
                        .param("startDate", "2026-09-01")
                        .param("endDate", "2026-09-30"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(6))
                .andExpect(jsonPath("$.items.length()").value(6))
                .andReturn();

        JsonNode body = body(result);
        assertThat(body.get("pageTotal").decimalValue()).isEqualByComparingTo("2613.12");
        assertThat(body.get("grandTotal").decimalValue()).isEqualByComparingTo("2613.12");
        assertThat(body.get("accountTotals")).hasSize(5);
        BigDecimal cardTotal = null;
        for (JsonNode total : body.get("accountTotals")) {
            if (CARD_NUMBER.equals(total.get("cardNumber").asText())) {
                cardTotal = total.get("total").decimalValue();
            }
        }
        assertThat(cardTotal).isEqualByComparingTo("250.47");
    }

    @Test
    void postingOverLimitReturnsRejectedWithReasonCode102() throws Exception {
        when(cardClient.findCard(CARD_NUMBER)).thenReturn(Optional.of(card));
        when(accountClient.findAccount(ACCOUNT_ID)).thenReturn(Optional.of(
                account(ACCOUNT_ID, "0.00", "2020.00", "0.00", "0.00", LocalDate.of(2028, 5, 20))));

        String request = """
                {
                  "transactions": [
                    {
                      "transactionId": "0000000000000100",
                      "cardNumber": "%s",
                      "typeCode": "01", "categoryCode": "0001", "source": "POS TERM",
                      "description": "Purchase at Merchant A", "amount": 5000.00,
                      "originalTimestamp": "2026-10-25T10:15:00",
                      "merchantId": "800000001", "merchantName": "Merchant A",
                      "merchantCity": "Springfield", "merchantZip": "10001"
                    }
                  ]
                }
                """.formatted(CARD_NUMBER);

        mockMvc.perform(post("/api/v1/postings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED_WITH_REJECTS"))
                .andExpect(jsonPath("$.processed").value(1))
                .andExpect(jsonPath("$.posted").value(0))
                .andExpect(jsonPath("$.rejected").value(1))
                .andExpect(jsonPath("$.rejections[0].transactionId").value("0000000000000100"))
                .andExpect(jsonPath("$.rejections[0].reasonCode").value(102))
                .andExpect(jsonPath("$.rejections[0].reason").value("OVERLIMIT TRANSACTION"));

        verify(accountClient, never()).applyPosting(any(), any());
    }

    @Test
    void billPaymentPaysOutstandingBalance() throws Exception {
        String accountId = "00000000002";
        CardSnapshot account2Card = new CardSnapshot("0683586198171516", accountId, "000000002",
                "ENRICO ROSENBAUM", LocalDate.of(2029, 8, 11), "Y");
        when(accountClient.findAccount(accountId)).thenReturn(Optional.of(
                account(accountId, "1940.00", "6130.00", "0.00", "0.00", LocalDate.of(2029, 8, 11))));
        when(cardClient.findCardsByAccount(accountId)).thenReturn(List.of(account2Card));
        when(accountClient.payBill(accountId, new BigDecimal("1940.00"))).thenReturn(
                account(accountId, "0.00", "6130.00", "0.00", "0.00", LocalDate.of(2029, 8, 11)));

        mockMvc.perform(post("/api/v1/bill-payments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"accountId\": \"" + accountId + "\", \"confirm\": true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.transactionId").isNotEmpty())
                .andExpect(jsonPath("$.amount").value(1940.00))
                .andExpect(jsonPath("$.newBalance").value(0.00));

        verify(accountClient).payBill(accountId, new BigDecimal("1940.00"));
    }

    @Test
    void billPaymentRequiresConfirmation() throws Exception {
        mockMvc.perform(post("/api/v1/bill-payments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"accountId\": \"00000000001\", \"confirm\": false}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONFIRMATION_REQUIRED"));
    }

    @Test
    void listsTransactionTypes() throws Exception {
        mockMvc.perform(get("/api/v1/transaction-types"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(8))
                .andExpect(jsonPath("$.items[0].typeCode").value("01"))
                .andExpect(jsonPath("$.items[0].description").value("Purchase"))
                .andExpect(jsonPath("$.items[6].typeCode").value("07"))
                .andExpect(jsonPath("$.items[6].description").value("Adjustment"))
                .andExpect(jsonPath("$.items[7].typeCode").value("08"))
                .andExpect(jsonPath("$.items[7].description").value("Replacement Fee"));
    }

    @Test
    void createsTransactionWithNextTransactionId() throws Exception {
        String accountId = "00000000005";
        when(accountClient.findAccount(accountId)).thenReturn(Optional.of(
                account(accountId, "0.00", "5000.00", "0.00", "0.00", LocalDate.of(2026, 7, 1))));

        String request = """
                {
                  "accountId": "%s",
                  "cardNumber": null,
                  "typeCode": "01",
                  "categoryCode": "0001",
                  "source": "POS TERM",
                  "description": "Purchase at Test Merchant",
                  "amount": 25.99,
                  "originalDate": "2026-10-25",
                  "processedDate": "2026-10-25",
                  "merchantId": "800000123",
                  "merchantName": "Test Merchant",
                  "merchantCity": "Springfield",
                  "merchantZip": "10001"
                }
                """.formatted(accountId);

        mockMvc.perform(post("/api/v1/transactions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.transactionId").value("0000000000000007"))
                .andExpect(jsonPath("$.accountId").value(accountId))
                .andExpect(jsonPath("$.typeDescription").value("Purchase"))
                .andExpect(jsonPath("$.categoryDescription").value("Regular Sales Draft"));

        verify(cardClient, never()).findCard(any());
    }

    @Test
    void runsInterestForAccountsWithCategoryBalances() throws Exception {
        List<String> accountIds = List.of("00000000001", "00000000002", "00000000003",
                "00000000004", "00000000006", "00000000008");
        for (String accountId : accountIds) {
            when(accountClient.findAccount(accountId)).thenReturn(Optional.of(
                    account(accountId, "1940.00", "9000.00", "0.00", "0.00", LocalDate.of(2028, 5, 20))));
        }
        when(cardClient.findCardsByAccount(any())).thenReturn(List.of(card));

        MvcResult result = mockMvc.perform(post("/api/v1/interest-runs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"statementDate\": \"2026-10-25\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.statementDate").value("2026-10-25"))
                .andExpect(jsonPath("$.accountsProcessed").value(6))
                .andExpect(jsonPath("$.interestPosted").value(6))
                .andExpect(jsonPath("$.details.length()").value(6))
                .andReturn();

        assertThat(body(result).get("totalInterest").decimalValue()).isEqualByComparingTo("103.01");
        verify(accountClient).accrueInterest("00000000001", new BigDecimal("28.00"));
        assertThat(transactions.findByTransactionId("2026102500000001")).get()
                .satisfies(record -> {
                    assertThat(record.getTypeCode()).isEqualTo("01");
                    assertThat(record.getCategoryCode()).isEqualTo("0005");
                    assertThat(record.getSource()).isEqualTo("System");
                    assertThat(record.getDescription()).isEqualTo("Int. for a/c 00000000001");
                    assertThat(record.getAmount()).isEqualByComparingTo("28.00");
                });
    }

    @Test
    void rejectsCardThatDoesNotBelongToAccount() throws Exception {
        when(cardClient.findCard(CARD_NUMBER)).thenReturn(Optional.of(card));

        String request = """
                {
                  "accountId": "00000000002",
                  "cardNumber": "%s",
                  "typeCode": "01", "categoryCode": "0001", "source": "POS TERM",
                  "description": "Purchase at Test Merchant", "amount": 25.99,
                  "originalDate": "2026-10-25", "processedDate": "2026-10-25",
                  "merchantId": "800000123", "merchantName": "Test Merchant",
                  "merchantCity": "Springfield", "merchantZip": "10001"
                }
                """.formatted(CARD_NUMBER);

        mockMvc.perform(post("/api/v1/transactions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("CARD_ACCOUNT_MISMATCH"));
    }

    @Test
    void rejectsTransactionWithoutAccountOrCard() throws Exception {
        String request = """
                {
                  "typeCode": "01", "categoryCode": "0001", "source": "POS TERM",
                  "description": "Purchase at Test Merchant", "amount": 25.99,
                  "originalDate": "2026-10-25", "processedDate": "2026-10-25",
                  "merchantId": "800000123", "merchantName": "Test Merchant",
                  "merchantCity": "Springfield", "merchantZip": "10001"
                }
                """;

        mockMvc.perform(post("/api/v1/transactions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("ACCOUNT_OR_CARD_REQUIRED"));
    }

    @Test
    void reports503WhenCardServiceIsUnavailable() throws Exception {
        when(cardClient.findCard(CARD_NUMBER))
                .thenThrow(new RemoteServiceException("card-service is unavailable"));

        String request = """
                {
                  "cardNumber": "%s",
                  "typeCode": "01", "categoryCode": "0001", "source": "POS TERM",
                  "description": "Purchase at Test Merchant", "amount": 25.99,
                  "originalDate": "2026-10-25", "processedDate": "2026-10-25",
                  "merchantId": "800000123", "merchantName": "Test Merchant",
                  "merchantCity": "Springfield", "merchantZip": "10001"
                }
                """.formatted(CARD_NUMBER);

        mockMvc.perform(post("/api/v1/transactions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("DEPENDENCY_UNAVAILABLE"));
    }
}

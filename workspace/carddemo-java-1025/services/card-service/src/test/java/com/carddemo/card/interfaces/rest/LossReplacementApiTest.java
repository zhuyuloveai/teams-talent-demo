package com.carddemo.card.interfaces.rest;

import com.carddemo.card.domain.model.Card;
import com.carddemo.card.domain.model.CardRegistration;
import com.carddemo.card.domain.model.OpsAlert;
import com.carddemo.card.domain.repository.CardRepository;
import com.carddemo.card.infrastructure.client.CustomerClient;
import com.carddemo.card.infrastructure.client.ReplacementFeeClient;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * REQ-2026-002 返工 R2 接口级验收（真实 HTTP + H2 + 真实迁移）：
 * 鉴权/归属/客服可信核身/幂等时序/计数/稳定卡身份/取消资金链/CSV 转义。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class LossReplacementApiTest {

    private static final String SECRET = "carddemo-demo-secret-change-me";
    private static final String CUSTOMER_CARD = "4111111111111111";
    private static final String SAME_MASK_CARD_A = "4111110000001111";
    private static final String SAME_MASK_CARD_B = "4111110099991111";
    private static final String STAFF_CARD = "4111111111110001";
    private static final String LIFECYCLE_CARD = "4111111111110002";
    private static final String COUNT_CARD = "4333333333330003";
    private static final String OTHER_CUSTOMER_CARD = "5222222222221111";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private CardRepository cards;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbc;

    @MockBean
    private CustomerClient customerClient;

    @MockBean
    private ReplacementFeeClient feeClient;

    @BeforeEach
    void setUp() {
        ensureCard(CUSTOMER_CARD, "00000000006", "000000006", "SOFIA MARINO");
        ensureCard(SAME_MASK_CARD_A, "00000000006", "000000006", "SOFIA MARINO");
        ensureCard(SAME_MASK_CARD_B, "00000000006", "000000006", "SOFIA MARINO");
        ensureCard(STAFF_CARD, "00000000006", "000000006", "SOFIA MARINO");
        ensureCard(LIFECYCLE_CARD, "00000000006", "000000006", "SOFIA MARINO");
        ensureCard(COUNT_CARD, "00000000006", "000000006", "SOFIA MARINO");
        ensureCard(OTHER_CUSTOMER_CARD, "00000000005", "000000005", "JOHN DOE");
        when(feeClient.charge(anyString(), anyString(), any())).thenAnswer(invocation ->
                new ReplacementFeeClient.FeeResult(invocation.getArgument(0), "00000000006",
                        new BigDecimal("50.00"), false, false, true, false));
        when(feeClient.refund(anyString(), anyString(), any(), anyString())).thenAnswer(invocation ->
                new ReplacementFeeClient.FeeResult(invocation.getArgument(0), "00000000006",
                        new BigDecimal("50.00"), false, true, true, false));
    }

    private void ensureCard(String cardNumber, String accountId, String customerId, String name) {
        if (cards.findByCardNumber(cardNumber).isEmpty()) {
            cards.saveCard(new Card(new CardRegistration(cardNumber, accountId, customerId, "321", name,
                    LocalDate.of(2029, 1, 31), "Y"), Card.STATUS_ACTIVE, "GOLD"));
        } else {
            jdbc.update("update card set card_status = 'ACTIVE', active_status = 'Y' where card_number = ?",
                    cardNumber);
        }
    }

    private static String token(String userId, String userType) {
        try {
            String payload = userId + "|" + userType + "|" + Instant.now().plusSeconds(3600).getEpochSecond();
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] signature = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
            return "Bearer " + encoder.encodeToString(payload.getBytes(StandardCharsets.UTF_8)) + "."
                    + encoder.encodeToString(signature);
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private void lossToLost(String cardNumber, String last4, String key) throws Exception {
        mockMvc.perform(post("/api/v1/cards/" + cardNumber + "/loss")
                        .header("Authorization", token("USER0001", "U"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"LOST\",\"confirmCardLast4\":\"" + last4
                                + "\",\"idempotencyKey\":\"" + key + "\"}"))
                .andExpect(status().isCreated());
    }

    @Test
    void newEndpointsRejectMissingToken() throws Exception {
        mockMvc.perform(post("/api/v1/cards/" + CUSTOMER_CARD + "/loss")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"LOST\",\"confirmCardLast4\":\"1111\",\"idempotencyKey\":\"k1\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));

        mockMvc.perform(get("/api/v1/replacements/REP-1")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/admin/replacements")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/admin/replacements/exports")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"idempotencyKey\":\"e1\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void customerCannotOperateAnotherCustomersCard() throws Exception {
        mockMvc.perform(post("/api/v1/cards/" + OTHER_CUSTOMER_CARD + "/loss")
                        .header("Authorization", token("USER0001", "U"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"LOST\",\"confirmCardLast4\":\"1111\",\"idempotencyKey\":\"k2\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void customerCannotUseAdminQueueOrExport() throws Exception {
        mockMvc.perform(get("/api/v1/admin/replacements")
                        .header("Authorization", token("USER0001", "U")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    /** 002-C02：客服核身不是格式校验——不存在的工单、错客户、已撤销、错引用一律 400 且不写任何数据。 */
    @Test
    void staffLossRequiresTrustedTicketAndVerificationForTheSameCustomer() throws Exception {
        mockMvc.perform(post("/api/v1/cards/" + STAFF_CARD + "/loss")
                        .header("Authorization", token("ADMIN001", "A"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"LOST\",\"confirmCardLast4\":\"0001\",\"idempotencyKey\":\"k3\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("STAFF_VERIFICATION_REQUIRED"));

        mockMvc.perform(post("/api/v1/cards/" + STAFF_CARD + "/loss")
                        .header("Authorization", token("ADMIN001", "A"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"LOST\",\"confirmCardLast4\":\"0001\",\"idempotencyKey\":\"k3a\","
                                + "\"staffTicketNo\":\"TICKET-9999\",\"identityVerificationRef\":\"REF-KYC-9999\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("STAFF_VERIFICATION_INVALID"));

        // TICKET-1002 属于客户 000000005，不能用于 000000006 的卡
        mockMvc.perform(post("/api/v1/cards/" + STAFF_CARD + "/loss")
                        .header("Authorization", token("ADMIN001", "A"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"LOST\",\"confirmCardLast4\":\"0001\",\"idempotencyKey\":\"k3b\","
                                + "\"staffTicketNo\":\"TICKET-1002\",\"identityVerificationRef\":\"REF-KYC-1002\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("STAFF_VERIFICATION_INVALID"));

        // TICKET-2001 已撤销
        mockMvc.perform(post("/api/v1/cards/" + OTHER_CUSTOMER_CARD + "/loss")
                        .header("Authorization", token("ADMIN001", "A"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"LOST\",\"confirmCardLast4\":\"1111\",\"idempotencyKey\":\"k3c\","
                                + "\"staffTicketNo\":\"TICKET-2001\",\"identityVerificationRef\":\"REF-KYC-2001\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("STAFF_VERIFICATION_INVALID"));

        assertThat(cards.findByCardNumber(STAFF_CARD).orElseThrow().getCardStatus())
                .isEqualTo(Card.STATUS_ACTIVE);

        mockMvc.perform(post("/api/v1/cards/" + STAFF_CARD + "/loss")
                        .header("Authorization", token("ADMIN001", "A"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"LOST\",\"confirmCardLast4\":\"0001\",\"idempotencyKey\":\"k3d\","
                                + "\"staffTicketNo\":\"TICKET-1001\",\"identityVerificationRef\":\"REF-KYC-1001\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.cardStatus").value("LOST"));

        Integer recorded = jdbc.queryForObject(
                "select count(*) from card_operation where staff_ticket_no = 'TICKET-1001'", Integer.class);
        assertThat(recorded).isEqualTo(1);
    }

    /** 002-C05：状态被拒的不同 key 请求同样计数；同 key 重放不重复计数；LOSS 与 REPLACEMENT 独立。 */
    @Test
    void requestAttemptsAreCountedBeforeStateChecksAndDeduplicatedByKey() throws Exception {
        String customerToken = token("USER0001", "U");
        jdbc.update("delete from request_attempt where kind in ('LOSS','REPLACEMENT')");

        // 已挂失的卡持续被拒：不同 key 的拒绝同样计数
        lossToLost(COUNT_CARD, "0003", "count-loss-0");

        for (int index = 1; index <= 4; index++) {
            mockMvc.perform(post("/api/v1/cards/" + COUNT_CARD + "/loss")
                            .header("Authorization", customerToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"reason\":\"LOST\",\"confirmCardLast4\":\"0003\",\"idempotencyKey\":\"count-loss-"
                                    + index + "\"}"))
                    .andExpect(status().isConflict());
        }
        // 同 key 重放不增加计数
        mockMvc.perform(post("/api/v1/cards/" + COUNT_CARD + "/loss")
                        .header("Authorization", customerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"LOST\",\"confirmCardLast4\":\"0003\","
                                + "\"idempotencyKey\":\"count-loss-4\"}"))
                .andExpect(status().isConflict());

        Integer attempts = jdbc.queryForObject(
                "select count(*) from request_attempt where kind = 'LOSS' and subject_id = '000000006'",
                Integer.class);
        assertThat(attempts).isEqualTo(5);
        Integer alerts = jdbc.queryForObject(
                "select count(*) from ops_alert where alert_type = '" + OpsAlert.LOSS_FREQUENCY
                        + "' and subject_id = '000000006'", Integer.class);
        assertThat(alerts).isEqualTo(1);
        Integer replacementAlerts = jdbc.queryForObject(
                "select count(*) from ops_alert where alert_type = '" + OpsAlert.REPLACEMENT_FREQUENCY + "'",
                Integer.class);
        assertThat(replacementAlerts).isZero();
    }

    /** 002-C03：同 BIN + 同后 4 位的两张卡互不串工单，各自可有 1 个进行中工单。 */
    @Test
    void cardsSharingMaskedNumberDoNotShareReplacements() throws Exception {
        String customerToken = token("USER0001", "U");
        lossToLost(SAME_MASK_CARD_A, "1111", "mask-loss-1");
        lossToLost(SAME_MASK_CARD_B, "1111", "mask-loss-2");

        MvcResult first = mockMvc.perform(post("/api/v1/cards/" + SAME_MASK_CARD_A + "/replacements")
                        .header("Authorization", customerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"addressId\":\"ADDR-000000006\",\"deliveryMethod\":\"STANDARD\","
                                + "\"reason\":\"LOST\",\"idempotencyKey\":\"mask-repl-1\"}"))
                .andExpect(status().isCreated())
                .andReturn();
        String firstId = objectMapper.readTree(first.getResponse().getContentAsString())
                .get("replacementId").asText();

        mockMvc.perform(post("/api/v1/cards/" + SAME_MASK_CARD_B + "/replacements")
                        .header("Authorization", customerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"addressId\":\"ADDR-000000006\",\"deliveryMethod\":\"STANDARD\","
                                + "\"reason\":\"LOST\",\"idempotencyKey\":\"mask-repl-2\"}"))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/v1/cards/" + SAME_MASK_CARD_B + "/replacements")
                        .header("Authorization", customerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].replacementId").value(org.hamcrest.Matchers.not(firstId)));
    }

    @Test
    void lossReplacementLifecycleIsIdempotentAndMasked() throws Exception {
        String customerToken = token("USER0001", "U");
        String lossBody = "{\"reason\":\"LOST\",\"confirmCardLast4\":\"0002\",\"idempotencyKey\":\"loss-api-1\"}";

        mockMvc.perform(post("/api/v1/cards/" + LIFECYCLE_CARD + "/loss")
                        .header("Authorization", customerToken)
                        .contentType(MediaType.APPLICATION_JSON).content(lossBody))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.cardStatus").value("LOST"))
                .andExpect(jsonPath("$.cardNumberLast4").value("0002"))
                .andExpect(jsonPath("$.replayed").value(false));

        mockMvc.perform(post("/api/v1/cards/" + LIFECYCLE_CARD + "/loss")
                        .header("Authorization", customerToken)
                        .contentType(MediaType.APPLICATION_JSON).content(lossBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.replayed").value(true));

        mockMvc.perform(post("/api/v1/cards/" + LIFECYCLE_CARD + "/loss")
                        .header("Authorization", customerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"LOST\",\"confirmCardLast4\":\"0002\","
                                + "\"idempotencyKey\":\"loss-api-2\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CARD_ALREADY_LOST"));

        MvcResult created = mockMvc.perform(post("/api/v1/cards/" + LIFECYCLE_CARD + "/replacements")
                        .header("Authorization", customerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"addressId\":\"ADDR-000000006\",\"deliveryMethod\":\"STANDARD\","
                                + "\"reason\":\"LOST\",\"idempotencyKey\":\"repl-api-1\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("REQUESTED"))
                .andExpect(jsonPath("$.numberStatus").value("ASSIGNED"))
                .andExpect(jsonPath("$.feeAmount").value(50.0))
                .andExpect(jsonPath("$.feeStatus").value("CHARGED"))
                .andExpect(jsonPath("$.newCardNumberLast4").isString())
                .andExpect(jsonPath("$.oldCardNumberLast4").value("0002"))
                .andReturn();

        JsonNode body = objectMapper.readTree(created.getResponse().getContentAsString());
        String replacementId = body.get("replacementId").asText();
        assertThat(created.getResponse().getContentAsString()).doesNotContain(LIFECYCLE_CARD);

        // 002-C06：审计与操作流水都不落完整卡号
        Integer leaked = jdbc.queryForObject(
                "select count(*) from audit_event where payload like '%" + LIFECYCLE_CARD + "%'"
                        + " or resource_id = '" + LIFECYCLE_CARD + "'", Integer.class);
        assertThat(leaked).isZero();
        Integer leakedOps = jdbc.queryForObject(
                "select count(*) from card_operation where card_number = '" + LIFECYCLE_CARD + "'", Integer.class);
        assertThat(leakedOps).isZero();

        mockMvc.perform(get("/api/v1/replacements/" + replacementId)
                        .header("Authorization", token("USER0002", "U")))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/v1/replacements/" + replacementId)
                        .header("Authorization", customerToken))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/v1/admin/replacements/" + replacementId + "/status")
                        .header("Authorization", token("ADMIN001", "A"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"CARD_PRODUCED\",\"idempotencyKey\":\"st-1\"}"))
                .andExpect(status().isForbidden());

        // 002-A005：后台 CANCELLED 不得绕过取消权限（ADMIN002 无 cancel:assist）
        mockMvc.perform(post("/api/v1/admin/replacements/" + replacementId + "/status")
                        .header("Authorization", token("ADMIN002", "A"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"CANCELLED\",\"idempotencyKey\":\"st-cancel-1\"}"))
                .andExpect(status().isForbidden());
        verify(feeClient, never()).refund(anyString(), anyString(), any(), anyString());

        mockMvc.perform(post("/api/v1/admin/replacements/" + replacementId + "/status")
                        .header("Authorization", token("ADMIN002", "A"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"CARD_PRODUCED\",\"idempotencyKey\":\"st-2\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CARD_PRODUCED"));

        mockMvc.perform(post("/api/v1/admin/replacements/" + replacementId + "/status")
                        .header("Authorization", token("ADMIN002", "A"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"SHIPPED\",\"trackingNo\":\"=cmd|' /C calc'!A0,SF\\\"100\","
                                + "\"estimatedArrival\":\"" + LocalDate.now().plusDays(3) + "\","
                                + "\"idempotencyKey\":\"st-3\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/v1/replacements/" + replacementId + "/cancel")
                        .header("Authorization", customerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"idempotencyKey\":\"cancel-api-1\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("REPLACEMENT_NOT_CANCELLABLE"));

        MvcResult export = mockMvc.perform(post("/api/v1/admin/replacements/exports")
                        .header("Authorization", token("ADMIN002", "A"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"idempotencyKey\":\"export-api-1\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.rowCount").exists())
                .andReturn();
        String exportId = objectMapper.readTree(export.getResponse().getContentAsString())
                .get("exportId").asText();

        String csv = mockMvc.perform(get("/api/v1/admin/replacements/exports/" + exportId)
                        .header("Authorization", token("ADMIN002", "A")))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("text/csv"))
                .andReturn().getResponse().getContentAsString();
        // 002-C09：公式前缀被中性化，含逗号/引号的值加引号，列数保持 9
        assertThat(csv).contains("\"'=cmd|' /C calc'!A0,SF\"\"100\"");
        String line = csv.lines().filter(row -> row.contains(replacementId)).findFirst().orElseThrow();
        assertThat(countColumns(line)).isEqualTo(9);
    }

    private static int countColumns(String line) {
        int columns = 1;
        boolean quoted = false;
        for (int index = 0; index < line.length(); index++) {
            char current = line.charAt(index);
            if (current == '"') {
                quoted = !quoted;
            } else if (current == ',' && !quoted) {
                columns++;
            }
        }
        return columns;
    }
}

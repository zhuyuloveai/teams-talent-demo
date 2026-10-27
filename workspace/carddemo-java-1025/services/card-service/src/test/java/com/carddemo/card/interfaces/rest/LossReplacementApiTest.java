package com.carddemo.card.interfaces.rest;

import com.carddemo.card.domain.model.Card;
import com.carddemo.card.domain.model.CardRegistration;
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
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * REQ-2026-002 接口级验收：鉴权/归属/幂等/凭证/状态机/导出（真实 HTTP + H2 + 真实迁移）。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class LossReplacementApiTest {

    private static final String SECRET = "carddemo-demo-secret-change-me";
    private static final String NEW_CARD = "4111111111111111";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private CardRepository cards;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private CustomerClient customerClient;

    @MockBean
    private ReplacementFeeClient feeClient;

    private Card card;

    @BeforeEach
    void setUp() {
        if (cards.findByCardNumber(NEW_CARD).isEmpty()) {
            card = cards.saveCard(new Card(new CardRegistration(NEW_CARD, "00000000006", "000000006",
                    "321", "SOFIA MARINO", LocalDate.of(2029, 1, 31), "Y"),
                    Card.STATUS_ACTIVE, "GOLD"));
        } else {
            card = cards.findByCardNumber(NEW_CARD).orElseThrow();
        }
        when(feeClient.charge(anyString(), anyString(), any())).thenReturn(
                new ReplacementFeeClient.FeeResult("8000000000000999", "00000000006",
                        new BigDecimal("50.00"), false, false));
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

    @Test
    void newEndpointsRejectMissingToken() throws Exception {
        mockMvc.perform(post("/api/v1/cards/4111111111111111/loss")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"LOST\",\"confirmCardLast4\":\"1111\",\"idempotencyKey\":\"k1\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));

        mockMvc.perform(get("/api/v1/replacements/REP-1"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/v1/admin/replacements"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/api/v1/admin/replacements/exports")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"idempotencyKey\":\"e1\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void customerCannotOperateAnotherCustomersCard() throws Exception {
        mockMvc.perform(post("/api/v1/cards/3344556677889900/loss")
                        .header("Authorization", token("USER0002", "U"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"LOST\",\"confirmCardLast4\":\"9900\",\"idempotencyKey\":\"k2\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void customerCannotUseAdminQueueOrExport() throws Exception {
        mockMvc.perform(get("/api/v1/admin/replacements")
                        .header("Authorization", token("USER0001", "U")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    void staffLossRequiresTicketAndVerificationReference() throws Exception {
        mockMvc.perform(post("/api/v1/cards/4111111111111111/loss")
                        .header("Authorization", token("ADMIN001", "A"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"LOST\",\"confirmCardLast4\":\"1111\",\"idempotencyKey\":\"k3\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("STAFF_VERIFICATION_REQUIRED"));
    }

    @Test
    void lossReplacementLifecycleIsIdempotentAndMasked() throws Exception {
        String customerToken = token("USER0001", "U");
        String lossBody = "{\"reason\":\"LOST\",\"confirmCardLast4\":\"1111\",\"idempotencyKey\":\"loss-api-1\"}";

        mockMvc.perform(post("/api/v1/cards/" + NEW_CARD + "/loss")
                        .header("Authorization", customerToken)
                        .contentType(MediaType.APPLICATION_JSON).content(lossBody))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.cardStatus").value("LOST"))
                .andExpect(jsonPath("$.cardNumberLast4").value("1111"))
                .andExpect(jsonPath("$.replayed").value(false));

        mockMvc.perform(post("/api/v1/cards/" + NEW_CARD + "/loss")
                        .header("Authorization", customerToken)
                        .contentType(MediaType.APPLICATION_JSON).content(lossBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.replayed").value(true));

        mockMvc.perform(post("/api/v1/cards/" + NEW_CARD + "/loss")
                        .header("Authorization", customerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"LOST\",\"confirmCardLast4\":\"1111\","
                                + "\"idempotencyKey\":\"loss-api-2\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CARD_ALREADY_LOST"));

        MvcResult created = mockMvc.perform(post("/api/v1/cards/" + NEW_CARD + "/replacements")
                        .header("Authorization", customerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"addressId\":\"ADDR-000000006\",\"deliveryMethod\":\"STANDARD\","
                                + "\"reason\":\"LOST\",\"idempotencyKey\":\"repl-api-1\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("REQUESTED"))
                .andExpect(jsonPath("$.feeAmount").value(50.0))
                .andExpect(jsonPath("$.feeStatus").value("CHARGED"))
                .andExpect(jsonPath("$.newCardNumberLast4").isString())
                .andExpect(jsonPath("$.oldCardNumberLast4").value("1111"))
                .andReturn();

        JsonNode body = objectMapper.readTree(created.getResponse().getContentAsString());
        String replacementId = body.get("replacementId").asText();
        assertThat(created.getResponse().getContentAsString()).doesNotContain(NEW_CARD);

        mockMvc.perform(get("/api/v1/replacements/" + replacementId)
                        .header("Authorization", token("USER0002", "U")))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/v1/replacements/" + replacementId)
                        .header("Authorization", customerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.replacementId").value(replacementId));

        mockMvc.perform(get("/api/v1/admin/replacements")
                        .header("Authorization", token("ADMIN003", "A")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].replacementId").exists());

        mockMvc.perform(post("/api/v1/admin/replacements/" + replacementId + "/status")
                        .header("Authorization", token("ADMIN001", "A"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"CARD_PRODUCED\",\"idempotencyKey\":\"st-1\"}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/v1/admin/replacements/" + replacementId + "/status")
                        .header("Authorization", token("ADMIN002", "A"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"CARD_PRODUCED\",\"idempotencyKey\":\"st-2\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CARD_PRODUCED"));

        mockMvc.perform(post("/api/v1/admin/replacements/" + replacementId + "/status")
                        .header("Authorization", token("ADMIN002", "A"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"SHIPPED\",\"trackingNo\":\"SF100\","
                                + "\"estimatedArrival\":\"" + LocalDate.now().plusDays(3) + "\","
                                + "\"idempotencyKey\":\"st-3\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.trackingNo").value("SF100"));

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

        mockMvc.perform(get("/api/v1/admin/replacements/exports/" + exportId)
                        .header("Authorization", token("ADMIN002", "A")))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("text/csv"));
    }
}

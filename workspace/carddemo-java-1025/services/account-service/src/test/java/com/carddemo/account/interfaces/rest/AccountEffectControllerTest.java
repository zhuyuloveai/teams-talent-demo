package com.carddemo.account.interfaces.rest;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * REQ-2026-002 §4.3 + 002-A001/A007：账户稳定 effect（补卡费 +50 / 冲回 −50）幂等、冲突与内部调用边界。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AccountEffectControllerTest {

    private static final String SECRET = "carddemo-demo-secret-change-me";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private static String token(String userId, String userType, long ttlSeconds) {
        try {
            String payload = userId + "|" + userType + "|" + Instant.now().plusSeconds(ttlSeconds).getEpochSecond();
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

    private static String serviceToken() {
        return token("transaction-service", "S", 600);
    }

    private BigDecimal balanceOf(String accountId) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/accounts/{id}", accountId))
                .andExpect(status().isOk()).andReturn();
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        return body.get("currentBalance").decimalValue();
    }

    /** 002-A007：匿名、客户 token、伪造调用方与过期 token 都不能改余额。 */
    @Test
    void effectEndpointRequiresTrustedServiceToken() throws Exception {
        String accountId = "00000000007";
        BigDecimal before = balanceOf(accountId);
        String body = "{\"effectId\":\"8000000000000901\",\"kind\":\"FEE\",\"amount\":50.00}";

        mockMvc.perform(post("/api/v1/accounts/" + accountId + "/effects")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/api/v1/accounts/" + accountId + "/effects")
                        .header("Authorization", token("USER0001", "U", 600))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/api/v1/accounts/" + accountId + "/effects")
                        .header("Authorization", token("card-service", "S", 600))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/api/v1/accounts/" + accountId + "/effects")
                        .header("Authorization", token("transaction-service", "S", -60))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/v1/accounts/effects/8000000000000901"))
                .andExpect(status().isUnauthorized());

        assertThat(balanceOf(accountId)).isEqualByComparingTo(before);
    }

    @Test
    void feeThenReplayThenRefundChangesBalanceOnce() throws Exception {
        String accountId = "00000000007";
        BigDecimal before = balanceOf(accountId);
        String feeBody = "{\"effectId\":\"8000000000000101\",\"kind\":\"FEE\",\"amount\":50.00}";
        String auth = serviceToken();

        mockMvc.perform(post("/api/v1/accounts/" + accountId + "/effects")
                        .header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON).content(feeBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.replayed").value(false));
        assertThat(balanceOf(accountId)).isEqualByComparingTo(before.add(new BigDecimal("50.00")));

        mockMvc.perform(post("/api/v1/accounts/" + accountId + "/effects")
                        .header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON).content(feeBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.replayed").value(true));
        assertThat(balanceOf(accountId)).isEqualByComparingTo(before.add(new BigDecimal("50.00")));

        // 内部反查：调用方据此区分"确实未执行"与"已执行但本地记录缺失"
        mockMvc.perform(get("/api/v1/accounts/effects/8000000000000101")
                        .header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountId").value(accountId))
                .andExpect(jsonPath("$.kind").value("FEE"));

        mockMvc.perform(post("/api/v1/accounts/" + accountId + "/effects")
                        .header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"effectId\":\"8000000000000102\",\"kind\":\"REFUND\",\"amount\":50.00}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.replayed").value(false));
        assertThat(balanceOf(accountId)).isEqualByComparingTo(before);

        mockMvc.perform(post("/api/v1/accounts/" + accountId + "/effects")
                        .header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"effectId\":\"8000000000000102\",\"kind\":\"REFUND\",\"amount\":50.00}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.replayed").value(true));
        assertThat(balanceOf(accountId)).isEqualByComparingTo(before);
    }

    @Test
    void sameEffectIdWithDifferentAmountOrKindOrAccountIsConflict() throws Exception {
        String auth = serviceToken();
        mockMvc.perform(post("/api/v1/accounts/00000000004/effects")
                        .header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"effectId\":\"8000000000000201\",\"kind\":\"FEE\",\"amount\":50.00}"))
                .andExpect(status().isOk());
        BigDecimal afterFirst = balanceOf("00000000004");

        mockMvc.perform(post("/api/v1/accounts/00000000004/effects")
                        .header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"effectId\":\"8000000000000201\",\"kind\":\"FEE\",\"amount\":10.00}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EFFECT_CONFLICT"));

        mockMvc.perform(post("/api/v1/accounts/00000000004/effects")
                        .header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"effectId\":\"8000000000000201\",\"kind\":\"REFUND\",\"amount\":50.00}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EFFECT_CONFLICT"));

        // 同一 effectId 换账户：不得因为唯一行而再次改变余额
        BigDecimal otherBefore = balanceOf("00000000005");
        mockMvc.perform(post("/api/v1/accounts/00000000005/effects")
                        .header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"effectId\":\"8000000000000201\",\"kind\":\"FEE\",\"amount\":50.00}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EFFECT_CONFLICT"));

        assertThat(balanceOf("00000000004")).isEqualByComparingTo(afterFirst);
        assertThat(balanceOf("00000000005")).isEqualByComparingTo(otherBefore);
    }

    @Test
    void unknownAccountAndInvalidKindAreRejected() throws Exception {
        String auth = serviceToken();
        mockMvc.perform(post("/api/v1/accounts/99999999999/effects")
                        .header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"effectId\":\"8000000000000301\",\"kind\":\"FEE\",\"amount\":50.00}"))
                .andExpect(status().isNotFound());

        mockMvc.perform(post("/api/v1/accounts/00000000004/effects")
                        .header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"effectId\":\"8000000000000302\",\"kind\":\"BONUS\",\"amount\":50.00}"))
                .andExpect(status().isBadRequest());
    }
}

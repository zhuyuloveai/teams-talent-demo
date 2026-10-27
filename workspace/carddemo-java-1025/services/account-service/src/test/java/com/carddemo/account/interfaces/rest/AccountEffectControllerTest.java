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

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * REQ-2026-002 §4.3：账户稳定 effect（补卡费 +50 / 冲回 −50）幂等与冲突。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AccountEffectControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private BigDecimal balanceOf(String accountId) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/accounts/{id}", accountId))
                .andExpect(status().isOk()).andReturn();
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        return body.get("currentBalance").decimalValue();
    }

    @Test
    void feeThenReplayThenRefundChangesBalanceOnce() throws Exception {
        BigDecimal before = balanceOf("00000000007");
        String feeBody = "{\"effectId\":\"8000000000000101\",\"kind\":\"FEE\",\"amount\":50.00}";

        mockMvc.perform(post("/api/v1/accounts/00000000007/effects")
                        .contentType(MediaType.APPLICATION_JSON).content(feeBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.replayed").value(false));
        assertThat(balanceOf("00000000007")).isEqualByComparingTo(before.add(new BigDecimal("50.00")));

        mockMvc.perform(post("/api/v1/accounts/00000000007/effects")
                        .contentType(MediaType.APPLICATION_JSON).content(feeBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.replayed").value(true));
        assertThat(balanceOf("00000000007")).isEqualByComparingTo(before.add(new BigDecimal("50.00")));

        mockMvc.perform(post("/api/v1/accounts/00000000007/effects")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"effectId\":\"8000000000000102\",\"kind\":\"REFUND\",\"amount\":50.00}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.replayed").value(false));
        assertThat(balanceOf("00000000007")).isEqualByComparingTo(before);

        mockMvc.perform(post("/api/v1/accounts/00000000007/effects")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"effectId\":\"8000000000000102\",\"kind\":\"REFUND\",\"amount\":50.00}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.replayed").value(true));
        assertThat(balanceOf("00000000007")).isEqualByComparingTo(before);
    }

    @Test
    void sameEffectIdWithDifferentAmountIsConflict() throws Exception {
        mockMvc.perform(post("/api/v1/accounts/00000000004/effects")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"effectId\":\"8000000000000201\",\"kind\":\"FEE\",\"amount\":50.00}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/v1/accounts/00000000004/effects")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"effectId\":\"8000000000000201\",\"kind\":\"FEE\",\"amount\":10.00}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EFFECT_CONFLICT"));
    }

    @Test
    void unknownAccountAndInvalidKindAreRejected() throws Exception {
        mockMvc.perform(post("/api/v1/accounts/99999999999/effects")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"effectId\":\"8000000000000301\",\"kind\":\"FEE\",\"amount\":50.00}"))
                .andExpect(status().isNotFound());

        mockMvc.perform(post("/api/v1/accounts/00000000004/effects")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"effectId\":\"8000000000000302\",\"kind\":\"BONUS\",\"amount\":50.00}"))
                .andExpect(status().isBadRequest());
    }
}

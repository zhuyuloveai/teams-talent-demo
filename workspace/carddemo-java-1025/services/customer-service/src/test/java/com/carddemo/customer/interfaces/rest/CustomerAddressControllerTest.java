package com.carddemo.customer.interfaces.rest;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** REQ-2026-002 D-09 / 002-C04：收卡地址资源的身份与归属边界。 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CustomerAddressControllerTest {

    private static final String SECRET = "carddemo-demo-secret-change-me";

    @Autowired
    private MockMvc mockMvc;

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

    @Test
    void anonymousOrExpiredTokenIsRejected() throws Exception {
        mockMvc.perform(get("/api/v1/customers/000000006/addresses"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));

        mockMvc.perform(get("/api/v1/customers/000000006/addresses")
                        .header("Authorization", token("USER0001", "U", -60)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void listsOwnPrimaryAddressForTheAuthenticatedCustomer() throws Exception {
        mockMvc.perform(get("/api/v1/customers/000000006/addresses")
                        .header("Authorization", token("USER0001", "U", 600)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].addressId").value("ADDR-000000006"))
                .andExpect(jsonPath("$.items[0].customerId").value("000000006"))
                .andExpect(jsonPath("$.items[0].primary").value(true))
                .andExpect(jsonPath("$.items[0].countryCode").value("USA"));
    }

    @Test
    void anotherCustomersAddressIsNotVisible() throws Exception {
        mockMvc.perform(get("/api/v1/customers/000000005/addresses/ADDR-000000006")
                        .header("Authorization", token("USER0001", "U", 600)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ADDRESS_NOT_FOUND"));

        mockMvc.perform(get("/api/v1/customers/000000006/addresses")
                        .header("Authorization", token("USER0002", "U", 600)))
                .andExpect(status().isNotFound());
    }

    /** 补卡前的归属校验由 card-service 以服务身份调用，可校验任意客户的地址。 */
    @Test
    void serviceTokenMayValidateAddressesForCardService() throws Exception {
        mockMvc.perform(get("/api/v1/customers/000000006/addresses/ADDR-000000006")
                        .header("Authorization", token("card-service", "S", 600)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.addressId").value("ADDR-000000006"));

        mockMvc.perform(get("/api/v1/customers/000000006/addresses/ADDR-000000999")
                        .header("Authorization", token("card-service", "S", 600)))
                .andExpect(status().isNotFound());
    }

    /** 002-C07：本人可修改地址资源，改后仍是同一 addressId；他人与服务身份不能写。 */
    @Test
    void ownerCanUpdateAddressWhileOthersCannot() throws Exception {
        String body = "{\"addressLine1\":\"1 Market Street\",\"addressLine3\":\"San Francisco CA\","
                + "\"stateCode\":\"CA\",\"zipCode\":\"94105\"}";
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .put("/api/v1/customers/000000006/addresses/ADDR-000000006")
                        .header("Authorization", token("USER0001", "U", 600))
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.addressId").value("ADDR-000000006"))
                .andExpect(jsonPath("$.addressLine1").value("1 Market Street"))
                .andExpect(jsonPath("$.stateCode").value("CA"))
                .andExpect(jsonPath("$.zipCode").value("94105"));

        mockMvc.perform(get("/api/v1/customers/000000006/addresses/ADDR-000000006")
                        .header("Authorization", token("USER0001", "U", 600)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.zipCode").value("94105"));

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .put("/api/v1/customers/000000006/addresses/ADDR-000000006")
                        .header("Authorization", token("USER0002", "U", 600))
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isNotFound());

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .put("/api/v1/customers/000000006/addresses/ADDR-000000006")
                        .header("Authorization", token("card-service", "S", 600))
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isForbidden());

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .put("/api/v1/customers/000000006/addresses/ADDR-000000006")
                        .header("Authorization", token("USER0001", "U", 600))
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"stateCode\":\"CAL\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void operatorTokenWithoutSelfServicePermissionIsForbidden() throws Exception {
        mockMvc.perform(get("/api/v1/customers/000000006/addresses")
                        .header("Authorization", token("ADMIN001", "A", 600)))
                .andExpect(status().isForbidden());
    }
}

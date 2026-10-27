package com.carddemo.customer.interfaces.rest;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** REQ-2026-002 D-09：收卡地址资源与归属校验。 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CustomerAddressControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void listsPrimaryAddressDerivedFromCustomer() throws Exception {
        mockMvc.perform(get("/api/v1/customers/000000006/addresses"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].addressId").value("ADDR-000000006"))
                .andExpect(jsonPath("$.items[0].customerId").value("000000006"))
                .andExpect(jsonPath("$.items[0].primary").value(true))
                .andExpect(jsonPath("$.items[0].countryCode").value("USA"));
    }

    @Test
    void returnsAddressWhenOwnedByCustomer() throws Exception {
        mockMvc.perform(get("/api/v1/customers/000000006/addresses/ADDR-000000006"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.addressId").value("ADDR-000000006"));
    }

    @Test
    void addressOfAnotherCustomerIsNotFound() throws Exception {
        mockMvc.perform(get("/api/v1/customers/000000005/addresses/ADDR-000000006"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ADDRESS_NOT_FOUND"));
    }
}

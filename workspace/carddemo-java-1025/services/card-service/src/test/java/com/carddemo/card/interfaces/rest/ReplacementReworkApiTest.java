package com.carddemo.card.interfaces.rest;

import com.carddemo.card.application.ReplacementNumberWorker;
import com.carddemo.card.application.ReplacementService;
import com.carddemo.card.infrastructure.security.CardPrincipal;
import com.carddemo.card.application.SideEffectWorker;
import com.carddemo.card.domain.model.Card;
import com.carddemo.card.domain.model.CardRegistration;
import com.carddemo.card.domain.model.NotificationRecord;
import com.carddemo.card.domain.model.OpsAlert;
import com.carddemo.card.domain.repository.CardRepository;
import com.carddemo.card.domain.repository.NotificationRepository;
import com.carddemo.card.domain.service.CardNumberCipher;
import com.carddemo.card.domain.service.Masking;
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
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 返工 R3（PR11 e4303f3 复审剩余项）：重放语义、回滚占位、白金零收费、激活效果、分页边界、
 * 导出重放与 24h 精确边界、告警阈值/一次性、号段 worker 排除已取消、通知渠道关闭不假投递。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ReplacementReworkApiTest {

    private static final String SECRET = "carddemo-demo-secret-change-me";
    private static final String CUSTOMER = "000000006";
    private static final String ACCOUNT = "00000000006";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private CardRepository cards;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ReplacementNumberWorker numberWorker;

    @Autowired
    private SideEffectWorker sideEffectWorker;

    @Autowired
    private NotificationRepository notifications;

    @Autowired
    private CardNumberCipher cipher;

    @MockBean
    private CustomerClient customerClient;

    @MockBean
    private ReplacementFeeClient feeClient;

    @BeforeEach
    void setUp() {
        when(feeClient.charge(anyString(), anyString(), any())).thenAnswer(invocation ->
                new ReplacementFeeClient.FeeResult(invocation.getArgument(0), ACCOUNT,
                        new BigDecimal("50.00"), false, false, true, false));
        when(feeClient.refund(anyString(), anyString(), any(), anyString())).thenAnswer(invocation ->
                new ReplacementFeeClient.FeeResult(invocation.getArgument(0), ACCOUNT,
                        new BigDecimal("50.00"), false, true, true, false));
    }

    private String token(String userId, String userType) {
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

    private String ensureActiveCard(String level) {
        String cardNumber = "4222"
                + String.format("%04d", Math.abs(UUID.randomUUID().getLeastSignificantBits() % 10000))
                + String.format("%02d", Math.abs(UUID.randomUUID().hashCode() % 100))
                + "000000";
        jdbc.update("delete from card where card_number = ?", cardNumber);
        cards.saveCard(new Card(new CardRegistration(cardNumber, ACCOUNT, CUSTOMER, "321", "SOFIA MARINO",
                LocalDate.of(2029, 12, 31), "Y"), Card.STATUS_ACTIVE, level));
        return cardNumber;
    }

    private void reportLoss(String cardNumber, String key, String token) throws Exception {
        mockMvc.perform(post("/api/v1/cards/" + cardNumber + "/loss")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"LOST\",\"confirmCardLast4\":\""
                                + cardNumber.substring(12) + "\",\"idempotencyKey\":\"" + key + "\"}"))
                .andExpect(status().isCreated());
    }

    private String createReplacement(String cardNumber, String key, String token) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/cards/" + cardNumber + "/replacements")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"addressId\":\"ADDR-" + CUSTOMER + "\",\"deliveryMethod\":\"STANDARD\","
                                + "\"reason\":\"LOST\",\"idempotencyKey\":\"" + key + "\"}"))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("replacementId").asText();
    }

    @Test
    void sameKeyWithDifferentPayloadOrSubjectConflicts() throws Exception {
        String cardNumber = ensureActiveCard("GOLD");
        String token = token("USER0001", "U");
        reportLoss(cardNumber, "conflict-loss-1", token);

        mockMvc.perform(post("/api/v1/cards/" + cardNumber + "/loss")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"STOLEN\",\"confirmCardLast4\":\"" + cardNumber.substring(12)
                                + "\",\"idempotencyKey\":\"conflict-loss-1\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_CONFLICT"));

        // 同键异主体：另一个客户用同一幂等键
        mockMvc.perform(post("/api/v1/cards/" + cardNumber + "/loss")
                        .header("Authorization", token("USER0002", "U"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"LOST\",\"confirmCardLast4\":\"" + cardNumber.substring(12)
                                + "\",\"idempotencyKey\":\"conflict-loss-1\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void cancelAndStatusReplayReturnReplayedWithoutSecondEffects() throws Exception {
        String cardNumber = ensureActiveCard("GOLD");
        String token = token("USER0001", "U");
        reportLoss(cardNumber, "replay-loss-1", token);
        String replacementId = createReplacement(cardNumber, "replay-create-1", token);

        mockMvc.perform(post("/api/v1/replacements/" + replacementId + "/cancel")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"idempotencyKey\":\"replay-cancel-1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.replayed").value(false));

        mockMvc.perform(post("/api/v1/replacements/" + replacementId + "/cancel")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"idempotencyKey\":\"replay-cancel-1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.replayed").value(true));

        verify(feeClient, times(1)).refund(anyString(), anyString(), any(), anyString());
        Integer cancels = jdbc.queryForObject(
                "select count(*) from audit_event where action = 'REPLACEMENT_CANCELLED' and resource_id = ?",
                Integer.class, replacementId);
        assertThat(cancels).isEqualTo(1);

        String statusCard = ensureActiveCard("GOLD");
        reportLoss(statusCard, "replay-loss-2", token);
        String statusReplacement = createReplacement(statusCard, "replay-create-2", token);
        String admin = token("ADMIN002", "A");
        mockMvc.perform(post("/api/v1/admin/replacements/" + statusReplacement + "/status")
                        .header("Authorization", admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"CARD_PRODUCED\",\"idempotencyKey\":\"replay-status-1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.replayed").value(false));
        mockMvc.perform(post("/api/v1/admin/replacements/" + statusReplacement + "/status")
                        .header("Authorization", admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"CARD_PRODUCED\",\"idempotencyKey\":\"replay-status-1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.replayed").value(true));
        Integer produced = jdbc.queryForObject(
                "select count(*) from audit_event where action = 'REPLACEMENT_CARD_PRODUCED' and resource_id = ?",
                Integer.class, statusReplacement);
        assertThat(produced).isEqualTo(1);
    }

    /** 002-A004：幂等占位与业务同事务——业务失败不留占位，随后合法重试只生效一次。 */
    @Test
    void failedBusinessAttemptLeavesNoIdempotencySlotAndRetryCreatesOnce() throws Exception {
        String cardNumber = ensureActiveCard("GOLD");
        String token = token("USER0001", "U");
        String key = "rollback-create-1";

        // 卡未挂失 → 建单业务失败（幂等占位必须一起回滚）
        mockMvc.perform(post("/api/v1/cards/" + cardNumber + "/replacements")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"addressId\":\"ADDR-" + CUSTOMER + "\",\"deliveryMethod\":\"STANDARD\","
                                + "\"reason\":\"LOST\",\"idempotencyKey\":\"" + key + "\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CARD_NOT_ACTIVE"));

        Integer slots = jdbc.queryForObject(
                "select count(*) from write_idempotency where scope = 'replacement-create' and "
                        + "idempotency_key = ?", Integer.class, key);
        assertThat(slots).isZero();

        reportLoss(cardNumber, "rollback-loss-1", token);
        String replacementId = createReplacement(cardNumber, key, token);
        mockMvc.perform(post("/api/v1/cards/" + cardNumber + "/replacements")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"addressId\":\"ADDR-" + CUSTOMER + "\",\"deliveryMethod\":\"STANDARD\","
                                + "\"reason\":\"LOST\",\"idempotencyKey\":\"" + key + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.replayed").value(true))
                .andExpect(jsonPath("$.replacementId").value(replacementId));
        Integer orders = jdbc.queryForObject(
                "select count(*) from card_replacement where old_card_number = ?",
                Integer.class, Masking.forStorage(cardNumber));
        assertThat(orders).isEqualTo(1);
    }

    @Test
    void platinumReplacementNeverCallsFeePosting() throws Exception {
        String cardNumber = ensureActiveCard("PLATINUM");
        String token = token("USER0001", "U");
        reportLoss(cardNumber, "platinum-loss-1", token);
        mockMvc.perform(post("/api/v1/cards/" + cardNumber + "/replacements")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"addressId\":\"ADDR-" + CUSTOMER + "\",\"deliveryMethod\":\"STANDARD\","
                                + "\"reason\":\"LOST\",\"idempotencyKey\":\"platinum-create-1\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.feeStatus").value("WAIVED"))
                .andExpect(jsonPath("$.feeAmount").value(0.0));
        verify(feeClient, never()).charge(anyString(), anyString(), any());
    }

    @Test
    void activationActivatesTheReplacementCard() throws Exception {
        String cardNumber = ensureActiveCard("GOLD");
        String token = token("USER0001", "U");
        reportLoss(cardNumber, "activate-loss-1", token);
        String replacementId = createReplacement(cardNumber, "activate-create-1", token);
        String admin = token("ADMIN002", "A");

        mockMvc.perform(post("/api/v1/admin/replacements/" + replacementId + "/status")
                        .header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"CARD_PRODUCED\",\"idempotencyKey\":\"activate-p-1\"}"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/v1/admin/replacements/" + replacementId + "/status")
                        .header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"SHIPPED\",\"trackingNo\":\"SF900\",\"estimatedArrival\":\""
                                + LocalDate.now().plusDays(4) + "\",\"idempotencyKey\":\"activate-s-1\"}"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/v1/admin/replacements/" + replacementId + "/status")
                        .header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"ACTIVATED\",\"idempotencyKey\":\"activate-a-1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVATED"));

        String newCardCipher = jdbc.queryForObject(
                "select new_card_cipher from card_replacement where replacement_id = ?", String.class,
                replacementId);
        String newCardNumber = cipher.decrypt(newCardCipher);
        String activeStatus = jdbc.queryForObject("select active_status from card where card_number = ?",
                String.class, newCardNumber);
        assertThat(activeStatus).isEqualTo("Y");
    }

    @Test
    void queuePaginationRejectsInvalidBoundsAndClampsAtServiceLevel() throws Exception {
        String admin = token("ADMIN003", "A");
        mockMvc.perform(get("/api/v1/admin/replacements").header("Authorization", admin)
                        .param("page", "-5").param("size", "500"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/v1/admin/replacements").header("Authorization", admin)
                        .param("page", "0").param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(20));

        CardPrincipal principal = new CardPrincipal("ADMIN003", "A");
        ReplacementService.PageResult clamped = replacementService.page(principal, null, -5, 500);
        assertThat(clamped.page()).isZero();
        assertThat(clamped.size()).isEqualTo(100);
        assertThat(replacementService.page(principal, null, 0, 0).size()).isEqualTo(1);
    }

    @Test
    void exportReplayReturnsSameFileAndExpiresExactlyAfter24Hours() throws Exception {
        String admin = token("ADMIN002", "A");
        MvcResult first = mockMvc.perform(post("/api/v1/admin/replacements/exports")
                        .header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"idempotencyKey\":\"export-replay-1\"}"))
                .andExpect(status().isCreated()).andReturn();
        JsonNode created = objectMapper.readTree(first.getResponse().getContentAsString());
        String exportId = created.get("exportId").asText();

        mockMvc.perform(post("/api/v1/admin/replacements/exports")
                        .header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"idempotencyKey\":\"export-replay-1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.replayed").value(true))
                .andExpect(jsonPath("$.exportId").value(exportId));

        LocalDateTime expiresAt = jdbc.queryForObject(
                "select expires_at from replacement_export where export_id = ?", LocalDateTime.class, exportId);
        Long hours = jdbc.queryForObject(
                "select extract(epoch from (expires_at - generated_at)) / 3600 from replacement_export "
                        + "where export_id = ?", Long.class, exportId);
        assertThat(hours).isEqualTo(24L);
        LocalDateTime generatedAt = jdbc.queryForObject(
                "select generated_at from replacement_export where export_id = ?", LocalDateTime.class, exportId);
        assertThat(expiresAt).isEqualTo(generatedAt.plusHours(24));

        // 应用侧以 UTC 写入/比较（hibernate.jdbc.time_zone=UTC），测试也用 UTC 计算边界
        jdbc.update("update replacement_export set expires_at = ? where export_id = ?",
                LocalDateTime.now(java.time.ZoneOffset.UTC).plusSeconds(60), exportId);
        mockMvc.perform(get("/api/v1/admin/replacements/exports/" + exportId).header("Authorization", admin))
                .andExpect(status().isOk());
        jdbc.update("update replacement_export set expires_at = ? where export_id = ?",
                LocalDateTime.now(java.time.ZoneOffset.UTC).minusSeconds(1), exportId);
        mockMvc.perform(get("/api/v1/admin/replacements/exports/" + exportId).header("Authorization", admin))
                .andExpect(status().isGone());
    }

    @Test
    void alertsThresholdRaisedOnlyOnceAndIndependentPerKind() throws Exception {
        // 第三个不同 key 的挂失请求：计数 3，未超过阈值 → 不告警
        jdbc.update("delete from request_attempt where subject_id = ?", CUSTOMER);
        jdbc.update("delete from ops_alert where subject_id = ?", CUSTOMER);
        String cardNumber = ensureActiveCard("GOLD");
        String token = token("USER0001", "U");
        reportLoss(cardNumber, "alert-count-1", token);
        for (int index = 2; index <= 3; index++) {
            mockMvc.perform(post("/api/v1/cards/" + cardNumber + "/loss")
                            .header("Authorization", token).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"reason\":\"LOST\",\"confirmCardLast4\":\"" + cardNumber.substring(12)
                                    + "\",\"idempotencyKey\":\"alert-count-" + index + "\"}"))
                    .andExpect(status().isConflict());
        }
        Integer lossAlerts = jdbc.queryForObject(
                "select count(*) from ops_alert where alert_type = ? and subject_id = ?", Integer.class,
                OpsAlert.LOSS_FREQUENCY, CUSTOMER);
        assertThat(lossAlerts).isZero();

        // 补卡频次独立计数并产生人工审核记录
        String frequencyCard = ensureActiveCard("GOLD");
        String cardRef = cardRefOf(frequencyCard);
        jdbc.update("delete from request_attempt where subject_id = ?", cardRef);
        for (int index = 1; index <= 4; index++) {
            mockMvc.perform(post("/api/v1/cards/" + frequencyCard + "/replacements")
                            .header("Authorization", token).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"addressId\":\"ADDR-" + CUSTOMER + "\",\"deliveryMethod\":\"STANDARD\","
                                    + "\"reason\":\"LOST\",\"idempotencyKey\":\"alert-repl-" + index + "\"}"))
                    .andExpect(status().isConflict());
        }
        Integer replacementAlerts = jdbc.queryForObject(
                "select count(*) from ops_alert where alert_type = ? and subject_id = ?", Integer.class,
                OpsAlert.REPLACEMENT_FREQUENCY, cardRef);
        Integer reviews = jdbc.queryForObject(
                "select count(*) from ops_alert where alert_type = ? and subject_id = ?", Integer.class,
                OpsAlert.MANUAL_REVIEW_REQUIRED, cardRef);
        assertThat(replacementAlerts).isEqualTo(1);
        assertThat(reviews).isEqualTo(1);
        Integer lossAlertsStill = jdbc.queryForObject(
                "select count(*) from ops_alert where alert_type = ?", Integer.class, OpsAlert.LOSS_FREQUENCY);
        assertThat(lossAlertsStill).isZero();
    }

    @Test
    void trackingAlertIsRaisedOncePerOrder() throws Exception {
        String cardNumber = ensureActiveCard("GOLD");
        String token = token("USER0001", "U");
        reportLoss(cardNumber, "tracking-loss-1", token);
        String replacementId = createReplacement(cardNumber, "tracking-create-1", token);
        String admin = token("ADMIN002", "A");
        mockMvc.perform(post("/api/v1/admin/replacements/" + replacementId + "/status")
                        .header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"CARD_PRODUCED\",\"idempotencyKey\":\"tracking-p-1\"}"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/v1/admin/replacements/" + replacementId + "/status")
                        .header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"SHIPPED\",\"trackingNo\":\"SF777\",\"estimatedArrival\":\""
                                + LocalDate.now().plusDays(4) + "\",\"idempotencyKey\":\"tracking-s-1\"}"))
                .andExpect(status().isOk());
        LocalDateTime shippedAt = jdbc.queryForObject(
                "select shipped_at from card_replacement where replacement_id = ?", LocalDateTime.class,
                replacementId);
        LocalDateTime later = shippedAt.plusHours(30);
        assertThat(alertService.raiseTrackingAlert(replacementId, shippedAt, later)).isTrue();
        assertThat(alertService.raiseTrackingAlert(replacementId, shippedAt, later)).isFalse();
        Integer alerts = jdbc.queryForObject(
                "select count(*) from ops_alert where alert_type = ? and subject_id = ?", Integer.class,
                OpsAlert.TRACKING_MISSING_24H, replacementId);
        assertThat(alerts).isEqualTo(1);
    }

    @Test
    void numberWorkerSkipsCancelledPendingAndAssignsRequested() {
        String pendingCard = ensureActiveCard("GOLD");
        String cancelledCard = ensureActiveCard("GOLD");
        String pendingId = insertPendingNumberRow(pendingCard, "REQUESTED");
        String cancelledId = insertPendingNumberRow(cancelledCard, "CANCELLED");

        numberWorker.assignIfPending(cancelledId);
        String cancelledState = jdbc.queryForObject(
                "select status || '|' || number_status from card_replacement where replacement_id = ?",
                String.class, cancelledId);
        assertThat(cancelledState).isEqualTo("CANCELLED|PENDING");
        String cancelledNewNumber = jdbc.queryForObject(
                "select new_card_number from card_replacement where replacement_id = ?", String.class,
                cancelledId);
        assertThat(cancelledNewNumber).isNull();
        String cancelledNewCipher = jdbc.queryForObject(
                "select coalesce(new_card_cipher, '') from card_replacement where replacement_id = ?",
                String.class, cancelledId);
        assertThat(cancelledNewCipher).isEmpty();

        numberWorker.assignIfPending(pendingId);
        String pendingState = jdbc.queryForObject(
                "select status || '|' || number_status from card_replacement where replacement_id = ?",
                String.class, pendingId);
        assertThat(pendingState).isEqualTo("REQUESTED|ASSIGNED");
    }

    private String insertPendingNumberRow(String oldCardNumber, String status) {
        String replacementId = "REP-" + UUID.randomUUID().toString().substring(0, 28);
        LocalDateTime now = LocalDateTime.now();
        jdbc.update("insert into card_replacement (replacement_id, old_card_number, old_card_ref, old_card_cipher, "
                        + "account_id, customer_id, address_id, reason, delivery_method, fee_amount, fee_status, "
                        + "fee_batch_id, status, requested_at, idempotency_key, active_key, number_status, version) "
                        + "values (?, ?, ?, ?, ?, ?, ?, 'LOST', 'STANDARD', 0.00, 'WAIVED', null, ?, ?, ?, ?, 'PENDING', 0)",
                replacementId, Masking.forStorage(oldCardNumber), cardRefOf(oldCardNumber),
                cipher.encrypt(oldCardNumber), ACCOUNT, CUSTOMER, "ADDR-" + CUSTOMER, status, now,
                "pending-" + replacementId, "CANCELLED".equals(status) ? null : cardRefOf(oldCardNumber));
        return replacementId;
    }

    private String cardRefOf(String cardNumber) {
        return cardRef.of(cardNumber);
    }

    @Autowired
    private com.carddemo.card.domain.service.CardRef cardRef;

    @Autowired
    private com.carddemo.card.application.AlertService alertService;

    @Autowired
    private com.carddemo.card.application.ReplacementService replacementService;



    /** 002-C01：渠道关闭时 worker 不得把待补发直接标记为已发送；打开后同一通知只发送一次。 */
    @Test
    void disabledChannelKeepsNotificationPendingUntilChannelRecovers() {
        String notificationId = UUID.randomUUID().toString();
        notifications.saveRecord(new NotificationRecord(notificationId, "CARD_LOST", CUSTOMER, "IN_APP",
                "CARD_LOSS_NOTICE", "PENDING_RETRY", "biz-recovery", LocalDateTime.now()));

        com.carddemo.card.infrastructure.support.SideEffectTransactions sideEffects =
                new com.carddemo.card.infrastructure.support.SideEffectTransactions(transactionManager);
        SideEffectWorker disabled = new SideEffectWorker(null, notifications, null, sideEffects, true, false);
        assertThat(disabled.dispatchNotifications()).isZero();
        assertThat(notifications.findRecord(notificationId).orElseThrow().getStatus())
                .isEqualTo("PENDING_RETRY");

        SideEffectWorker enabled = new SideEffectWorker(null, notifications, null, sideEffects, true, true);
        assertThat(enabled.dispatchNotifications()).isGreaterThanOrEqualTo(1);
        assertThat(notifications.findRecord(notificationId).orElseThrow().getStatus()).isEqualTo("SENT");
        // 第二轮不再重复投递
        enabled.dispatchNotifications();
        assertThat(notifications.findRecord(notificationId).orElseThrow().getStatus()).isEqualTo("SENT");
        Integer sentRows = jdbc.queryForObject(
                "select count(*) from notification_record where notification_id = ? and status = 'SENT'",
                Integer.class, notificationId);
        assertThat(sentRows).isEqualTo(1);
    }

    @Autowired
    private org.springframework.transaction.PlatformTransactionManager transactionManager;

    @Test
    void capabilityEndpointReportsRealPermissions() throws Exception {
        mockMvc.perform(get("/api/v1/cards/permissions").header("Authorization", token("USER0001", "U")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userType").value("U"))
                .andExpect(jsonPath("$.permissions.length()").value(0))
                .andExpect(jsonPath("$.customerId").value(CUSTOMER));
        mockMvc.perform(get("/api/v1/cards/permissions").header("Authorization", token("ADMIN001", "A")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.permissions.length()").value(3));
    }

    @Test
    void supportRequestIsRecordedLocallyAndVisibleToStaff() throws Exception {
        String token = token("USER0001", "U");
        MvcResult created = mockMvc.perform(post("/api/v1/support-requests")
                        .header("Authorization", token).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"subjectType\":\"REPLACEMENT\",\"subjectRef\":\"REP-DEMO\","
                                + "\"note\":\"need help\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("OPEN"))
                .andReturn();
        String requestId = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("requestId").asText();

        mockMvc.perform(get("/api/v1/support-requests").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].requestId").value(requestId));
        mockMvc.perform(get("/api/v1/admin/support-requests").header("Authorization", token("ADMIN001", "A")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].requestId").value(requestId));
        mockMvc.perform(get("/api/v1/admin/support-requests").header("Authorization", token))
                .andExpect(status().isForbidden());
    }
}

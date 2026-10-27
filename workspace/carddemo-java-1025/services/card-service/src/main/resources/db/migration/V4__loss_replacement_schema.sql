-- REQ-2026-002：挂失/补卡数据模型（PRD v1.2 第 8 章）
CREATE TABLE card_operation (
    operation_id              VARCHAR(32)  PRIMARY KEY,
    card_number               VARCHAR(19)  NOT NULL,
    operation_type            VARCHAR(16)  NOT NULL,
    status                    VARCHAR(16)  NOT NULL,
    reason                    VARCHAR(16),
    actor                     VARCHAR(64)  NOT NULL,
    idempotency_key           VARCHAR(64)  NOT NULL,
    staff_ticket_no           VARCHAR(32),
    identity_verification_ref VARCHAR(64),
    created_at                TIMESTAMP    NOT NULL,
    payload                   VARCHAR(4000),
    CONSTRAINT uk_card_operation_idem UNIQUE (idempotency_key)
);
CREATE INDEX idx_card_operation_card ON card_operation (card_number);
CREATE INDEX idx_card_operation_created ON card_operation (created_at);

CREATE TABLE card_replacement (
    replacement_id    VARCHAR(32)    PRIMARY KEY,
    old_card_number   VARCHAR(19)    NOT NULL,
    new_card_number   VARCHAR(19)    NOT NULL,
    new_card_cipher   VARCHAR(64)    NOT NULL,
    account_id        VARCHAR(11)    NOT NULL,
    customer_id       VARCHAR(9)     NOT NULL,
    address_id        VARCHAR(32)    NOT NULL,
    reason            VARCHAR(16)    NOT NULL,
    delivery_method   VARCHAR(16)    NOT NULL,
    fee_amount        NUMERIC(12, 2) NOT NULL,
    fee_status        VARCHAR(16)    NOT NULL,
    fee_batch_id      VARCHAR(32),
    refund_batch_id   VARCHAR(32),
    status            VARCHAR(16)    NOT NULL,
    tracking_no       VARCHAR(32),
    estimated_arrival DATE,
    requested_at      TIMESTAMP      NOT NULL,
    produced_at       TIMESTAMP,
    shipped_at        TIMESTAMP,
    activated_at      TIMESTAMP,
    cancelled_at      TIMESTAMP,
    idempotency_key   VARCHAR(64)    NOT NULL,
    active_key        VARCHAR(19),
    version           BIGINT         NOT NULL DEFAULT 0,
    CONSTRAINT uk_card_replacement_idem UNIQUE (idempotency_key),
    CONSTRAINT uk_card_replacement_active UNIQUE (active_key),
    CONSTRAINT uk_card_replacement_fee_batch UNIQUE (fee_batch_id),
    CONSTRAINT uk_card_replacement_refund_batch UNIQUE (refund_batch_id),
    CONSTRAINT uk_card_replacement_new_card UNIQUE (new_card_number)
);
CREATE INDEX idx_card_replacement_old_card ON card_replacement (old_card_number);
CREATE INDEX idx_card_replacement_status ON card_replacement (status);

CREATE TABLE write_idempotency (
    scope            VARCHAR(32)  NOT NULL,
    idempotency_key  VARCHAR(64)  NOT NULL,
    request_digest   VARCHAR(64)  NOT NULL,
    subject_id       VARCHAR(64)  NOT NULL,
    result_ref       VARCHAR(64),
    result_status    INTEGER,
    created_at       TIMESTAMP    NOT NULL,
    CONSTRAINT pk_write_idempotency PRIMARY KEY (scope, idempotency_key)
);

CREATE TABLE audit_event (
    event_id                  VARCHAR(36)  PRIMARY KEY,
    actor                     VARCHAR(64)  NOT NULL,
    action                    VARCHAR(32)  NOT NULL,
    resource_type             VARCHAR(32)  NOT NULL,
    resource_id               VARCHAR(64)  NOT NULL,
    masked_card_number        VARCHAR(19),
    reason                    VARCHAR(16),
    staff_ticket_no           VARCHAR(32),
    identity_verification_ref VARCHAR(64),
    trace_id                  VARCHAR(36),
    payload                   VARCHAR(4000),
    created_at                TIMESTAMP    NOT NULL
);
CREATE INDEX idx_audit_event_resource ON audit_event (resource_type, resource_id);
CREATE INDEX idx_audit_event_created ON audit_event (created_at);

CREATE TABLE audit_compensation (
    compensation_id VARCHAR(36) PRIMARY KEY,
    actor           VARCHAR(64) NOT NULL,
    action          VARCHAR(32) NOT NULL,
    resource_type   VARCHAR(32) NOT NULL,
    resource_id     VARCHAR(64) NOT NULL,
    payload         VARCHAR(4000),
    reason          VARCHAR(500),
    created_at      TIMESTAMP   NOT NULL
);

CREATE TABLE notification_record (
    notification_id VARCHAR(36) PRIMARY KEY,
    event_type      VARCHAR(32) NOT NULL,
    recipient       VARCHAR(64) NOT NULL,
    channel         VARCHAR(16) NOT NULL,
    template        VARCHAR(64) NOT NULL,
    status          VARCHAR(16) NOT NULL,
    biz_ref         VARCHAR(64) NOT NULL,
    attempts        INTEGER     NOT NULL DEFAULT 0,
    created_at      TIMESTAMP   NOT NULL,
    updated_at      TIMESTAMP   NOT NULL
);
CREATE INDEX idx_notification_biz ON notification_record (biz_ref);

CREATE TABLE ops_alert (
    alert_id      VARCHAR(36) PRIMARY KEY,
    alert_type    VARCHAR(32) NOT NULL,
    subject_type  VARCHAR(16) NOT NULL,
    subject_id    VARCHAR(64) NOT NULL,
    window_start  TIMESTAMP   NOT NULL,
    window_end    TIMESTAMP   NOT NULL,
    occurrences   INTEGER     NOT NULL,
    status        VARCHAR(16) NOT NULL,
    created_at    TIMESTAMP   NOT NULL,
    CONSTRAINT uk_ops_alert_window UNIQUE (alert_type, subject_id, window_start)
);

CREATE TABLE request_attempt (
    attempt_id      VARCHAR(36) PRIMARY KEY,
    kind            VARCHAR(16) NOT NULL,
    subject_id      VARCHAR(64) NOT NULL,
    idempotency_key VARCHAR(64) NOT NULL,
    created_at      TIMESTAMP   NOT NULL,
    CONSTRAINT uk_request_attempt_key UNIQUE (kind, idempotency_key)
);
CREATE INDEX idx_request_attempt_subject ON request_attempt (kind, subject_id, created_at);

CREATE TABLE replacement_export (
    export_id      VARCHAR(36) PRIMARY KEY,
    requested_by   VARCHAR(64) NOT NULL,
    filter_status  VARCHAR(16),
    generated_at   TIMESTAMP   NOT NULL,
    expires_at     TIMESTAMP   NOT NULL,
    row_count      INTEGER     NOT NULL,
    file_ref       VARCHAR(8000) NOT NULL,
    access_count   INTEGER     NOT NULL DEFAULT 0
);

CREATE TABLE card_access (
    user_id     VARCHAR(16) PRIMARY KEY,
    customer_id VARCHAR(9)  NOT NULL
);

CREATE TABLE card_permission (
    user_id    VARCHAR(16) NOT NULL,
    permission VARCHAR(64) NOT NULL,
    CONSTRAINT pk_card_permission PRIMARY KEY (user_id, permission)
);

-- 费用/退款稳定业务引用（16 位数字交易号）；重试复用同一值
CREATE SEQUENCE replacement_effect_seq START WITH 8000000000000001 INCREMENT BY 1;

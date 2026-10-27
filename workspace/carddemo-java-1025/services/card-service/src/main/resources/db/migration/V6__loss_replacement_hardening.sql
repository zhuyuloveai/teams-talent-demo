-- REQ-2026-002 返工 R2：稳定卡身份、费用操作、可信工单、副作用补偿（002-A002/A006/C01/C02/C03/C08）

-- 1) 稳定卡身份（002-C03）：掩码只用于展示，业务键改用 HMAC 卡身份
ALTER TABLE card_replacement ADD COLUMN old_card_ref VARCHAR(64);
ALTER TABLE card_replacement ADD COLUMN old_card_cipher VARCHAR(64);
ALTER TABLE card_replacement ADD COLUMN new_card_ref VARCHAR(64);
-- 进行中唯一性载体改为稳定身份：旧掩码键整体重建
ALTER TABLE card_replacement DROP COLUMN active_key;
ALTER TABLE card_replacement ADD COLUMN active_key VARCHAR(64);
ALTER TABLE card_replacement ADD CONSTRAINT uk_card_replacement_active UNIQUE (active_key);
CREATE INDEX idx_card_replacement_old_ref ON card_replacement (old_card_ref);
CREATE UNIQUE INDEX uk_card_replacement_new_ref ON card_replacement (new_card_ref);

-- 2) 受理即可落库，卡号分配为独立可重试步骤（002-C08）
ALTER TABLE card_replacement ALTER COLUMN new_card_number DROP NOT NULL;
ALTER TABLE card_replacement ALTER COLUMN new_card_cipher DROP NOT NULL;
ALTER TABLE card_replacement ADD COLUMN number_status VARCHAR(16) NOT NULL DEFAULT 'ASSIGNED';
ALTER TABLE card_replacement ALTER COLUMN number_status SET DEFAULT 'PENDING';

ALTER TABLE card_operation ADD COLUMN card_ref VARCHAR(64);
CREATE INDEX idx_card_operation_ref ON card_operation (card_ref);

-- 3) 持久费用操作（002-A002/A006）
CREATE TABLE fee_operation (
    operation_key      VARCHAR(64)    PRIMARY KEY,
    replacement_id     VARCHAR(32)    NOT NULL,
    kind               VARCHAR(8)     NOT NULL,
    effect_id          VARCHAR(32)    NOT NULL,
    amount             NUMERIC(12, 2) NOT NULL,
    account_id         VARCHAR(11)    NOT NULL,
    card_number_masked VARCHAR(19)    NOT NULL,
    card_cipher        VARCHAR(64)    NOT NULL,
    state              VARCHAR(24)    NOT NULL,
    attempts           INTEGER        NOT NULL DEFAULT 0,
    last_error         VARCHAR(500),
    created_at         TIMESTAMP      NOT NULL,
    updated_at         TIMESTAMP      NOT NULL,
    version            BIGINT         NOT NULL DEFAULT 0,
    CONSTRAINT uk_fee_operation_effect UNIQUE (effect_id),
    CONSTRAINT uk_fee_operation_replacement_kind UNIQUE (replacement_id, kind),
    CONSTRAINT ck_fee_operation_kind CHECK (kind IN ('CHARGE', 'REFUND'))
);
CREATE INDEX idx_fee_operation_state ON fee_operation (state);

-- 4) 客服工单/核身可信记录（002-C02）：本地测试夹具，不接外部工单平台
CREATE TABLE staff_verification (
    ticket_no                 VARCHAR(32) PRIMARY KEY,
    customer_id               VARCHAR(9)  NOT NULL,
    identity_verification_ref VARCHAR(64) NOT NULL,
    status                    VARCHAR(16) NOT NULL,
    verified_at               TIMESTAMP   NOT NULL,
    used_at                   TIMESTAMP
);
CREATE INDEX idx_staff_verification_customer ON staff_verification (customer_id);

INSERT INTO staff_verification (ticket_no, customer_id, identity_verification_ref, status, verified_at)
VALUES ('TICKET-1001', '000000006', 'REF-KYC-1001', 'VALID', CURRENT_TIMESTAMP);
INSERT INTO staff_verification (ticket_no, customer_id, identity_verification_ref, status, verified_at)
VALUES ('TICKET-1002', '000000005', 'REF-KYC-1002', 'VALID', CURRENT_TIMESTAMP);
INSERT INTO staff_verification (ticket_no, customer_id, identity_verification_ref, status, verified_at)
VALUES ('TICKET-2001', '000000005', 'REF-KYC-2001', 'REVOKED', CURRENT_TIMESTAMP);

-- 5) 副作用补偿（002-C01）：审计补偿补齐可重放载荷；通知入队失败补偿表
ALTER TABLE audit_compensation ADD COLUMN masked_card_number VARCHAR(19);
ALTER TABLE audit_compensation ADD COLUMN staff_ticket_no VARCHAR(32);
ALTER TABLE audit_compensation ADD COLUMN identity_verification_ref VARCHAR(64);
ALTER TABLE audit_compensation ADD COLUMN trace_id VARCHAR(36);
ALTER TABLE audit_compensation ADD COLUMN last_error VARCHAR(500);

ALTER TABLE notification_record ADD COLUMN last_error VARCHAR(500);

CREATE TABLE notification_retry (
    notification_id VARCHAR(36) PRIMARY KEY,
    event_type      VARCHAR(32) NOT NULL,
    recipient       VARCHAR(64) NOT NULL,
    channel         VARCHAR(16) NOT NULL,
    template        VARCHAR(64) NOT NULL,
    biz_ref         VARCHAR(64) NOT NULL,
    last_error      VARCHAR(500),
    created_at      TIMESTAMP   NOT NULL
);

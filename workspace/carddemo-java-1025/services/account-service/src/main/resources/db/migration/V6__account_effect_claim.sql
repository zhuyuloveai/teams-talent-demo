-- REQ-2026-002 返工 R3：账户侧稳定 effect 的到达/取消仲裁（002-A003-R2）
-- 资金提交端的因果锚点：FEE 请求先以独立事务登记 claim，取消/退款可先写 CANCEL_REQUESTED/CANCELLED，
-- 从而让"已到达但未提交"的资金请求与取消互斥，避免点时 404 被当成永远未执行。
CREATE TABLE account_effect_claim (
    effect_id  VARCHAR(32) PRIMARY KEY,
    kind       VARCHAR(8),
    account_id VARCHAR(11),
    amount     NUMERIC(12, 2),
    state      VARCHAR(24) NOT NULL,
    created_at TIMESTAMP   NOT NULL,
    updated_at TIMESTAMP   NOT NULL,
    version    BIGINT      NOT NULL DEFAULT 0,
    CONSTRAINT ck_account_effect_claim_state
        CHECK (state IN ('CLAIMED', 'APPLIED', 'CANCEL_REQUESTED', 'CANCELLED')),
    CONSTRAINT ck_account_effect_claim_kind CHECK (kind IS NULL OR kind IN ('FEE', 'REFUND'))
);

CREATE INDEX idx_account_effect_claim_state ON account_effect_claim (state);

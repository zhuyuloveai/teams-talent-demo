-- REQ-2026-002：费用/退款稳定 effect 身份（PRD §4.3 / D-10）
-- 调用方（transaction-service 补卡费）按 effectId 提交；同 effectId 重试只生效一次。
CREATE TABLE account_effect (
    effect_id      VARCHAR(32)    PRIMARY KEY,
    account_id     VARCHAR(11)    NOT NULL,
    kind           VARCHAR(8)     NOT NULL,
    amount         NUMERIC(12, 2) NOT NULL,
    balance_after  NUMERIC(12, 2) NOT NULL,
    applied_at     TIMESTAMP      NOT NULL,
    CONSTRAINT ck_account_effect_kind CHECK (kind IN ('FEE', 'REFUND')),
    CONSTRAINT ck_account_effect_amount CHECK (amount > 0)
);

CREATE INDEX idx_account_effect_account ON account_effect (account_id);

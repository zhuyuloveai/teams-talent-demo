-- REQ-2026-002 返工 R2：补卡费退款与原收费的一对一约束（002-A002）
-- 一张原收费最多对应一笔退款；重复退款在数据库层被拒绝，而不是靠应用层状态猜测。
ALTER TABLE transaction ADD COLUMN original_transaction_id VARCHAR(16);
ALTER TABLE transaction ADD CONSTRAINT uk_transaction_refund_original UNIQUE (original_transaction_id);
CREATE INDEX idx_transaction_original ON transaction (original_transaction_id);

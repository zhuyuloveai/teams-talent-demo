-- REQ-2026-002 返工 R2：取消栅栏（002-A003）
-- 退款判定"原收费确定未执行"后落栅栏；任何迟到的同身份收费请求必须被拒绝。
CREATE TABLE replacement_fee_fence (
    fee_transaction_id VARCHAR(16) PRIMARY KEY,
    reason             VARCHAR(64) NOT NULL,
    created_at         TIMESTAMP   NOT NULL
);

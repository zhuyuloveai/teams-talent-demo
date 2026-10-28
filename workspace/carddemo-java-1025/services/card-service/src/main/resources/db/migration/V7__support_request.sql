-- REQ-2026-002 返工 R3：本地客服协助入口（002-C07）
-- 原文只要求"最小可用客服入口"，不接外部客服平台：客户提交的协助请求落本地，客服/运营在队列中可见并处理。
CREATE TABLE support_request (
    request_id   VARCHAR(36) PRIMARY KEY,
    customer_id  VARCHAR(9)  NOT NULL,
    subject_type VARCHAR(16) NOT NULL,
    subject_ref  VARCHAR(64),
    note         VARCHAR(500),
    status       VARCHAR(16) NOT NULL,
    created_by   VARCHAR(64) NOT NULL,
    created_at   TIMESTAMP   NOT NULL
);

CREATE INDEX idx_support_request_customer ON support_request (customer_id, created_at);
CREATE INDEX idx_support_request_status ON support_request (status);

-- REQ-2026-002：卡状态机扩展（D-06）与模拟卡级别（D-07）
-- active_status 保留为遗留"可交易"标志以兼容既有接口；card_status 为业务状态权威来源。
ALTER TABLE card ADD COLUMN card_status VARCHAR(16);
ALTER TABLE card ADD COLUMN card_level VARCHAR(16);

UPDATE card SET card_status = CASE WHEN active_status = 'Y' THEN 'ACTIVE' ELSE 'CLOSED' END;
UPDATE card SET card_level = 'CLASSIC';

ALTER TABLE card ALTER COLUMN card_status SET NOT NULL;
ALTER TABLE card ALTER COLUMN card_level SET NOT NULL;

ALTER TABLE card ADD CONSTRAINT ck_card_status
    CHECK (card_status IN ('ACTIVE', 'LOST', 'FROZEN', 'CLOSED'));
ALTER TABLE card ADD CONSTRAINT ck_card_level
    CHECK (card_level IN ('CLASSIC', 'GOLD', 'PLATINUM'));

-- US-004 使用的非白金卡（金卡）：账户 00000000006 / 客户 000000006 / 持卡人 USER0001
UPDATE card SET card_level = 'GOLD' WHERE card_number = '3344556677889900';

-- 本地测试种子（模拟）：原文 US-003 示例白金卡号，账户 00000000005 / 客户 000000005 / 持卡人 USER0002
INSERT INTO card (card_number, account_id, customer_id, cvv, embossed_name, expiration_date,
                  active_status, card_status, card_level, version)
VALUES ('4000000000009999', '00000000005', '000000005', '321', 'MARCUS CHEN', DATE '2029-12-31',
        'Y', 'ACTIVE', 'PLATINUM', 0);
INSERT INTO card_xref (card_number, customer_id, account_id)
VALUES ('4000000000009999', '000000005', '00000000005');

-- 本地测试种子（模拟）：冻结卡，用于 BR-LOST-01 三类非 ACTIVE 断言
INSERT INTO card (card_number, account_id, customer_id, cvv, embossed_name, expiration_date,
                  active_status, card_status, card_level, version)
VALUES ('4000000000008888', '00000000003', '000000003', '654', 'LARRY HOMENICK', DATE '2028-06-30',
        'N', 'FROZEN', 'CLASSIC', 0);
INSERT INTO card_xref (card_number, customer_id, account_id)
VALUES ('4000000000008888', '000000003', '00000000003');

-- REQ-2026-002：本地权限与客户映射种子（ADR-012 先例，本地演示专用）
-- 客户自助（USER0001/USER0002）不授予后台权限点
INSERT INTO card_access (user_id, customer_id) VALUES ('USER0001', '000000006');
INSERT INTO card_access (user_id, customer_id) VALUES ('USER0002', '000000005');

-- ADMIN001：客服（代客挂失、查询、协助取消）
INSERT INTO card_permission (user_id, permission) VALUES ('ADMIN001', 'card:loss:assist');
INSERT INTO card_permission (user_id, permission) VALUES ('ADMIN001', 'replacement:read:any');
INSERT INTO card_permission (user_id, permission) VALUES ('ADMIN001', 'replacement:cancel:assist');

-- ADMIN002：制卡运营（队列、状态更新、导出）
INSERT INTO card_permission (user_id, permission) VALUES ('ADMIN002', 'replacement:read:any');
INSERT INTO card_permission (user_id, permission) VALUES ('ADMIN002', 'replacement:status:update');

-- ADMIN003：风控只读
INSERT INTO card_permission (user_id, permission) VALUES ('ADMIN003', 'replacement:read:any');

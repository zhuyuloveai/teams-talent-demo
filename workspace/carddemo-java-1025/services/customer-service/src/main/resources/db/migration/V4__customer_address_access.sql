-- REQ-2026-002 返工 R2：地址接口的身份与归属（002-C04）
-- 客户自助只能读本人 customerId；card-service 的内部调用以服务 token 校验地址归属。
CREATE TABLE customer_user (
    user_id     VARCHAR(16) PRIMARY KEY,
    customer_id VARCHAR(9)  NOT NULL
);

INSERT INTO customer_user (user_id, customer_id) VALUES ('USER0001', '000000006');
INSERT INTO customer_user (user_id, customer_id) VALUES ('USER0002', '000000005');

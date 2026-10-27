-- REQ-2026-002 D-09：最小地址资源。以客户主地址派生稳定 addressId = 'ADDR-' + customer_id，
-- 供补卡申请校验地址归属（不冗余存储地址明细，保持 §8.2 最小化）。
CREATE TABLE customer_address (
    address_id   VARCHAR(32) PRIMARY KEY,
    customer_id  VARCHAR(9)  NOT NULL,
    address_line1 VARCHAR(50) NOT NULL,
    address_line2 VARCHAR(50),
    address_line3 VARCHAR(50) NOT NULL,
    state_code   VARCHAR(2)  NOT NULL,
    country_code VARCHAR(3)  NOT NULL,
    zip_code     VARCHAR(10) NOT NULL,
    is_primary   VARCHAR(1)  NOT NULL
);

INSERT INTO customer_address (address_id, customer_id, address_line1, address_line2, address_line3,
                              state_code, country_code, zip_code, is_primary)
SELECT 'ADDR-' || customer_id, customer_id, address_line1, address_line2, address_line3,
       state_code, country_code, zip_code, 'Y'
FROM customer;

-- REQ-2026-002：补卡费/冲回交易类型（D-10）。不得伪装成普通消费（01/0001）。
INSERT INTO tran_type (type_code, description) VALUES ('08', 'Replacement Fee');

INSERT INTO tran_category (type_code, category_code, description)
VALUES ('08', '0001', 'Replacement Fee');

INSERT INTO disclosure_group (group_id, type_code, category_code, interest_rate)
VALUES ('A000000000', '08', '0001', 0.00),
       ('DEFAULT', '08', '0001', 0.00);

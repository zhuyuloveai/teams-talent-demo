# ADR-013：挂失/补卡的写幂等与补卡费资金一致性

| 项 | 内容 |
|----|------|
| 编号 | ADR-013 |
| 日期 | 2026-10-28 |
| 状态 | 已接受（本地演示；正式 KMS/账务/权限见 PRD §12） |
| 关联需求 | REQ-2026-002（PRD v1.2 D-10/D-13/D-17/§4.3、BR-LOST-10/14/17） |

## 背景

- 原文 §11.3 要求所有写接口支持去重键，v2 要求同键重放 200；基线 card-service 无幂等表，account `/postings` 无 effect 幂等（仅 `/payments` 有 `effectId`）。
- 补卡费与冲回跨 card → transaction → account 三段，`FEE_PENDING` 可能表示"远端已收费但响应丢失"；`/postings` 的"先远端后本地提交"存在崩溃窗口。
- 冲回必须一次且仅一次；取消与收费重试并发不得出现"取消后补收"或"重复退费"。

## 候选方案

| 方案 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| A. 仅复用 `/postings` | card 直接调 transaction `/postings` 记费用，取消再调 `/payments` 退款 | 改动小 | postings 无 effect 幂等，崩溃窗口会双收；退款语义与费用交易不可对账 |
| B. card 内自建资金表 | 补卡费与退款都在 card 库记账 | 简单 | 违反"余额变更经 account-service"约束，账务分裂 |
| C. 稳定 effect + 交易幂等（采纳） | account 新增 `/effects`（effectId 唯一、FEE/REFUND），transaction 新增 `/replacement-fees`（transaction_id 即 effectId，退款先核实原收费） | 跨服务幂等可验证；可对账；失败可重试续跑 | 新增两个内部接口与一张表 |

## 决策

采用 **C**：

1. `write_idempotency(scope, idempotency_key, request_digest, subject_id, result_ref, result_status)` 统一承接挂失/补卡/取消/状态/导出的幂等；同键异载荷或异主体 → 409 `IDEMPOTENCY_KEY_CONFLICT`。
2. `account_effect(effect_id PK, account_id, kind, amount, balance_after)`：`FEE` 增加欠款、`REFUND` 减少欠款；同 effectId 不同载荷 → 409 `EFFECT_CONFLICT`，重放返回首次结果。
3. `transaction-service` 新增 `POST /api/v1/replacement-fees`，交易类型 `08/0001`（费用）与 `05/0001`（冲回）；以 `transaction_id` 幂等，退款前在自有交易表核实原收费是否存在，不存在则返回 `refunded=false`（无资金效果）。
4. card-service 持久化 `fee_batch_id`/`refund_batch_id`（序列生成，16 位）后再发起调用；重试复用同一身份。
5. 顺序为先账户 effect、后交易落库：崩溃重试时账户侧不重复生效、交易侧按 id 判重。

## 后果

- 正面：取消/重试/并发组合不会双收双退；`FEE_PENDING` 取消有确凿核实依据；费用与冲回可在交易与账户两侧对账。
- 负面：新增内部接口需要部署到 transaction/account 两服务；effect 表随调用量增长，需要归档策略（P-07）。
- 未覆盖：会计总账科目（P-05）尚未确认，本期不写 ledger 分录，仅落交易与账户余额，避免冒称已过账。
- 回退：如后续引入统一账务/网关，`account_effect` 可迁移为通用 effect 表，card 侧调用方式不变。

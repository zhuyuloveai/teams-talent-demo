# 10 · 挂失与补卡能力设计（REQ-2026-002 / 任务 REQ-edd73c9b）

| 项 | 内容 |
|----|------|
| 设计编号 | DES-REQ-2026-002-v1.0 |
| 依据 | PRD v1.2（`docs/requirements/REQ-2026-002-REQ-edd73c9b-a625-435f-a6ae-5479ec5d21cc-revision-f37de8a4.md`，SHA256 `5f2bc594…9297bf`）+ 原始需求 v1.0 + test-profile-v2 |
| 基线 | 分支 `codex/carddemo-req-edd73c9b-…-21d3da61`，base `41cab537c8439192b74c4e2b39bb4ce49731b9b1`（= develop，含 REQ-2026-001 合入） |
| 范围 | 卡状态机与卡级别、挂失、补卡工单与状态机、补卡费与冲回、通知/审计/告警、后台队列与导出、7 个业务接口 + 内部费用接口 + 地址资源、前端 4 个页面 |

## 1. 设计目标与约束

- 原文 13 章语义、REQ-LOST-01..07、US-001..008 全部落地；不新增未获批准的政策（PRD v1.2 §3.3）。
- 基线缺口必须真实补齐（不得 stub）：卡状态 `LOST`、卡级别、幂等记录、补卡工单、地址资源、费用交易、冲回、通知、审计、导出失效、告警。
- 资金一致性：费用与冲回都经 `account-service` 记账，具备**稳定 effect 身份**与持久重试；取消必须按原收费身份核实后才冲回（PRD §4.3）。
- 不改造平台/其他任务：仅本任务 worktree 内模块；既有卡查询/维护接口保持原合同。

## 2. 需求 → 设计覆盖矩阵

| 需求 | 设计落点 |
|------|----------|
| REQ-LOST-01 挂失入口 | §5.2 卡详情页：`ACTIVE` 且可交易时展示挂失确认表单 |
| REQ-LOST-02 挂失立即生效 | §4.1 `POST /cards/{n}/loss`，卡状态机 `ACTIVE→LOST`，审计+通知 |
| REQ-LOST-03 补卡申请 | §4.1 `POST /cards/{n}/replacements`，地址校验、新卡生成、费用过账 |
| REQ-LOST-04 进度时间线 | §4.1 `GET /replacements/{id}`、`GET /cards/{n}/replacements`；§5.2 进度页 |
| REQ-LOST-05 补卡费 | §4.3 费用 effect（transaction-service `08/0001` + account `/effects`），取消冲回 |
| REQ-LOST-06 后台队列 | §4.1 admin 接口 + §5.2 队列页（筛选/状态更新/导出） |
| REQ-LOST-07 去重 | §4.2 全部写接口 `idempotencyKey` + 载荷摘要，同键异载荷 409 |
| BR-LOST-01..07（原文） | §3 卡状态与合法边表；§4 接口约束；§6 审计/通知 |
| BR-LOST-08..20（PRD 口径） | §3.2 状态机、§4.2 幂等、§4.3 资金、§4.4 告警、§6 安全 |
| US-001..008 / AC-V2-01..19 | §7 测试策略与覆盖映射；接口与状态机逐条对应 |
| 原文 §8.2 脱敏/加密/导出 24h | §6.1 掩码与密文；§4.5 导出有效期 |
| 原文 §12.1 两项风险响应 | §4.4 告警（缺单号 24h、补卡频率） |

## 3. 领域模型

### 3.1 卡状态与卡级别

- `card.card_status`：`ACTIVE`/`LOST`/`FROZEN`/`CLOSED`（迁移 V3），`card.card_level`：`CLASSIC`/`GOLD`/`PLATINUM`（模拟）。
- 既有 `active_status`（Y/N）保留为"可交易"标志：挂失要求 `card_status=ACTIVE` **且** `active_status=Y`；
  补卡新卡创建时 `card_status=ACTIVE`、`active_status=N`，`ACTIVATED` 时置 Y（对应授权 4200「卡未激活」）。
- 存量映射：`Y→ACTIVE`、`N→CLOSED`（既有 N 卡到期日已过）；通用维护接口禁止把 `LOST`/`CLOSED` 重新启用（不得绕过旧卡永久失效）。
- 测试种子新增：白金卡 `4000000000009999`（账户 `00000000005`、客户 `000000005`）、冻结卡 `4000000000008888`（账户 `00000000003`）。

### 3.2 补卡工单状态机（唯一合法边）

```
REQUESTED ──► CARD_PRODUCED ──► SHIPPED ──► ACTIVATED
    └──────► CANCELLED
```
- `SHIPPED` 必须携带 `trackingNo`，`estimatedArrival ≥ 寄出日 + 3 天`；跳级/回退/终态再写 → 409 `INVALID_STATE_TRANSITION`。
- 进行中唯一性：`active_key`（旧卡掩码）在 `REQUESTED|CARD_PRODUCED|SHIPPED` 期间唯一，终态置空 → 同卡并发只 1 单（BR-LOST-06）。

### 3.3 费用状态机

```
(无) ─► FEE_PENDING ─► CHARGED ─► REFUNDED
        └────────────► WAIVED（白金免收 / 取消时确认未收费）
```

## 4. 接口与实现

### 4.1 对外接口（card-service）

| 接口 | 说明 | 关键实现 |
|------|------|----------|
| `POST /api/v1/cards/{n}/loss` | 201 首次 / 200 同键重放 | `CardLossService`：主体校验→幂等→客服凭证→状态机→操作/审计/通知/告警 |
| `POST /api/v1/cards/{n}/replacements` | 201 已收费/免收；202 费用待补收 | `ReplacementService.create`：仅持卡人（U 且本人）；地址校验；新卡生成；费用 effect |
| `GET /api/v1/cards/{n}/replacements` | 该卡补卡记录 | 客户本人或 `replacement:read:any` |
| `GET /api/v1/replacements/{id}` | 时间线 | 越权 404 |
| `POST /api/v1/replacements/{id}/cancel` | 仅 `REQUESTED` | 已收费→冲回一次；`FEE_PENDING`→按原收费核实 |
| `GET /api/v1/admin/replacements` | 队列（分页/筛选） | 需 `replacement:read:any` |
| `POST /api/v1/admin/replacements/{id}/status` | 状态更新 | 需 `replacement:status:update`；`ACTIVATED` 激活新卡 |
| `POST/GET /api/v1/admin/replacements/exports[/{id}]` | 导出与下载 | 服务端生成 CSV、仅后 4 位、24h 失效（410 `EXPORT_EXPIRED`）、留审计 |

内部接口：`POST /api/v1/replacement-fees`（transaction-service）、`POST /api/v1/accounts/{id}/effects`（account-service）、`GET /api/v1/customers/{id}/addresses[/{addressId}]`（customer-service）。

### 4.2 幂等（BR-LOST-17）

- 表 `write_idempotency(scope, idempotency_key, request_digest, subject_id, result_ref, result_status)`；
  同键同载荷 → 200 + 首次结果；同键异载荷或异主体 → 409 `IDEMPOTENCY_KEY_CONFLICT`；新键对已 `CANCELLED` → 409 `REPLACEMENT_NOT_CANCELLABLE`。
- 重放仍需通过 token/权限/归属校验（过滤器 + `AccessGuard` 前置）。

### 4.3 资金：稳定 effect 与冲回

- 收费：`card_replacement.fee_batch_id`（16 位数字，序列 `replacement_effect_seq`）→ transaction-service 以该 id 作为 `transaction_id` 记账（`08/0001`），内部调用 account `/effects`（`effectId=fee_batch_id`）。
- 冲回：`refund_batch_id` → transaction-service `05/0001`，account `/effects` 用 `REFUND`。
- **核实优先**：`FEE_PENDING` 取消时携带原 `fee_batch_id` 请求退款；transaction-service 在**自己的交易表**确认原收费存在才执行退款，否则返回 `refunded=false`，card-service 置 `WAIVED`（停收、无资金）。
- 恢复语义：account `/effects` 按 `effectId` 幂等（唯一约束 + 冲突 409），transaction 按 `transaction_id` 幂等；顺序为先账户后交易，重试不双收/双退。
- 不足：会计总账科目未定（PRD P-05）→ 本期只落交易与账户余额，"总账科目"标为待确认，不冒称已过账 ledger。

### 4.4 告警（D-15 / D-20）

- `request_attempt(kind, subject_id, idempotency_key)` 记录每次请求（同键不重复计数）；`kind=LOSS` 按客户、`kind=REPLACEMENT` 按旧卡掩码统计 24h 窗口；第 4 次起产生 `LOSS_FREQUENCY` / `REPLACEMENT_FREQUENCY` + `MANUAL_REVIEW_REQUIRED` 记录（每窗口只一次）。
- `TrackingAlertSweeper`（`@Scheduled`，默认 60s）扫描 `SHIPPED` 且 `trackingNo` 为空超过 24h 的记录 → `TRACKING_MISSING_24H`（每工单一次）。
- 告警不阻断业务、不构成审批流（C04）。

### 4.5 导出（C03）

- `replacement_export(export_id, requested_by, filter_status, generated_at, expires_at=+24h, row_count, file_ref, access_count)`；
  下载时 `now >= expires_at` → 410 `EXPORT_EXPIRED`，`expires_at` 不因访问延长；CSV 仅含后 4 位；生成与下载都写审计。

## 5. 前端（web-ui）

- 卡列表/详情卡号改为 `**** **** **** 1234`；详情页新增挂失确认表单（风险提示 + 原因 + 后 4 位）与 `LOST` 卡的补卡入口、补卡记录列表。
- 新增 `#/cards/{n}/replacement`（地址/配送/原因/费用确认）、`#/replacements/{id}`（四阶段时间线、快递单号、预计到达、取消）、`#/admin/replacements`（筛选、状态更新、CSV 导出）。
- 代理新增 `/api/v1/replacements`、`/api/v1/admin/replacements` → card-service；token 由浏览器 `Authorization` 透传。

## 6. 安全与数据保护

### 6.1 认证与授权

- 新接口统一 HMAC token 校验（`TokenAuthenticationFilter`，仅拦截本需求路径），无/坏/过期 → 401 `UNAUTHENTICATED`。
- 主体映射与本地点权限表（ADR-012 先例）：`card_access`（USER0001→000000006、USER0002→000000005）、`card_permission`
  （ADMIN001=客服：loss:assist/read:any/cancel:assist；ADMIN002=运营：read:any/status:update；ADMIN003=只读）。
- 越权访问他人卡/工单 → 404；缺权限点 → 403；actor 一律取认证主体。

### 6.2 卡号保护

- 存储：掩码列（前 6 + 后 4）+ 密文列（AES-256/GCM，密钥来自 `CARD_NUMBER_KEY` 环境配置）。
- 展示：接口响应、页面、日志、审计、导出仅后 4 位；新接口响应只含 `*Last4`。
- 存量 `card.card_number` 明文主键未整改（P-02），本设计不修改存量主键。

## 7. 测试策略与同版本证据

| 层 | 覆盖 |
|----|------|
| 领域单测 | 卡状态机/可交易、工单状态机与边表、费用生命周期、卡号 Luhn/BIN、掩码、费率 |
| 应用单测（Mockito） | 挂失幂等/客服凭证/已挂失/冻结、补卡费用（含白金免收与依赖失败 FEE_PENDING）、取消冲回与核实、状态更新与激活、告警阈值与重放不计数、导出 24h 边界 |
| 接口测试（H2 + Flyway 真实迁移） | 401/403/404、客服凭证 400、挂失 201→重放 200→新键 409、补卡 201（响应脱敏）、跨客户 404、运营更新 403/200、导出 201+下载 CSV |
| 跨服务单测 | account `/effects` 幂等与冲突、transaction 收费/退款幂等与原收费核实、customer 地址归属 |

命令与结果（真实执行）见本任务证据目录 `.../final-002/REQ-edd73c9b…-runtime/unit-tests.md`；测试范围：card-service、account-service、transaction-service、customer-service、web-ui。

## 8. NFR 应答

| 维度 | 目标 | 实现/验证 |
|------|------|-----------|
| 性能 | 挂失 p95<500ms、补卡<1200ms、进度<800ms | 索引（card_operation.card_number/created_at、card_replacement.old_card_number/status）；本地 50 并发由验证节点实测，本轮不宣称 |
| 可用性 | 依赖失败可观测、不影响主流程 | 费用失败→`FEE_PENDING`+202；通知/审计失败→待补发/补偿记录 |
| 一致性 | 同键不重复资金/事件 | effect 唯一约束 + 事务/幂等表 |
| 可观测性 | traceId/后 4 位/工单号 | 审计与告警字段 |
| 可维护性 | 费用/告警阈值配置化 | `replacement.fee.amount`、`card.alert.*` |

## 9. 部署与配置（本地）

- `docker-compose.yml`：card-service 新增 `CUSTOMER_SERVICE_URL`、`TRANSACTION_SERVICE_URL`、`IAM_TOKEN_SECRET`、`CARD_NUMBER_KEY`，并 `depends_on` customer/transaction。
- 迁移：card V3/V4/V5、account V5、transaction V3、customer V3（Flyway 顺序执行，H2 兼容）。
- 本任务独立 Compose 由协调者提供的 `compose-isolate.py` 生成（项目名 `carddemo-e2e-req-edd73c9b-…`），端口 loopback 随机、独立卷；本轮未启动容器（单元/接口测试用 H2）。

## 10. 演进与仍待确认（与 PRD §12 一致）

- P-01 正式 JWT/网关与细粒度 RBAC；P-02 KMS 与存量卡号整改；P-03 存量 N 卡冻结/销户归类；P-04 白金客群正式规则；
  P-05 费用/冲回会计科目与最低还款额；P-06 通知真实通道；P-07 长期归档清理；P-08 告警处置与人工审核流程；P-09 制卡/邮寄 SLA；P-10 客服工单与核实记录上游系统。
- 本设计不将上述事项标为已确认，也不以本地实现替代投产签字。

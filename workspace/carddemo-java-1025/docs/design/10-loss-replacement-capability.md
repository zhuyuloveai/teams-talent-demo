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

## 7A. 返工修复 R2（独立审查 002-A001..A007 / C-01..C-09）

本节记录本轮按 PR #11 两份固定独立审查（`pr11-review-a-a674a5b.json` / `pr11-review-c-a674a5b.json`）做的根因修复与取舍，替换上文 4.2/4.3/4.4/6.1/6.2 中已被修订的描述。

### 7A.1 资金路径（A-001/A-002/A-003/A-006，§4.3 修订）

- **账户 effect 锁内幂等**（`AccountEffectService`）：先 `SELECT … FOR UPDATE` 锁账户行，再在同一临界区内重读 `account_effect`；命中即按 `accountId/kind/amount` 比对后返回 `replayed=true`，不符 → 409 `EFFECT_CONFLICT`；未命中才改余额并插入 effect 行（`effect_id` 主键 + 冲突后重读）。同 key 并发两笔 FEE 50 → 余额只 +50、effect 行 1 条。effect 是账户侧唯一资金身份，可被 `GET /api/v1/accounts/effects/{effectId}` 反查（内部调用）。
- **card-service 持久费用操作 `fee_operation`**：`operation_key = FEE-<replacementId> | REFUND-<replacementId>`（PK），`effect_id`（16 位序列，唯一）、`state(PENDING/SENT/SUCCEEDED/FAILED/CANCELLED/REFUNDED)`、`attempts/last_error`、账户与卡密文。业务事务内只落工单 + `FEE` 操作行（PENDING）并提交，随后才调用下游；远端已执行但响应丢失时，同一 `effect_id` 重放返回 `replayed=true` 并确认 CHARGED。取消在同一事务内把 `FEE` 操作置 `CANCEL_REQUESTED`（栅栏），worker 只有在栅栏未竖立时才发起收费，因此取消后不会有迟到收费。
- **未知 ≠ 未执行**（A-003）：退款前先由 transaction-service 反查账户 effect。effect 不存在 → 收费确定未发生（`refunded=false, executed=false`）；存在 → 视为已执行，先把缺失的交易行幂等补齐（同一 `transaction_id` 走一遍 charge 的写入）再退款，净额 0；account-service 不可达 → `UNKNOWN`，保持 `FEE_PENDING`/`REFUND_PENDING`，由 worker 重试，不置 `WAIVED`。
- **退款一次**：transaction 表新增 `original_transaction_id` 并加唯一约束（PG 允许多 NULL），退款单以原 fee 事务号为唯一键；`REFUND-<replacementId>` 只有一行。收费遇到已存在退款单 → 409 `FEE_ALREADY_REFUNDED`。收费与退款对同一原 fee 使用 `pg_advisory_xact_lock(hashtext(effectId))` 串行，避免"先核实不存在、然后迟到收费"的竞态。
- **US008 恢复 worker**（A-006）：`FeeRecoveryWorker`（`@Scheduled`，默认 5s）扫描 `fee_operation` 的 PENDING/SENT/FAILED 与 REFUND_PENDING，按稳定 `effect_id` 重投；DB 持久，重启续跑；超过上限仍继续重试并留 `attempts/last_error` 可观测，不把"写了标记"当完成。
- **总账（Owner A-03/FEE 合同）**：transaction-service 在交易行后调用既有 ledger-service `POST /api/v1/journal-entries`，`entryGroupId=FEE-<effectId>` / `REFUND-<effectId>`，借贷配平：
  - 收费：DEBIT `1100`（信用卡应收账款）50 / CREDIT `4001`（补卡手续费收入）50；
  - 冲回：DEBIT `4001` / CREDIT `1100`。
  科目号为**仅本次本地验证的固定测试科目**（`1100`/`4001`），生产会计科目仍待正式确认（PRD §12 P-05），不声称已获批。ledger 失败 → 该笔过账失败，由 card-service worker 重试（ledger 按 entryGroupId 幂等）。

### 7A.2 幂等时序（A-004）

`write_idempotency` 改为**与业务同事务**：`begin()` 在业务事务内插入 `IN_PROGRESS` 行（唯一约束 `(scope,key)`），完成后同事务内写 `COMPLETED + result_ref/status`。因此：

- 业务回滚 → 占位行一并回滚，不会残留永久 `null` 占位或假 200；
- 同键并发第二个请求唯一键冲突 → 业务整体回滚并返回 409 `IDEMPOTENCY_IN_PROGRESS`，重试已完成请求则重放首次结果；
- 不再使用 `REQUIRES_NEW`，不额外借连接，不重演 001 的 afterCommit 连接饥饿。

### 7A.3 副作用（C-01，§4.4 补充）

- `SideEffectTransactions` 沿用 001 已验证范式：业务事务内只登记线程内队列（不碰 DB），事务提交后在**请求边界**（`SideEffectFlushFilter`）以单层 `REQUIRES_NEW` 逐条执行，失败时在另一条独立事务写补偿队列，绝不嵌套事务、绝不在 `afterCommit` 借连接。
- 审计：先写 `audit_event`；失败写 `audit_compensation`（补齐 actor/action/resource/masked/reason/staff_ticket/verification/trace/payload）。`SideEffectWorker`（默认 5s）重放补偿 → 以同一 `event_id` 写回（PK 幂等）→ 删除补偿，恰好一条。
- 通知：投递关闭或写失败 → `notification_record.status=PENDING_RETRY` + `attempts/last_error`；`SideEffectWorker` 重投并置 `SENT`，`biz_ref+event_type` 唯一，不重复投递。
- 两种副作用都不参与主事务，故真实 PG INSERT 失败（触发器/约束）不会回滚挂失/补卡，旧卡仍为 LOST。

### 7A.4 可信身份与权限（C-02/C-03/C-04/A-007）

- **卡身份**：新增 `CardRef`＝`SHA-256(salt|PAN)` 十六进制（不可逆、可关联）；`card_replacement.old_card_ref/new_card_ref`、`card_operation.card_ref`、`active_key` 都用它，展示/日志/审计仍只有后 4 位。同 BIN+尾 4 的两张卡不再共用掩码键，工单列表/详情按 `old_card_ref` 过滤，互不串数据、各可有 1 个进行中工单。
- **客服核身**：新增本地可信记录表 `staff_verification(ticket_no PK, customer_id, identity_verification_ref, status, verified_at)`，以**测试夹具**种子（`TICKET-1001/REF-KYC-1001` → 客户 000000006；`TICKET-1002/REF-KYC-1002` → 客户 000000005）。客服代客挂失必须命中"有效 + 客户与卡一致 + 核实引用一致"，否则 400 且无任何写入/通知；审计与 `card_operation` 记录 actor/工单/核实引用；客户自助不需要客服凭证。
- **内部资金调用**：account-service `/api/v1/accounts/*/effects`、`/api/v1/accounts/effects/**` 与 transaction-service `/api/v1/replacement-fees/**` 需 HMAC **服务 token**（payload `userId|S|exp`，userId 必须等于被允许的调用方：transaction-service / card-service），无/坏/过期/用户 token 一律 401。card-service、transaction-service 出站调用统一由 `ServiceTokenIssuer` 签发。web-ui 代理显式拒绝 `/api/v1/accounts/*/effects` 与 `/api/v1/replacement-fees`（403），不靠"隐藏 URL"。
- **地址接口**：customer-service 地址端点要求 token；客户只能读本人 `customerId`（新增 `customer_user` 映射，种子 USER0001→000000006、USER0002→000000005），他人 → 404；`userType=S` 且 userId=`card-service` 的内部调用可校验任意客户地址，供补卡前归属校验。

### 7A.5 计数、生成失败与导出（C-05/C-08/C-09）

- 计数（C-05）：`AlertService.registerAttempt` 在**状态机校验之前**、以独立事务写入（唯一键 `(kind,key)` 保证同键重放不重复计数），key 用 `CardRef`/customerId，不用掩码；被 409/400 拒绝的不同 key 请求同样计数；`LOSS` 与 `REPLACEMENT` 独立窗口，>3 次产生告警 + 人工审核记录，不新增硬拒绝。
- 生成失败（C-08）：工单**先落 `REQUESTED`**（`number_status=PENDING`，`new_card_ref/new_card_number/new_card_cipher` 可空），再生成卡号；生成失败（`card.number.generation-enabled=false` 模拟号段不可用，或碰撞耗尽）→ 202 + `CARD_NUMBER_GENERATION_FAILED` 告警，工单可查；worker 恢复后补号；同幂等键重放返回同一工单，不重复收费/建单。
- 导出（C-09）：CSV 按 RFC4180 转义（含 `,`/`"`/换行加引号、内部引号翻倍），对以 `= + - @` 或制表/回车开头的值加 `'` 前缀，防止表格公式注入；仍保留 24h 失效（410）与权限/审计。

### 7A.6 前端（C-07）

- 挂失：先比对已加载卡的后 4 位，不一致直接提示且**不发 POST**；客服入口需填工单号 + 核身引用；运营无客服权限时入口不可用。
- 补卡：地址从真实 `/api/v1/customers/{customerId}/addresses` 读取并可确认/改选，读取失败显式提示 + 重试（不再静默当空）；工单只保存 `addressId`。
- 进度页提供客服协助入口；未知结果重试沿用**同一逻辑请求 key**（成功后轮换），不再每次生成新 key。
- 后台队列：真实筛选 + 分页（`page/size/total`）+ 详情抽屉 + 状态更新（SHIPPED 必填单号与预计到达）+ CSV 下载。

### 7A.7 验证

单元/接口测试见 §7；本轮另需真实 PostgreSQL + HTTP 故障脚本（独立 Compose、loopback 随机端口）覆盖：同 effect 并发、账户已扣但本地写失败后恢复、远端已收费但响应丢失、双取消/取消×worker、pending 取消不迟到收费、匿名/越权资金 0 写入、审计/通知真实 SQL 失败不回滚并补发、ledger 借贷配平、CSV 特殊字符、地址与客服核身负例。证据与命令见本任务运行报告。

## 7B. 返工 R3（PR11 e4303f3 复审剩余项）

本节补充 7A 的资金仲裁与前端能力说明，替换 7A.1 中"点时 404 即可判定未执行"的旧描述。

### 7B.1 资金提交端的到达/取消仲裁（002-A003-R1/R2）

- **锁定失败不再降级**：`FeePostingLock` 取不到 advisory lock 时抛 503（可重试），**不会**把进程置为"无锁继续"；
  唯一的关闭方式是非 PG 单测显式配置 `fee.posting-lock.enabled=false`。真实 PG 验证：外部会话持锁期间
  余额与 effect 行都不变、工单保持 FEE_PENDING；释放后同一 `effect_id` 恢复收费且只扣一次。
- **账户侧 claim（资金提交端的因果锚点）**：表 `account_effect_claim(effect_id PK, kind, account_id, amount,
  state, version)`，状态 `CLAIMED → APPLIED`，取消路径可写 `CANCEL_REQUESTED`/`CANCELLED`。
  `POST /accounts/{id}/effects` 分两步：①独立事务登记/读取 claim（已取消 → 409 `EFFECT_CANCELLED`，零资金写）；
  ②资金事务：锁 claim → 锁账户 → **拿到账户锁后重新读取 claim** → 仍未取消才应用资金并置 APPLIED。
- **取消仲裁端点** `POST /accounts/effects/{effectId}/fence`（内部服务 token）返回：
  - `APPLIED`：资金已提交 → 调用方必须退款一次；
  - `CANCEL_REQUESTED`：请求已到达但未提交 → 调用方视为**未知**，保持可重试（绝不宣告未执行）；
  - `CANCELLED`：从未到达或已被拦下 → 调用方才可以停收（WAIVED）。
- **transaction-service** 退款改为调用上述 fence：`APPLIED` → 幂等补齐原收费再冲回一次；`CANCELLED` → 落审计栅栏、
  `executed=false`；`CANCEL_REQUESTED` → 返回 `pending=true`，card-service 的 `FeeWorkflow` 保持 `REFUND_PENDING`
  并继续重试。因此"调用方超时释放锁 + 取消在点时 404 窗口并发 + 原请求迟到提交"最终落到两种因果安全终态之一：
  取消拦下（无扣款）或迟到费用由同一退款身份冲回一次（净额 0、FEE/REFUND 分录组各自唯一且平衡）。

### 7B.2 重放语义（002-A004-R1）

`ReplacementCommandService` 返回 `CommandOutcome(replacement, replayed)`，facade 原样传播：
同键同载荷/同主体重放 → HTTP 200 `replayed=true`，不重复退款/通知/审计；异载荷或异主体仍 409。
业务事务失败（如卡未挂失）时幂等占位随事务回滚，随后合法重试只生效一次。

### 7B.3 通知渠道（002-C01）

`SideEffectWorker` 读取 `card.notification.delivery-enabled`：渠道关闭时**不投递、不改状态**，
记录保持 `PENDING_RETRY`；渠道恢复后按同一 `notification_id` 恰好投递一次（`SENT`）。

### 7B.4 号段与取消（002-C08）

`findNumberPending` 与锁内校验都要求 `number_status=PENDING 且 status=REQUESTED`；
已取消工单不再补号、不新建卡行，未取消的 REQUESTED 仍可恢复补号。

### 7B.5 前端能力（002-C07）

- `GET /api/v1/cards/permissions` 返回当前主体的真实权限点与 customerId；前端按此显示挂失（`card:loss:assist`
  或本人）、补卡（仅本人）、取消（`replacement:cancel:assist` 或本人）、状态更新（`replacement:status:update`）
  与补卡队列（`replacement:read:any`）；后端仍逐次校验，不扩大任何角色写权限。
- 收卡地址可在补卡页**真实修改**：`PUT /api/v1/customers/{customerId}/addresses/{addressId}`（仅客户本人 token，
  服务/运营 403），保存后仍以同一 `addressId` 提交补卡；工单不冗余地址明细。
- 客服入口：新增本地 `support_request` 表与 `POST /api/v1/support-requests`（客户提交）、
  `GET /api/v1/admin/support-requests`（客服/运营按 `replacement:read:any` 查看），不依赖外部客服平台，
  也不声称外部接入；客服代客操作仍走既有权限点与可信核身记录。

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

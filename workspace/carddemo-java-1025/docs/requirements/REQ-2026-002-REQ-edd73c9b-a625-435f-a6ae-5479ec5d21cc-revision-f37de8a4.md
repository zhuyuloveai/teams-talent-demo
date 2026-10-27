# PRD：信用卡挂失与补卡（REQ-2026-002 / 任务 REQ-edd73c9b-a625-435f-a6ae-5479ec5d21cc）

| 项 | 内容 |
|----|------|
| 文档编号 | PRD-REQ-2026-002-REQ-edd73c9b |
| 版本 | **v1.2（prepare 节点复核纠正稿，替代 v1.1 供下游获取；v1.1 四项审查修订已通过）** |
| 节点 | prepare（需求澄清）· 合同 `delivery-node-v2` |
| 项目 / 任务 | carddemo / REQ-edd73c9b-a625-435f-a6ae-5479ec5d21cc |
| 交付人 | 陈晨（member） |
| 本次 runId / sessionId | f37de8a4-985a-4f6e-8578-16fa9463f575 / bec0ad11-248e-4301-9a91-3a3cc934c123（adoptionId `f80dedf6-f83a-42cf-8b78-e95d160f8cf5`；v1.1 为 run `af8faf6e…` / adoptionId `e5f6af5f…`；v1.0 为 run `2651fb56…` / adoptionId `fb069b90…`） |
| 上游依据版本 | 原始需求 v1.0（SHA256 `3a4ab044…85744e9`）+ test-profile v2（SHA256 `b77c1942…b3813cd`），Talents 知识 artifact `a-req-2026-002-v2` v2；Teams 上下文 revision 216、basisDigest `9f2529f8…d4efa5d4` |
| 独立审查输入 | `teams/test-results/four-requirements-20261028/acceptance/002-prd-review-c-v1.json`（SHA256 `2af5d287…e8b03`，结论 `revision-required-before-develop`，基线 `41cab537`，被审对象为 v1.0 PRD `890327ff…dc840`） |
| 档位 | L2（标准评审级）+ 涉及卡号变更与资金费用的 L3 深度字段（字段级需求表、异常矩阵、数据字典、场景矩阵） |
| 状态 | 待 Owner 评审；本轮仅声明按开发者已批准的本地测试口径可实施，**不构成任何投产/定价/合规签字** |

### 0.1 修订记录

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-10-27 | prepare 初稿（run `2651fb56…`，文件 `REQ-2026-002-REQ-edd73c9b-a625-435f-a6ae-5479ec5d21cc.md`，SHA256 `890327ff…dc840`），原 result 保留不覆盖 |
| v1.1 | 2026-10-27 | 按独立审查清单完成四项合同补全，见下表；范围、金额、US、v2 口径与基线映射均未删减 |
| v1.2 | 2026-10-27 | **仅纠正一处越权口径**：补卡申请主体恢复为持卡人本人（`U`、卡 `LOST`、归属本人），移除 v1.1 新增的客服代创建补卡口径（原文 §2 与 v2 未授权该权限点）；客服代挂失/查询/协助取消不变；其余已审内容逐字保持不变 |

| 审查项 | 修订落点 |
|--------|----------|
| 002-PRD-C01 写操作幂等/取消重放区分 | D-17、BR-LOST-17、§6.2 全部写接口、§7、§8.1 幂等记录、AC-V2-13/14 |
| 002-PRD-C02 客服代客挂失工单号与身份核实记录 | §2、D-18、BR-LOST-18、§6.2 条件字段、§7、AC-V2-15 |
| 002-PRD-C03 导出 24h 失效属本期范围 | D-19、BR-LOST-19、§6.2 导出、§9、AC-V2-16、§12 P-07 拆分 |
| 002-PRD-C04 原 §12.1 两项风险响应 | D-20、BR-LOST-20、§9、AC-V2-17/18、§13 |
| A 交接的资金约束（设计阶段） | §4.3、BR-LOST-10 补充、AC-V2-19 |

## 0. 本稿如何阅读

- **原文语义全部保留**：原始需求 13 章、功能点 REQ-LOST-01..07、业务规则 BR-LOST-01..07、US-001..008 逐条映射（见第 6、10、13 章），不删减功能、接口、数据、安全与验收范围。
- **本轮可执行值来源**：`test-profile-v2`（本地试验口径，含「v2 新增的 002 本地测试口径」）与开发者 2026-10-28 对本任务的显式工作授权。凡标注「v2 口径」者为测试参数，不是正式业务政策。
- **内部矛盾**：按第 3 章差异清单统一口径，原文示例与数值保留不改写。
- **未给值**：进第 12 章「投产前待确认」，不标必须、不按已确认处理、不静默阻塞实施。
- **本轮未执行**：本节点只产出 PRD。未编写业务代码、未运行单测/工具脚本、未提交/推送、未创建 PR；下文所有「验证方法」均为待执行口径。

## 1. 背景与目标

### 1.1 背景（沿用原文 §1.1）

客户卡片丢失或被盗后需立即停卡并申请补卡；当前系统只能由后台维护卡状态，客户无自助入口，补卡进度不可见，客服工单集中于进度查询。本期提供客户自助挂失、补卡申请、补卡进度查看，并为运营提供补卡队列工作台。

### 1.2 目标（沿用原文 §1.2 量化指标）

| 目标 | 指标 | 本轮可否验证 |
|------|------|--------------|
| 缩短停卡时间 | 挂失受理到卡状态生效平均 15 分钟 → 1 分钟 | 部分（本地可验证"受理即生效"，无法验证历史 15 分钟基线） |
| 降低客服负担 | 补卡进度咨询量下降 40% | 否（业务指标，非本地验证范围） |
| 提升处理时效 | 挂失 p95 < 500ms；补卡申请 p95 < 1200ms；进度查询 p95 < 800ms | 是（本地实测并记录命令/并发/取值，不作投产 SLA 结论） |

### 1.3 术语（沿用原文 §1.3，按 `bank-domain-payments` 统一）

挂失 / 补卡工单 / 制卡 / 快递单号 / 激活 / 去重键（`idempotencyKey`）。补充统一：**费用**指补卡费（`feeAmount`），**冲回**指对已收费用生成反向记账（≠「撤销」原文业务动作），**进行中工单**= `REQUESTED`/`CARD_PRODUCED`/`SHIPPED`，**重放**=同一 `idempotencyKey` 的重复提交。禁用「划账」「手续费总额固定」等漂移表述；不混用「清算/结算」（本需求不涉及清算）。

## 2. 角色与权限

| 角色 | 职责 | 原文权限点（§2） | 基线现状 | 本轮要求 |
|------|------|------------------|----------|----------|
| 持卡人 | 挂失、申请补卡、查看进度、取消（制卡前） | `card:loss:self`、`replacement:create:self`、`replacement:read:self` | IAM 仅 `userType`=`U`/`A`，无权限点模型；卡接口无任何鉴权 | 映射 `U`；必须校验卡片/工单归属，越权返回 404；自助挂失**不需要**工单号或核实记录 |
| 客服 | 核实身份、代客挂失、补卡异常处理、协助取消 | `card:loss:assist`、`replacement:read:any`、`replacement:cancel:assist` | 同上 | 映射 `A` + 客服权限点；**代客挂失必须提供客服工单号与客户身份核实记录/可信引用**（原文 §6.2、§9「客服代客挂失」），缺失或无效即拒绝；写操作留审计 actor（来自认证）并关联工单号与核实引用 |
| 制卡运营 | 查看补卡队列、更新制卡/邮寄/激活状态、导出 | `replacement:read:any`、`replacement:status:update` | 同上 | 映射 `A` + 运营权限点；**不得**发起挂失/补卡（SoD）；导出留审计 |

- 权限点→接口的可执行映射表（含测试账号与 token）由 design 落 API 目录；测试须用各自真实 IAM token 分别调用验证，**不得用同一账号轮换角色冒充职责分离**。
- **actor 一律来自认证主体**（token），不取请求体或 `X-User-Id`；重放请求同样执行权限与归属校验，重放不得成为绕过校验的通道（C01）。
- 基线无客服/运营/风控独立身份与权限点。这是基线能力缺口，由设计补齐并以权限矩阵验证，不得据此删除原文角色要求；正式 RBAC 列入第 12 章。
- 已存在的本地身份可复用（`services/iam-service` 种子、ADR-012 先例）：`USER0001`→客户 `000000006`、`USER0002`→客户 `000000005`、`ADMIN001/ADMIN002`（A）、`ADMIN003`（A）。具体客服/运营权限点归属由 design 定，但须满足上表 SoD。

## 3. 范围与差异口径

### 3.1 In-Scope（沿用原文 §3.1，含 v1.1 补全项）

卡片挂失（立即冻结）、补卡申请、补卡进度、补卡工单；补卡费（模拟 50.00 元）计入账户与冲回；新卡号生成与旧卡失效、通知、审计；前台卡片详情、挂失向导、进度页；后台补卡队列与导出（含 24 小时失效）；客服代客挂失的身份核实凭证；运营告警（缺快递单号、频繁申请）。

### 3.2 Out-of-Scope（沿用原文 §3.1）

快递物流实时轨迹（只记录快递单号与邮寄状态）；境外紧急补卡、临时虚拟卡；挂失后的争议交易处理（见 REQ-2026-004）。本期不新增硬性拒绝策略或未获批准的审批流（C04）。

### 3.3 差异与口径

| 编号 | 差异 | 原文体现 | 本轮口径（来源） | 影响 |
|------|------|----------|------------------|------|
| D-01 | 重复挂失响应自相矛盾 | §4.2「返回首次结果 HTTP 200」；§7 错误表/§9/§10 US-002「409 `CARD_ALREADY_LOST`」 | **按去重键分离**：同一 `idempotencyKey` 重放 → 200 + 首次结果（不新增记录/不重复通知）；不同键 + 卡已 `LOST` → 409 `CARD_ALREADY_LOST`；不同键 + `FROZEN`/`CLOSED` → 409 `CARD_NOT_ACTIVE`（§5 BR-LOST-01 + v2 口径第 3 条） | 两类 409 都只产生 1 条 `LOSS` 审计 |
| D-02 | 卡号掩码口径不一致 | §4.2 字段表「前 6 + 后 4」；§6.2/§8.2「响应、日志、事件仅后 4」 | **按渠道分工**：存储掩码列 = 前 6 + 后 4；接口响应、日志、审计事件、页面、导出 = 仅后 4；完整卡号仅密文列 | 日志检索完整卡号应为 0 命中 |
| D-03 | 补卡取消截止状态 | BR-LOST-02「制卡前可取消」；状态串尾含 `ACTIVATED/CANCELLED` | **仅 `REQUESTED` 可取消**；`CARD_PRODUCED` 及之后（含已 `CANCELLED` 的新请求）→ 409 `REPLACEMENT_NOT_CANCELLABLE`（v2 口径第 3 条 + C01：同键重放仍返回首次成功） | 见 BR-LOST-08/10/17 |
| D-04 | 请求示例缺必填字段 | §7 示例挂失缺 `idempotencyKey`，补卡缺 `reason` 等 | 以 §4.2 字段表为合同：所有写接口含 `idempotencyKey`；挂失另需 `reason`+`confirmCardLast4`；补卡另需 `addressId`+`deliveryMethod`+`reason` | 示例判为示例缺陷 |
| D-05 | 认证方式 | §6.2 要求 JWT；ADR-007/基线为 HMAC token，资源服务不强制校验 | 新接口校验**当前 IAM HMAC token**（非 JWT）：无/坏/过期 → 401（v2 口径第 6 条） | 不称「生产鉴权已就绪」 |
| D-06 | 卡状态表示不足 | 原文要求卡状态支持 `LOST`；异常矩阵含已挂失/冻结/销户三类 | 卡状态须能表达 `ACTIVE`/`LOST`/`FROZEN`/`CLOSED`；授权对任一非 `ACTIVE` 拒绝；存量 `active_status='N'` 的迁移归类由 design 明确，**不得默认迁成 `ACTIVE`**，且通用卡片维护不得绕过旧卡永久失效 | BR-LOST-01 三类断言可构造 |
| D-07 | 卡级别缺失 | BR-LOST-03「白金卡免收、其余 50.00」；基线无级别字段 | 新增**模拟**卡级别与配置化费用（0.00/50.00/50.00），配置标 `SIMULATION`；正式客群与定价留第 12 章 | 费用判定不得硬编码卡号 |
| D-08 | ID 长度与示例卡号不存在 | 原文示例卡 `4000000000005740`、白金卡 `4000000000009999` | 按基线合同 card 16 / account 11 / customer 9 / transaction 16，**不改存量 ID**；US-001/004 用 `3344556677889900`（账户 `00000000006`、客户 `000000006`），US-003 新增真实白金测试种子卡 `4000000000009999`（账户 `00000000005`、客户 `000000005`、持有者 `USER0002`、级别 `PLATINUM`） | 新增种子不改既有卡号/余额；AC 语义不变 |
| D-09 | 地址簿能力缺失 | §4.2 `addressId`「存在于客户地址簿」；基线仅单地址字段 | `addressId` 必须由 customer-service 的真实地址资源解析并校验归属（新增最小地址能力或客户主地址派生，由 design 定），不得用常量/mock；失败 → 400 `INVALID_ADDRESS` | 不得删字段或跳过校验 |
| D-10 | 无 FEE 交易类型 | §7「FEE 过账」；基线 `tran_type` 仅 01..07 | 必须产生真实、可识别的补卡费交易并使账户欠款增加 `feeAmount`，幂等键 `feeBatchId` 与交易号一一对应；类型码/类别由 design 定，不得伪装成普通消费 | US-004/US-008 断言依据 |
| D-11 | 补卡申请成功码歧义 | §7「201」；错误表 `FEE_POSTING_FAILED` 202 | 费用成功/免收 → **201**；工单创建但费用待补收 → **202** + `FEE_POSTING_FAILED`（`feeStatus=FEE_PENDING`） | US-004 / US-008 |
| D-12 | 通知/审计服务不存在 | §7 依赖 notification/audit-service；基线无 | 必须真实落地通知（投递记录 + 失败待补发）与审计（事件落库 + 失败补偿队列），主流程不因通知/审计失败回滚；形态由 design 定 | 不得空实现吞错 |
| D-13 | 费用状态缺"已冲回" | §4.2 `feeStatus` 仅三值；v2 要求取消冲回一次 | 扩展 `REFUNDED`；保留原收费交易与冲回交易两条可核对记录；`WAIVED` 不产生退款交易 | 见 BR-LOST-10/17 |
| D-14 | 存量卡号加密要求 | §8.2 密文列（AES-256/KMS）+ 掩码列分列；基线 `card.card_number` 明文主键 | 本期**新增**数据必须密文/掩码分列（密钥来自环境配置，不硬编码/不入库）；存量整改列入第 12 章 | 安全断言按新表执行 |
| D-15 | 防滥用告警无实现 | §6.2「同客户 24h 挂失请求 > 3 次触发风控告警」 | 第 4 次起产生可查风控告警记录（客户、时间窗、次数），不阻断挂失；时间窗 Asia/Shanghai | 与 D-20 的补卡计数分别记录 |
| D-16 | 新卡号 BIN/Luhn | §11.3「BIN 段与 Luhn」；v2「沿用当前种子测试卡 BIN 前缀」 | 新卡 16 位、沿用旧卡前 6 位 BIN、Luhn 通过、全库唯一且 ≠ 旧卡；仅本地测试号段，不称卡组织认证 | 只对新卡断言，不整改存量卡号 |
| **D-17** | 写操作幂等不完整（审查 C01） | §11.3「所有写接口支持去重键」；v2「同键重放 200」；v1.0 仅挂失/补卡定义键，AC-V2-03 表述含混 | 挂失、补卡申请、取消、后台状态更新**全部**要求 `idempotencyKey`：同键重放 → 200 + 首次结果，**不再产生第二条资金/审计/通知/业务记录**；**同键不同载荷 → 409 `IDEMPOTENCY_KEY_CONFLICT`**，无副作用；**新键**对已 `CANCELLED` 取消 → 409 `REPLACEMENT_NOT_CANCELLABLE`；重放仍执行权限、归属与 scope 校验（C01） | 消除 v1.0「重复取消一概不返回 2xx」的含混表述 |
| **D-18** | 客服代客挂失凭证缺失（审查 C02） | §6.2「客服代客挂失需工单号 + 客户身份核实记录」；§9「记录核实方式」 | 客服（A + `card:loss:assist`）代客挂失为**条件必填**：`staffTicketNo`（客服工单号）+ `identityVerificationRef`（核实记录或可信引用）；缺失/无效 → 400 `STAFF_VERIFICATION_REQUIRED`（不写 `card_operation`、不写 LOSS 审计、不发通知）；审计须关联工单号与核实引用，actor 取自认证；客户自助不受此限（C02） | 见 BR-LOST-18 与 AC-V2-15 |
| **D-19** | 导出 24h 失效被推后（审查 C03） | §8.2「导出文件 24 小时自动失效」 | **本期实现并验证**：导出即生成带 `expiresAt` 的文件记录，`< 24h` 可下载，`≥ 24h` 拒绝（410 `EXPORT_EXPIRED`）；抽取时间边界负例（固定时钟）；仅"长期归档/清理运行策略"留待确认（C03） | §12 P-07 相应收窄 |
| **D-20** | 原 §12.1 风险响应未追踪（审查 C04） | §12.1「`SHIPPED` 后 24 小时未回填触发运营告警」「24 小时内 > 3 次补卡请求触发风控告警与人工审核」 | 两条均**保留并纳入验证**：① `SHIPPED` 缺 `trackingNo` 达 24h → 运营告警记录（正常 `SHIPPED` 仍强制单号；历史/异常缺单号记录保留监控，不回填不追溯改写）；② 同卡 24h 内补卡请求 > 3 次 → 告警 + 人工审核记录，与挂失计数（D-15）**分别独立**；不新增硬拒绝或未批准审批流（C04） | 见 BR-LOST-20、AC-V2-17/18 |

## 4. 基线与实现边界（本轮实测）

核对对象：任务工作树 `.../workspace/carddemo-java-1025`，分支 `codex/carddemo-req-edd73c9b-a625-435f-a6ae-5479ec5d21cc-21d3da61`，HEAD `41cab53`（= `origin/develop`，含 REQ-2026-001 合入 PR #10），工作区仅新增本文档。

### 4.1 已存在能力

| 能力 | 事实 | 证据 |
|------|------|------|
| 模块 | iam 8081、customer 8082、card 8083、account 8084、transaction 8085、authorization 8086、marketing 8087、ledger、installment、web-ui（Compose 对外 8090，同源代理 `/api/**`） | 根 `pom.xml`；`docker-compose.yml` |
| 卡模型 | `card(card_number VARCHAR(16) PK, account_id VARCHAR(11), customer_id VARCHAR(9), cvv, embossed_name, expiration_date, active_status VARCHAR(1) Y/N, version)`；`card_xref` | `V1__card_schema.sql`、`Card.java` |
| 卡接口 | `GET /api/v1/cards`、`/by-account/{accountId}`、`/{cardNumber}`、`POST`、`PUT /{cardNumber}`；无挂失/补卡接口与幂等表 | `CardController.java` |
| 卡种子 | 9 张卡；`3344556677889900`→账户 `00000000006`、客户 `000000006`；`4455667788990011` 为 `N`（到期 2024-05-05） | `V2__card_seed.sql` |
| 账户 | `current_balance`/`credit_limit`/…；`POST /{id}/postings`（直接加欠款，**无 effect 幂等**）、`/payments`（`effectId` 幂等）、`/interest-accruals`、`/cashback-credits`（`rewardId` 幂等） | `V1__account_schema.sql`、`AccountController.java` |
| 账户种子 | `00000000006`：Y、余额 2450.75、额度 8000.00；`00000000005`：Y、余额 0.00、额度 5000.00 | `V2__account_seed.sql` |
| 交易 | `tran_type` 01..07、11 组 `tran_category`；`POST /api/v1/postings`（按 `transactionId` 幂等） | `V2__transaction_seed.sql`、`PostingController.java` |
| 授权 | 判定顺序 3100→4100→4200（卡未激活）→4300→5100 | `AuthorizationPolicy.java` |
| 客户 | `GET /api/v1/customers`、`GET/PUT /{customerId}`、`POST`；仅单地址字段，无地址簿 | `CustomerController.java` |
| 鉴权 | `base64url(userId|userType|exp).base64url(HmacSHA256)`；`POST /api/v1/auth/login`、`/verify`；资源服务不强制校验（ADR-007）；ADR-012 已有过滤器+权限表先例 | `HmacTokenService.java`、`ADR-007`、`ADR-012` |
| 身份种子 | `ADMIN001/002/003`（A）、`USER0001/0002`（U）；分期访问表 `00000000006`→`USER0001`、`00000000005`→`USER0002` | `V2__iam_seed.sql`、`V3__installment_roles.sql` |
| 通知/审计 | **不存在** notification-service、audit-service，也无通知/审计表 | 模块清单、`docker-compose.yml` |
| 总账 | `ledger-service`：`POST /api/v1/journal-entries`、`GET /{entryGroupId}` | `JournalEntryController.java` |
| 前端 | 单页 SPA（hash 路由）：`#/cards`、`#/cards/{cardNumber}`（含"维护卡片"可改 Y/N）、`#/transactions`、`#/installments`、`#/users`；卡详情明文展示完整卡号 | `app.js` |
| 错误约定 | `{code,message,details}`；400/404/409/503 有先例，401/403 仅分期引入 | `07-java-conventions.md`、ADR-012 |

### 4.2 必须由本需求补齐的基线缺口（不得 stub）

| 缺口 | 影响 | 本轮要求 |
|------|------|----------|
| 卡状态无 `LOST`/无三态区分 | BR-LOST-01/04、US-001/US-007 | 扩展卡状态并为存量 N 卡确定归类；授权对非 ACTIVE 拒绝 |
| 无卡级别 | BR-LOST-03、US-003 | 模拟级别 + 配置化费用（`SIMULATION`） |
| 无挂失/补卡接口、无幂等记录 | REQ-LOST-02/03/07、C01 | 7 个接口 + 写操作幂等记录（含载荷摘要） |
| 无补卡工单表/状态机 | REQ-LOST-04/06 | `card_replacement` + 状态机边表 + 后台队列 |
| 无地址簿 | REQ-LOST-03 | 真实地址资源与归属校验（D-09） |
| 无 FEE 交易、无冲回、postings 无 effect 幂等 | REQ-LOST-05、US-004/008、A 约束 | 真实费用过账 + 稳定 effect 身份 + 持久续跑 + 一次性冲回（D-10/D-13/§4.3） |
| 无通知/审计 | §7、§6.2、BR-LOST-07 | 真实通知投递记录与审计事件落库（D-12），含客服工单号与核实引用关联 |
| 无导出与失效控制 | §8.2、C03 | 导出记录 + 24h 失效 + 脱敏 + 审计（D-19） |
| 无运营告警 | §12.1、C04 | 缺单号 24h 告警、补卡频率告警与人工审核记录（D-20） |
| 无识别非 ACTIVE 三类测试数据 | BR-LOST-01 | 测试数据须含 `LOST`/`FROZEN`/`CLOSED` 卡 |
| 前端无挂失/补卡/队列页面 | §4.3 | 卡片详情挂失入口、补卡向导、进度页、后台队列与导出；卡号展示后 4 位掩码 |

新增服务/内聚模块的最终形态属 design 决策；PRD 只约束：**涉及欠款变更必须经 account-service，费用必须有真实交易与会计影响，跨服务失败必须可观测且不静默吞错**。

### 4.3 设计阶段的已存在资金约束（A 交接，写清但不新增政策）

以下为审查转达的实现约束，用于避免设计误判；不是新的业务政策：

1. **`FEE_PENDING` 不等于"未收费"**：存在远端收费已成功但响应丢失的情形。取消流程必须先按稳定原 `feeBatchId`/收费 effect 身份**核实真实收费状态**，已收费则冲回一次；**不得**仅把工单置 `CANCELLED` 并停止 worker 而留下已发生收费。
2. **"取消后无交易"断言仅覆盖请求未到达下游的停机分支**（dependency 未执行、确未收费）；不覆盖"远端已成功但响应丢失"分支——后者按第 1 条核实并冲回。
3. **account `/postings` 当前无 effect 幂等**（仅 `/payments` 按 `effectId` 幂等，且 001 的 payments 幂等不自动覆盖 postings）。设计须实现/复用**真实幂等**的账户与总账收费/退款 effect 身份，并具备持久续跑（失败重试不双收、不双退）。
4. **费用 worker 抢先成功不消灭取消权**：仍处 `REQUESTED` 的工单，客户合法取消依然成立，已收费用仍须冲回一次。

## 5. 业务规则

### 5.1 原文规则（保留，编号不变）

| 编号 | 规则 | 来源 | 优先级 | 验证点 |
|------|------|------|--------|--------|
| BR-LOST-01 | 仅 `ACTIVE` 卡可挂失；已挂失/冻结/销户返回 409 | 模拟业务确认 | 必须 | 三类非 ACTIVE 卡调用挂失均返回 `CARD_NOT_ACTIVE`（已挂失为 `CARD_ALREADY_LOST`，见 D-01） |
| BR-LOST-02 | 挂失不可撤销；补卡可取消（制卡前） | 模拟业务确认 | 必须 | 挂失接口无撤销路径；`SHIPPED` 后取消返回 `REPLACEMENT_NOT_CANCELLABLE` |
| BR-LOST-03 | 补卡费 50.00 元，白金卡免收；费用计入账户 | 模拟定价 | 必须 | 白金卡 `feeStatus=WAIVED`；金卡/普卡生成 50.00 元费用交易 |
| BR-LOST-04 | 补卡生成新卡号，旧卡永久失效；新卡未激活前不可交易 | 模拟业务确认 | 必须 | 旧卡号授权返回拒绝；新卡 `ACTIVATED` 前交易被拒 |
| BR-LOST-05 | 补卡工单状态：REQUESTED→CARD_PRODUCED→SHIPPED→ACTIVATED/CANCELLED | 模拟业务确认 | 必须 | 非法迁移被拒绝并返回 `INVALID_STATE_TRANSITION` |
| BR-LOST-06 | 同一卡同一时间只能有一个进行中补卡工单 | 模拟业务确认 | 必须 | 并发两次申请，`card_replacement` 仅 1 条进行中记录 |
| BR-LOST-07 | 挂失/补卡必须写审计（actor、卡号掩码、原因） | 模拟合规 | 必须 | 审计事件含 actor、maskedCardNumber、reason 三字段 |

### 5.2 本轮口径补充（标注来源，不与原文混同）

| 编号 | 规则 | 来源 |
|------|------|------|
| BR-LOST-08 | 合法状态迁移（唯一依据边表）：工单 `REQUESTED→CARD_PRODUCED→SHIPPED→ACTIVATED`；`REQUESTED→CANCELLED`。其余迁移一律 409 `INVALID_STATE_TRANSITION`。`SHIPPED` 必须携带 `trackingNo` 与 `estimatedArrival ≥ 寄出日期 + 3 天`。`ACTIVATED` 后新卡才可交易 | 原文 §4.2/§5 + D-03 |
| BR-LOST-09 | 去重键语义：同一 `idempotencyKey` 重放返回首次结果（HTTP 200），不新增业务记录、不重复通知；不同键对已 `LOST` 卡 → 409 `CARD_ALREADY_LOST`；不同键对 `FROZEN`/`CLOSED` 卡 → 409 `CARD_NOT_ACTIVE` | v2 口径第 3 条 + D-01 |
| BR-LOST-10 | 取消语义：仅 `REQUESTED` 可取消；`CHARGED` 费用冲回一次（`REFUNDED`）；`FEE_PENDING` 必须先按稳定原收费身份核实——已收费则冲回一次，未收费则阻止后续补收；`WAIVED` 不产生退款交易；取消与收费重试并发时不得"取消后补收"或"重复退费"，也不得"仅停 worker 留下已收费用" | v2「002 本地测试口径」第 1 条 + D-13 + §4.3 |
| BR-LOST-11 | 挂失后**默认由客户人工发起补卡**，系统不自动创建补卡工单 | v2 同上第 1 条 |
| BR-LOST-12 | 新卡号：16 位、沿用旧卡前 6 位 BIN、Luhn 校验通过、全库唯一且 ≠ 旧卡；号段仅本地测试用 | v2 同上第 2 条 + D-16 |
| BR-LOST-13 | 认证与归属：全部业务接口校验 IAM HMAC token，无/坏/过期 → 401；客户仅操作本人卡与工单（越权 404，不泄露存在性）；后台接口仅 `A` 且需对应权限点，缺失 → 403；身份取自 token | v2 口径第 6 条 + ADR-012 |
| BR-LOST-14 | 费用幂等：同一工单按 `feeBatchId` 去重不重复扣费；冲回按原收费 effect 引用去重，不重复退款 | 原文 §4.2 + §4.3 |
| BR-LOST-15 | 通知失败、审计失败均不回滚挂失/补卡主流程，须留待补发/补偿记录且可观测 | 原文 §4.2/§7/§11.1 |
| BR-LOST-16 | 防滥用（挂失）：同一客户 24 小时（Asia/Shanghai）内挂失请求 > 3 次触发风控告警记录，不阻断业务 | 原文 §6.2 + D-15 |
| **BR-LOST-17** | **全部写接口幂等（C01）**：挂失、补卡申请、取消、后台状态更新均要求 `idempotencyKey`。① 同键同载荷重放 → 200 + 首次结果，不再产生第二条资金、审计、通知或业务记录；② 同键不同载荷 → 409 `IDEMPOTENCY_KEY_CONFLICT` 且无副作用；③ 每次请求（含重放）都执行 token/权限/归属/scope 校验，重放不得越权；④ 新键对已 `CANCELLED` 发起取消 → 409 `REPLACEMENT_NOT_CANCELLABLE`；⑤ `status` 更新以 `idempotencyKey` 去重，同键重放不重复激活、不重复审计 | 原文 §11.3 + v2 口径第 3 条 + 审查 C01 |
| **BR-LOST-18** | **客服代客挂失凭证（C02）**：客服身份（A + `card:loss:assist`）必须随请求提交 `staffTicketNo` 与 `identityVerificationRef`；缺失/格式无效/无法解析 → 400 `STAFF_VERIFICATION_REQUIRED`，不写 `card_operation`、不写 LOSS 审计、不发通知；成功时审计关联工单号与核实引用，actor 为认证工号。客户自助挂失不受此要求约束；不得信任客户端自报 actor | 原文 §6.2/§9 + 审查 C02 |
| **BR-LOST-19** | **导出生效期（C03）**：后台导出为服务端生成、脱敏（卡号后 4 位）、留审计的文件资源；生成即记录 `expiresAt = 生成时间 + 24 小时`；`< 24h` 可下载，`≥ 24h` 拒绝 410 `EXPORT_EXPIRED`（不返回内容、不再延长）；时间按 Asia/Shanghai 记录、以服务端时间为准 | 原文 §8.2 + 审查 C03 |
| **BR-LOST-20** | **运营告警（C04）**：① `SHIPPED` 后 24 小时仍无 `trackingNo` → 产生运营告警记录（含工单号、寄出时间、缺失时长），客服可介入；正常 `SHIPPED` 仍强制单号，历史/异常缺单号记录保留监控、不回填不追溯改写；② 同一卡 24 小时内补卡请求（含被拒的重试，按请求计入）> 3 次 → 产生风控告警 + 人工审核记录；与挂失计数独立。两者均**不阻断**正常业务、不新增硬拒绝或审批流 | 原文 §12.1 + 审查 C04 |

### 5.3 算例与口径值（本轮断言值）

| 项 | 值 |
|----|----|
| 非白金卡补卡费 | 50.00 元，计入 `current_balance`（新增费用交易，`feeStatus=CHARGED`） |
| 白金卡补卡费 | 0.00 元，`feeStatus=WAIVED`，**不产生**任何费用/退款交易 |
| 取消（已收费） | 冲回 50.00 一次，`feeStatus=REFUNDED`，净影响 0.00；同键重放不产生第二次冲回 |
| 取消（`FEE_PENDING`，确认下游未收） | 不产生费用，后续重试停止（工单 `CANCELLED`） |
| 取消（`FEE_PENDING`，核实远端已收） | 获取原收费交易事实后冲回一次，`feeStatus=REFUNDED`，净影响 0.00 |
| 新卡号 | 16 位数字，前缀 = 旧卡前 6 位（如 `334455…`），Luhn 通过、唯一 |
| 金额精度 | `BigDecimal` / `numeric(12,2)`，HALF_UP 至 2 位 |
| 导出有效期 | `expiresAt = generatedAt + 24h`；`T+23:59` 可下载，`T+24:00` 起 410 `EXPORT_EXPIRED` |

## 6. 功能需求与接口合同

### 6.1 功能点映射（原文 §4.1，编号不变）

| 模块 | 功能点 | 优先级 | 本轮落点 |
|------|--------|--------|----------|
| 挂失 | REQ-LOST-01 卡片详情「挂失」入口 | 必须 | 前端 `#/cards/{cardNumber}` 仅 `ACTIVE` 显示；后端提供卡状态与是否可挂失标志 |
| 挂失 | REQ-LOST-02 挂失立即生效 | 必须 | `POST /api/v1/cards/{cardNumber}/loss` |
| 补卡 | REQ-LOST-03 补卡申请 | 必须 | `POST /api/v1/cards/{cardNumber}/replacements` |
| 补卡 | REQ-LOST-04 补卡进度时间线 | 必须 | `GET /api/v1/replacements/{id}`（及 `GET /api/v1/cards/{cardNumber}/replacements`） |
| 补卡 | REQ-LOST-05 补卡费收取 | 必须 | 补卡申请内联费用过账 + 取消冲回 + 失败重试（§4.3） |
| 后台 | REQ-LOST-06 后台补卡队列 | 必须 | `GET /api/v1/admin/replacements`、`POST /api/v1/admin/replacements/{id}/status`、导出与 24h 失效 |
| 后台 | REQ-LOST-07 重复挂失与重复补卡去重 | 必须 | 全部写接口幂等（BR-LOST-17） |
| 补卡 | （原文 §7 接口）取消 | 必须 | `POST /api/v1/replacements/{id}/cancel` |

字段级要求沿用原文 §4.2 字段表，并按 D-02 增加响应侧 `cardNumberLast4`/`maskedCardNumber` 渠道区分，按 C01 为全部写接口增加 `idempotencyKey`，按 C02 增加客服条件字段 `staffTicketNo`/`identityVerificationRef`。

### 6.2 接口合同（7 个业务接口 + 导出 + 依赖调用）

| 接口 | 方法/路径 | 主体 | 成功 | 关键约束（含 v1.1 补全） |
|------|-----------|------|------|--------------------------|
| 挂失 | `POST /api/v1/cards/{cardNumber}/loss` | 持卡人（U，本人卡）/ 客服（A，`card:loss:assist`） | 201 首次；200 同键重放 | 必填 `reason` ∈ `LOST/STOLEN/DAMAGED`、`confirmCardLast4`（须匹配）、`idempotencyKey`（≤64）；**客服身份另必填** `staffTicketNo`、`identityVerificationRef`；响应含 `cardStatus=LOST`、`operationId`、`cardNumberLast4`、`replayed`；重放执行同样权限/归属校验 |
| 补卡申请 | `POST /api/v1/cards/{cardNumber}/replacements` | 持卡人（U，卡须 `LOST` 且本人） | 201（费用成功/免收）；202（`FEE_POSTING_FAILED`） | 必填 `addressId`、`deliveryMethod` ∈ `STANDARD/EXPRESS`、`reason`、`idempotencyKey`；响应含 `replacementId`、`status=REQUESTED`、`feeAmount`、`feeStatus`、`newCardNumberLast4`、`replayed` |
| 该卡补卡记录 | `GET /api/v1/cards/{cardNumber}/replacements` | 持卡人（本人）/ 客服、运营（A） | 200 | 仅本人/授权范围，卡号后 4 位 |
| 进度 | `GET /api/v1/replacements/{id}` | 持卡人（本人）/ 客服、运营（A） | 200 | 时间线四阶段；`SHIPPED` 后含 `trackingNo`、`estimatedArrival`；缺单号展示「物流信息同步中」；非本人 404 |
| 取消 | `POST /api/v1/replacements/{id}/cancel` | 持卡人（本人）/ 客服（`replacement:cancel:assist`） | 200 首次；200 同键重放 | 必填 `idempotencyKey`；仅 `REQUESTED`；`FEE_PENDING` 先核实（§4.3）再决定冲回/停收；已收费冲回一次；响应含 `status=CANCELLED`、`feeStatus`、`refundBatchId?`、`replayed`；**同键重放 → 200 首次结果且无第二次冲回**；**新键对已 `CANCELLED` → 409 `REPLACEMENT_NOT_CANCELLABLE`**；同键不同载荷 → 409 `IDEMPOTENCY_KEY_CONFLICT` |
| 后台队列 | `GET /api/v1/admin/replacements?status=&page=&size=` | 运营/客服（A，`replacement:read:any`） | 200 | 分页（`size` ≤ 100），卡号后 4 位；按状态筛选 |
| 后台导出 | `POST /api/v1/admin/replacements/exports` + `GET /api/v1/admin/replacements/exports/{exportId}` | 运营/客服（A，`replacement:read:any`） | 201 创建；200 下载 | 必填 `idempotencyKey`；服务端生成、脱敏、留审计；`expiresAt = +24h`；`≥ 24h` → 410 `EXPORT_EXPIRED`；导出不因失效被"续期" |
| 后台状态更新 | `POST /api/v1/admin/replacements/{id}/status` | 运营（A，`replacement:status:update`） | 200 首次；200 同键重放 | 必填 `idempotencyKey`、`status`，`trackingNo?`、`estimatedArrival?`；按 BR-LOST-08 边表校验；`ACTIVATED` 后新卡可交易；同键重放不重复激活/审计 |

请求示例（本轮合同，替换原文 §7 缺字段示例）：

```json
{"reason":"LOST","confirmCardLast4":"9900","idempotencyKey":"loss-20261028-0001"}
{"reason":"LOST","confirmCardLast4":"9900","idempotencyKey":"loss-20261028-0002","staffTicketNo":"CS-20261028-0007","identityVerificationRef":"IVR-20261028-0042"}
{"addressId":"ADDR-0001","deliveryMethod":"STANDARD","reason":"LOST","idempotencyKey":"repl-20261028-0001"}
{"idempotencyKey":"cancel-20261028-0001"}
{"status":"SHIPPED","trackingNo":"SF1234567890","estimatedArrival":"2026-11-02","idempotencyKey":"status-20261028-0001"}
{"idempotencyKey":"export-20261028-0001"}
```

`addressId` 具体编码由 design 依据真实地址资源定义（须可解析且校验归属，D-09）；`staffTicketNo`/`identityVerificationRef` 的格式与可信来源由 design 定义并校验（C02），示例仅示字段形态。

依赖调用：`POST /api/v1/accounts/{accountId}/postings`（费用与冲回，须配稳定 effect 身份，§4.3）、费用交易记录在 transaction-service、地址读取 `GET /api/v1/customers/{customerId}`（或地址资源）、审计与通知按 D-12、总账按 D-10/§12。

### 6.3 错误码（合并原文 §7 与新增）

| 错误码 | HTTP | 触发条件 |
|--------|------|---------|
| `CARD_NOT_ACTIVE` | 409 | 卡非 `ACTIVE`（冻结/销户/已挂失的补卡前置） |
| `CARD_ALREADY_LOST` | 409 | 不同去重键对已 `LOST` 卡再次挂失 |
| `REPLACEMENT_EXISTS` | 409 | 同一卡已有进行中工单 |
| `REPLACEMENT_NOT_CANCELLABLE` | 409 | 工单已制卡/已寄出/已激活，或新键对已 `CANCELLED` 再次取消 |
| `INVALID_STATE_TRANSITION` | 409 | 非法状态迁移（含新键重复终态迁移） |
| `INVALID_ADDRESS` | 400 | 地址不存在或不属于客户 |
| `FEE_POSTING_FAILED` | 202 | 工单已创建、费用待补收（`feeStatus=FEE_PENDING`） |
| `CARD_NUMBER_GENERATION_FAILED` | 202 | 卡号生成失败，工单保持 `REQUESTED` 并告警，可重试 |
| `CONCURRENT_MODIFICATION` | 409 | 乐观锁/并发冲突 |
| **`IDEMPOTENCY_KEY_CONFLICT`** | 409 | 同 `idempotencyKey` 不同载荷或不同主体范围（C01） |
| **`STAFF_VERIFICATION_REQUIRED`** | 400 | 客服代客挂失缺工单号/核实记录或无法解析（C02） |
| **`EXPORT_EXPIRED`** | 410 | 导出文件已达 24 小时有效期（C03）；`EXPORT_NOT_FOUND` 404 用于不存在/非本人范围 |
| `TRACKING_MISSING` | 200（展示态） | `SHIPPED` 缺快递单号时进度页展示「物流信息同步中」 |
| `UNAUTHENTICATED` | 401 | 无/坏/过期 token |
| `FORBIDDEN` | 403 | 后台权限点缺失 |
| `DOWNSTREAM_UNAVAILABLE` | 503 | card/customer/transaction 依赖失败 |
| `VALIDATION_FAILED` | 400 | 字段格式/枚举/后 4 位不匹配 |

## 7. 异常与错误码矩阵（原文异常矩阵 + 本轮补充）

| 分类 | 场景 | 系统行为 | 错误码/HTTP | 用户提示 |
|------|------|----------|-------------|----------|
| 参数 | `confirmCardLast4` 不匹配 | 前端拦截，不发请求 | 无（前端） | 「卡号后 4 位不匹配」 |
| 参数 | `reason`/`deliveryMethod` 非法枚举 | 参数校验失败 | `VALIDATION_FAILED`/400 | 「请选择有效的原因/配送方式」 |
| 参数 | `idempotencyKey` 缺失或 > 64 | 参数校验失败 | `VALIDATION_FAILED`/400 | 「请求不合法」 |
| 参数 | 客服代客挂失缺 `staffTicketNo`/`identityVerificationRef` 或无法解析 | 拒绝，不写任何记录 | `STAFF_VERIFICATION_REQUIRED`/400 | 「需提供客服工单号与身份核实记录」 |
| 业务 | 非 `ACTIVE` 卡挂失（冻结/销户） | 拒绝，不写 `card_operation` | `CARD_NOT_ACTIVE`/409 | 「当前卡片状态不支持挂失」 |
| 业务 | 已 `LOST` 卡再次挂失（不同键） | 拒绝，不重复通知 | `CARD_ALREADY_LOST`/409 | 「该卡已挂失，无需重复操作」 |
| 业务 | 同键同载荷重放（挂失/补卡/取消/状态/导出） | 返回首次结果，无第二次资金/事件 | 200，`replayed=true` | 「挂失已生效」/「补卡申请已提交」/「已取消」 |
| 业务 | 同键不同载荷（同一接口、不同字段值） | 拒绝，无副作用 | `IDEMPOTENCY_KEY_CONFLICT`/409 | 「请求与先前提交不一致，请刷新」 |
| 业务 | 补卡前置卡非 `LOST` | 拒绝创建 | `CARD_NOT_ACTIVE`/409 | 「请先完成挂失再申请补卡」 |
| 业务 | 已有进行中工单 | 拒绝，返回已有工单引用 | `REPLACEMENT_EXISTS`/409 | 「该卡已有进行中的补卡申请」 |
| 业务 | 地址非法/不属客户 | 拒绝创建 | `INVALID_ADDRESS`/400 | 「收卡地址无效，请重新选择」 |
| 业务 | 卡号生成失败 | 工单保持 `REQUESTED`，告警可重试 | `CARD_NUMBER_GENERATION_FAILED`/202 | 「补卡申请已受理，制卡信息生成中」 |
| 业务 | 取消已 `CARD_PRODUCED`/`SHIPPED`/`ACTIVATED` 工单 | 拒绝 | `REPLACEMENT_NOT_CANCELLABLE`/409 | 「当前进度不可取消」 |
| 业务 | 新键取消已 `CANCELLED` 工单 | 拒绝（同键重放仍返回首次 200） | `REPLACEMENT_NOT_CANCELLABLE`/409 | 「该工单已取消」 |
| 业务 | 状态迁移非法（如 `REQUESTED→ACTIVATED`） | 拒绝更新 | `INVALID_STATE_TRANSITION`/409 | 后台「状态迁移不合法」 |
| 业务 | `SHIPPED` 缺单号/预计到达早于寄出+3 天 | 拒绝更新 | `VALIDATION_FAILED`/400 | 后台「请回填快递单号与预计到达日期」 |
| 业务 | 导出已过 24h | 拒绝下载，不返回内容 | `EXPORT_EXPIRED`/410 | 「导出文件已过期，请重新导出」 |
| 系统 | transaction-service 过账失败 | 工单保留 `FEE_PENDING`，进入重试队列 | `FEE_POSTING_FAILED`/202 | 「补卡申请已受理，费用将在 24 小时内补收」 |
| 系统 | 取消时 `FEE_PENDING` 且远端已收费（响应曾丢失） | 核实后冲回一次，工单 `CANCELLED`、`feeStatus=REFUNDED` | 无（成功） | 「已取消，费用将冲回」 |
| 系统 | notification 失败 | 主流程成功，记录待补发 | 无（主流程成功） | 「挂失已生效，通知将稍后送达」 |
| 系统 | 审计写入失败 | 主流程成功 + 本地补偿队列 | 无（主流程成功） | 同主流程结果 |
| 系统 | card/customer 超时（>500ms） | 明确失败码，页面可重试 | `DOWNSTREAM_UNAVAILABLE`/503 | 「服务暂时不可用，请重试」 |
| 并发 | 同卡并发挂失/补卡 | 乐观锁或唯一约束拒绝 | `CONCURRENT_MODIFICATION`/409 或 `REPLACEMENT_EXISTS`/409 | 「卡片状态已变化，请刷新后重试」 |
| 并发 | 取消与收费重试并发 | 互斥：取消后不补收、不双退；费用已成功则冲回一次 | 首次成功方生效 | 一致结果，不出现双向记账 |
| 并发 | 同键并发重放 | 仅一次执行业务，其余返回首次结果 | 200（`replayed=true`） | 同上 |
| 安全 | 无/坏 token | 401，不执行业务 | `UNAUTHENTICATED`/401 | 「请重新登录」 |
| 安全 | 越权访问他人卡/工单 | 404，不泄露存在性 | 404 | 「卡片不存在」/「补卡记录不存在」 |
| 安全 | 重放请求携带他人 key 或超出自身 scope | 拒绝，不因重放放行 | 404 / `FORBIDDEN` | 同上 |
| 安全 | 后台权限点缺失 | 403 | `FORBIDDEN`/403 | 「无操作权限」 |
| 风控 | 同客户 24h 挂失 > 3 次 | 业务继续，产生告警记录 | 无（业务成功） | 无额外提示（内部告警） |
| 风控 | 同卡 24h 补卡请求 > 3 次 | 业务继续，产生告警 + 人工审核记录 | 无（业务成功） | 无额外提示（内部记录） |
| 运营 | `SHIPPED` 无单号达 24h | 产生运营告警记录，进度页展示同步中 | `TRACKING_MISSING`（展示态） | 「物流信息同步中，可联系客服」 |

## 8. 数据需求

### 8.1 数据字典

**`card_operation`（新增，原文 §8.1）**

| 字段 | 含义 | 类型/约束 |
|------|------|----------|
| operation_id | 操作流水号 | varchar(32) PK |
| card_number | 卡号存储**掩码**（前 6 + 后 4） | varchar(19)，索引 |
| operation_type | `LOSS`/`REPLACE`/`CANCEL` | varchar(16) |
| status | `SUCCESS`/`FAILED`/`PENDING` | varchar(16) |
| reason | `LOST`/`STOLEN`/`DAMAGED` | varchar(16) |
| actor | 操作人（客户号或客服工号，取自认证） | varchar(64) 非空 |
| idempotency_key | 去重键 | varchar(64) 唯一约束 |
| staff_ticket_no | 客服工单号（客服代客时必填） | varchar(32) 可空 |
| identity_verification_ref | 身份核实记录引用（客服代客时必填） | varchar(64) 可空 |
| created_at | 操作时间 | timestamptz |
| payload | 请求快照（脱敏） | jsonb |

**`card_replacement`（新增，原文 §8.1）**

| 字段 | 含义 | 类型/约束 |
|------|------|----------|
| replacement_id | 工单号 | varchar(32) PK |
| old_card_number | 旧卡号掩码（前 6 + 后 4） | varchar(19) |
| new_card_number | 新卡号掩码 + 密文列另存 | varchar(19) 唯一 |
| account_id | 关联账户 | varchar(11)，索引 |
| customer_id | 客户号 | varchar(9) |
| address_id | 收卡地址引用 | varchar(32) |
| fee_amount | 补卡费 | numeric(12,2) ≥ 0 |
| fee_status | `CHARGED`/`FEE_PENDING`/`WAIVED`/`REFUNDED` | varchar(16) |
| fee_batch_id | 费用交易引用（稳定 effect 身份） | varchar(32) 可空，唯一 |
| refund_batch_id | 冲回交易引用 | varchar(32) 可空，唯一 |
| status | `REQUESTED`/`CARD_PRODUCED`/`SHIPPED`/`ACTIVATED`/`CANCELLED` | varchar(16) |
| tracking_no | 快递单号 | varchar(32) 可空（`SHIPPED` 必填） |
| estimated_arrival | 预计到达 | date 可空（≥ 寄出 + 3 天） |
| requested_at / shipped_at / activated_at / cancelled_at | 时点 | timestamptz |
| idempotency_key | 去重键 | varchar(64) 唯一 |
| version | 乐观锁 | int 默认 0 |

- **卡的扩展**：状态扩展为可表达 `ACTIVE`/`LOST`/`FROZEN`/`CLOSED`（D-06），并新增**模拟**卡级别（D-07）；不得修改存量卡号与账户号（D-08）。
- **进行中唯一约束**：`(old_card_number)` 在 `status ∈ {REQUESTED, CARD_PRODUCED, SHIPPED}` 期间唯一（部分唯一索引或等价机制），支撑 BR-LOST-06。
- **写操作幂等记录（C01）**：表 `write_idempotency(scope, idempotency_key, request_digest, subject_id, result_ref, result_status, created_at)`，`(scope, idempotency_key)` 唯一；`request_digest` 用于识别同键不同载荷 → 409 `IDEMPOTENCY_KEY_CONFLICT`；`subject_id` 记录认证主体，重放须与其权限/归属一致。
- **导出记录（C03）**：表 `replacement_export(export_id, requested_by, filter_snapshot, generated_at, expires_at, row_count, file_ref, status)`；`expires_at = generated_at + 24h`；下载前校验有效期与主体权限，过期 410。
- **审计**：`eventId`、`actor`（认证主体）、`action`、`resourceType`、`resourceId`、`maskedCardNumber`（仅后 4 位）、`reason`、`staffTicketNo?`、`identityVerificationRef?`、`traceId`、`payload`（脱敏）、`createdAt`；保留 3 年（清理策略见第 12 章）。
- **通知**：投递记录（事件类型、接收方、渠道、模板、状态 `SENT`/`FAILED`/`PENDING_RETRY`、关联业务单号、尝试次数）；失败可重投。
- **告警（D-15/D-20）**：`ops_alert(alert_id, type, subject_type, subject_id, window_start, window_end, count, status, created_at)`，`type` ∈ `LOSS_FREQUENCY`/`REPLACEMENT_FREQUENCY`/`TRACKING_MISSING_24H`/`MANUAL_REVIEW_REQUIRED`；补卡频率与人工审核记录与挂失计数分属不同 `type`。
- **费用/退款 effect**：与 account/ledger 共享稳定 effect 身份（`feeBatchId`/`refundBatchId`），支持持久续跑与失败重试（§4.3）。

### 8.2 数据安全（按 D-02/D-14）

| 维度 | 要求 |
|------|------|
| 存储 | 完整卡号仅密文列（AES-256；密钥来自环境配置，不硬编码/不入库，KMS 托管留第 12 章）；掩码列 = 前 6 + 后 4；新表不得明文落库 |
| 展示 | 接口响应、页面、日志、审计事件、通知内容、**导出文件**一律仅后 4 位：`**** **** **** 9900` |
| 传输 | HTTPS（本地 Compose 按现有部署口径） |
| 留存 | 挂失与补卡工单 5 年、审计事件 3 年、快递单号随工单；**导出文件 24 小时失效（本期实现）** |
| 最小化 | 仅引用 `addressId`，不采集身份证影像与地址明细副本 |
| 验证 | 日志/审计/导出检索完整卡号应 0 命中 |

## 9. 非功能需求

| 维度 | 指标 | 本轮验证方法 |
|------|------|--------------|
| 性能 | 挂失 p95 < 500ms；补卡申请 p95 < 1200ms；进度查询 p95 < 800ms | 本地 50 并发实测 p95，记录命令/并发/时间/取值；不作投产 SLA 结论 |
| 可用性 | 依赖不可用返回明确错误码；挂失不受通知失败影响 | 停用通知/审计能力后挂失，断言卡状态 `LOST` 且有待补发/补偿记录 |
| 一致性 | 挂失与卡状态迁移同一事务；费用过账与工单状态一致（`CHARGED`/`FEE_PENDING`/`REFUNDED` 与交易可对账） | 并发挂失仅 1 条 `card_operation`；取消后净费用 0.00 |
| 去重 | 全部写接口同键重放返回首次结果且无第二资金/事件；同键不同载荷 409 | 每类写接口至少 1 组同键重放 + 1 组冲突用例（AC-V2-13） |
| 可观测性 | 状态迁移输出 `traceId`、`cardNumberLast4`、`replacementId`；告警可查 | 日志与告警表检索 |
| 可维护性 | 状态机、费用规则、告警阈值配置化（`SIMULATION`） | 代码评审 + 改配置用例 |
| 安全 | 401/403/404 语义；SoD 用不同真实账号验证；卡号仅后 4 位；客服凭证必填 | 用无 token、客户 A/B、客服、运营 token 分别调用 |
| 导出 | 24h 失效（含边界负例）、脱敏、留审计、限期不可续期 | 固定时钟边界用例（AC-V2-16） |
| 防滥用 | 挂失 >3 次/24h 与 补卡 >3 次/24h 分别告警；缺单号 24h 告警 | 构造请求与时间推进断言告警记录 |
| 审计 | 挂失、补卡、取消、状态更新、费用过账与冲回、导出全量留痕 | 审计记录完整性查询 |

## 10. 可执行验收标准

说明：**原 US-001..008 全部保留、不替换、不降级**；「数据准备（基线映射）」只解决原文示例 ID 在基线的可构造性（D-08），不改变 Given/When/Then 语义。补充用例标注「test-profile-v2 补充」；v1.1 新增用例标注「审查修订补全」。

| 故事 | 原文 Given | When | 原文 Then | 数据准备（基线映射） |
|------|------------|------|-----------|----------------------|
| US-001 | 存在 `ACTIVE` 卡 4000000000005740 | 客户确认挂失 | 卡状态立即 `LOST`，旧卡授权被拒，审计可查 | 卡 `3344556677889900`（账户 `00000000006`、客户 `000000006`、`USER0001`）；余额 2450.75、额度 8000.00；`confirmCardLast4=9900` |
| US-002 | 卡已 `LOST` | 再次提交挂失 | 409 `CARD_ALREADY_LOST`，通知仅 1 条 | 复用 US-001；使用**不同** `idempotencyKey` |
| US-003 | 白金卡已挂失 | 提交补卡申请 | `feeAmount=0.00`、`feeStatus=WAIVED`，无费用过账 | 白金测试卡 `4000000000009999`（`PLATINUM` 模拟，账户 `00000000005`、客户 `000000005`、`USER0002`），先经挂失置 `LOST` |
| US-004 | 金卡已挂失 | 提交补卡申请 | `feeAmount=50.00`，生成费用过账，`fee_batch_id` 回填 | 卡 `3344556677889900`（`GOLD`/非白金），账户 `00000000006`；`addressId` 取客户 `000000006` 的有效地址 |
| US-005 | 存在进行中补卡工单 | 再次提交补卡 | 409 `REPLACEMENT_EXISTS`，工单数不变 | 复用 US-004 的 `REQUESTED` 工单，使用不同 `idempotencyKey` |
| US-006 | 工单状态 `CARD_PRODUCED` | 运营更新为 `SHIPPED` 并回填单号 | 客户进度页展示快递单号与预计到达日期 | US-004 工单先由运营置 `CARD_PRODUCED`；`trackingNo`、`estimatedArrival ≥ 寄出+3 天`；运营 token |
| US-007 | 新卡已生成未激活 | 用新卡发起交易 | 交易被拒，提示「新卡未激活」 | US-004 新卡号；`POST /api/v1/authorizations` → `DECLINED` 且 `reasonCode=4200`，前端映射「新卡未激活」；交易金额取小额（如 10.00）且额度充足，避免先命中 `4100`（顺序 3100→4100→4200→4300→5100） |
| US-008 | 停用 transaction-service | 提交金卡补卡申请 | 工单创建成功且 `feeStatus=FEE_PENDING`；恢复后 24 小时内补收成功 | 非白金卡 `2233445566778899`（账户 `00000000005`、客户 `000000005`、`USER0002`）先经挂失置 `LOST`；停用/恢复用 Compose 服务操作并保留 volume；断言补收仅 1 笔、金额 50.00（HTTP 202 + `FEE_POSTING_FAILED`） |

**test-profile-v2 补充用例**

| 用例 | 场景 | 断言 |
|------|------|------|
| AC-V2-01 | 挂失成功后不自动补卡 | 挂失 201 后不存在新建 `card_replacement`；需客户显式申请 |
| AC-V2-02 | 取消截止状态 | `REQUESTED` 取消成功（`CANCELLED`）；`CARD_PRODUCED`/`SHIPPED` 取消 → 409 `REPLACEMENT_NOT_CANCELLABLE` |
| AC-V2-03 | 已收费取消冲回一次 | `CHARGED` 工单取消后 `feeStatus=REFUNDED`，存在 1 条冲回交易 −50.00，净费用 0.00；**同键重放**返回首次结果（200，`replayed=true`）且无第二次冲回；**新键**取消已 `CANCELLED` → 409 `REPLACEMENT_NOT_CANCELLABLE`（C01 修订，取代 v1.0「重复取消一概不返回 2xx」表述） |
| AC-V2-04 | `FEE_PENDING`（下游未执行）取消停止补收 | 停机分支（请求确未到达下游）：取消后恢复 transaction-service 仍不产生费用（无 `CHARGED`、无交易） |
| AC-V2-05 | 取消与收费重试并发 | 并发触发取消与重试：不得"取消后补收"或"重复退费"；若收费 worker 先成功，取消仍成立并冲回一次；交易与工单状态一致 |
| AC-V2-06 | 去重键分离语义 | 同键重放 → 200 首次结果（记录数不变、通知 1 条）；不同键 + 已 `LOST` → 409 `CARD_ALREADY_LOST` |
| AC-V2-07 | 新卡号规则 | 16 位、前 6 位 = 旧卡 BIN、Luhn 通过、唯一且 ≠ 旧卡；旧卡与新卡不可同时作为有效交易卡 |
| AC-V2-08 | 认证与归属/SoD | 无 token → 401；客户 B 访问客户 A 卡/工单 → 404；后台接口缺对应权限点 → 403；客服代客挂失成功且审计 actor 为工号；运营无法发起挂失/补卡 |
| AC-V2-09 | BR-LOST-01 三类非 ACTIVE | `LOST`→`CARD_ALREADY_LOST`；`FROZEN`、`CLOSED`→`CARD_NOT_ACTIVE`；三类均不新增 `card_operation` |
| AC-V2-10 | 审计/通知/挂失防滥用 | 审计事件含 actor、maskedCardNumber、reason；通知失败不回滚且留待补发；同客户 24h 第 4 次挂失产生告警记录（Asia/Shanghai） |
| AC-V2-11 | 白金卡取消无退款交易 | 白金卡 `WAIVED` 工单取消后不产生任何费用/退款交易 |
| AC-V2-12 | 卡号展示脱敏 | 响应、页面、日志、审计事件、导出仅含后 4 位；检索完整卡号 0 命中 |

**审查修订补全用例（v1.1）**

| 用例 | 场景 | 断言 |
|------|------|------|
| AC-V2-13 | 写操作幂等统一（C01） | 对挂失、补卡申请、取消、状态更新、导出各执行同键重放：均返回 200 + 首次结果（`replayed=true`），`card_operation`/`card_replacement`/费用交易/冲回交易/审计事件/通知记录计数均不增加；同键不同载荷 → 409 `IDEMPOTENCY_KEY_CONFLICT` 且无副作用；重放仍校验 token/权限/归属（他人 key 或越权 → 404/403，不得放行） |
| AC-V2-14 | 新键取消已 `CANCELLED`（C01） | 新 `idempotencyKey` 取消已取消工单 → 409 `REPLACEMENT_NOT_CANCELLABLE`；不产生冲回、不改状态 |
| AC-V2-15 | 客服代客挂失凭证（C02） | 客服 token + `staffTicketNo` + `identityVerificationRef` → 201，审计含两者且 actor=工号；缺任一字段或引用无法解析 → 400 `STAFF_VERIFICATION_REQUIRED`，无 `card_operation`、无 LOSS 审计、无通知；客户自助仅凭本人 token 可成功（不需凭证）；客户端伪造 actor 无效 |
| AC-V2-16 | 导出 24h 失效边界（C03） | 导出创建成功（201，记录 `expiresAt`）；固定时钟 `T+23:59` 下载 200 且内容脱敏；`T+24:00` 及之后下载 410 `EXPORT_EXPIRED`；导出内容卡号仅后 4 位；导出动作写审计；`expiresAt` 不因访问而延长 |
| AC-V2-17 | `SHIPPED` 缺单号 24h 告警（C04） | 正常 `SHIPPED` 更新仍强制 `trackingNo`（缺失 → 400）；对历史/异常缺单号记录，时间推进至寄出后 24h → 产生 `TRACKING_MISSING_24H` 告警记录且进度页展示「物流信息同步中」；不产生硬拒绝或状态回退 |
| AC-V2-18 | 同卡 24h 补卡请求 > 3 次（C04） | 同一卡 24h 内第 4 次补卡请求：业务按既有规则处理（`REPLACEMENT_EXISTS` 或成功），同时产生 `REPLACEMENT_FREQUENCY` 告警 + `MANUAL_REVIEW_REQUIRED` 记录；与 `LOSS_FREQUENCY` 计数互不影响、互不替代 |
| AC-V2-19 | `FEE_PENDING` 远端已收（A 约束） | 构造"远端已收费、响应丢失"的 `FEE_PENDING` 工单：取消时先按原 `feeBatchId`/effect 核实，确认已收 → 冲回一次且 `feeStatus=REFUNDED`，净费用 0.00；禁止仅停 worker 而留下已收费；同键重放不二次冲回；仅"请求未到达下游"分支断言无交易 |

### 10.1 原文 §9 场景矩阵覆盖对照

| 原文场景（§9） | 覆盖用例 |
|----------------|----------|
| `ACTIVE` 卡挂失（主流程） | US-001 |
| 挂失后申请补卡（金卡） | US-004 |
| 运营更新为 `SHIPPED`（主流程） | US-006、AC-V2-17 |
| 白金卡申请补卡（边界） | US-003、AC-V2-11 |
| 刚挂失 1 秒内立即申请补卡（边界） | US-004 |
| 同一去重键 30 分钟内第 3 次提交（边界） | AC-V2-06、AC-V2-13 |
| 已挂失卡再次挂失（异常） | US-002、AC-V2-06、AC-V2-09 |
| 补卡进行中再次申请（异常） | US-005、AC-V2-18 |
| 费用过账时 transaction-service 不可用（异常） | US-008、AC-V2-04、AC-V2-19 |
| 运营在 `REQUESTED` 直接置 `ACTIVATED`（异常） | BR-LOST-08 / 异常矩阵 `INVALID_STATE_TRANSITION` |
| 客户 A 查看客户 B 的补卡工单（权限） | AC-V2-08 |
| 客服代客挂失（权限） | AC-V2-08、AC-V2-15 |

## 11. 测试批准来源与证据边界

- **批准来源**：开发者 2026-10-28 授权的本地四需求端到端测试，及本任务锁定的 `test-profile-v2`（SHA256 `b77c194258178a08ffd90beccb5e0f038472e69615655440bdc2493b2b3813cd`，含「v2 新增的 002 本地测试口径」）。这是**测试口径批准**，不是产品/定价/风控/合规正式签字。
- **本轮修订来源**：独立审查清单 `002-prd-review-c-v1.json`（SHA256 `2af5d287…e8b03`）四项 C01..C04 与 A 交接资金约束；修订只补全原合同表述，未扩政策、未删范围、未改金额与原 US。
- **可用作本轮断言**：原文第 5 章模拟规则与数值（50.00/白金免收/状态机/审计三字段）、原文 §4.2 字段表与 §7 接口清单、原文 §8.2 导出 24h、原文 §12.1 两项风险响应、`test-profile-v2` 的 002 口径（人工补卡、仅 `REQUESTED` 取消、冲回一次、BIN 前缀+Luhn、HMAC token 与归属/SoD）。
- **不得据本轮批准标为已确认**：原文 §12.3 五项与第 12 章新增待确认项；不得以"已加推断标签"代替确认，不得删功能或降级 AC 规避。
- **证据边界**：PRD、设计、代码、PR、单测、功能测试（含真实浏览器走查）、静态检查、Agent Review、安全复测必须来自**真实执行**并指向同一代码版本；工具失败不得用预置通过抵消；本轮（prepare 修订）未执行任何代码或测试。
- 后续节点的必要测试范围以节点合同为准；单测只接受实际执行结果。

## 12. 投产前待确认事项（不按已确认处理）

### 12.1 原文 §12.3（逐项保留）

1. 挂失后是否自动发起补卡（原文默认人工发起；本轮按 BR-LOST-11 不做自动补卡）。
2. 客户是否可取消补卡及可取消的截止状态（原文"制卡前"；本轮按 BR-LOST-10 仅 `REQUESTED`，正式口径待产品确认）。
3. 补卡新卡号生成规则与 BIN 段（本轮仅本地测试号段，待卡组织规范对齐）。
4. 补卡费减免策略与白金卡范围（本轮为模拟配置，待定价与产品确认）。
5. 补卡费欠款是否计入最低还款额（待账单规则负责人确认；本轮不做该断言）。

### 12.2 本轮新增待确认（影响投产，不阻塞本轮本地实施）

| 编号 | 事项 | 本轮处理 | 影响 |
|------|------|----------|------|
| P-01 | 正式鉴权：JWT/网关/细粒度 RBAC（原文 §6.2 与 ADR-007 差异） | 本地按 HMAC token + 归属/角色/SoD 实现 | 不得对外称生产鉴权就绪 |
| P-02 | 卡号密钥 KMS 托管与轮换；存量 `card` 表明文主键整改 | 新表落实密文/掩码分列，密钥走环境配置 | 存量数据合规整改需立项 |
| P-03 | 卡状态迁移：存量 `N` 卡的冻结/销户归类与卡生命周期管理权限 | 迁移须明确归类、不得默认 `ACTIVE` | BR-LOST-01 三类语义完整性 |
| P-04 | 白金客群正式判定规则（卡级别来源、与产品系统同步） | 模拟级别 + 配置化费用 | 费用与减免正确性 |
| P-05 | 费用与冲回的会计口径（总账科目、对账报表、最低还款额） | 真实费用交易 + 冲回记录，科目由 design/账务确认 | 账务与对账 |
| P-06 | 通知真实通道（邮件/短信服务商）与模板审批 | 本地为可查询投递记录 + 失败重投 | 客户触达率 |
| P-07 | **长期**留存与归档运行策略（工单 5 年、审计 3 年的归档/清理任务与存储成本） | 记录字段与策略已定义；**导出 24h 失效不在本项（已属本期实现与验证）** | 合规归档与存储成本 |
| P-08 | 风控告警的处置流程（阈值来源、处置人、升级路径）与补卡人工审核的具体审批步骤 | 仅产生告警与人工审核记录，不阻断、不新增硬拒绝 | 风控运营（C04 明确不得自行新增审批流） |
| P-09 | 制卡/邮寄 SLA 与 `estimatedArrival` 业务口径（原文仅约束 ≥ 寄出+3 天） | 按原文校验下限 | 客户预期管理 |
| P-10 | 客服工单号与身份核实记录的真实上游系统与格式（`staffTicketNo`/`identityVerificationRef` 来源） | 本地为可信引用校验 + 审计关联 | 客服身份核实合规 |

## 13. 追溯矩阵

| US / 用例 | 审查项 | REQ-LOST | BR | 接口 | 基线数据准备 |
|-----------|--------|----------|----|------|--------------|
| US-001 | — | 01, 02, 07 | BR-LOST-01/02/07/09 | `POST /cards/{n}/loss` | 卡 `3344556677889900`、账户 `00000000006`、`USER0001` |
| US-002 | — | 02, 07 | BR-LOST-01/09 | 同上 | 复用 US-001（新键） |
| US-003 | — | 03, 05 | BR-LOST-03/12/14 | `POST /cards/{n}/replacements` | 白金卡 `4000000000009999`（模拟）、`USER0002` |
| US-004 | — | 03, 05 | BR-LOST-03/12/14 | 同上 + 账户 postings | 卡 `3344556677889900`、账户 `00000000006` |
| US-005 | — | 07 | BR-LOST-06/09 | 同上 | 复用 US-004 |
| US-006 | — | 04, 06 | BR-LOST-05/08 | `GET /replacements/{id}`、`POST /admin/replacements/{id}/status` | US-004 工单 + 运营 token |
| US-007 | — | 03, 04 | BR-LOST-04/12 | `POST /authorizations`（基线） | US-004 新卡号 |
| US-008 | §4.3 | 03, 05 | BR-LOST-03/14/15 | `POST /cards/{n}/replacements` + 费用重试 | 非白金卡 `2233445566778899`、`USER0002` |
| AC-V2-01 | — | 03 | BR-LOST-11 | 挂失后查询无工单 | US-001 |
| AC-V2-02 | — | — | BR-LOST-08/10 | `POST /replacements/{id}/cancel` | US-004 工单 |
| AC-V2-03 / 14 | C01 | 05 | BR-LOST-10/14/17 | 取消 + 交易查询 | US-004 已收费工单 |
| AC-V2-04 / 19 | A 约束 | 05 | BR-LOST-10/14 | 停机分支 + 核实分支 | US-008 |
| AC-V2-05 | A 约束 | 05 | BR-LOST-10/14/17 | 并发取消 × 重试 | US-008 |
| AC-V2-06 | — | 02, 07 | BR-LOST-09 | 挂失/补卡重放 | US-001 |
| AC-V2-07 | — | 03, 04 | BR-LOST-04/12 | 补卡 + 授权 | US-004 |
| AC-V2-08 / 15 | C02 | 01, 02 | BR-LOST-13/18 | 全部接口 + 客服代客挂失 | `USER0001/0002`、客服账号 |
| AC-V2-10 / 16 | C03 | 06, 07 | BR-LOST-07/15/16/19 | 挂失 + 导出 | US-001、US-004 |
| AC-V2-13 | C01 | 01..07 | BR-LOST-17 | 五类写接口 + 导出 | US-004/006 |
| AC-V2-17 | C04 | 04, 06 | BR-LOST-20① | 状态更新 + 告警查询 | US-006 工单 |
| AC-V2-18 | C04 | 03, 07 | BR-LOST-20② | 补卡请求重复 | US-004 |
| AC-V2-11 / 12 | — | 03, 05 | BR-LOST-03 | 取消 + 展示 | US-003 |

## 14. 领域约束（按 `bank-domain-payments` L3）

- **业务规则编号**：BR-LOST-01..07（原文）+ BR-LOST-08..16（v1.0 口径）+ BR-LOST-17..20（v1.1 审查补全），每条可追溯到原文条款、v2 口径或审查项。
- **状态机（唯一合法边表）**：
  - 卡：`ACTIVE → LOST`（不可回退）；`ACTIVE → FROZEN/CLOSED`（存量与运营口径待 P-03）；非 `ACTIVE` 一律拒绝挂失与交易授权。
  - 工单：`REQUESTED → CARD_PRODUCED → SHIPPED → ACTIVATED`；`REQUESTED → CANCELLED`。
  - 费用：`(无) → CHARGED | WAIVED | FEE_PENDING`；`FEE_PENDING → CHARGED`（重试成功）或 `FEE_PENDING → CHARGED → REFUNDED`（核实已收后取消）；`CHARGED → REFUNDED`（取消冲回）；`FEE_PENDING → (确认未收) 停止补收`；`WAIVED` 终态。
- **幂等与资金一致性**：全部写接口以 `idempotencyKey` 去重（同键同载荷 200 重放、同键不同载荷 409）；费用/冲回通过 account-service 记账并具备稳定 effect 身份与持久续跑；每笔有唯一业务引用（`feeBatchId`/`refundBatchId`）并支持重放核对；取消与重试互斥，禁止双收/双退/仅停 worker 留收费。
- **审计与 SoD**：挂失、补卡、取消、状态迁移、费用与冲回、导出全量留痕；客服代客挂失审计关联工单号与核实引用；运营不可发起挂失/补卡、费用无手工调账。
- **时效与告警**：导出 24 小时失效（含边界负例）；`SHIPPED` 缺单号 24h 告警；挂失与补卡频率告警分别记录，均不阻断业务。
- **术语校验**：后续可用 `bank-domain-payments` 的 `term_check.py` 校验；本轮未运行该脚本，不声称术语检查已通过。

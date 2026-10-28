# 信用卡账单/消费分期 · 设计与交付说明（任务 REQ-40d234a6）

| 项 | 内容 |
|----|------|
| 需求 | REQ-2026-001 信用卡账单/消费分期（原文 v1.0，SHA256 `6d6a04c8…479e13`） |
| PRD | `docs/requirements/REQ-2026-001-REQ-40d234a6-2248-4d02-9e97-f7add72bc203.md`（本任务 PRD v1.0） |
| 试验口径 | `test-profile-v2`，SHA256 `b77c1942…b3813cd`（本地测试参数，非业务签字） |
| 基线 | 分支 `codex/carddemo-req-40d234a6-…`，起点提交 `41cab537c8439192b74c4e2b39bb4ce49731b9b1`（= `develop`） |
| 交付方式 | 基线缺口补齐 + 真实验证（开发者 2026-10-28 明确；不重复构建同一服务） |

## 1. 交付策略与依据

`develop` 已包含前序任务 REQ-5118990a 合入的分期能力（installment-service、ledger-service、web-ui 分期页面、`docs/design/09-installment-capability.md`）。按开发者确认，本任务以该实现为**基线代码**，逐条对照本任务 PRD 审计后补齐缺口，并产出本任务自己的设计说明、真实单测证据与 PR，不另建重复服务。

| 决策 | 候选方案 | 选择与理由 |
|------|----------|-----------|
| D1 交付形态 | ①重新实现分期服务 ②基线缺口补齐 ③仅出验证报告 | 选②：同一需求在同一仓库重复建服务会产生两套资金路径与数据表，风险高于收益；同时保留“不缩减范围、证据自出”的要求（缺口清单见第 3 章） |
| D2 单笔分期的本金去重粒度 | ①交易级一次性（任一占用即拒绝）②本金级（可用 = 交易金额 − 已占用） | 选②：`test-profile-v2` 要求「同一原交易本金不得重复转分期，已关联本金与未关联本金须可核对」；交易级会把未占用本金永久锁死，与账单侧本金级分摊口径不一致 |
| D3 BR-INS-08「T+1 生效」语义 | ①新增 `PENDING_ACTIVE` 状态与次日激活任务（占用/笔数次日才计） ②创建即占用，首期落在下一账单周期 | 选②（沿用基线行为）：原文 BR-INS-08 的可执行验收点只约束「创建日 D 时首期到期日落在 D+1 之后的账单周期」，而 US-004 要求「建计划后账户分期占用 = 1000.00」为即时；①会与 US-004 冲突并使额度口径出现当日空窗。差异登记为 R-10，待产品/账户确认后另行评估 |
| D4 认证方式 | ①JWT ②IAM HMAC token | 选②：与基线 IAM 签发器一致（`base64url(payload).base64url(HmacSHA256)`），`test-profile-v2` 第 6 项明确；不宣称生产鉴权就绪（R-07） |

## 2. 架构与数据（基线事实）

- 模块：`installment-service`（8088）、`ledger-service`、`web-ui`（同源代理 `/api/**`）；billing/notification/audit 能力内聚在分期服务内（`BillingStatementService`、`LocalNotificationSender`、`AuditEventWriter`）。
- 数据：`installment_plan`、`installment_schedule`、`installment_repayment`、`installment_principal_allocation`、`installment_application_intent`、`installment_settlement_intent`、`installment_audit_event/retry`、`installment_notification_outbox/retry`、`account_limit_view`（`installment_occupied = SUM(remaining_principal) WHERE status='ACTIVE'`）。
- 资金路径：创建 → ledger 过账（失败/业务拒绝走逆向分录，意图表续跑）；还款/结清 → account 真实扣减 + 计划行锁 + `effectId` 去重；通知/审计失败不阻塞主流程，进重试队列。
- 分层：`interfaces/rest` → `application` → `domain`（模型/规则/计算）→ `infrastructure`（JPA/REST/安全/worker）。

## 3. 缺口与本次改动

| # | 缺口（审计结论） | PRD 依据 | 改动 | 验证 |
|---|------------------|----------|------|------|
| G1 | `INVALID_TERM` 返回 400，PRD 要求 409 | §7 错误码矩阵 | `GlobalExceptionHandler`：从 `BAD_REQUEST_CODES` 移除该码 | `InstallmentControllerTest#invalidTermMapsTo409` |
| G2 | 缺参、类型不匹配、约束违反落到 500 `INTERNAL_ERROR` | §7 参数类 | 新增 `MissingServletRequestParameterException`/`MethodArgumentTypeMismatchException`/`ConstraintViolationException`/`HandlerMethodValidationException` 映射到 400 `INVALID_PARAMETER` | `missingAccountIdQueryParameterIsRejected`、`principalWithThreeDecimalsIsRejected` |
| G3 | 金额 3 位小数触发 `setScale(2, UNNECESSARY)` → 500 | §6.1 字段合同 | 请求体加 `@Digits(integer=10, fraction=2)`（试算/创建/还款/减免） | 同上 |
| G4 | 查询参数上的 `@Pattern/@Size` 在运行时不生效 | D-05（accountId 11 位） | 控制器加 `@Validated`，并对列表接口的 `accountId` 做显式服务端校验 | `accountIdMustBeElevenDigits` |
| G5 | 单笔分期不校验消费类型，与入口资格 `NOT_PURCHASE` 不一致 | BR-INS-06、REQ-INS-01 | `EligibilityPolicy.requirePurchaseTransaction`，试算与创建共用 | `PreviewServiceTest#nonPurchaseTransactionIsNotEligible` |
| G6 | 单笔去重是交易级布尔锁，未占用本金不可再分期 | BR-INS-09、AC-09 | 改为本金级：`available = amount − allocatedAmount`，为 0 才 `ALREADY_INSTALLED`；删除不再使用的 `existsByTransactionId` | `partiallyInstallmentedTransactionKeepsUnallocatedPrincipalAvailable` + 原有 ALREADY_INSTALLED/冲正用例 |
| G7 | 详情缺 `paidPeriods`；还款计划行数与期数不符时未告警 | §6.1 查询字段、REQ-INS-05 | `PlanView` 增加 `paidPeriods`；`SCHEDULE_INCONSISTENT` 改为「行数 ≠ 期数」判定 | `detailCountsPaidPeriodsAndFlagsIncompleteSchedule`、`detailWithCompleteScheduleHasNoWarning` |
| G8 | 401 响应体缺 `details`，与统一错误结构不一致 | §7 统一 `{code,message,details}` | `TokenAuthenticationFilter` 401 体补 `details: []` | 现有 `TokenAuthenticationFilterTest` 通过 |
| G9 | 前端费率直出小数 `0.0055`，不符合费率明示；无还款合计；导出按钮可连点 | §9 合规披露、REQ-INS-03、US-008 | 新增 `rateText()` 显示 `0.55%/月`（试算/详情/后台详情 3 处）；试算页补「还款合计（本金+总手续费）」；导出按钮 `setBusy` 防重 | `node --check` 语法校验；web-ui 单测通过；页面行为需人工走查（见第 5 章） |

未改动、登记为限制或待确认的项见第 6 章。

## 4. 需求覆盖矩阵（REQ → 设计/代码 → 测试）

| 功能点 | 主要实现 | 验收覆盖 |
|--------|----------|----------|
| REQ-INS-01 交易入口 | `EligibilityQueryService`（`typeCode=01`、`POSTED`、风险标记） | `EligibilityPolicyTest`、`PreviewServiceTest#nonPurchaseTransactionIsNotEligible` |
| REQ-INS-02 账单入口 | `BillingStatementService`（账期锚点、排除非消费/周期外/已分摊） | `BillingStatementServiceTest`（5 例） |
| REQ-INS-03 试算 | `PreviewService` + `FeeScheduleCalculator` + `PreviewTokenService`（30 分钟、绑定金额/期数/账户） | `FeeScheduleCalculatorTest`、`PreviewServiceTest`（9 例，含 1000/6=19.25、500/3=6.00） |
| REQ-INS-04 提交 | `InstallmentApplicationService`（意图表 + 幂等键 + 账户锁 + 补偿/对账） | `InstallmentApplicationServiceTest`（21 例） |
| REQ-INS-05 查询 | `InstallmentQueryService`（分页/状态校验、`paidPeriods`、越权 404） | `InstallmentQueryServiceTest`（9 例） |
| REQ-INS-06 结清 | `SettlementCalculator`/`SettlementService`（1% 违约金、`feeRebate=0`、幂等在途互斥） | `SettlementCalculatorTest`、`SettlementServiceTest`（11 例，含 US-005 606.00） |
| REQ-INS-07 后台 | `AdminInstallmentController`/`AdminExportService`（`installment:read:any` 映射、24h 有效期、导出留痕） | `AdminExportServiceTest`（5 例）、`AccessGuardTest` |
| 额度占用 | `account_limit_view` + `AccountLimitViewService` | `InstallmentSchemaValidationTest`（真 PG 视图聚合） |
| 认证/越权 | `HmacTokenVerifier`、`TokenAuthenticationFilter`、`AccessGuard` | `HmacTokenVerifierTest`、`AccessGuardTest`、控制器 401/403/404 用例 |

## 5. 验证记录（本次实际执行）

| 命令 | 范围 | 结果 |
|------|------|------|
| `JAVA_HOME=<JDK21> mvn -pl services/installment-service,services/web-ui test` | 分期服务 + 前端代理 | **BUILD SUCCESS**；installment-service `Tests run: 165, Failures: 0, Errors: 0, Skipped: 0`；web-ui `Tests run: 4, Failures: 0, Errors: 0, Skipped: 0` |
| `node --check services/web-ui/src/main/resources/static/app.js` | 前端语法 | 通过（JS-SYNTAX-OK） |

未执行、需在验证节点补做的部分：

- 真实容器/多服务功能验证（Compose 起全栈、台账与额度端到端），以及 50 并发 p95 压测（PRD §9 性能）。
- 前端交互走查（三态、费率与还款合计展示、导出防重）。
- 静态检查与安全扫描工具（本次未运行，不得记为已通过）。

## 6. 限制与待确认（不按已确认处理）

| 编号 | 事项 | 处理 |
|------|------|------|
| R-01 | 本任务与已合入 `develop` 的前序实现范围重叠 | 开发者已确认按「缺口补齐 + 真实验证」执行；正式范围裁定仍留协调者 |
| R-02 | 材料《基线与实现约束》基线（5eeddd6）与实测（41cab53）不符 | 已按实测实现，材料待维护方更新 |
| R-04 | `INVALID_PARAMETER`/`SCHEDULE_INCONSISTENT`/`CONCURRENT_MODIFICATION` 及 401、去重键过期码未入原文 §7 目录 | 本任务沿用代码实际值并在 PRD 第 7 章登记；接口目录修订仍待确认 |
| R-05 | 超 20 笔的错误码文案 | 实现为 `INSTALLMENT_LIMIT_EXCEEDED`（409），文案待产品确认 |
| R-06 | PRD 权限点（`installment:read:any` 等）与代码 `STAFF_ASSIST`/`RISK_READONLY` 未与 IAM 角色统一 | 保持本地权限表实现，映射待 R-06 闭环；未宣称 SoD 已落地（分期无审批流，SoD 仅覆盖“风控只读、写操作限客服/客户”） |
| R-07 | JWT/网关演进 | 本地 HMAC 校验，不称生产鉴权就绪 |
| R-10 | BR-INS-08「T+1 生效」采用「首期落下一账期 + 即时占用」口径 | 与 US-004 一致；若要求状态延迟生效需产品另行确认 |
| R-11 | `previewToken` 长度合同：PRD §6.1 写 `string(64)`，实现签发约 118 字符（`@Size(max=512)`） | 未改实现（改小会破坏现有令牌）；接口目录/PRD 需择一修正 |
| R-12 | 结清“试算/执行”拆为 `GET /settlement-quote` + `POST /early-settlement` | 与 PRD §6.1 注一致（原文 §7 列为同一接口），接口目录需登记 |
| R-13 | `project-standards` 节点输入为 missing | 经开发者确认按仓库既有规范（`docs/design/07-java-conventions.md` 等）实现；输入缺口如实回传 |

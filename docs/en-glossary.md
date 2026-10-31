# English demo glossary (demo-en branch)

Every translator on this branch uses these renderings so the same thing reads the same everywhere.
When a term already has an English rendering in `shared/i18n/messages/en.ts`, `teams/src/task-labels-en.ts`
or `talents/src/demo/catalog-en.ts`, use that rendering; this list only adds what those files do not cover.

## Style

- Plain, professional US English. Keep sentences short; no marketing tone.
- Keep unchanged: IDs (`REQ-2026-001`, `US-005`, `DEMO-MKT-001`, UUIDs), code identifiers, class/method names,
  file paths, URLs, SHA values, numbers, dates, Markdown/JSON/YAML structure, front-matter keys.
- Money: `900.00元` → `CNY 900.00`; `¥12.50` stays `¥12.50`.
- Chinese full-width punctuation becomes ASCII punctuation (`：` → `: `, `，` → `, `, `（）` → `()`, `「」`/`“”` → `"`).
- Code inside content (patches, snippets, SQL, Java): translate Chinese comments and string literals only; never
  change code tokens, indentation or line structure of a diff (keep `+`/`-`/context prefixes and hunk headers).

## People and organisation

| Chinese | English |
|---|---|
| 林悦 | Lin Yue |
| 陈晨 | Chen Chen |
| 苏晴 | Su Qing |
| 杨帆 | Yang Fan |
| 赵宁 | Zhao Ning |
| 王晓 | Wang Xiao |
| 成员 A / B / C | Member A / B / C |
| 信用卡研发团队 | Credit Card R&D Team |
| 研发效能团队 | Engineering Productivity Team |
| 银行开发规范 | Bank Development Standards |
| 禅道 | ZenTao |

## Products and roles

| Chinese | English |
|---|---|
| iCode Teams / iCode Talents | unchanged |
| Owner / 负责人 | Owner |
| 成员 | Member |
| 管理员 (Talents) | Admin |
| 开发者 (Talents) | Developer |
| 会话 | Session |
| 轨迹诊断 | Trajectory diagnosis |
| 轨迹诊断报告 | Trajectory diagnosis report |
| 改进建议 | Improvement suggestions |
| Skill 改进 | Skill improvement |
| 知识 / 产物 | Knowledge / Artifact |
| 发布 | Publish |
| 来源 | Source |
| 代码图谱 / CodeGraph | Code graph / CodeGraph |
| 范式 / 开发范式 | Pattern / Development pattern |
| 范式总结 | Pattern summary |
| 代码分析报告 | Code analysis report |
| 挖掘元数据 | Mining metadata |
| 范式索引 | Pattern index |
| 文档知识提取 | Document knowledge extraction |
| 业务规则目录 | Business rules catalog |
| 统一语言术语表 | Ubiquitous language glossary |
| 数据字典 | Data dictionary |
| 银行编码规范要点 | Bank coding standards essentials |

## Delivery flow

| Chinese | English |
|---|---|
| 需求澄清 / 功能开发 / 测试验证 / 需求验收 | Requirement clarification / Feature development / Test verification / Requirement acceptance |
| 原始需求 | Original requirement |
| 业务需求编号 | Business requirement ID |
| 原始需求 SHA256 | Original requirement SHA256 |
| 试验口径 / 试验口径版本 | Test profile / Test profile version |
| 业务规则与范围 | Business rules and scope |
| 基线与实现约束 | Baseline and implementation constraints |
| 待确认与差异 | Open questions and differences |
| 测试定义与验收 | Test definition and acceptance |
| 待确认 / 待确认项 | Open question / To be confirmed |
| 已确认 | Confirmed |
| 验收 / 验收用例 | Acceptance / Acceptance cases |
| 交付 / 交付人 | Delivery / Assignee |
| 完成标准 | Completion criteria |

## CardDemo business

| Chinese | English |
|---|---|
| 白金卡 | Platinum card |
| 返现 / 消费返现 | Cashback / Spending cashback |
| 针对白金卡客户未来 3 个月的消费，额外增加 0.5% 的消费返现。 | Platinum card customers get an extra 0.5% cashback on their spending over the next 3 months. |
| 白金卡消费返现权益说明页 | Platinum Card Spending Cashback Benefit Page |
| 权益 / 权益说明页 | Benefit / Benefit page |
| 信用卡营销交付 | Credit Card Marketing Delivery |
| 信用卡消费返现 · 项目交付流程 | Credit Card Spending Cashback · Project Delivery Flow |
| 入账 / 记账 | Posting / Booking |
| 幂等 | Idempotent / Idempotency |
| 额度 | Credit limit |
| 分期 | Installment |
| 挂失补卡 | Card loss reporting and replacement |
| 提额 | Limit increase |
| 交易争议 | Transaction dispute |
| 信用卡账单/消费分期 | Credit Card Statement/Purchase Installment |
| 信用卡挂失与补卡 | Credit Card Loss Reporting and Replacement |
| 信用卡额度调整申请与审批 | Credit Card Limit Increase Application and Approval |
| 交易争议在线申请与处理 | Transaction Dispute Online Application and Handling |

The four requirement titles above follow the English requirement documents on carddemo `devb-en`
(`docs/requirements/REQ-2026-00x-*.md`); keep them identical to those headings.

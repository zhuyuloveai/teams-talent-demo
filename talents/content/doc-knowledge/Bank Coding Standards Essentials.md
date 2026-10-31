# 银行编码规范要点

> 生成能力：文档业务知识提取 · 来源：银行开发规范、信用卡核心业务文档 · 生成时间：2026-10-25 22:31
> 汇总 Java 服务的分层、建模、接口和安全约定，以及银行编码规范的五类检查规则。

## 1. 分层与依赖

```
com.cardcore.<context>
├── interfaces/rest      入站适配器：Controller、请求 / 响应 DTO
├── application          应用服务：用例编排、事务边界
├── domain               聚合根、实体、值对象、仓储端口、领域异常
└── infrastructure       持久化、调用其他服务的客户端、配置
```

- 依赖方向：`interfaces → application → domain ← infrastructure`。
- domain 不依赖 Spring Web，也不依赖其他服务。

来源：信用卡核心业务文档 / design/07-java-conventions.md §2

## 2. 建模约定

| 约定 | 说明 |
|---|---|
| 充血模型 | 领域行为写在实体上，如 `account.applyPosting(amount)`，不在 Service 里堆 setter |
| 标识符 | 账户号 11 位、卡号 16 位、客户号 9 位、交易号 16 位，一律零填充字符串，禁止 `long` |
| 金额 | `BigDecimal`，数据库 `numeric(12,2)`，禁止 `double` |
| 日期时间 | `LocalDate`（`YYYY-MM-DD`）、`LocalDateTime` |
| 状态码 | 保持存量取值：`Y/N`、`A/U`、`00/05` |
| 并发 | 每个聚合表带 `version`，实体使用 `@Version` |

来源：信用卡核心业务文档 / design/07-java-conventions.md §3、§6

## 3. 接口约定

- 基础路径 `/api/v1/<资源复数>`，DTO 使用 Java `record`，请求 DTO 加 Jakarta Validation 注解。
- 列表统一返回 `{"items": [...]}`，分页时附带 `page`、`size`、`total`。
- 错误响应统一为 `{"code", "message", "details"}`。
- HTTP 语义：`400` 参数校验失败、`404` 未找到、`409` 业务规则冲突、`503` 下游不可用。

来源：信用卡核心业务文档 / design/07-java-conventions.md §4

## 4. 五类检查规则

| 类别 | 检查项 | 分级 |
|---|---|---|
| 命名 | 类 / 方法 / 变量 / 常量命名规范，禁止拼音缩写 | 告警 |
| 异常 | 禁止吞异常、空 catch；服务间调用失败抛 `RemoteServiceException`，不得吞掉 | 严重 |
| 日志 | 关键操作有日志；**不打印卡号、SSN、密码等敏感字段** | 严重 |
| 安全 | 参数化查询，无硬编码密钥，输入校验 | 致命 |
| 资源 | 连接 / 流 / 锁正确释放，使用 try-with-resources | 严重 |

- 致命项阻断提交，严重项必须修复，告警项附解释或跟踪单。
- 涉及资金划拨、密钥处理、监管报送、第三方支付集成的变更自动升级为 L3 检查。

来源：银行开发规范 / 编码规范清单；银行开发规范 / 规则→工具映射

## 5. 测试与数据库

- 每个服务至少有领域行为单测（纯 JUnit）和一个 `@SpringBootTest` + `MockMvc` 端到端用例。
- 断言业务规则与错误码，不断言日志或实现细节；测试不依赖外部网络。
- 每个服务独立数据库，禁止跨库 JOIN；Flyway 脚本 `V1__<context>_schema.sql`、`V2__<context>_seed.sql`，种子数据幂等。

来源：信用卡核心业务文档 / design/07-java-conventions.md §6、§7

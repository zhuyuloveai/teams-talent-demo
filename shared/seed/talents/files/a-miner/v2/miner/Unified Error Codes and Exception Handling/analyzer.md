# 统一错误码与异常映射（PR #12、#19、#35）代码分析报告

## 仓库知识层次分类

三个 PR 统一了 7 个服务的错误表达：领域层只抛业务异常，出站客户端把下游失败归一，接口层集中映射 HTTP 状态和错误体。

> carddemo-java-1025 → 各服务 `interfaces.rest.GlobalExceptionHandler`（HTTP 映射）→ `domain.exception`（`BusinessRuleException`、`NotFoundException`、`ValidationException`）→ `infrastructure.client`（`RemoteServiceException`）→ `ApiError`（统一错误体）

核心涉及模块：

- `services/transaction-service/src/main/java/com/carddemo/transaction/domain/exception/BusinessRuleException.java`：业务断言失败，携带错误码，映射为 409。
- `services/transaction-service/src/main/java/com/carddemo/transaction/infrastructure/client/AccountClient.java`：出站调用，PR #19 把连接失败、超时、5xx 统一转换为 `RemoteServiceException`。
- `services/transaction-service/src/main/java/com/carddemo/transaction/interfaces/rest/GlobalExceptionHandler.java`：PR #12 新增，6 个 `@ExceptionHandler` 覆盖 404、409、503、400 和并发冲突。
- `services/transaction-service/src/main/java/com/carddemo/transaction/interfaces/rest/ApiError.java`：错误体 `{code, message, details}`。
- `services/customer-service/src/main/java/com/carddemo/customer/domain/model/Customer.java`：PR #35 让字段校验沿用存量屏幕的提示文案。
- 文档：`docs/design/05-api-catalog.md` §7 错误码总表。

## 需求影响位置依赖分析

**核心依赖链**（以交易服务为例）：

1. 控制器入参经 `@Valid` 校验，失败抛 `MethodArgumentNotValidException`，由 `handleValidation()`（`GlobalExceptionHandler.java:43-50`）转为 400 并逐字段写入 `details`。
2. 应用服务或领域对象断言失败抛 `BusinessRuleException`，由 `handleBusinessRule()`（`GlobalExceptionHandler.java:25-29`）转为 409，`code` 原样输出。
3. 出站调用经 `AccountClient.post()`（`AccountClient.java:65`）：下游 404 转 `NotFoundException`，下游 409 解析对方错误体后转 `BusinessRuleException`，其他非 2xx 与 `RestClientException` 转 `RemoteServiceException`。
4. `RemoteServiceException` 由 `handleRemote()`（`GlobalExceptionHandler.java:31-35`）转为 `503 DEPENDENCY_UNAVAILABLE`。

**关键类型与常量**：

- `BusinessRuleException(code, message)`：a) 只表达业务断言，不含 HTTP 语义（`BusinessRuleException.java:1-18`）；b) 错误码登记在错误码总表。
- `RemoteServiceException`：a) 下游不可用的统一载体；b) 只在 `infrastructure.client` 包内构造。
- `ApiError`：a) `of(code, message)` 与 `of(code, message, details)` 两个工厂方法；b) 所有服务同构，前端只解析这一种结构。
- 错误码示例：`NOTHING_TO_PAY`、`PAYMENT_EXCEEDS_BALANCE`、`CONCURRENT_UPDATE`、`DEPENDENCY_UNAVAILABLE`、`REPORT_REFERENCE_ERROR`。

**测试依赖**：各服务的 `*ControllerTest` 用 MockMvc 断言状态码和 `$.code`；`TransactionControllerTest` 模拟账户服务不可用，断言 503。

## 调用跟踪

```
PostingController.post()                     PostingController.java:43
  └─ PostingService.post()                   PostingService.java:69
       └─ AccountClient.applyPosting()       AccountClient.java:53
            └─ post()                        AccountClient.java:65
                 ├─ HTTP 404  → NotFoundException          → handleNotFound()      404
                 ├─ HTTP 409  → BusinessRuleException      → handleBusinessRule()  409
                 └─ 其他失败  → RemoteServiceException     → handleRemote()        503
```

## 其他相关概念

**编码行为与约定**：
- **分层职责**：领域层不引用 Spring Web 类型；HTTP 状态只在 `GlobalExceptionHandler` 中决定。
- **错误码稳定**：错误码为大写下划线短标识，一旦对外发布不改名，新增时先登记总表。
- **提示文案沿用存量**：迁移屏幕校验时保留原提示，便于业务人员对照。
- **不吞异常**：客户端捕获底层异常后必须包装再抛出，保留 cause。

**领域与系统知识**：
- **存量错误呈现**：COBOL 屏幕把错误写在消息行，新系统用 `message` 承载同一句话。
- **依赖不可用**：服务之间同步调用，下游宕机时上游返回 503，前端提示稍后重试。

**最佳实践**：
- 新增出站客户端时，按“404 / 409 / 其他”三档处理，与现有 `AccountClient` 保持一致。
- 每个新错误码都配一条控制器测试，断言状态码和 `code`。
- 不要为单个场景新建异常类型，优先复用三类领域异常。

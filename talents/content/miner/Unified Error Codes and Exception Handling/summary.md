# Unified Error Codes and Exception Handling 开发范式总结

**一般性场景描述**：新增业务校验或调用其他服务时，如何定义错误码、抛出异常并映射为统一的 HTTP 错误响应。

## 实现步骤

### 步骤 1. 领域异常只表达业务断言

**实现逻辑**：业务规则不满足时抛 `BusinessRuleException(code, message)`，资源不存在抛 `NotFoundException`，参数非法抛 `InvalidRequestException`。

**规范约束**：
- `code` 使用大写下划线，必须登记在错误码总表；`message` 可沿用存量系统提示文案（如 `You have nothing to pay...`）。

**注意事项**：
- 异常类放在 `domain/exception`，不依赖 Spring。

**一般化参考代码**：

```java
public class BusinessRuleException extends RuntimeException {
    private final String code;
    public BusinessRuleException(String code, String message) {
        super(message);
        this.code = code;
    }
    public String getCode() { return code; }
}
```

**参考文件**：
- `services/transaction-service/src/main/java/com/carddemo/transaction/domain/exception/BusinessRuleException.java` 行 1-18

---

### 步骤 2. 出站调用失败统一转换

**实现逻辑**：调用其他服务的客户端把 5xx、超时、连接失败统一转换为 `RemoteServiceException`。

**规范约束**：
- 不得吞掉远程异常；404 由客户端转换为 `Optional.empty()` 或业务异常，交给调用方决定。

**一般化参考代码**：

```java
} catch (RestClientException ex) {
    throw new RemoteServiceException(SERVICE + " is unavailable", ex);
}
```

**参考文件**：
- `services/transaction-service/src/main/java/com/carddemo/transaction/infrastructure/client/AccountClient.java` 行 40-50

---

### 步骤 3. 全局异常处理映射 HTTP 状态

**规范约束**：
- 错误体统一为 `{"code", "message", "details"}`；每个服务各有一个 `@RestControllerAdvice`。

**参考文件**：
- `services/transaction-service/src/main/java/com/carddemo/transaction/interfaces/rest/GlobalExceptionHandler.java` 行 17-56

---

### 步骤 4. 登记错误码

**实现逻辑**：新增错误码时同步更新接口目录的错误码总表，写明 HTTP 状态、归属服务与含义。

**参考文件**：
- carddemo-java-1025 / docs/design/05-api-catalog.md §8

**示例**：`NOTHING_TO_PAY`（409，account / transaction）、`PAYMENT_EXCEEDS_BALANCE`（409，account）、`LAST_ADMIN`（409，iam）。

## 测试要点

- MockMvc 断言 HTTP 状态与 `code`，不断言 `message` 全文。
- 下游服务停掉时，接口返回 503 `DEPENDENCY_UNAVAILABLE`。

## 依据

- carddemo-java-1025 / docs/design/07-java-conventions.md §3–§4
- 银行开发规范 / 编码规范清单（异常类：禁止吞异常）

# Unified Error Codes and Exception Handling: Development Pattern Summary

**General scenario**: when adding a business validation or calling another service, how to define error codes, throw exceptions and map them to a unified HTTP error response.

## Implementation steps

### Step 1. Domain exceptions express business assertions only

**Implementation logic**: throw `BusinessRuleException(code, message)` when a business rule is not met, `NotFoundException` when a resource does not exist, and `InvalidRequestException` for invalid parameters.

**Standards and constraints**:
- `code` uses upper case with underscores and must be registered in the error code table; `message` may reuse the legacy system's prompt text (such as `You have nothing to pay...`).

**Notes**:
- Exception classes live in `domain/exception` and do not depend on Spring.

**Generalized reference code**:

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

**Reference files**:
- `services/transaction-service/src/main/java/com/carddemo/transaction/domain/exception/BusinessRuleException.java` lines 1-18

---

### Step 2. Translate outbound call failures uniformly

**Implementation logic**: clients that call other services translate 5xx, timeouts and connection failures into `RemoteServiceException`.

**Standards and constraints**:
- Never swallow remote exceptions; the client turns a 404 into `Optional.empty()` or a business exception and leaves the decision to the caller.

**Generalized reference code**:

```java
} catch (RestClientException ex) {
    throw new RemoteServiceException(SERVICE + " is unavailable", ex);
}
```

**Reference files**:
- `services/transaction-service/src/main/java/com/carddemo/transaction/infrastructure/client/AccountClient.java` lines 40-50

---

### Step 3. Global exception handling maps HTTP status

**Standards and constraints**:
- The error body is always `{"code", "message", "details"}`; each service has one `@RestControllerAdvice`.

**Reference files**:
- `services/transaction-service/src/main/java/com/carddemo/transaction/interfaces/rest/GlobalExceptionHandler.java` lines 17-56

---

### Step 4. Register error codes

**Implementation logic**: when adding an error code, update the error code table in the API catalog at the same time, stating the HTTP status, owning service and meaning.

**Reference files**:
- carddemo-java-1025 / docs/design/05-api-catalog.md §8

**Examples**: `NOTHING_TO_PAY` (409, account / transaction), `PAYMENT_EXCEEDS_BALANCE` (409, account), `LAST_ADMIN` (409, iam).

## Testing points

- MockMvc asserts the HTTP status and `code`, not the full `message` text.
- When a downstream service is stopped, the API returns 503 `DEPENDENCY_UNAVAILABLE`.

## Basis

- carddemo-java-1025 / docs/design/07-java-conventions.md §3–§4
- Bank Development Standards / Coding standards checklist (exception category: never swallow exceptions)

# Unified Error Codes and Exception Handling (PR #12, #19, #35) Code Analysis Report

## Repository knowledge layers

The three PRs unify how 7 services express errors: the domain layer only throws business exceptions, outbound clients normalize downstream failures, and the interface layer maps HTTP status and the error body in one place.

> carddemo-java-1025 → each service's `interfaces.rest.GlobalExceptionHandler` (HTTP mapping) → `domain.exception` (`BusinessRuleException`, `NotFoundException`, `ValidationException`) → `infrastructure.client` (`RemoteServiceException`) → `ApiError` (unified error body)

Core modules involved:

- `services/transaction-service/src/main/java/com/carddemo/transaction/domain/exception/BusinessRuleException.java`: business assertion failure, carries an error code, mapped to 409.
- `services/transaction-service/src/main/java/com/carddemo/transaction/infrastructure/client/AccountClient.java`: outbound calls; PR #19 translates connection failures, timeouts and 5xx into `RemoteServiceException`.
- `services/transaction-service/src/main/java/com/carddemo/transaction/interfaces/rest/GlobalExceptionHandler.java`: added in PR #12; 6 `@ExceptionHandler` methods cover 404, 409, 503, 400 and concurrency conflicts.
- `services/transaction-service/src/main/java/com/carddemo/transaction/interfaces/rest/ApiError.java`: error body `{code, message, details}`.
- `services/customer-service/src/main/java/com/carddemo/customer/domain/model/Customer.java`: PR #35 makes field validation reuse the legacy screens' prompt text.
- Documentation: `docs/design/05-api-catalog.md` §7 error code table.

## Dependency analysis of affected locations

**Core dependency chain** (transaction service as the example):

1. Controller input is validated with `@Valid`; on failure `MethodArgumentNotValidException` is thrown and `handleValidation()` (`GlobalExceptionHandler.java:43-50`) turns it into 400, writing each field into `details`.
2. When an application service or domain object assertion fails, `BusinessRuleException` is thrown and `handleBusinessRule()` (`GlobalExceptionHandler.java:25-29`) turns it into 409, passing `code` through unchanged.
3. Outbound calls go through `AccountClient.post()` (`AccountClient.java:65`): a downstream 404 becomes `NotFoundException`, a downstream 409 has its error body parsed and becomes `BusinessRuleException`, and any other non-2xx or `RestClientException` becomes `RemoteServiceException`.
4. `handleRemote()` (`GlobalExceptionHandler.java:31-35`) turns `RemoteServiceException` into `503 DEPENDENCY_UNAVAILABLE`.

**Key types and constants**:

- `BusinessRuleException(code, message)`: a) expresses business assertions only, with no HTTP semantics (`BusinessRuleException.java:1-18`); b) error codes are registered in the error code table.
- `RemoteServiceException`: a) the single carrier for an unavailable downstream; b) constructed only inside the `infrastructure.client` package.
- `ApiError`: a) two factory methods, `of(code, message)` and `of(code, message, details)`; b) identical across all services, so the frontend parses only this one structure.
- Error code examples: `NOTHING_TO_PAY`, `PAYMENT_EXCEEDS_BALANCE`, `CONCURRENT_UPDATE`, `DEPENDENCY_UNAVAILABLE`, `REPORT_REFERENCE_ERROR`.

**Test dependencies**: each service's `*ControllerTest` uses MockMvc to assert the status code and `$.code`; `TransactionControllerTest` simulates an unavailable account service and asserts 503.

## Call trace

```
PostingController.post()                     PostingController.java:43
  └─ PostingService.post()                   PostingService.java:69
       └─ AccountClient.applyPosting()       AccountClient.java:53
            └─ post()                        AccountClient.java:65
                 ├─ HTTP 404  → NotFoundException          → handleNotFound()      404
                 ├─ HTTP 409  → BusinessRuleException      → handleBusinessRule()  409
                 └─ other     → RemoteServiceException     → handleRemote()        503
```

## Other related concepts

**Coding conventions**:
- **Layer responsibilities**: the domain layer does not reference Spring Web types; HTTP status is decided only in `GlobalExceptionHandler`.
- **Stable error codes**: error codes are short upper-case identifiers with underscores; once published they are never renamed, and new ones are registered in the table first.
- **Reuse legacy prompt text**: keep the original prompts when migrating screen validations so business users can compare them.
- **Never swallow exceptions**: a client that catches a low-level exception must wrap and rethrow it, keeping the cause.

**Domain and system knowledge**:
- **Legacy error presentation**: COBOL screens write errors in the message line; the new system carries the same sentence in `message`.
- **Unavailable dependencies**: services call each other synchronously; when a downstream service is down, the upstream returns 503 and the frontend asks the user to retry later.

**Best practices**:
- When adding an outbound client, handle three tiers, "404 / 409 / other", consistent with the existing `AccountClient`.
- Pair every new error code with a controller test that asserts the status code and `code`.
- Do not create a new exception type for a single scenario; prefer reusing the three domain exception types.

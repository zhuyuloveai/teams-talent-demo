# Account Balance Optimistic Lock Update Code Analysis Report

## Repository knowledge layers

This requirement sits in the **account context** of the CardDemo credit card core system (DDD microservices, Maven multi-module). The affected layers are:

> account-service (account context) → application layer (use case orchestration and transaction boundaries) → domain layer (aggregate roots and domain behavior) → infrastructure layer (JPA repository adapter) → database (Flyway migration scripts) → interfaces layer (unified error response)

Concrete locations:

- **application layer**: `AccountApplicationService` (`services/account-service/src/main/java/com/carddemo/account/application/AccountApplicationService.java`): a `@Service @Transactional` use case service that defines the transaction boundary and orchestrates "read aggregate root → change via domain method → save".
- **domain layer**: `Account` (`.../domain/model/Account.java`): the aggregate root entity, with the `@Version` optimistic lock version field and balance change domain methods such as `applyPosting`/`applyBillPayment`/`accrueInterest`/`applyCashback`/`applyDetails`; `AccountRepository` (`.../domain/repository/AccountRepository.java`): the repository port interface.
- **infrastructure layer**: `AccountJpaRepository` (`.../infrastructure/persistence/AccountJpaRepository.java`): the Spring Data adapter implementing the domain repository port; `db/migration/V1__account_schema.sql`: the table creation script, `version BIGINT NOT NULL DEFAULT 0`.
- **interfaces layer**: `GlobalExceptionHandler` (`.../interfaces/rest/GlobalExceptionHandler.java`): `@RestControllerAdvice` that maps `OptimisticLockingFailureException` to HTTP 409 + `CONCURRENT_UPDATE`; `ApiError` (`.../interfaces/rest/ApiError.java`): the unified error response structure; `AccountResponse` (`.../interfaces/rest/dto/AccountResponse.java`): the response DTO, which returns `version` so the client can retry after a conflict.
- **tests**: `AccountTest` (`.../src/test/java/com/carddemo/account/domain/model/AccountTest.java`): plain JUnit unit tests of domain behavior.

## Dependency analysis of affected locations

The dependency direction follows the repository standard `interfaces → application → domain ← infrastructure` (dependency inversion; the domain does not depend on frameworks).

| Dependency | Type | Reason and mechanism |
|---|---|---|
| `AccountApplicationService` → `AccountRepository` | Port call | The application service gets `AccountRepository accounts` through constructor injection (`AccountApplicationService.java:30-36`) and calls `findByAccountId` / `saveAccount` inside the transaction to read-modify-write |
| `AccountApplicationService` → `Account` | Domain method call | After `getById` returns an `Account`, methods such as `account.applyPosting(amount)` are called (`AccountApplicationService.java:56-72`); the domain change happens inside the transaction |
| `AccountApplicationService` → `NotFoundException` | Exception dependency | `orElseThrow(() -> new NotFoundException("ACCOUNT_NOT_FOUND", ...))` in `getById` (`AccountApplicationService.java:40-42`) |
| `Account` → `BusinessRuleException` | Exception dependency | Domain methods throw `BusinessRuleException("CODE", "message")` when validation fails (e.g. `NOTHING_TO_PAY` in `applyBillPayment`, `Account.java:189`) |
| `Account` → JPA annotations | Framework dependency | `@Entity @Table(name = "account") @Version @Column(name = "version")` (`Account.java:111-156`); `@Version` is the core trigger of optimistic locking |
| `AccountJpaRepository` → `AccountRepository` | Interface implementation/inheritance | `interface AccountJpaRepository extends JpaRepository<Account, String>, AccountRepository`, with `default` methods bridging the domain port methods to Spring Data methods (`findByAccountId→findById`, `saveAccount→save`, `findAllAccounts→findAll`) (`AccountJpaRepository.java:346-362`) |
| `GlobalExceptionHandler` → `OptimisticLockingFailureException` | Exception handling | The exception Spring Data JPA throws at flush on a version conflict, caught by an `@ExceptionHandler` (`GlobalExceptionHandler.java:60-65`) |
| `GlobalExceptionHandler` → `ApiError` | Response assembly | `ApiError.of("CONCURRENT_UPDATE", "Record changed by some one else. Please review")` builds the unified error body |
| `AccountResponse` → `Account` | Static factory call | `AccountResponse.from(account)` copies all fields and returns `account.getVersion()` (`AccountResponse.java:95-110`), so the client holds the latest version number |
| `Account` ↔ `V1__account_schema.sql` | Table-entity mapping | The entity field `version` maps to the DDL `version BIGINT NOT NULL DEFAULT 0` (`V1__account_schema.sql:382`); the constructor's `this.version = 0` supplies the entity default, keeping new objects consistent with rows in the database |
| `AccountController` → `AccountApplicationService` | Call | REST endpoints (PUT/POST posting, payment, interest, cashback) delegate to the application service (`AccountController.java:47-79`) |

## Call trace

The full call flow, using "balance posting (POST /api/v1/accounts/{id}/postings)" as the example:

```
AccountController.post(accountId, PostingRequest)
  └─ AccountApplicationService.applyPosting(accountId, amount)      [@Transactional transaction starts]
       ├─ AccountApplicationService.getById(accountId)
       │    └─ AccountRepository.findByAccountId → AccountJpaRepository.findById
       │         └─ not found → NotFoundException → GlobalExceptionHandler.handleNotFound → 404
       ├─ Account.applyPosting(amount)                               [domain method changes currentBalance/currentCycleCredit]
       └─ AccountRepository.saveAccount(account) → JpaRepository.save
            └─ flush at commit: UPDATE account SET ... WHERE account_id=? AND version=?
                 ├─ affected rows=1 → commit succeeds, version increments, AccountResponse returns the new version
                 └─ affected rows=0 → OptimisticLockingFailureException
                      └─ GlobalExceptionHandler.handleOptimisticLock → 409 {"code":"CONCURRENT_UPDATE",...}
```

All update operations (`update`/`applyPosting`/`applyBillPayment`/`accrueInterest`/`creditCashback`) follow the same "read-modify-write" call pattern; `creditCashback` additionally checks `RewardCreditRepository.existsByRewardId` first for idempotency (`AccountApplicationService.java:77-87`).

## Requirement classification

This is a **concurrency safety refactoring/new feature** requirement: introduce optimistic locking for account balance updates. In essence it migrates the legacy mainframe (CICS) concurrency model of "record lock + manual snapshot comparison" to version-based optimistic concurrency detection in a web/microservice architecture (ADR-006, accepted), together with a unified error response. Underneath it touches three cross-cutting points: the database version field, transaction boundaries and global exception handling.

## Example usage context

- **When it is used**: any REST request that modifies the `account` aggregate root (account maintenance PUT; posting/payment/interest/cashback POST). All these endpoints can be triggered concurrently by several clients, for example the same account being processed at the same time by a batch posting job, a repayment request and a marketing cashback task.
- **Why it matters**: amount fields such as balance and credit limit cannot be merged automatically (if operation A adds 50 and operation B changes the limit, concurrent write-backs overwrite each other). Optimistic locking ensures that when "the last writer updates from a stale snapshot", the write is rejected with a prompt to retry instead of silently overwriting.
- **Usage example**:
  ```json
  // Request: POST /api/v1/accounts/00000000003/postings  {"amount": 10.00}
  // Success response 200: {..., "currentBalance": 1950.00, "version": 1}
  // Conflict response 409: {"code":"CONCURRENT_UPDATE","message":"Record changed by some one else. Please review","details":[]}
  ```
- **Legacy background**: the legacy program `COACTUPC.cbl:4109-4191` takes a record lock with `READ ... UPDATE` and compares each field against the screen snapshot on save, showing `Record changed by some one else. Please review` when they differ (this text is kept verbatim in this implementation). Web/microservices cannot hold a database lock across the user's think time, so ADR-006 decided to switch to optimistic locking.

## Root cause analysis (how)

- **Why the concurrency model had to change**: the legacy record lock relies on long CICS transactions, with the lock held across the user's think time; a microservice architecture has no long transactions, and database locks significantly reduce throughput and deadlock easily. ADR-006 weighed three options (JPA @Version optimistic locking / SELECT FOR UPDATE pessimistic locking / field-level merge + audit) and chose A: low implementation cost, no lock waiting, version numbers traceable for audit, and database independent (PostgreSQL and H2 behave the same, which helps testing).
- **Why these files were changed**:
  - `Account.java` adds `@Version`: Hibernate uses it to generate an UPDATE with `WHERE version=?` and throws `OptimisticLockingFailureException` on conflict. This is the only trigger of the optimistic locking mechanism and must be on the aggregate root entity.
  - `V1__account_schema.sql` adds `version BIGINT NOT NULL DEFAULT 0`: the DDL and the entity must match (`ddl-auto: validate`, see `application.yml:17`; a mismatch fails startup).
  - `GlobalExceptionHandler` adds a handler: an unhandled `OptimisticLockingFailureException` becomes a 500, so it must be mapped to 409 so callers understand the "retry needed" semantics.
  - `AccountResponse` returns `version`: the client needs the latest version number to retry with it (or the frontend prompts a refresh).
- **Environment constraints**: Spring Boot 3.3.6 + JPA (Hibernate), Flyway migrations, running on both PostgreSQL and H2 (`ddl-auto: validate` in `application.yml` forces the table structure to match the entities); JDK 21, `BigDecimal`/`LocalDate` conventions for amounts and dates; tests use an H2 in-memory database + Flyway migrations + seed data (`application-test.yml`, V2 seed).

## Current and expected behavior

- **Before**: on concurrent updates, two transactions based on the same old snapshot commit one after the other and the later one silently overwrites the earlier (lost update); there is no error response, and framework exceptions surface directly as 500.
- **After**:
  - Every account aggregate root carries a version number; saving runs `UPDATE ... WHERE version=?`, and a version mismatch throws `OptimisticLockingFailureException` and rolls back the transaction.
  - The global exception handler translates it to 409 `CONCURRENT_UPDATE`, reusing the legacy prompt text.
  - Responses return `version`, supporting the "conflict → read again → retry" loop.
- **Distinctive aspects (easily overlooked)**:
  1. The version conflict is thrown only **at flush/commit**, not when `save()` is called, so the application service method appears to return normally and the exception surfaces at the transaction boundary, caught by the global handler; business code needs no try-catch.
  2. For an `@Version` entity, Hibernate decides new/merge semantics on `save()`; here every operation first calls `findById` in the same transaction (getting a managed entity) and then changes it, so `save` takes the merge path and `WHERE version=?` applies.
  3. The `version` of new objects must match the DDL `DEFAULT 0`: the constructor sets `this.version = 0` (`Account.java:165`), otherwise rows inserted by Hibernate would have a version that does not match the database default.
  4. Idempotent writes (`creditCashback`) work together with optimistic locking: first deduplicate via `reward_credit`, then change the balance; even if two cashback requests run concurrently, the unique primary key of the reward table plus the account row's version prevent a double reduction.
  5. The repository standard requires "every aggregate table carries version" (`07-java-conventions.md` §6). The same pattern appears in the entities and `GlobalExceptionHandler` of all 7 services in the repository (iam/customer/card/account/transaction/authorization/marketing), showing that it is a repository-wide baseline rather than a one-off for a single service.

## Requirement implementation logic (how/why)

**Implementation locations and responsibilities**:

- `Account.java` (new, `domain/model`): the aggregate root. `@Version private long version` (lines 154-156) triggers optimistic locking; the balance change domain methods `applyPosting`/`applyBillPayment`/`accrueInterest`/`applyCashback` express the business rules in one place (BR-POST-006, BR-BILL-001/002, BR-INT-001, NR-REWARD-01) and throw `BusinessRuleException` on failure. Rich domain model: change logic lives on the entity, not as piles of setters in a service (repository standard §3).
- `AccountApplicationService.java` (new, `application`): `@Service @Transactional`, where the transaction boundary lives; methods such as `update`/`applyPosting` all follow the three steps "`getById` → domain method → `saveAccount`", and `@Transactional(readOnly = true)` is used for queries.
- `AccountJpaRepository.java` (new, `infrastructure/persistence`): Spring Data interface + domain port implementation, bridged with `default` methods, so the repository adapter does not intrude on the domain.
- `V1__account_schema.sql` (new, `resources/db/migration`): creates the table with `version BIGINT NOT NULL DEFAULT 0`; the `group_id` index supports queries by group.
- `GlobalExceptionHandler.java` (new, `interfaces/rest`): `@RestControllerAdvice` with four handlers: 404 (NotFoundException), 409 (BusinessRuleException), 400 (MethodArgumentNotValidException field validation details), 409 (OptimisticLockingFailureException → CONCURRENT_UPDATE).
- `ApiError.java` (new): `record ApiError(String code, String message, List<String> details)` + `of` factory; the unified error body structure (`07-java-conventions.md` §4 defines the JSON shape).
- `AccountResponse.java` (new): `record` response DTO with a `from(Account)` factory, including the `version` field in the response.
- `AccountTest.java` (new, `src/test`): plain JUnit + AssertJ domain unit tests covering the direction of balance changes, business rule rejection paths and error codes.

**Non-code files**: none (the application's `ddl-auto: validate` in `application.yml` and Flyway already support this pattern; no configuration was added).

**Call relations**: new REST endpoint → application service → domain method → repository port → JPA adapter → database; exceptions all exit through `GlobalExceptionHandler`.

## Concrete implementation steps

1. **Add the optimistic lock version field to the entity**: add `@Version @Column(name = "version", nullable = false) private long version` to the aggregate root `Account` and initialize `version = 0` in the constructor. `@Version` is the trigger of Hibernate optimistic locking; afterwards `save` automatically generates an UPDATE with a version condition. Code: `Account.java:154-156, 165`.
2. **Add the version column in the DDL**: `version BIGINT NOT NULL DEFAULT 0` in `V1__account_schema.sql`. Because of `ddl-auto: validate`, a mismatch between the entity and the table structure fails startup; `DEFAULT 0` matches the entity's initial value so new rows have a consistent version. Code: `V1__account_schema.sql:382`.
3. **Express balance changes with domain methods (rich domain model)**: `applyPosting` (`amount.signum()` decides between the cycle credit/debit totals), `applyBillPayment` (three checks: amount > 0, an amount is owed, not exceeding it), `accrueInterest` (posts and resets the cycle totals), `applyCashback` (reduces the balance, which may go negative). Business rule failures throw `BusinessRuleException("CODE", ...)`. Code: `Account.java:171-218`.
4. **The application service defines the transaction boundary and orchestrates read-modify-write**: class-level `@Transactional`, with query methods overriding it with `@Transactional(readOnly = true)`; change methods follow the three steps "`getById` → domain method → `saveAccount`". All balance changes complete within a single transaction, ensuring atomicity. Code: `AccountApplicationService.java:26-27, 38-48, 50-72`.
5. **Bridge the repository port and the adapter**: `AccountRepository` (domain port, `findByAccountId`/`saveAccount`/`findAllAccounts`) + `AccountJpaRepository extends JpaRepository<Account, String>, AccountRepository` mapped with `default` methods, keeping dependency inversion (the domain does not depend on Spring Data). Code: `AccountRepository.java:11-18`, `AccountJpaRepository.java:346-362`.
6. **Unified exception response**: the `ApiError` record defines the error body (code/message/details); `GlobalExceptionHandler` uses `@RestControllerAdvice` to handle NotFound→404, BusinessRule→409, validation→400 and `OptimisticLockingFailureException`→409 + `CONCURRENT_UPDATE` (reusing the legacy prompt text). Code: `ApiError.java:11-16`, `GlobalExceptionHandler.java:37-65`.
7. **Return the version in responses**: `AccountResponse` has a `version` field and `from(Account)` copies `account.getVersion()`, so the caller gets the latest version to support the retry loop. Code: `AccountResponse.java:80-110`.
8. **Unit tests for domain behavior**: plain JUnit + AssertJ covering the numeric direction of balance changes and each business rule rejection path (asserting the exception `code`, not the message text). Code: `AccountTest.java:27-101`.

## Requirement implementation checklist

- [ ] Does the aggregate root have `@Version`? Does the `version` field match the DDL's `BIGINT NOT NULL DEFAULT 0` (under `ddl-auto: validate` a mismatch fails startup immediately)?
- [ ] Do new entities initialize `version = 0` in the constructor, matching `DEFAULT 0`?
- [ ] Do change methods complete "read-modify-write" within the **same transaction**? Is the transaction boundary in the application service (`@Transactional`), not in the controller or repository?
- [ ] Did you remember that the conflict exception is thrown **at flush/commit** (not when save is called)? Business code needs no try-catch, but the global handler must catch `OptimisticLockingFailureException`.
- [ ] Does the global exception handler map optimistic lock conflicts to **409** (instead of letting them become 500)? Does the error code use the uniform `CONCURRENT_UPDATE` or the repository's established error code?
- [ ] Does the response DTO return `version`? Does the frontend/caller need to retry with the version number?
- [ ] Are query methods annotated with `@Transactional(readOnly = true)`?
- [ ] Are amounts `BigDecimal`, compared with `signum()`/`compareTo()` (no `double`, no `==`)?
- [ ] Are legacy business rules expressed as `BusinessRuleException("CODE", ...)`, and are the error codes traceable (BR-/R-/NR- IDs)?
- [ ] Were domain behavior unit tests added (asserting error codes, not logs/implementation details)?
- [ ] Is there an idempotency need (such as cashback posting)? Has the idempotency table + unique key + check-before-write inside the transaction been verified together with optimistic locking?
- [ ] Has the consistency of this pattern been checked against other services in the same repository (iam/customer/card/transaction/authorization/marketing in this repository all have the same `@Version` + 409 handling)?

## Summary

This requirement brings "Account Balance Optimistic Lock Update" to account-service: it migrates the legacy CICS concurrency control of "record lock + snapshot comparison" (`COACTUPC.cbl`) to JPA `@Version` optimistic locking (the ADR-006 decision). The implementation spans all DDD layers: the aggregate root `Account` adds the `@Version` field and expresses domain behavior such as posting/repayment/interest/cashback in one place; `AccountApplicationService` defines the transaction boundary with `@Transactional` and orchestrates "read-modify-write"; `AccountJpaRepository` bridges the domain repository port with `default` methods; the Flyway `V1` table creation adds `version BIGINT NOT NULL DEFAULT 0`; `GlobalExceptionHandler` maps concurrency conflicts to 409 `CONCURRENT_UPDATE` (reusing the legacy prompt text); `AccountResponse` returns the version number to support the conflict retry loop; `AccountTest` covers domain behavior and rule rejection paths. The pattern matches the baseline in the repository's `07-java-conventions.md` §6 and recurs in all 7 microservices, making it a repository-wide general development pattern.

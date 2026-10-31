# Account Balance Optimistic Lock Update: Development Pattern Summary

> General scenario: implement optimistic locking for account balance updates, including an entity version field, balance changes inside a transaction, and a unified error response for concurrent update conflicts.

## 1. Implementation steps

### Step 1: Add an optimistic lock version field to the aggregate root entity

**Implementation logic**: on the aggregate root entity that carries the balance updates (such as `Account`), declare a long field annotated with `@Version` and map it to the database `version` column. `@Version` is the trigger for JPA/Hibernate optimistic locking: once the entity is managed, Hibernate generates a versioned UPDATE on `save` (`WHERE id=? AND version=?`), and when a concurrent modification leaves 0 affected rows it throws `OptimisticLockingFailureException` and the whole transaction rolls back.

**Standards and constraints**:

- Use `long` for the version field, not `Long`/`Integer`, mapped to database `BIGINT`.
- The field must have `@Column(name = "version", nullable = false)`, exactly matching the DDL column name.
- New objects must explicitly initialize `version = 0` in the constructor, matching the column's `DEFAULT 0`, so inserted rows do not get a mismatched version.

**Notes**:

- The conflict exception is thrown **at flush/commit**, not when `save()` is called; business code does not need try-catch, but the global exception handler must catch it.
- Changes must load the entity first (to get a managed entity) and then modify it **within the same transaction**, so that `save` takes the merge path with the version condition; otherwise it degrades into inserting a new row or an unconditional update.
- After saving an `@Version` entity the version number increments automatically; what is returned to the caller must be the incremented new value.

**Historical reference code** (generalized):

```java
@Entity
@Table(name = "<aggregate_table>")
public class <AggregateRoot> {
    @Version
    @Column(name = "version", nullable = false)
    private long version;

    public <AggregateRoot>(<Id> id, ...) {
        ...
        this.version = 0;
    }
}
```

**Reference files**: `Account.java` (new file, content start line 154, end line 156; constructor initialization line 165).

### Step 2: Add the version column in the database migration script

**Implementation logic**: in the table creation migration script (`V*__schema.sql`), add a `version` column to the aggregate table, `BIGINT NOT NULL DEFAULT 0`. The entity and the DDL must match, because the repository configures `ddl-auto: validate`, which checks both at startup and fails to start if they differ.

**Standards and constraints**:

- The column is always defined as `version BIGINT NOT NULL DEFAULT 0`.
- Manage it with versioned Flyway scripts (`src/main/resources/db/migration`); do not rely on Hibernate auto DDL.
- Seed data scripts must set the `version` column to 0 explicitly, so existing rows match the initial version of new entities.

**Notes**:

- If `ddl-auto` is `validate`, adding an `@Version` field to the entity requires **committing the migration script together**, otherwise the service cannot start.
- If a seed INSERT omits `version` from its column list, it relies on `DEFAULT 0`; listing it explicitly is recommended for readability.

**Historical reference code** (generalized):

```sql
CREATE TABLE <aggregate_table> (
    ...,
    version BIGINT NOT NULL DEFAULT 0
);
```

**Reference files**: `V1__account_schema.sql` (new file, content start line 369, end line 383; the `version` column is on line 382).

### Step 3: Implement balance change behavior on the entity

**Implementation logic**: implement the balance change rules as domain methods on the aggregate root (rich domain model), such as `applyPosting(amount)`, `applyBillPayment(amount)` and `accrueInterest(amount)`. Each method performs the business rule checks (amount sign, whether there is an amount owed, whether it is exceeded) and the field changes; a rule failure throws the domain exception `BusinessRuleException("CODE", "message")`. Rules and error codes can be traced to legacy business rule IDs (such as BR-POST-006).

**Standards and constraints**:

- Domain behavior lives on the entity; do not pile setters into a service (repository Java conventions §3).
- Amounts are always `BigDecimal`; use `signum()`/`compareTo()` to check sign and size; `double` and `==` comparisons are forbidden.
- Validation failures always throw `BusinessRuleException(code, message)`, with `code` as an upper snake case error code.
- Null parameters throw via `Objects.requireNonNull` or the same kind of business exception; never handle them silently.

**Notes**:

- Update balance fields by reassigning `currentBalance.add/subtract(...)`; do not use `+=` (BigDecimal is immutable).
- Operations that reset accumulated values (such as interest posting resetting the cycle credit/debit totals) do so inside the domain method, keeping the aggregate consistent.
- Validation and change must happen atomically: a failed validation throws and rolls back the whole transaction.

**Historical reference code** (generalized):

```java
public void apply<BizAction>(BigDecimal amount) {
    // 1. Rule check: if not met, throw new BusinessRuleException("CODE", "message");
    // 2. Field change: currentBalance = currentBalance.add/subtract(amount); ...
}
```

**Reference files**: `Account.java` (new file; `applyPosting` lines 171-179, `applyBillPayment` lines 184-196, `accrueInterest` lines 201-206, `applyCashback` lines 212-218).

### Step 4: The application service defines the transaction boundary and orchestrates "read-modify-write"

**Implementation logic**: create a use case application service (`@Service`) with class-level `@Transactional` to define the transaction boundary; query methods override it with `@Transactional(readOnly = true)`. Each change method follows the same three steps: `getById(accountId)` (read the aggregate root; throw `NotFoundException` if not found) → call the domain method to change state → persist with `saveAccount(account)`. All operations fall within the same transaction, ensuring atomicity and version consistency.

**Standards and constraints**:

- The transaction boundary sits in the **application service** layer, not in the controller or repository (repository layering standard: `interfaces → application → domain ← infrastructure`).
- Class-level `@Transactional` + method-level `readOnly = true` for queries.
- Inject repository ports through the constructor (`private final` fields), not field injection.
- Read the aggregate root through a repository port method and `orElseThrow` a domain exception.

**Notes**:

- Change methods **must** read, modify and save within the same transaction; if the read and write are in separate transactions, optimistic locking will conflict frequently because of stale versions.
- Idempotent writes (such as postings deduplicated by business key) should also do "check for duplicates → change → record the idempotency entry" inside this transaction, working with optimistic locking to prevent duplicates.
- Do not put `@Transactional` on domain entities or repository interfaces: the transaction is a property of the application service's use case.

**Historical reference code** (generalized):

```java
@Service
@Transactional
public class <Entity>ApplicationService {
    private final <Entity>Repository repository;

    public <Entity> apply<BizAction>(String id, BigDecimal amount) {
        <Entity> entity = getById(id);
        entity.apply<BizAction>(amount);
        return repository.saveAccount(entity);
    }

    @Transactional(readOnly = true)
    public <Entity> getById(String id) {
        return repository.findByAccountId(id)
                .orElseThrow(() -> new NotFoundException("NOT_FOUND", "..."));
    }
}
```

**Reference files**: `AccountApplicationService.java` (new file; class-level annotations lines 26-27; `getById` lines 38-43; `applyPosting` lines 56-60, `applyBillPayment` lines 62-66, `accrueInterest` lines 68-72, `creditCashback` lines 77-87).

### Step 5: Bridge the repository port and the JPA adapter

**Implementation logic**: define the repository port interface in the domain layer (a plain interface with no framework dependency: `findByAccountId`/`saveAccount`/`findAllAccounts`), and implement and bridge it with a Spring Data interface in the infrastructure layer: `AccountJpaRepository extends JpaRepository<Account, String>, AccountRepository`, using `default` methods to map the domain method names to the built-in Spring Data methods (`findById`/`save`/`findAll`). This keeps dependency inversion: the domain is unaware of the persistence framework.

**Standards and constraints**:

- Repository ports go in `domain/repository`, implementations in `infrastructure/persistence`.
- The adapter interface extends both `JpaRepository<entity, primary key>` and the domain port, with `default` methods bridging the method names, so no framework annotations are introduced on the domain interface.
- One aggregate root has one repository port and one JPA adapter.

**Notes**:

- Keep bridge method names distinct from Spring Data derived query semantics; `findByAccountId` bridges to `findById`, not to a derived query of the same name.
- Do not write an implementation class for the port interface; the Spring Data interface proxy is enough.

**Historical reference code** (generalized):

```java
// domain/repository
public interface <Entity>Repository {
    Optional<<Entity>> findBy<IdName>(String id);
    <Entity> save<Entity>(<Entity> entity);
    List<<Entity>> findAll<Entities>();
}

// infrastructure/persistence
public interface <Entity>JpaRepository extends JpaRepository<<Entity>, String>, <Entity>Repository {
    @Override
    default Optional<<Entity>> findBy<IdName>(String id) { return findById(id); }
    @Override
    default <Entity> save<Entity>(<Entity> entity) { return save(entity); }
    @Override
    default List<<Entity>> findAll<Entities>() { return findAll(); }
}
```

**Reference files**: `AccountRepository.java` (new file, lines 11-18); `AccountJpaRepository.java` (new file, lines 346-362).

### Step 6: Unified exception handling: map optimistic lock conflicts to 409

**Implementation logic**: define a unified error body `ApiError(code, message, details)` (record + static factory), and use a `@RestControllerAdvice` global exception handler to map each kind of exception to HTTP semantics: `NotFoundException` → 404, `BusinessRuleException` → 409, parameter validation `MethodArgumentNotValidException` → 400 (details collects the field errors), `OptimisticLockingFailureException` → 409 + the `CONCURRENT_UPDATE` error code. The optimistic lock conflict message reuses the legacy system's prompt (such as "Record changed by some one else. Please review"), keeping the meaning and users' habits consistent.

**Standards and constraints**:

- The error body always has the structure `{"code": "...", "message": "...", "details": [...]}` (repository REST conventions §4).
- Fixed HTTP semantics: 404 not found, 409 business rule conflict, 400 validation failure, 409 concurrency conflict.
- The conflict error code is uniform (such as `CONCURRENT_UPDATE`) across the whole repository.
- `@RestControllerAdvice` handlers have one method per exception type, not a giant if-else.

**Notes**:

- `OptimisticLockingFailureException` is a runtime exception that Spring Data throws at flush; it **must** be caught by the global handler, otherwise the client gets a 500 with no retry semantics.
- Validation failures must collect field details into `details` so callers can locate the problem; map `bindingResult.getFieldErrors()` with a stream.
- Error codes are upper snake case, stable and documentable (matching the rules catalog/API docs).

**Historical reference code** (generalized):

```java
@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ResponseEntity<ApiError> handleOptimisticLock(OptimisticLockingFailureException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ApiError.of("CONCURRENT_UPDATE",
                        "Record changed by some one else. Please review"));
    }
}
```

**Reference files**: `ApiError.java` (new file, lines 11-16); `GlobalExceptionHandler.java` (new file, lines 36-65; optimistic lock handler lines 60-65).

### Step 7: The response DTO returns the version to close the retry loop

**Implementation logic**: the response DTO (record) contains a `version` field, and the static factory `from(entity)` copies all entity fields and carries `account.getVersion()`. The client gets the latest version number and, after a conflict, can close the loop with "read again → retry with the new version", or ask the user to refresh.

**Standards and constraints**:

- Request/response DTOs use Java `record` (repository REST conventions §4).
- Returning the version in the response is part of the optimistic locking API contract and cannot be omitted.
- The factory method `from(entity)` does the entity → DTO mapping in one place; controllers do not copy fields by hand.

**Notes**:

- If update requests may carry an expected version for a pre-check, declare it in the request DTO as well and compare it in the application service (this case uses the "read the latest version inside the transaction" mode; the version is only used for responses and retries).
- Amount fields stay numeric in the DTO (`1940.00`) and times are ISO-8601 strings, following the repository's serialization conventions.

**Historical reference code** (generalized):

```java
public record <Entity>Response(<Id> id, ... , long version) {
    public static <Entity>Response from(<Entity> entity) {
        return new <Entity>Response(entity.getId(), ..., entity.getVersion());
    }
}
```

**Reference files**: `AccountResponse.java` (new file, lines 80-110; `version` component line 93; factory lines 95-110).

### Step 8: Unit tests for domain behavior

**Implementation logic**: write plain JUnit (no Spring context) unit tests with AssertJ assertions for the aggregate root's domain methods, covering the numeric direction of each kind of balance change (the effect of positive/negative amounts on the balance/cycle totals), business rule rejection paths (assert that `BusinessRuleException` is thrown with the right `code`), and parameter boundaries. At the controller layer, `@SpringBootTest` + MockMvc + H2 end-to-end cases add verification of error codes and HTTP status.

**Standards and constraints**:

- Domain unit tests assert business rules and error codes, not logs or implementation details (repository testing conventions §7).
- Amount assertions use `isEqualByComparingTo(...)` (BigDecimal comparison, not `equals`/`==`).
- Exception assertions use AssertJ `assertThatThrownBy(...).isInstanceOf(...).extracting("code")...`.
- Every service has at least "domain unit tests + one @SpringBootTest/MockMvc end-to-end case" (H2 + Flyway migrations + seed data).

**Notes**:

- End-to-end cases depend directly on the seed data's accounts and initial versions; be aware that earlier cases may have changed an account's balance.
- Simulating the concurrency conflict path end to end is costly; domain/repository layer tests can replace it. If simulation is needed, commit two transactions concurrently and verify that the second fails.

**Historical reference code** (generalized):

```java
@Test
void <action>UpdatesBalanceAndCycleTotals() {
    Account account = new Account("<id>", details("<balance>"));
    account.apply<BizAction>(new BigDecimal("50.25"));
    assertThat(account.getCurrentBalance()).isEqualByComparingTo("150.25");
}

@Test
void <action>Rejects<RuleViolation>() {
    assertThatThrownBy(() -> account.apply<BizAction>(...))
            .isInstanceOf(BusinessRuleException.class)
            .extracting("code").isEqualTo("RULE_CODE");
}
```

**Reference files**: `AccountTest.java` (new file; test helper lines 20-25; posting cases lines 27-36, 39-47; rejection path cases lines 50-65, 79-89, 92-101).

## 2. Other concepts and best practices

- **Optimistic concurrency control (OCC)**: assumes conflicts are rare and checks the version at commit. Compared with pessimistic locking (`SELECT FOR UPDATE`) there is no lock waiting, deadlocks are unlikely, and it is database independent. Hot accounts with high conflict rates can fall back to short row-lock transactions for single-account posting (the ADR-006 fallback path), while everything else keeps optimistic locking.
- **Lost update problem**: without concurrency control, two transactions based on the same snapshot commit one after the other and the later one silently overwrites the earlier. Optimistic locking makes the second commit fail instead of overwriting, a required safeguard for non-mergeable fields such as balances and credit limits.
- **Transactions and entity lifecycle**: `@Version` conflicts are thrown at flush/commit, so the transaction boundary design must keep read, modify and write in the same transaction, with the global exception handler as the safety net, leaving business code clean.
- **Rich domain model and domain exceptions**: business rules are cohesive inside aggregate root methods, with failures expressed as `BusinessRuleException(code, message)`; error codes can be traced to legacy rule IDs (BR-/R-/NR-), supporting audit and documentation.
- **Dependency inversion and layering**: the domain defines repository ports and the infrastructure implements them with Spring Data; dependency direction `interfaces → application → domain ← infrastructure`; apart from JPA annotations, the domain depends on no framework details such as Spring Web.
- **Modeling amounts and dates**: amounts are always `BigDecimal` (DB `NUMERIC(12,2)`), dates `LocalDate`, timestamps `LocalDateTime`; legacy identifiers are zero-padded strings (accountId is 11 digits, etc.), and `long` is forbidden because it loses leading zeros.
- **Strict consistency between DDL and entities**: under `ddl-auto: validate`, a new entity column requires a matching Flyway migration script or startup fails; migration scripts are the single authority for the table structure.
- **Idempotency working with concurrency control**: cross-service scenarios such as posting/cashback implement idempotency with "a unique business key table + check for duplicates before writing inside the transaction"; when combined with optimistic locking, the retrying side should read the latest version again.
- **Observability and operations**: services expose the `/actuator/health` probe; logs never print sensitive fields such as card numbers, SSNs or passwords; the version conflict error code is stable and can be consumed by monitoring and alerting.

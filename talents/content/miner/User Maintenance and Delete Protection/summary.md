# User Maintenance and Delete Protection: Development Pattern Summary

> General scenario: implement creating, updating and deleting users, including user type validation, password hashing, no self-deletion, and keeping the last admin.

## 1. Implementation steps

### Step 1: Define the aggregate root entity and value object, and centralize field validation

**Implementation logic**: create an `@Entity` aggregate root (such as `User`) for the maintained domain object, with fields mapped one to one to the database table (the primary key is the business key, fixed-length string identifiers, an `@Version` optimistic lock column); group the maintainable fields into a value object record (such as `UserDetails`). All field-level business validation (identifier format, maximum length, enum values, trim normalization) is written as private `require*` methods inside the aggregate root's constructor and update methods; services no longer pile up setters. For fields that are "normalized before comparison" (such as user ID trim + upper case), provide a static normalization method that several use cases, such as login and maintenance, can reuse.

**Standards and constraints**:

- Rich domain model: validation and change behavior live on the entity; all entity fields are private and behavior is exposed through public methods (repository Java conventions §3).
- Identifiers keep the legacy fixed-length string: for example user ID `VARCHAR(8)`, regex `^[A-Z0-9]{8}$`; never switch to `long`, which would lose leading zeros.
- Explicitly initialize `version = 0` in the entity constructor, aligned with the DDL `DEFAULT 0` (ADR-006 optimistic locking baseline).
- Value objects are Java records whose fields mirror the request DTO; they carry data from DTO to aggregate root.

**Notes**:

- Normalize with `toUpperCase(Locale.ROOT)` rather than the default locale, to avoid case pitfalls such as `i → İ` in a Turkish locale.
- Apply normalization only to identifiers and enums, **not** to passwords (passwords are trimmed as is and hashed, see the ADR-008 case).
- On validation failure, throw a domain validation exception (`ValidationException(field, message)`, with details as a list of `field: message`); do not return error codes or booleans from the entity.
- Enums (such as user type A/U) are trimmed, upper-cased and then checked against a strict allowlist; a non-empty check alone is not enough (the legacy non-empty-only check was a defect, which this pattern fixes).

**Generalized reference code**:

```java
@Entity
@Table(name = "<table>")
public class <AggregateRoot> {
    public static final String TYPE_<X> = "X";

    @Id
    @Column(name = "<id>", length = <n>, nullable = false, updatable = false)
    private String <id>;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected <AggregateRoot>() { /* for JPA */ }

    public <AggregateRoot>(String <id>, <Details> details, ...) {
        this.<id> = require<Id>(<id>);
        applyDetails(details);
        this.version = 0;
    }

    /** Normalize before comparison: trim + upper case */
    public static String normalize<Id>(String raw) {
        return raw == null ? null : raw.trim().toUpperCase(Locale.ROOT);
    }

    public void applyDetails(<Details> details) {
        // assign after field-by-field validation such as requireName / requireType
    }

    private static String require<Id>(String raw) {
        String normalized = normalize<Id>(raw);
        if (normalized == null || !PATTERN.matcher(normalized).matches()) {
            throw new ValidationException("<id>", "<Id> must ...");
        }
        return normalized;
    }
}
```

**Reference files**: `User.java` (new file, content from line 137 to line 291; `normalizeUserId` lines 203-205, `applyDetails` lines 210-217, `requireUserId` lines 240-246), `UserDetails.java` (new file, lines 297-304).

### Step 2: Define and implement the password hashing port; passwords are never stored in plain text

**Implementation logic**: declare a hashing port in the domain layer (two methods, `hash`/`verify`) so the algorithm decision is isolated behind the port; implement it in the infrastructure layer with the JDK's built-in `SecretKeyFactory("PBKDF2WithHmacSHA256")`: a 16-byte salt per user from `SecureRandom`, 210000 iterations, encoded in a self-contained format `pbkdf2$<iterations>$<saltBase64>$<hashBase64>` (verify parses the iteration count and salt from the encoded string and compares with `MessageDigest.isEqual` in constant time to prevent timing side channels). The use case service calls `hash(requirePassword(raw))` before writing to the database; the entity only stores/receives the hashed value.

**Standards and constraints**:

- Password length and whitespace rules are centralized in the application layer (such as `requirePassword`: check for empty → trim → then check 8-64 characters, so pure whitespace cannot pass the length check).
- Entities and response DTOs must not have a plain-text password field; response DTOs do not even expose the hash field (data minimization).
- Prefer JDK built-in hashing algorithms and avoid adding a security framework dependency (the background of this project's ADR-008 decision).
- Clear the in-memory copy of the key spec (`PBEKeySpec`) with `clearPassword()` after use.

**Notes**:

- When the password is "optional" on update, use `password == null` (not an empty string) to mean "keep the existing hash", and call `changePassword` only when it is not null.
- Login and maintenance share the same `verify`/normalization semantics so the two sides do not drift apart (login in this project also trims the password).
- Seed data (Flyway INSERT) contains only pre-generated hashes; comments may note the demo plain text, but no plain text may be in the database.

**Generalized reference code**:

```java
public interface PasswordHasher {
    String hash(String rawPassword);
    boolean verify(String rawPassword, String encodedPassword);
}

@Component
public class Pbkdf2PasswordHasher implements PasswordHasher {
    public String hash(String rawPassword) {
        byte[] salt = new byte[SALT_BYTES]; random.nextBytes(salt);
        byte[] derived = derive(rawPassword, salt, ITERATIONS);
        return PREFIX + SEPARATOR + ITERATIONS + SEPARATOR
                + encoder.encodeToString(salt) + SEPARATOR + encoder.encodeToString(derived);
    }
    // verify: parse the encoded string → derive → constant-time comparison with MessageDigest.isEqual
}
```

**Reference files**: `PasswordHasher.java` (new file, lines 340-356), `Pbkdf2PasswordHasher.java` (existing file, lines 1-72; encoding format comment lines 14-17, `hash` lines 31-38, `verify` lines 41-58).

### Step 3: Define the repository port and implement it with a Spring Data JPA adapter

**Implementation logic**: declare a plain repository interface in the domain layer (listing the methods the use cases need: find by business key, existence check, save, paginated list, count, delete) with no framework types; in the infrastructure layer, make the Spring Data interface extend both `JpaRepository` and the domain port, bridging domain methods to the Spring Data API (`findById`/`save`/`count`/`deleteById`) with default methods. Query conditions (sorting, pagination) are written in the adapter layer (such as `PageRequest.of(page, size, Sort.by(ASC, "<id>"))`), and simple counts/existence checks are implemented automatically through derived queries.

**Standards and constraints**:

- Domain port method names follow the use case semantics (`findByXxx`/`saveXxx`/`countByType`/`deleteXxx`) rather than a literal copy of the framework API.
- Pagination and sorting requirements (such as business key ascending) are declared explicitly in the adapter layer, so the application layer does not handle sorting details.
- The port must not leak JPA/Spring types (for example, do not return `Page<T>`; use a domain page carrier or `List`).

**Notes**:

- For duplicate detection, prefer checking with `existsByUserId` before writing (the 409 meaning is explicit) rather than using a primary key conflict exception for control flow.
- Count methods (such as `countByUserType`) are the basis for protection rules such as "last admin"; the port must provide them and they must run in the same transaction as the later write.
- Adapter methods contain no business logic and delegate everything to Spring Data.

**Generalized reference code**:

```java
public interface <Entity>Repository {
    Optional<<Entity>> findBy<Id>(String <id>);
    boolean existsBy<Id>(String <id>);
    <Entity> save<Entity>(<Entity> entity);
    List<<Entity>> findAll(int page, int size);   // business key ascending
    long count();
    long countBy<Field>(String value);
    void delete(String <id>);
}

public interface <Entity>JpaRepository extends JpaRepository<<Entity>, String>, <Entity>Repository {
    long countBy<Field>(String value);
    @Override
    default Optional<<Entity>> findBy<Id>(String <id>) { return findById(<id>); }
    @Override
    default List<<Entity>> findAll(int page, int size) {
        return findAll(PageRequest.of(page, size, Sort.by(Sort.Direction.ASC, "<id>"))).getContent();
    }
}
```

**Reference files**: `UserRepository.java` (new file, lines 305-339), `UserJpaRepository.java` (existing file, lines 1-42; `findAllUsers` lines 29-31, `countByUserType` line 14).

### Step 4: Implement the use case service, define the transaction boundary, and orchestrate "read-check-change-save"

**Implementation logic**: create a `@Service` use case class with class-level `@Transactional` defining the transaction boundary; query methods use `@Transactional(readOnly = true)`. Each change use case follows a fixed order: `get` (read the aggregate root; if not found, throw `NotFoundException(code, message)`) → business rule checks (uniqueness, protection rules, etc.; on failure throw `BusinessRuleException(code, message)`) → call the domain method to change → `save` to persist. The repository port and port services (such as `PasswordHasher`) are injected through the constructor, and all fields are `private final`.

**Standards and constraints**:

- The transaction boundary is in the application service layer, not in the controller or repository (repository layering convention: `interfaces → application → domain ← infrastructure`).
- Pagination parameters are guarded in the application layer: page < 0 becomes 0, size ≤ 0 uses the default, and values over the maximum are capped (default and maximum as class constants).
- Write methods are not marked `readOnly`; methods that both read and write are treated as writable.
- Domain exceptions are thrown in the application layer and mapped to HTTP semantics by the global exception handler; the service does not handle HTTP.

**Notes**:

- "Read, check, then write" must happen in the **same transaction**, so the check (such as the admin count) and the write are atomic.
- The uniqueness check (`existsByUserId` → 409 USER_ALREADY_EXISTS) is a cross-entity constraint and belongs in the application layer, not the entity.
- Read the aggregate root with `orElseThrow` to throw a domain exception; error codes are upper snake case (such as `USER_NOT_FOUND`).

**Generalized reference code**:

```java
@Service
@Transactional
public class <Entity>DirectoryService {
    private static final int DEFAULT_PAGE_SIZE = 10;
    private static final int MAX_PAGE_SIZE = 100;

    private final <Entity>Repository entities;
    private final PasswordHasher passwordHasher;

    @Transactional(readOnly = true)
    public PageResult<<Entity>> list(int page, int size) {
        int safePage = page < 0 ? 0 : page;
        int safeSize = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
        return new PageResult<>(entities.findAll(safePage, safeSize), safePage, safeSize, entities.count());
    }

    public <Entity> create(String raw<Id>, <Details> details, String password) {
        <Entity> entity = new <Entity>(raw<Id>, details, passwordHasher.hash(requirePassword(password)));
        if (entities.existsBy<Id>(entity.get<Id>())) {
            throw new BusinessRuleException("ALREADY_EXISTS", "... already exists");
        }
        return entities.save(entity);
    }

    public <Entity> update(String raw<Id>, <Details> details, String password) {
        <Entity> entity = get(raw<Id>);
        entity.applyDetails(details);                    // change through the domain method
        if (password != null) {
            entity.changePassword(passwordHasher.hash(requirePassword(password)));
        }
        return entities.save(entity);
    }

    public void delete(String raw<Id>, String actingUserId) {
        <Entity> entity = get(raw<Id>);
        // protection rule checks (step 5)
        entities.delete(entity.get<Id>());
    }
}
```

**Reference files**: `UserDirectoryService.java` (new file, lines 1-130; `list` lines 41-47, `create` lines 60-67, `update` lines 73-86, `delete` lines 91-103, `requirePassword` lines 120-129).

### Step 5: Implement delete/downgrade protection rules (no self-deletion, keep the last admin)

**Implementation logic**: add two protections to destructive "delete/downgrade" operations: (1) self-deletion protection: normalize the acting user's identity (such as the request header `X-User-Id`) the same way as the identifier and compare it with the target; if equal, refuse (error code such as `CANNOT_DELETE_SELF`); (2) last admin protection: check whether the target is of a privileged type (such as admin); if so, count privileged objects of that type and refuse the delete or downgrade when `count <= 1` (error code such as `LAST_ADMIN`). Both rules are checked in the application layer, before the save/delete action, in the same transaction. The acting user's identity is passed as an optional parameter (for example, the controller reads an optional request header); when it is null, the self-deletion check is skipped.

**Standards and constraints**:

- The order of protection checks is fixed: self-deletion/identity check first, then the last-one check (tests can assert error code priority, so order matters).
- Count privileged objects through the port method (`countByType(TYPE_X) <= 1`); do not duplicate query logic in the application layer.
- The downgrade condition is "currently a privileged type && the target type is not privileged"; protection only triggers when the privilege status actually changes.
- Error codes and messages have clear meanings: `LAST_ADMIN` ("Cannot demote/delete the last administrator"), `CANNOT_DELETE_SELF`.

**Notes**:

- Normalize the acting user's identity before comparing (inconsistent case/whitespace causes false rejections or misses); when it is `null`/missing, treat it as "not the same user" and do not block.
- The rules must be checked in the same transaction and process as the write; do not count from a snapshot in another transaction.
- Legacy systems usually lack such rules (a historical defect); when implementing them, register them explicitly in the rules catalog as "new protection rules" (NR-*) and pair them with positive and negative path tests.

**Generalized reference code**:

```java
public void delete(String raw<Id>, String actingUserId) {
    <Entity> entity = get(raw<Id>);
    String actor = <Entity>.normalize<Id>(actingUserId);
    if (actor != null && actor.equals(entity.get<Id>())) {
        throw new BusinessRuleException("CANNOT_DELETE_SELF", "You cannot delete your own record.");
    }
    if (entity.is<Privileged>() && isLast<Privileged>()) {
        throw new BusinessRuleException("LAST_<PRIVILEGED>", "Cannot delete the last <privileged>.");
    }
    entities.delete(entity.get<Id>());
}

public <Entity> update(String raw<Id>, <Details> details, String password) {
    <Entity> entity = get(raw<Id>);
    boolean demoting = entity.is<Privileged>()
            && !TYPE_<X>.equals(details == null ? null : details.<type>());
    if (demoting && isLast<Privileged>()) {
        throw new BusinessRuleException("LAST_<PRIVILEGED>", "Cannot demote the last <privileged>.");
    }
    entity.applyDetails(details);
    ...
}

private boolean isLast<Privileged>() {
    return entities.countBy<Type>(<Entity>.TYPE_<X>) <= 1;
}
```

**Reference files**: `UserDirectoryService.java` (`delete` lines 91-103, `update` lines 73-86, `isLastAdmin` lines 105-107).

### Step 6: Implement the REST adapter layer (controller + request/response DTOs)

**Implementation logic**: create `@RestController @RequestMapping("/api/v1/<resources>")`; each resource method does only three things: parameter binding and validation (`@Valid`), calling the use case service, and mapping the domain object to a response DTO (`XxxResponse.from(entity)`). Request DTOs are records with Jakarta Bean Validation annotations (`@NotBlank`/`@NotNull`/`@Size`/`@Pattern`) plus `@Schema` documentation annotations; a `toDetails()` method assembles the validated request fields into a domain value object. The response DTO's static factory `from` picks only safe fields and **deliberately leaves out sensitive fields** (password, hash, card CVV, etc.). For delete and similar operations, the acting user's identity is passed in an optional request header (such as `X-User-Id`, `required = false`).

**Standards and constraints**:

- Base path `/api/v1/<plural resource>` (repository REST convention); lists always use the structure `{"items": [...], "page", "size", "total"}`.
- Request/response DTOs are always records; the messages of request DTO validation annotations match the domain layer's validation messages.
- Controllers contain no business logic and no manual validation; HTTP semantics are left to the global exception handler (400/404/409/201/204).
- `@Valid` only validates the request body; basic formats of path variables and query parameters (such as regex) can go in the DTO or parameter annotations.
- Create returns `201 CREATED` with a response body; delete returns `204 NO_CONTENT`.

**Notes**:

- Response DTOs must list fields explicitly and must not serialize the entity directly (otherwise sensitive fields leak); tests assert that `passwordHash` does not exist.
- "Optional fields" in update requests (such as password) must not have `@NotBlank`; add only constraints that apply when present (`@Size`).
- Request DTO validation is the "format layer" and domain validation is the "semantic layer"; input is valid only when both pass (tests in this project assert that the 400 details match the domain 400 messages).

**Generalized reference code**:

```java
@RestController
@RequestMapping("/api/v1/<resources>")
public class <Entity>Controller {
    private static final String ACTING_USER_HEADER = "X-User-Id";

    private final <Entity>DirectoryService service;

    @GetMapping
    public PageResponse<<Entity>Response> list(@RequestParam(defaultValue = "0") int page,
                                               @RequestParam(defaultValue = "10") int size) {
        PageResult<<Entity>> result = service.list(page, size);
        return new PageResponse<>(result.items().stream().map(<Entity>Response::from).toList(),
                result.page(), result.size(), result.total());
    }

    @PostMapping
    public ResponseEntity<<Entity>Response> create(@Valid @RequestBody CreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(<Entity>Response.from(
                service.create(request.<id>(), request.toDetails(), request.password())));
    }

    @DeleteMapping("/{<id>}")
    public ResponseEntity<Void> delete(@PathVariable String <id>,
                                       @RequestHeader(name = ACTING_USER_HEADER, required = false)
                                       String actingUserId) {
        service.delete(<id>, actingUserId);
        return ResponseEntity.noContent().build();
    }
}
```

**Reference files**: `UserController.java` (new file, lines 1-76; list lines 44-50, create lines 57-61, delete lines 69-75), `CreateUserRequest.java` (lines 77-127), `UpdateUserRequest.java` (lines 128-164), `UserResponse.java` (lines 165-185).

### Step 7: Confirm unified error mapping and HTTP semantics

**Implementation logic**: a `@RestControllerAdvice` global exception handler maps domain exceptions to HTTP responses: `ValidationException` (including Bean Validation's `MethodArgumentNotValidException`) → 400, `NotFoundException` → 404, `BusinessRuleException` → 409, `OptimisticLockingFailureException` → 409 (reusing the legacy conflict message). Responses are always `ApiError{code, message, details}`, with details as a list of `field: message`. Error code convention: upper snake case for business cases (`USER_ALREADY_EXISTS`/`LAST_ADMIN`), `*_NOT_FOUND` for not found.

**Standards and constraints**:

- The error response structure is the same across the repository (repository Java conventions §4); domain exceptions carry the code at construction.
- The details of a 400 are generated from the field errors of `BindingResult` and have the same shape as the details of a domain `ValidationException`.
- Domain exceptions carry no HTTP concepts (status codes appear only in the exception handler).

**Notes**:

- The code for Bean Validation failures is always `VALIDATION_FAILED`; domain validation failures may use `VALIDATION_FAILED` + details.
- Optimistic lock conflicts must have a fallback handler (the exception is thrown at flush/commit, and business code does not try-catch it).

**Generalized reference code**:

```java
@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ApiError> handleNotFound(NotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiError.of(ex.getCode(), ex.getMessage()));
    }
    @ExceptionHandler(BusinessRuleException.class)
    public ResponseEntity<ApiError> handleBusinessRule(BusinessRuleException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiError.of(ex.getCode(), ex.getMessage()));
    }
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException ex) {
        List<String> details = ex.getBindingResult().getFieldErrors().stream()
                .map(e -> e.getField() + ": " + e.getDefaultMessage()).toList();
        return ResponseEntity.badRequest().body(new ApiError("VALIDATION_FAILED", "...", details));
    }
}
```

**Reference files**: `GlobalExceptionHandler.java` (existing file, lines 1-58; 404 lines 25-29, 409 lines 31-35, 400 lines 43-50, optimistic lock lines 52-57), `ApiError.java` (existing file, lines 1-10).

### Step 8: Write the database scripts and seed data

**Implementation logic**: Flyway migration scripts create the tables, with column definitions strictly matching the entity annotations (length, not null, `version BIGINT NOT NULL DEFAULT 0`); seed scripts write demo/test baseline data, with sensitive fields (passwords) written only as pre-generated hashes. With `ddl-auto: validate`, a mismatch between entity and DDL makes startup fail, so new entity fields must be added to the migration scripts at the same time.

**Standards and constraints**:

- Table names are lower case with underscores, and columns map one to one to the legacy copybook (repository database convention); every aggregate table has `version`.
- Seed INSERTs are idempotent and list all columns explicitly, so they run on both H2 and PostgreSQL.
- The test profile reuses the same migration scripts (H2 + Flyway).

**Notes**:

- The password hashes of seed users match the `pbkdf2$210000$` prefix asserted in tests, and tests depend on the seed baseline (such as total=2).
- Keep test cases self-contained as far as possible (create data first, then delete) to reduce order dependencies on the seed.

**Generalized reference code**:

```sql
CREATE TABLE <entity_table> (
    <id>          VARCHAR(<n>)   PRIMARY KEY,
    <field1>      VARCHAR(<n>)   NOT NULL,
    ...
    password_hash VARCHAR(200)   NOT NULL,
    <type>        VARCHAR(1)     NOT NULL,
    version       BIGINT         NOT NULL DEFAULT 0
);

INSERT INTO <entity_table> (<id>, ..., password_hash, <type>, version)
VALUES ('<SEED>', ..., '<pbkdf2$iter$salt$hash>', 'X', 0);
```

**Reference files**: `V1__iam_schema.sql` (existing file, lines 1-8), `V2__iam_seed.sql` (existing file, lines 1-9).

### Step 9: Write application layer and REST layer tests

**Implementation logic**: tests have two layers: (1) application layer `@SpringBootTest` (`@ActiveProfiles("test") @Transactional`) injects the use case service directly and uses AssertJ to assert domain behavior: the pass and reject paths of every business rule (duplicates, enums, length, self-deletion, deleting/downgrading the last admin, keeping and replacing the password), password hash verification (`verify` succeeds for the original text, hash prefix assertion), pagination ordering and counts; (2) REST layer `@SpringBootTest + @AutoConfigureMockMvc` uses MockMvc to assert HTTP semantics and error codes (200/201/204/400/404/409) and minimal response fields (`doesNotExist` for sensitive fields).

**Standards and constraints**:

- Assertions focus on business rules and error codes, not logs or implementation details (repository testing convention).
- Reject paths assert `assertThatThrownBy(...).isInstanceOf(...).extracting("code")`.
- End-to-end cases must run locally (H2 + Flyway + seed) without external services.

**Notes**:

- Protection rule order matters (self-deletion takes precedence over last admin); tests must cover both priority scenarios.
- Keep test data self-contained: first create a second admin through update, then verify that deletion is allowed, to avoid dependencies between cases.
- Service tests and controller tests share the seed baseline; isolate delete cases with transaction rollback (`@Transactional` test rollback).

**Generalized reference code**:

```java
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class <Entity>DirectoryServiceTest {
    @Autowired private <Entity>DirectoryService service;

    @Test
    void refusesToDeleteLast<Privileged>() {
        assertThatThrownBy(() -> service.delete("ADMIN001", "USER0001"))
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code").isEqualTo("LAST_ADMIN");
    }

    @Test
    void keepsPasswordWhenUpdateOmitsIt() {
        String originalHash = service.get("USER0001").getPasswordHash();
        User renamed = service.update("USER0001", new <Details>("Demo", "Tester", "U"), null);
        assertThat(renamed.getPasswordHash()).isEqualTo(originalHash);
    }
}
```

**Reference files**: `UserDirectoryServiceTest.java` (new file, lines 1-146; last admin lines 104-108, password kept lines 126-141), `UserControllerTest.java` (existing file, lines 1-210; self-deletion 409 lines 184-189, no password field in response lines 96-106, create 201 lines 123-138).

## 2. Other related concepts and knowledge

- **Domain knowledge (legacy migration)**: this pattern is the typical shape of a "COBOL screen program → REST CRUD" migration. The business rules catalog (`docs/legacy/03-business-rule-catalog.md`) records, for each rule, the legacy evidence (program/paragraph/line) → target location → implementation status; migrated implementations must be traceable (BR-USER-*, NR-USER-*), and new protection rules are registered as NR-*. The traceability matrix (`docs/design/06-traceability-matrix.md`) records the full chain "legacy program → service → API → rule → test".
- **System knowledge (identifiers and protocol)**: legacy identifiers are always zero-padded fixed-length strings (8/9/11/16 characters), the business key is the primary key, and APIs transmit them as strings; dates use `LocalDate`/ISO-8601, amounts use `BigDecimal`, and status codes keep the legacy values (A/U, Y/N). The `@Version` optimistic lock replaces the legacy `READ UPDATE` + snapshot comparison (ADR-006), with conflicts returning 409.
- **Security knowledge**: password storage follows the ADR decision (PBKDF2 + per-user salt + self-contained encoding); login failures use a single error meaning to prevent user enumeration; response data is minimized (sensitive fields are never exposed); constant-time comparison prevents timing attacks; password copies are cleared after use.
- **Coding conventions**: request validation has three layers (REST format via Bean Validation / domain semantics / application cross-entity), with consistent messages across layers; error codes are upper snake case and can be asserted by tests; transaction boundaries are only in the application layer; thin controllers, orchestrating services, rich domain, adapting infrastructure.
- **Best practices**: constructor injection for use case classes (`private final`); defensive normalization of pagination parameters; protection business rules must have positive and negative path tests; test cases are self-contained, based on the seed baseline, and isolated by transaction rollback.

## 3. Reference file list

| Step | Reference file | Content lines |
|---|---|---|
| 1 | `User.java` (new) | 137-291 |
| 1 | `UserDetails.java` (new) | 297-304 |
| 2 | `PasswordHasher.java` (new) | 340-356 |
| 2 | `Pbkdf2PasswordHasher.java` (existing) | 1-72 |
| 3 | `UserRepository.java` (new) | 305-339 |
| 3 | `UserJpaRepository.java` (existing) | 1-42 |
| 4 | `UserDirectoryService.java` (new) | 1-130 |
| 5 | `UserDirectoryService.java` (delete/update/isLastAdmin) | 73-107 |
| 6 | `UserController.java` (new) | 1-76 |
| 6 | `CreateUserRequest.java` (new) | 77-127 |
| 6 | `UpdateUserRequest.java` (new) | 128-164 |
| 6 | `UserResponse.java` (new) | 165-185 |
| 7 | `GlobalExceptionHandler.java` (existing) | 1-58 |
| 7 | `ApiError.java` (existing) | 1-10 |
| 8 | `V1__iam_schema.sql` (existing) | 1-8 |
| 8 | `V2__iam_seed.sql` (existing) | 1-9 |
| 9 | `UserDirectoryServiceTest.java` (new) | 1-146 |
| 9 | `UserControllerTest.java` (existing) | 1-210 |

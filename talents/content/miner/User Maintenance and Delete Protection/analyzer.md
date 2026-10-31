# User Maintenance and Delete Protection (iam-service User Directory CRUD) Code Analysis Report

## Repository knowledge layers

- **Repository**: `carddemo-java-1025`, the microservice repository of the bank credit card demo system (Maven multi-module, parent POM `com.carddemo:carddemo-java`). Each service is built separately and has its own database; the layering baseline is in `docs/design/07-java-conventions.md`.
- **Subsystem affected by the requirement**: iam-service (identity and access context, port 8081). This service carries the migration of the legacy security domain (login COSGN00C, user directory maintenance COUSR00C/01C/02C/03C).
- **Layer placement** (dependency direction `interfaces → application → domain ← infrastructure`):
  - `interfaces/rest`: `UserController` (inbound adapter, REST mapping and request validation) and its DTOs (`CreateUserRequest`/`UpdateUserRequest`/`UserResponse`/`PageResponse`).
  - `application`: `UserDirectoryService` (use case orchestration and transaction boundary), `PageResult` (page carrier).
  - `domain/model`: `User` (aggregate root, rich model), `UserDetails` (value object record of maintainable fields).
  - `domain/repository`: `UserRepository` (repository port, plain interface without framework dependencies).
  - `domain/security`: `PasswordHasher` (password hashing port).
  - `domain/exception`: `BusinessRuleException`/`NotFoundException`/`ValidationException`.
  - `infrastructure/persistence`: `UserJpaRepository` (Spring Data JPA adapter implementing the port).
  - `infrastructure/security`: `Pbkdf2PasswordHasher` (PBKDF2 implementation).
  - `interfaces/rest`: `GlobalExceptionHandler` + `ApiError` (unified error response).
- Core objects affected: `User` aggregate root → `UserDirectoryService` use cases → `UserController` REST entry, spanning all four layers.

## Dependency analysis of affected locations

| Dependency | Type | Reason and location |
|---|---|---|
| `UserController` → `UserDirectoryService` | Import + constructor-injected call | The controller is the only inbound entry; it gets the use case service through constructor injection (`UserController.java:40-42`), translates HTTP requests into use case calls and maps response DTOs |
| `UserDirectoryService` → `UserRepository` | Import + constructor-injected call | The use cases read and write the aggregate root through the repository port (`UserDirectoryService.java:33-36`), without depending on JPA directly |
| `UserDirectoryService` → `User` / `UserDetails` | Import + call | The use cases orchestrate domain behavior: construct `User`, call `applyDetails`/`changePassword`, read `isAdmin()`/`getUserId()` |
| `UserDirectoryService` → `PasswordHasher` | Import + constructor-injected call | Password hashing port; `hash()` is called when creating/changing a password (`UserDirectoryService.java:61,83`) |
| `User` → `UserDetails` | Import + call | The aggregate root takes in maintainable fields through `applyDetails(details)` (`User.java:210-217`) |
| `UserRepository` → `UserJpaRepository` | Interface implementation | `UserJpaRepository extends JpaRepository<User, String>, UserRepository` (`UserJpaRepository.java:12`); JPA derived queries `countByUserType`/`existsByUserId` implement the port methods automatically, and `findAllUsers` uses `PageRequest.of(page, size, Sort.by(ASC, "userId"))` |
| `PasswordHasher` → `Pbkdf2PasswordHasher` | Interface implementation | `Pbkdf2PasswordHasher implements PasswordHasher` (`Pbkdf2PasswordHasher.java:19`), encoding format `pbkdf2$<iterations>$<salt>$<hash>` |
| Domain exceptions → `GlobalExceptionHandler` | Import + handling | `@RestControllerAdvice` maps `NotFoundException`→404, `BusinessRuleException`→409, `ValidationException`→400, `MethodArgumentNotValidException`→400, `OptimisticLockingFailureException`→409 (`GlobalExceptionHandler.java:19-57`) |
| DTOs `CreateUserRequest`/`UpdateUserRequest` → `UserDetails` | Import + call | Request DTOs provide `toDetails()`, which assembles the bean-validated fields into a domain value object (`CreateUserRequest.java:124-126`) |
| DTO `UserResponse` → `User` | Import + call | `UserResponse.from(user)` outputs only safe fields and deliberately leaves out password-related fields (`UserResponse.java:12-14`) |
| `PageResult<T>` → `PageResponse<T>` | Type usage | The application layer page carrier is mapped to the REST response structure `{items, page, size, total}` (`PageResponse.java:5`) |
| `User` → database table `sec_user` | Mapping | `@Entity @Table(name = "sec_user")` + Flyway `V1__iam_schema.sql` creates the table; `version BIGINT NOT NULL DEFAULT 0` matches the `@Version` field |

## Call trace

```
GET  /api/v1/users?page&size
  → UserController.list (builds PageResponse)
  → UserDirectoryService.list (@Transactional(readOnly=true))
      → users.findAllUsers(page, size)   // PageRequest, userId ascending
      → users.countUsers()
      → PageResult<User>
GET  /api/v1/users/{userId}
  → UserController.get
  → UserDirectoryService.get
      → requireUserId → users.findByUserId → orElseThrow(NotFoundException "USER_NOT_FOUND")
POST /api/v1/users
  → UserController.create (@Valid CreateUserRequest → toDetails)
  → UserDirectoryService.create
      → User(rawUserId, details, passwordHasher.hash(requirePassword(password)))
      → users.existsByUserId → if duplicate, BusinessRuleException "USER_ALREADY_EXISTS"
      → users.saveUser → 201
PUT  /api/v1/users/{userId}
  → UserController.update (@Valid UpdateUserRequest → toDetails)
  → UserDirectoryService.update
      → get → isAdmin() && target not admin && isLastAdmin() → BusinessRuleException "LAST_ADMIN"
      → user.applyDetails(details)
      → password != null → user.changePassword(passwordHasher.hash(...))
      → users.saveUser
DELETE /api/v1/users/{userId}  (Header X-User-Id = acting user)
  → UserController.delete
  → UserDirectoryService.delete
      → get → actor.equals(userId) → BusinessRuleException "CANNOT_DELETE_SELF"
      → isAdmin() && isLastAdmin() → BusinessRuleException "LAST_ADMIN"
      → users.deleteUser → 204
Error path: any domain exception / validation exception → GlobalExceptionHandler → ApiError{code, message, details}
```

## Requirement type

New feature development (migration of legacy COBOL online programs + new security protection rules):

- Migration: the four 3270 screen programs `COUSR00C` (list), `COUSR01C` (add), `COUSR02C` (update) and `COUSR03C` (delete) are migrated to REST CRUD, with business rule IDs BR-USER-01..07.
- New: `NR-USER-01` (the last admin cannot be deleted/downgraded) and `NR-USER-02` (users cannot delete themselves) are protection rules the legacy system lacked entirely (the legacy `COUSR03C.cbl` has no admin count anywhere, so the system could lose all admins). Legacy defects are also fixed per ADR-008: plain-text passwords become PBKDF2 hashes, and password case handling is made consistent.

## Example usage context

- **Usage scenario**: an admin (`userType = 'A'`, landingMenu=ADMIN after login) maintains the system user directory. REST base path `/api/v1/users`; the mapping to legacy programs is in `docs/design/06-traceability-matrix.md` §1 (COUSR00C→GET, COUSR01C→POST, COUSR02C→PUT, COUSR03C→DELETE).
- **Why it matters**: the user directory is the data source for login (`AuthenticationService.login`); the login use case also reads the password hash from the `User` entity to verify it. Delete/downgrade protection directly decides whether a system admin exists, which is the baseline for security and availability.
- **Authentication scope**: per ADR-007, in this phase iam only issues/verifies tokens and resource services do not enforce authentication (local demo environment), so the delete endpoint passes the "acting user identity" in the optional request header `X-User-Id` for self-deletion protection; this is a lightweight place for the protection rule while there is no gateway.

## Root cause analysis (how)

- **Why these files were added**: iam-service originally only had login (`AuthenticationService` + an early `User` domain object) and no user directory maintenance; this change completes the full CRUD chain. All files are new (every diff is `new file mode 100644`) and no existing file is modified, which shows this is "added capability" rather than "changed behavior".
- **Legacy environment constraints**:
  - In the legacy `USRSEC` file, `SEC-USR-PWD PIC X(8)` is plain text with a fixed length of 8, and adding a user does not upper-case it while login does (`COUSR01C.cbl:157`), so passwords containing lower case can never log in. ADR-008 decision: PBKDF2-HMAC-SHA256 (210000 iterations, 16-byte salt, `pbkdf2$iter$salt$hash` encoding), passwords 8-64 characters saved after trim; user IDs are always trimmed and upper-cased (BR-SGN-02).
  - Legacy identifiers are zero-padded fixed-length strings: `user_id VARCHAR(8)`, so the user ID is validated with the regex `^[A-Z0-9]{8}$`, and the primary key is the business key.
  - The legacy `READ ... UPDATE` + screen snapshot comparison is replaced per ADR-006 with an `@Version` optimistic lock: `User` has `@Version long version`, the update response returns the incremented `version`, and conflicts are mapped by `GlobalExceptionHandler` to 409 `CONCURRENT_UPDATE`.
  - Concurrency safety: `isLastAdmin()` checks `countByUserType(TYPE_ADMIN) <= 1` with "read, check, then write" inside the application service transaction; transaction isolation keeps the check and the write atomic.
- **Validation layers**: the REST layer (Jakarta Bean Validation, annotations on request DTOs) handles format validation (required, regex, length), the domain layer (`User`'s `require*` methods) handles business semantics (enum A/U, trim normalization), and the application layer handles cross-entity constraints (uniqueness, admin protection). Each layer has its own job, and error codes and messages are consistent (for example `User Type must be A or U.` is the same in the DTO and the domain layer; test `UserControllerTest.java:166` asserts the 400 details).

## Current and expected behavior

- **Before**: iam-service only provided login/signature verification (`/api/v1/auth/login`, `/verify`) and no user maintenance endpoints; the `User` domain object served only login. Admins existed only through seed data (ADMIN001/USER0001 in `V2__iam_seed.sql`) and could not be added, changed or deleted.
- **After**:
  - `/api/v1/users` provides these operations: paginated list (BR-USER-05: userId ascending, default 10, maximum 100), details (404 USER_NOT_FOUND), create (duplicate 409 USER_ALREADY_EXISTS), update (idempotent PUT; an omitted password keeps the existing hash), delete (404 / 409 protection rules).
  - Passwords are never stored in plain text: `User` only stores `passwordHash`, and `UserResponse` deliberately has no password field (tests `UserControllerTest.java:105,135` assert that `passwordHash` does not exist).
  - Admin protection: `delete`/`update` check `isLastAdmin()` first (when there is ≤ 1 admin in the whole database, downgrade/delete is refused with 409 LAST_ADMIN); `delete` checks whether the acting user (`X-User-Id` after normalization) is the user being deleted (409 CANNOT_DELETE_SELF).
- **Key behavior differences**: legacy delete had no protection (the last admin could be deleted), which this implementation adds; legacy passwords were plain text, now hashed; legacy update compared each field and only wrote when something changed, while this implementation follows REST semantics with an idempotent PUT (updating with the same values is not an error; BR-USER-06 partially implemented). The optimistic lock conflict message reuses the legacy text "Record changed by some one else. Please review".

## Requirement implementation logic (how/why)

### New files (all under `services/iam-service`)

1. **`domain/model/User.java` (aggregate root, rich model)**: `@Entity @Table("sec_user")`. Holds all fields (`userId` 8-character primary key, `firstName`/`lastName` 20 characters, `passwordHash` 200 characters, `userType` 1 character, `@Version version`). Key domain behavior:
   - Factory-style constructor `User(userId, details, passwordHash)`: normalizes the user ID and validates it with a regex (`requireUserId`, `User.java:240-246`), and delegates name/type validation to `applyDetails`.
   - `normalizeUserId(raw)` (`User.java:203-205`): trim + `toUpperCase(Locale.ROOT)`; login and maintenance share the same normalization, so user IDs are "normalized before comparison" (BR-SGN-02).
   - `applyDetails(details)` (`User.java:210-217`): names trimmed, non-empty, ≤ 20 characters; type trimmed and upper-cased, then only A/U allowed (BR-USER-01/04).
   - `changePassword(hash)` (`User.java:222-227`): only accepts hashed values; the entity itself never touches the plain-text password.
   - `isAdmin()` / `landingMenu()` (`User.java:229-238`): `TYPE_ADMIN("A")` check and login menu routing (BR-SGN-04/05).
   - Intent: centralize validation and behavior in the aggregate root so the service does not pile up setters (repository Java conventions §3, rich model).
2. **`domain/model/UserDetails.java` (value object record)**: carrier for the three maintainable fields `(firstName, lastName, userType)`, connecting the request DTO and the aggregate root so the service does not pass fields one by one.
3. **`domain/repository/UserRepository.java` (repository port)**: seven methods `findByUserId`/`existsByUserId`/`saveUser`/`findAllUsers`/`countUsers`/`countByUserType`/`deleteUser`. A plain interface without Spring Data dependencies; it is the seam of domain ← infrastructure (the doc comment says the implementation is `UserJpaRepository`).
4. **`domain/security/PasswordHasher.java` (port)**: two methods `hash`/`verify`; the ADR-008 algorithm decision is isolated behind the port.
5. **`application/UserDirectoryService.java` (use cases + transaction boundary)**: class-level `@Service @Transactional`; query methods `@Transactional(readOnly = true)`. Five use cases:
   - `list(page, size)` (lines 42-47): page/size guard (negative page becomes 0, size ≤ 0 uses the default 10, > 100 is capped); returns `PageResult<User>`.
   - `get(rawUserId)` (lines 50-55): `requireUserId` non-empty check → `findByUserId().orElseThrow(NotFoundException("USER_NOT_FOUND"))`.
   - `create(rawUserId, details, password)` (lines 60-67): hash the password first (`passwordHasher.hash(requirePassword(password))`), then construct `User`; `existsByUserId` checks for duplicates (check before writing instead of relying on a primary key conflict exception); `saveUser`.
   - `update(rawUserId, details, password)` (lines 73-86): read → check "downgrading the last admin" (`isAdmin() && target not A && isLastAdmin()` → 409 LAST_ADMIN) → `applyDetails` → only when `password != null`, `changePassword(new hash)` (omitted keeps the existing password, BR-USER-06) → `saveUser`.
   - `delete(rawUserId, actingUserId)` (lines 91-103): read → acting user, after normalization, is the same as the user to delete → 409 CANNOT_DELETE_SELF → admin and the only one → 409 LAST_ADMIN → `deleteUser`.
   - `isLastAdmin()` (lines 105-107): `users.countByUserType(TYPE_ADMIN) <= 1`.
   - `requirePassword` (lines 120-129): non-null/non-blank, 8-64 characters after trim (BR-USER-03; the comment states "login trims too, see ADR-008").
6. **`interfaces/rest/UserController.java` (REST adapter)**: `@RestController @RequestMapping("/api/v1/users")`. `@Valid` triggers request DTO validation; `create` returns 201 + `UserResponse`; `delete` reads the optional request header `X-User-Id` (`ACTING_USER_HEADER`, `required = false`) as the acting user identity; `list` builds `PageResponse<UserResponse>`. DTO mapping is `UserResponse.from(user)` and `request.toDetails()`; the controller has no business logic.
7. **Three DTOs**:
   - `CreateUserRequest` (record): all five fields required; userId `@Pattern("^[A-Za-z0-9]{8}$")`, names `@NotBlank @Size(max=20)`, password `@Size(min=8, max=64)`, type `@NotNull @Pattern("[AU]")`; `@Schema` provides descriptions and examples for OpenAPI; `toDetails()` assembles the domain value object.
   - `UpdateUserRequest` (record): names/type required + optional password (`@Size` only validated when present; omitted means the password is not changed).
   - `UserResponse` (record): `(userId, firstName, lastName, userType, version)`, static mapping `from(user)`, **deliberately leaving out `passwordHash`** (data minimization; tests assert the response has no password field).
8. **`infrastructure/persistence/UserJpaRepository.java` (port implementation)**: `extends JpaRepository<User, String>, UserRepository`; default methods translate the domain port to the Spring Data API; `findAllUsers` uses `PageRequest.of(page, size, Sort.by(ASC, "userId"))` to meet the BR-USER-05 ordering; `countByUserType`/`existsByUserId` are derived queries.
9. **`infrastructure/security/Pbkdf2PasswordHasher.java` (port implementation)**: PBKDF2WithHmacSHA256, 210000 iterations, 16-byte `SecureRandom` salt, constant-time comparison with `MessageDigest.isEqual` (prevents timing side channels), `spec.clearPassword()` clears the in-memory password copy.
10. **Tests** (`03-tests.patch`):
    - `application/UserDirectoryServiceTest.java`: `@SpringBootTest @ActiveProfiles("test") @Transactional`, injecting the use case service + hasher directly for integration-level behavior verification, covering list ordering/404/create (including user ID trim + upper case, hash prefix `pbkdf2$210000$`, verify round trip)/duplicate rejection/type enum/blank names (asserting the details list)/password length/deleting and downgrading the last admin/self-deletion/password kept and replaced/deletion allowed once a second admin exists.
    - `interfaces/rest/UserControllerTest.java` (existing file, extended with user directory cases): MockMvc end-to-end verification of HTTP semantics and error codes (201/204/400/404/409) and that responses have no password field.

### Non-code files

- `V1__iam_schema.sql` (existing): the `sec_user` table strictly matches the entity columns (`ddl-auto: validate` constraint; new fields must be added to the migration scripts at the same time).
- `V2__iam_seed.sql` (existing): seed users ADMIN001 (A)/USER0001 (U) with PBKDF2-hashed passwords (no plain text in the database), providing baseline data for tests and demos; test assertions are based on these two seeds (total=2).

### Call relationship changes

- No existing method is modified; all call chains are new: `UserController → UserDirectoryService → UserRepository → UserJpaRepository`, `PasswordHasher → Pbkdf2PasswordHasher`, with `UserDetails` connecting DTO and domain. `AuthenticationService` keeps using `User`/`PasswordHasher` independently and shares the same normalization and hashing semantics with user maintenance.

## Concrete implementation steps

1. **Define the domain model and value object** (`User.java` + `UserDetails.java`): declare the `@Entity` aggregate root with fields matching the `sec_user` table one to one; implement field-level validation in the constructor and `applyDetails` (user ID regex `^[A-Z0-9]{8}$`, names 1-20, type A/U); `normalizeUserId` provides a single global trim + upper-case normalization.
2. **Define and implement the password hashing port** (`PasswordHasher.java` + `Pbkdf2PasswordHasher.java`): the interface isolates the algorithm; the implementation uses the JDK `SecretKeyFactory("PBKDF2WithHmacSHA256")`, the encoding format contains the iteration count/salt/hash, and `verify` parses the encoded string and compares in constant time; `clearPassword()` the key spec after use.
3. **Define the repository port and JPA adapter** (`UserRepository.java` + `UserJpaRepository.java`): the port declares only the read/write/count/pagination methods the domain needs; the adapter bridges to Spring Data with default methods, paginating by userId ascending.
4. **Implement the use case service** (`UserDirectoryService.java`): class-level `@Transactional` defines the boundary; queries are `readOnly = true`; each change method follows "read aggregate → check business rules → change through domain method → save"; an omitted password is not changed, and a required password goes through `requirePassword` (trim + 8-64).
5. **Implement delete/downgrade protection rules** (update/delete above): normalize the acting user identity first; self-deletion → `CANNOT_DELETE_SELF`; `isLastAdmin()` (admin count ≤ 1) → `LAST_ADMIN`; protection checks happen before saving, in the same transaction.
6. **Implement the REST adapter layer** (`UserController.java` + three DTOs): request DTO records + Jakarta validation annotations + `@Schema` documentation; `toDetails()` converts to the domain value object; `UserResponse.from` maps and leaves out password fields; the delete endpoint reads the optional `X-User-Id` header.
7. **Confirm error mapping** (existing `GlobalExceptionHandler`): validation failure 400 (with field-level details from Bean Validation), not found 404, business rule 409, optimistic lock conflict 409; `ApiError` uses the unified `{code, message, details}` structure (repository Java conventions §4).
8. **Complete the database scripts** (existing `V1`/`V2`): table columns match the entity (including `version`); seed data contains PBKDF2 hashes, with idempotent INSERTs for both H2 and PostgreSQL.
9. **Write tests**: application layer `@SpringBootTest` cases (pass and reject paths of every BR/NR rule, password hash round trip, pagination assertions); REST layer MockMvc cases (HTTP semantics, error codes, minimal response field assertions).

## Implementation checklist

- **User ID**: must be trimmed and upper-cased before storage (`Locale.ROOT`, to avoid the Turkish i problem); length/character set are validated in both the domain layer and the DTO; the primary key is the business key, and duplicates are detected with `existsByUserId` rather than by catching a primary key exception.
- **Password**: never stored in plain text; `requirePassword` checks for empty first, then trims, then checks the length (so whitespace cannot pass the length check); hash with PBKDF2 (self-contained encoding format, `verify` reads the iteration count from the encoded string); do not apply the user ID upper-case conversion to passwords (ADR-008).
- **Admin protection**: `isLastAdmin()` is based on `countByUserType(A) <= 1` and must be checked in the same transaction as the "update/delete"; check self-deletion before LAST_ADMIN (test `refusesSelfDeletionWith409` has ADMIN001 delete itself and hits CANNOT_DELETE_SELF rather than LAST_ADMIN, so order matters); the downgrade protection condition is "currently admin && target type not A".
- **Update semantics**: PUT is idempotent (updating with the same values is not an error); a null password means keep the existing hash; do not use an empty string as a placeholder (`update` only acts on `password != null`).
- **Response minimization**: no user response may contain a `password`/`passwordHash` field (tests assert `doesNotExist`); version is returned for retries after optimistic lock conflicts.
- **Pagination guard**: page < 0 becomes 0, size ≤ 0 uses the default, > maximum is capped; default 10, maximum 100 (matching the legacy 10 rows per page).
- **Consistent validation messages**: DTO annotations and domain layer exception messages match (such as "User Type must be A or U."); error codes are upper snake case (`USER_NOT_FOUND`/`USER_ALREADY_EXISTS`/`LAST_ADMIN`/`CANNOT_DELETE_SELF`); `details` is a list of `field: message`.
- **Layering discipline**: validation has three layers (REST format, domain semantics, application cross-entity); controllers have no business logic, services do not pile up setters, and transaction boundaries are in the application layer; domain does not import Spring framework classes (`User.java` only imports jakarta.persistence; everything else is JDK).
- **Seed and test data**: test assertions depend on the seed users (ADMIN001/USER0001); keep cases self-contained where possible (for example, first update a user into a new admin, then delete the old admin) to avoid dependencies between cases.

## Summary

This requirement adds user directory maintenance to iam-service (identity and access context): the four screen use cases of the legacy COBOL online programs COUSR00C/01C/02C/03C are migrated to REST CRUD (`GET/POST/PUT/DELETE /api/v1/users`), and during the migration the security and concurrency baselines are put in place per ADR-008 (PBKDF2 password hashing) and ADR-006 (@Version optimistic locking). Two protection rules missing from the legacy system are also added: NR-USER-01 (the last admin cannot be deleted/downgraded, 409 LAST_ADMIN) and NR-USER-02 (no self-deletion, 409 CANNOT_DELETE_SELF, decided through the optional request header X-User-Id). The implementation follows the repository's four-layer dependency discipline: `interfaces/rest` (UserController + request/response DTOs, validation and documentation annotations) → `application` (UserDirectoryService, transaction boundary and use case orchestration) → `domain` (User rich aggregate root, UserDetails value object, UserRepository/PasswordHasher ports, domain exceptions) ← `infrastructure` (UserJpaRepository, Pbkdf2PasswordHasher implementing the ports); errors are mapped uniformly by GlobalExceptionHandler to `{code, message, details}`. Behavior change: before, only login worked and the user directory was read-only seed data; after, the user directory is fully maintainable, passwords are never in plain text, and the admin baseline is protected. The implementation pattern is reusable: domain validation centralized in the aggregate root, port-adapter isolation of frameworks, use-case-level transactions with "read-check-change-save" orchestration, minimal response DTOs, and protection rules in the application layer with positive and negative path tests.

# REQ-2026-002 · Baseline and Implementation Constraints

Code verification baseline: `5eeddd63184eb17876bd09d89ea45082644b56db`, branch `develop`; the sources are the root Maven pom and ADR-007 at that commit. The task's actual baseline is the commit bound to the workspace; re-check after later merges and do not treat this list as a live inventory.

Existing modules: iam-service, customer-service, card-service, account-service, transaction-service, authorization-service, marketing-service, web-ui. Java 21, Spring Boot 3.3.6, Maven, PostgreSQL, native static SPA.

The dev-b mentioned in the materials README was not found in any ref reachable in the current repository. The baseline above has no standalone billing, ledger, notification, audit, limit, workflow, dispute or document service; the original requirement's assumption of "reusing existing services" must be checked first. Do not report empty directories, stubs, preset data or adapters that are never called as a successful real integration. Whether to add a new service, merge into an existing boundary or take another approach is decided by the confirmed design notes; keep the evidence for anything not implemented or blocked.

## Current Engineering Constraints

- Maven uses JDK 21. Record the actual unit test command, working directory, commit, exit code and Surefire report in the development result; fix failing tests and run them again.
- The services' existing JUnit/Mockito/H2 tests do not prove that PostgreSQL, multi-service, Docker or business integration is done; prepare and run functional/integration tests for the chosen approach.
- Use BigDecimal for amounts in Java, and cover idempotency, state concurrency and funds consistency under failures. Follow this requirement for the semantics of notification failures versus funds failures; do not swallow errors across the board.
- Verify the available version and configuration of static check and security scan tools first; record Agent Review separately, and do not treat static analysis/security Skill text as actual scan results.
- Modify this requirement's business files only in the working directory of the explicitly bound requirement branch; the PR base is develop. Initialization does not mean development has started, and previously uncommitted code is not carried into the new branch automatically.

## Source Text: Interfaces, Data and Dependencies for This Requirement

## 7. Interfaces and Integration

| API | Direction | Description |
|------|------|------|
| POST `/api/v1/cards/{cardNumber}/loss` | Front end → card-service | Loss reporting (deduplicated, 201 the first time / 200 for duplicates) |
| POST `/api/v1/cards/{cardNumber}/replacements` | Front end → card-service | Replacement request (201) |
| GET `/api/v1/cards/{cardNumber}/replacements` | Front end → card-service | Replacement records for the card |
| GET `/api/v1/replacements/{id}` | Front end → card-service | Progress timeline |
| POST `/api/v1/replacements/{id}/cancel` | Front end → card-service | Cancel (before card production) |
| GET `/api/v1/admin/replacements?status=&page=&size=` | Back office → card-service | Replacement queue |
| POST `/api/v1/admin/replacements/{id}/status` | Back office → card-service | Update card production/mailing/completion |
| FEE posting | card-service → transaction-service | Replacement fee charged to the account and general ledger |
| Balance and statement update | transaction-service → account-service | The fee affects the available balance |
| Loss reporting/replacement notification | card-service → notification-service | Email, SMS, in-app message (failures do not roll back) |
| Audit event | card-service → audit-service | actor/action/resource/payload |
| Address lookup | card-service → customer-service | Delivery address validation |

Request example:

```json
{"reason":"LOST","confirmCardLast4":"5740"}
{"addressId":"ADDR-001","deliveryMethod":"STANDARD","idempotencyKey":"repl-20261027-001"}
```

Error code list:

| Error code | HTTP | Trigger condition |
|--------|------|---------|
| `CARD_NOT_ACTIVE` | 409 | The card is not `ACTIVE`, or the loss was not reported before replacement |
| `CARD_ALREADY_LOST` | 409 | Repeated loss reporting |
| `REPLACEMENT_EXISTS` | 409 | A replacement ticket is already in progress |
| `REPLACEMENT_NOT_CANCELLABLE` | 409 | The ticket is already in production or shipped |
| `INVALID_STATE_TRANSITION` | 409 | Invalid state transition |
| `INVALID_ADDRESS` | 400 | The address does not exist or does not belong to the customer |
| `FEE_POSTING_FAILED` | 202 | The ticket is created but the fee is pending collection |
| `CONCURRENT_MODIFICATION` | 409 | Optimistic locking conflict |
| `DOWNSTREAM_UNAVAILABLE` | 503 | card/customer/transaction dependency failure |

## 8. Data Requirements

### 8.1 Data Dictionary

**Table `card_operation` (new)**

| Entity/Field | Meaning | Type/Constraint | Source |
|-----------|------|----------|------|
| operation_id | Card operation serial number | varchar(32) primary key | Generated by card-service |
| card_number | Card number (stored masked) | varchar(19) not null, indexed | Request parameter |
| operation_type | Operation type | varchar(16), `LOSS`/`REPLACE`/`CANCEL` | Business action |
| status | Operation status | varchar(16), `SUCCESS`/`FAILED`/`PENDING` | State machine |
| reason | Operation reason | varchar(16), `LOST`/`STOLEN`/`DAMAGED` | Front-end dropdown |
| actor | Operator | varchar(64) not null | IAM token |
| created_at | Operation time | timestamptz not null | Server |
| payload | Request snapshot | jsonb, sensitive fields masked | Server |

**Table `card_replacement` (new)**

| Entity/Field | Meaning | Type/Constraint | Source |
|-----------|------|----------|------|
| replacement_id | Replacement ticket number | varchar(32) primary key | Generated by card-service |
| old_card_number | Old card number (stored masked) | varchar(19) not null | Request parameter |
| new_card_number | New card number (stored masked, ciphertext kept in a separate column) | varchar(19) unique | Generated by card-service |
| account_id | Linked account number | varchar(20) not null, indexed | card-service |
| customer_id | Customer number | varchar(20) not null | customer-service |
| address_id | Delivery address | varchar(32) not null | customer-service |
| fee_amount | Replacement fee | numeric(12,2) ≥ 0 | Pricing rules |
| fee_batch_id | Fee posting batch | varchar(32) nullable | transaction-service |
| status | Ticket status | varchar(16), 5 enum values | State machine |
| tracking_no | Tracking number | varchar(32) nullable | Filled in by operations |
| requested_at | Request time | timestamptz not null | Server |
| shipped_at | Shipping time | timestamptz nullable | Filled in by operations |
| activated_at | Activation time | timestamptz nullable | Activation action |
| idempotency_key | Deduplication key | varchar(64) unique index | Front end |
| version | Optimistic locking version | int default 0 | Server |

**Card table extension**

| Entity/Field | Meaning | Type/Constraint | Source |
|-----------|------|----------|------|
| card.status | Card status | varchar(16), new enum value `LOST` | card-service state machine |

### 8.2 Data Security

| Dimension | Requirement |
|------|------|
| Masking | Card numbers show only the last 4 digits in API responses, logs, and audit events; the page displays them as `\*\*\*\* \*\*\*\* \*\*\*\* 5740` |
| Encryption | Full card numbers are stored in a ciphertext column (AES-256, keys managed by KMS); HTTPS at the transport layer |
| Retention | Loss reporting and replacement tickets are retained for 5 years; audit events for 3 years; tracking numbers for the same period as the ticket |
| Access | Customers can access only their own cards and tickets; operations can view all tickets but cannot change card numbers; exported files expire automatically after 24 hours |
| Minimization | Customer ID document images and detailed home addresses are not collected; only `addressId` is referenced |

## 11. Dependencies and Constraints

### 11.1 Dependencies

| Dependency | Purpose | Impact of failure and handling |
|---------|------|---------------|
| card-service | Card state machine, card number generation | Loss reporting and replacement unavailable, returns 503 |
| customer-service | Address book lookup and validation | Replacement request rejected with an invalid address message |
| transaction-service | Replacement fee FEE posting | The ticket keeps `FEE_PENDING` and the charge is retried |
| account-service | Balance and statement update | The fee is posted later and the ticket is not blocked |
| notification-service | Loss reporting and replacement notifications | The main flow is not rolled back and redelivery is recorded |
| audit-service | Audit events | Write failures go to a local compensation log |
| IAM | Authentication and roles | Without a token, 401 is returned |

### 11.2 Impact Analysis

| Dimension | Impact |
|------|------|
| Front end | Card details, loss reporting confirmation dialog, replacement wizard, progress page, back-office queue |
| Back end | card-service state machine and tickets; FEE posting in transaction; notifications in notification; auditing in audit; balance in account |
| Data | `card_operation`, `card_replacement`; new `LOST` status in the card table |
| APIs | 7 new APIs; card details responses gain loss reporting and replacement status fields |
| Configuration | Replacement fee rules, delivery methods, notification templates, tracking number validation rules |
| Tests | Loss reporting deduplication, replacement uniqueness, fee posting, new card invalidation and activation, state machine, unauthorized access |
| Documentation | This requirement, API catalog, service inventory, loss reporting contingency plan |

### 11.3 Constraints

- Reuse card-service; do not create a separate replacement service.
- Card number generation must comply with the card network BIN ranges and the Luhn check rule.
- Amounts uniformly use `BigDecimal` / `numeric(12,2)`.
- All write APIs support a deduplication key; key operations write audit events.
- The demo environment keeps the IAM roles `U`/`A`; the POC does not enforce API-level authorization (ADR-007), but card ownership validation must be retained.

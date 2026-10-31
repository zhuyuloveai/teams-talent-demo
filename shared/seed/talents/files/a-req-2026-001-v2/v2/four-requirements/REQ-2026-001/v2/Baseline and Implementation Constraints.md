> v2 node materials: the original chapters and historical baseline excerpts below keep their original meaning. The current local test parameters follow `test-profile.md` v2 in this directory; the formal §12.3 items are still to be confirmed. Do not turn any other inferred policy into a confirmed one on your own.

# REQ-2026-001 · Baseline and Implementation Constraints

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
| POST `/api/v1/installments/preview` | Front end → installment-service | Preview (not persisted), returns a preview token and details |
| POST `/api/v1/installments` | Front end → installment-service | Create an installment (201, with a deduplication key) |
| GET `/api/v1/installments?accountId=&status=` | Front end → installment-service | My/account installment list |
| GET `/api/v1/installments/{id}` | Front end → installment-service | Details + repayment schedule |
| POST `/api/v1/installments/{id}/early-settlement` | Front end → installment-service | Early settlement preview and execution |
| GET `/api/v1/admin/installments?accountId=&status=&page=&size=` | Back office → installment-service | Back-office query and export |
| Transaction posting event | transaction-service → installment-service | Source of the installment eligibility fields |
| Limit reservation/release | installment-service → account-service | Plan creation reserves the remaining principal; settlement releases it |
| Fee income posting | installment-service → ledger-service | Fee and penalty fee entries |
| Installment notification | installment-service → notification-service | Plan creation and settlement notifications (failures do not roll back) |
| Audit event | installment-service → audit-service | actor/action/resource/payload |

Create request example:

```json
{"idempotencyKey":"ins-20261027-001","accountId":"00000000006",
 "sourceType":"TRANSACTION","sourceId":"0000000000000200",
 "principal":1000.00,"termMonths":6,"agreementAccepted":true}
```

Error code list:

| Error code | HTTP | Trigger condition |
|--------|------|---------|
| `INSTALLMENT_NOT_ELIGIBLE` | 409 | Insufficient amount, unsupported status, overdue, or in dispute |
| `ALREADY_INSTALLED` | 409 | The transaction or statement already has an effective plan |
| `INVALID_TERM` | 409 | Period count not in 3/6/12 |
| `PREVIEW_EXPIRED` | 409 | Preview token expired or amount mismatch |
| `PRINCIPAL_EXCEEDS_LIMIT` | 409 | Principal exceeds the installment-eligible balance |
| `SETTLEMENT_NOT_ALLOWED` | 409 | The plan is not `ACTIVE` |
| `AGREEMENT_REQUIRED` | 400 | Agreement not checked |
| `INSTALLMENT_NOT_FOUND` | 404 | Plan does not exist or unauthorized |
| `DOWNSTREAM_UNAVAILABLE` | 503 | account/ledger call failed |

## 8. Data Requirements

### 8.1 Data Dictionary

**Table `installment_plan` (new)**

| Entity/Field | Meaning | Type/Constraint | Source |
|-----------|------|----------|------|
| plan_id | Installment plan number | varchar(32) primary key | Generated by installment-service |
| account_id | Account number | varchar(20) not null, indexed | Request body/session |
| customer_id | Customer number | varchar(20) not null | customer-service |
| source_type | Installment source type | varchar(16), `TRANSACTION`/`BILL` | Request body |
| source_id | Transaction ID or statement ID | varchar(32) not null | Request body |
| principal | Installment principal | numeric(12,2) > 0 | Preview result |
| term_months | Number of periods | smallint, only 3/6/12 | Request body |
| monthly_fee_rate | Monthly fee rate | numeric(6,4) | Pricing table |
| total_fee | Total fees | numeric(12,2) ≥ 0 | Computed value |
| remaining_principal | Remaining principal | numeric(12,2) ≥ 0 | Updated by settlement/repayment |
| status | Plan status | varchar(16), `ACTIVE`/`SETTLED`/`CANCELLED` | State machine |
| created_at | Creation time | timestamptz not null | Server |
| settled_at | Settlement time | timestamptz nullable | Settlement action |
| idempotency_key | Deduplication key | varchar(64) unique index | Front end |
| version | Optimistic locking version | int default 0 | Server |

**Table `installment_schedule` (new)**

| Entity/Field | Meaning | Type/Constraint | Source |
|-----------|------|----------|------|
| schedule_id | Repayment schedule line number | varchar(32) primary key | Generated by installment-service |
| plan_id | Owning plan number | varchar(32) foreign key | installment_plan |
| installment_no | Period sequence | smallint, unique together with plan_id | Server |
| due_date | Due date | date not null | Statement cycle |
| principal_due | Principal due this period | numeric(12,2) ≥ 0 | Computed value |
| fee_due | Fee due this period | numeric(12,2) ≥ 0 | Computed value |
| total_due | Total due this period | numeric(12,2) ≥ 0 | Computed value |
| status | Status of this period | varchar(16), `PENDING`/`PAID` | Updated by repayment |
| paid_at | Actual repayment time | timestamptz nullable | Updated by repayment |

**View extension `account_limit_view`**

| Entity/Field | Meaning | Type/Constraint | Source |
|-----------|------|----------|------|
| installment_occupied | Limit occupied by installments | numeric(12,2) ≥ 0, = total remaining principal of effective plans | installment_plan |

### 8.2 Data Security

| Dimension | Requirement |
|------|------|
| Masking | API responses and logs keep only the last 4 digits of the card number; customer names are shown as "surname + \*"; sensitive fields are filtered before JSON is persisted |
| Encryption | HTTPS at the transport layer; TLS enabled for database connections; no new fields require encryption at rest (this phase has only amounts and plan numbers) |
| Retention | Installment plans and repayment schedules are retained for 5 years per the simulated policy; audit events for 3 years; deduplication keys for the same period as the plan |
| Access | Customers can read only their own account data (unauthorized access returns 404); operations and risk are read-only; write operations are limited to customer service assistance scenarios and are audited |
| Export | Back-office export requires `installment:read:any`, files are valid for 24 hours, and the export action is audited |

## 11. Dependencies and Constraints

### 11.1 Dependencies

| Dependency | Purpose | Impact of failure and handling |
|---------|------|---------------|
| transaction-service | Transaction status and installment eligibility fields | The entry shows a retry action and the application flow is not entered |
| billing-service | Installment-eligible statement amount | Preview fails and can be retried |
| account-service | Limit reservation and release | Submission rolls back and no plan is created |
| ledger-service | Fee and penalty fee entries | Submission or settlement rolls back and raises an alert |
| notification-service | Plan creation and settlement notifications | The main flow is not rolled back; the failed notification is recorded for redelivery |
| audit-service | Audit events | Write failures go to a local retry queue |
| IAM | Authentication and roles | Without a token, the response is 401 |

### 11.2 Impact Analysis

| Dimension | Impact |
|------|------|
| Front end | Transaction details, statement page, new application page, list/details page, back-office query page |
| Back end | New installment-service; installment eligibility in transaction, installment-eligible amount in billing, limit occupation in account, fee income in ledger, notifications in notification, auditing in audit |
| Data | 2 new tables + a new "installment occupation" in the account limit view |
| APIs | 6 new APIs; transaction and statement responses gain installment eligibility fields |
| Configuration | New Compose service and database, web-ui proxy |
| Tests | Preview, plan creation, deduplication, eligibility rejection, early settlement, limit release, general ledger entries |
| Documentation | This requirement, API catalog, service inventory, runbook |

### 11.3 Constraints

- The technology stack keeps the existing Spring Boot 3 / PostgreSQL / vanilla SPA and introduces no new framework.
- A new service `installment-service :8110` and database `carddemo_installment` are recommended; merging it into billing-service must be decided after review.
- Amounts uniformly use `BigDecimal` / `numeric(12,2)`; IDs follow the existing zero-padding or UUID conventions.
- Changes affecting balances must go through account-service; changes with accounting impact must be posted to ledger-service.
- All write endpoints must support a deduplication key; key operations write audit events.

# REQ-2026-004 · Baseline and Implementation Constraints

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

## 7. APIs and integration

| API | Direction | Description |
|------|------|------|
| POST `/api/v1/disputes` | Front end → dispute-service | Open a case (201, with deduplication key) |
| GET `/api/v1/disputes?accountId=&status=&page=&size=` | Front end → dispute-service | My dispute list |
| GET `/api/v1/disputes/{id}` | Front end → dispute-service | Details and timeline |
| POST `/api/v1/disputes/{id}/evidence` | Front end → document-service | Upload evidence and write back metadata |
| POST `/api/v1/disputes/{id}/withdraw` | Front end → dispute-service | Withdraw the case |
| GET `/api/v1/admin/disputes?status=&sla=breached&page=&size=` | Back office → dispute-service | Case workbench list |
| POST `/api/v1/admin/disputes/{id}/review` | Back office → dispute-service | Intake review |
| POST `/api/v1/admin/disputes/{id}/provisional-credit` | Back office → dispute-service | Provisional credit (deduplicated by `creditId`) |
| POST `/api/v1/admin/disputes/{id}/chargeback` | Back office → dispute-service | Initiate chargeback |
| POST `/api/v1/admin/disputes/{id}/resolve` | Back office → dispute-service | Close the case (`won=true/false`) |
| Transaction snapshot | dispute-service → transaction-service | Read the transaction amount, posting date, and status |
| Evidence storage | dispute-service → document-service | File storage and authenticated download |
| Provisional credit and reversal | dispute-service → account-service | `POST /accounts/{id}/credits`, `creditId = provisionalCreditId` |
| Case notification | dispute-service → notification-service | Case opening, credit, closing, SLA reminders (failures do not roll back) |
| Audit events | dispute-service → audit-service | actor/action/resource/payload |

Request example:

```json
{"transactionId":"0000000000000200","accountId":"00000000006",
 "reasonCode":"FRAUD","amount":299.00,"description":"unauthorized transaction",
 "idempotencyKey":"dsp-20261027-001"}
```

Error code list:

| Error code | HTTP | Trigger condition |
|--------|------|---------|
| `DISPUTE_NOT_ELIGIBLE` | 409 | Transaction not posted or more than 90 days old |
| `DISPUTE_EXISTS` | 409 | A case is already in progress for the same transaction |
| `EVIDENCE_REQUIRED` | 409 | FRAUD/UNAUTHORIZED without evidence uploaded |
| `INVALID_EVIDENCE` | 400 | Type or size does not match the allowlist |
| `EVIDENCE_LIMIT_EXCEEDED` | 400 | More than 5 evidence files for one case |
| `INVALID_DISPUTE_AMOUNT` | 400 | Amount ≤ 0 or above the transaction amount |
| `INVALID_DISPUTE_STATE` | 409 | The current status does not support the operation |
| `PROVISIONAL_CREDIT_EXCEEDS_AMOUNT` | 409 | Provisional credit amount exceeds the dispute amount |
| `APPROVAL_REQUIRED` | 403 | High-value credit without supervisor approval |
| `CHARGEBACK_WINDOW_EXPIRED` | 409 | Beyond the 30-day chargeback window |
| `SETTLEMENT_CONFLICT` | 409 | Case closing rule conflict |
| `DOWNSTREAM_UNAVAILABLE` | 503 | transaction/document/account dependency failed |

## 8. Data requirements

### 8.1 Data dictionary

**Table `dispute_case` (reused and extended)**

| Entity/Field | Meaning | Type/Constraint | Source |
|-----------|------|----------|------|
| case_id | Case number | varchar(32) primary key | Generated by dispute-service |
| transaction_id | Related transaction number | varchar(20) not null, indexed | Transaction snapshot |
| account_id | Account number | varchar(20) not null, indexed | Request body |
| customer_id | Customer ID | varchar(20) not null | customer-service |
| reason_code | Reason code | varchar(24), 5 enum values | Front-end dropdown |
| amount | Dispute amount | numeric(12,2) > 0 and ≤ transaction amount | Front-end form |
| description | Dispute description | varchar(500) not null | Front-end input |
| status | Case status | varchar(16), 7 enum values | State machine |
| sla_due_at | SLA due time | timestamptz not null | Computed value |
| last_action_at | Last action time | timestamptz not null | Refreshed on state transition |
| provisional_credit_id | Provisional credit identifier | varchar(32) nullable, unique | dispute-service |
| chargeback_at | chargeback initiation time | timestamptz nullable | Specialist action |
| idempotency_key | Deduplication key | varchar(64) unique index | Front end |
| version | Optimistic locking version | int default 0 | Server |

**Table `dispute_evidence` (new)**

| Entity/Field | Meaning | Type/Constraint | Source |
|-----------|------|----------|------|
| evidence_id | Evidence ID | varchar(32) primary key | Generated by dispute-service |
| case_id | Owning case | varchar(32) foreign key | dispute_case |
| document_id | File identifier | varchar(32) not null, composite unique `(case_id, document_id)` | document-service |
| file_name | Original file name | varchar(128) not null | Upload request |
| content_type | File type | varchar(32), `application/pdf`/`image/jpeg`/`image/png` | Upload request |
| uploaded_by | Uploaded by | varchar(64) not null | IAM token |
| uploaded_at | Upload time | timestamptz not null | Server |

**Table `dispute_event` (new)**

| Entity/Field | Meaning | Type/Constraint | Source |
|-----------|------|----------|------|
| event_id | Event ID | varchar(32) primary key | Generated by dispute-service |
| case_id | Owning case | varchar(32) foreign key, indexed | dispute_case |
| event_type | Event type | varchar(32), `SUBMIT`/`REVIEW`/`CREDIT`/`CHARGEBACK`/`RESOLVE`/`EVIDENCE_VIEW` | Business action |
| from_status / to_status | Status before and after the transition | varchar(16) nullable | State machine |
| actor | Operator | varchar(64) not null | IAM token |
| payload | Event content | jsonb, sensitive fields masked | Server |
| created_at | Event time | timestamptz not null | Server |

### 8.2 Data security

| Dimension | Requirement |
|------|------|
| Masking | Customer names are shown as "surname + \*"; card numbers show only the last 4 digits; evidence file names are truncated in lists and downloads require authentication |
| Encryption | Evidence files are stored encrypted by document-service (AES-256); this service stores only metadata; HTTPS at the transport layer |
| Retention | Cases and evidence are retained for 7 years (simulated policy); audit events are retained for 3 years; expired evidence is archived by document-service |
| Access | Customers can only access evidence of their own cases; specialists can access cases they handle; supervisors can access all; every download writes an audit event |
| Minimization | No customer identity document images are collected; the description field filters HTML and scripts and is capped at 500 characters |

## 11. Dependencies and constraints

### 11.1 Dependencies

| Dependency | Purpose | Failure impact and handling |
|---------|------|---------------|
| transaction-service | Transaction snapshot and eligibility | The entry point shows retry and no case is created |
| document-service | Evidence storage and authenticated download | Case opening fails or evidence is missing; the customer is asked to retry |
| account-service | Provisional credit and closing reversal | The case status is unchanged and enters the retry queue |
| notification-service | Case opening, credit, closing, SLA reminders | The main flow does not roll back; the notification is recorded for resending |
| audit-service | Audit events | Write failures go to a local compensation log |
| fraud-service | Fraud leads (reserved only in this iteration) | Does not block the main flow |
| IAM | Authentication, roles, and supervisor approval principals | No token returns 401 |

### 11.2 Impact analysis

| Dimension | Impact |
|------|------|
| Front end | Transaction details, dispute application, my disputes, dispute details, back-office workbench, case details |
| Back end | dispute state machine and SLA; document evidence; account provisional credit; transaction snapshots; notification notifications; audit auditing |
| Data | `dispute_case` gains fields; `dispute_evidence` and `dispute_event` are added |
| APIs | 10 new and extended APIs; the transaction response gains a dispute status field |
| Configuration | Evidence size and type, SLA rules, high-value credit threshold 1000.00, notification templates |
| Testing | Eligibility, unique case, mandatory evidence, provisional credit deduplication and limits, state transitions, SLA, privilege escalation |
| Documentation | This requirement, API catalog, dispute handling runbook, SLA description |

### 11.3 Constraints

- Reuse the existing dispute-service and `dispute_case`; no new dispute service is created.
- Evidence files are managed by document-service and this service stores only metadata.
- Amounts uniformly use `BigDecimal` / `numeric(12,2)`.
- All write APIs support deduplication keys; provisional credit and closing must support deduplication (double validation through `creditId` and case status).
- The demo environment reuses IAM roles `U`/`A`, and the POC does not perform strict API-level authorization (ADR-007), but case ownership validation must be retained.

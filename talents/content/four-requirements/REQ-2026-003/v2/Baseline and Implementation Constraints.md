> v2 node materials: the original chapters and historical baseline excerpts below keep their original meaning. The current local test parameters follow `test-profile.md` v2 in this directory; the formal §12.3 items are still to be confirmed. Do not turn any other inferred policy into a confirmed one on your own.

# REQ-2026-003 · Baseline and Implementation Constraints

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
| POST `/api/v1/limit-applications` | Front end → limit-service | Submit an application (201, with deduplication key) |
| GET `/api/v1/limit-applications?accountId=&status=` | Front end → limit-service | Application list for a customer and account |
| GET `/api/v1/limit-applications/{id}` | Front end → limit-service | Details and progress |
| POST `/api/v1/limit-applications/{id}/documents` | Front end → document-service | Supplement documents, returns `documentId` |
| GET `/api/v1/admin/limit-applications?status=&page=&size=` | Back office → limit-service | Approval to-do list |
| POST `/api/v1/admin/limit-applications/{id}/review` | Back office → limit-service | Initial review approval or rejection |
| POST `/api/v1/admin/limit-applications/{id}/approve` | Back office → limit-service | Final approval and limit update |
| POST `/api/v1/admin/limit-applications/{id}/reject` | Back office → limit-service | Rejection (reason mandatory) |
| Approval tasks | limit-service → workflow-service | Create the initial review and final approval task nodes |
| Limit update | limit-service → account-service | `PUT /accounts/{id}` updates `creditLimit` |
| Limit definition synchronization | limit-service → limit limit table | Update the account limit definition |
| Limit increase notification | limit-service → notification-service | Submission and approval result notifications (failures do not roll back) |
| Audit events | limit-service → audit-service | actor/action/resource/payload |

Request example:

```json
{"accountId":"00000000006","requestedLimit":12000.00,
 "purpose":"TRAVEL","incomeRange":"20K-30K",
 "idempotencyKey":"lim-20261027-001"}
```

Error code list:

| Error code | HTTP | Trigger condition |
|--------|------|---------|
| `LIMIT_APPLICATION_EXISTS` | 409 | An in-progress application already exists |
| `LIMIT_NOT_ELIGIBLE` | 409 | Delinquency, insufficient card tenure, or count exceeded |
| `LIMIT_EXCEEDS_PRODUCT_MAX` | 409 | Requested limit exceeds the product maximum |
| `LIMIT_REACHED_PRODUCT_MAX` | 409 | Current limit already at the product maximum |
| `INVALID_REQUESTED_LIMIT` | 400 | Requested limit ≤ current limit |
| `DOCUMENT_REQUIRED` | 400 | More than 2x the limit requested without uploading documents |
| `INVALID_DOCUMENT` | 400 | Type or size does not match the allowlist |
| `APPLICATION_NOT_PENDING` | 409 | Application status is not pending |
| `DECISION_NOTE_REQUIRED` | 400 | Rejection without a reason |
| `DUAL_APPROVAL_REQUIRED` | 409 | Dual approval required but the second approver is missing |
| `SOD_VIOLATION` | 403 | Separation of duties violated |
| `CREDIT_LIMIT_UPDATE_FAILED` | 503 | Limit update or limit definition synchronization failed |
| `DOWNSTREAM_UNAVAILABLE` | 503 | account/limit/workflow dependency failed |

## 8. Data requirements

### 8.1 Data dictionary

**Table `limit_application` (new)**

| Entity/Field | Meaning | Type/Constraint | Source |
|-----------|------|----------|------|
| application_id | Application ID | varchar(32) primary key | Generated by limit-service |
| account_id | Account number | varchar(20) not null, indexed | Request body/session |
| customer_id | Customer ID | varchar(20) not null | customer-service |
| current_limit | Current limit at application time | numeric(12,2) > 0 | account-service snapshot |
| requested_limit | Requested limit | numeric(12,2) > `current_limit` | Front-end form |
| approved_limit | Approved limit | numeric(12,2) nullable, ≤ `requested_limit` | Entered by the approver |
| purpose | Purpose | varchar(16), 5 enum values | Front-end dropdown |
| income_range | Income range | varchar(16), 5 enum values | Front-end dropdown |
| status | Application status | varchar(16), `SUBMITTED`/`PRE_REVIEWED`/`REVIEWED`/`APPROVED`/`APPROVED_PENDING`/`REJECTED`/`EXPIRED` | State machine |
| pre_review_note | Pre-review decision note | varchar(128) nullable, contains the rule ID | limit-service |
| decision_note | Approval comment | varchar(256) nullable, required on rejection | Entered by the approver |
| submitted_at | Submission time | timestamptz not null | Server |
| decided_at | Decision time | timestamptz nullable | Approval action |
| effective_at | Limit effective time | timestamptz nullable | account-service |
| applicant | Applicant | varchar(64) not null | IAM token |
| reviewer | Initial reviewer | varchar(64) nullable | IAM token |
| approver | Final approver | varchar(64) nullable, ≠ `applicant` | IAM token |
| second_approver | Second approver | varchar(64) nullable, used for dual approval | IAM token |
| idempotency_key | Deduplication key | varchar(64) unique index | Front end |
| version | Optimistic locking version | int default 0 | Server |

**Related tables and external data**

| Entity/Field | Meaning | Type/Constraint | Source |
|-----------|------|----------|------|
| limit_application_document.application_id | Document-to-application association | varchar(32) not null, composite unique `(application_id, document_id)` | limit-service |
| limit_application_document.document_id | Document identifier | varchar(32) not null | document-service |
| account.credit_limit | Account credit limit | numeric(12,2) > 0 | account-service |
| limit_definition.account_id / max_amount | Account limit definition and maximum | varchar(20) / numeric(12,2) | limit-service |

### 8.2 Data security

| Dimension | Requirement |
|------|------|
| Masking | Customer names in the approval workbench list are shown as "surname + \*"; card numbers show only the last 4 digits; the income range is shown as an enum without the underlying amount details |
| Encryption | Income documents are stored encrypted by document-service (AES-256); this service stores only `documentId`; HTTPS at the transport layer |
| Retention | Application and approval records are retained for 5 years; income documents are automatically archived and deleted after 2 years; audit events are retained for 3 years |
| Access | Customers can only read their own applications; approvers can read applications and documents within their scope; document downloads require authentication and write an audit record; exported files expire after 24 hours |
| Minimization | Only purpose, income range, requested limit, and document references are collected; full income transaction details are not collected |

## 11. Dependencies and constraints

### 11.1 Dependencies

| Dependency | Purpose | Failure impact and handling |
|---------|------|---------------|
| account-service | Limit read and update | Effectiveness failure keeps `APPROVED_PENDING` and retries automatically 6 times |
| limit-service | Product maximum and limit definitions | Pre-review is blocked, the application stays `SUBMITTED` |
| workflow-service | Initial review and final approval tasks | Approval to-dos are invisible; task creation is retried |
| document-service | Income document storage and authenticated download | Document submission failure returns `INVALID_DOCUMENT` |
| customer-service | Basic customer information | Fields are missing in the approval details; a placeholder is shown and an alert is raised |
| notification-service | Limit increase result notification | The main flow does not roll back; the notification is recorded for resending |
| audit-service | Audit events | Write failures go to a local compensation log |
| IAM | Authentication, roles, and SoD principals | No token returns 401 |

### 11.2 Impact analysis

| Dimension | Impact |
|------|------|
| Front end | Account view, application page, progress page, approval workbench, approval details |
| Back end | limit-service applications and rules; workflow approval; account limit update; document documents; notification notifications; audit auditing |
| Data | `limit_application`, `limit_application_document`; account limit version and audit events |
| APIs | 8 new APIs; the account response gains an "in-progress limit increase application" field |
| Configuration | Product maximum limit, approval roles, dual approval threshold (2x the current limit), notification templates |
| Testing | Eligibility rules, SoD, duplicate applications, limit effectiveness after approval, downstream failure retries |
| Documentation | This requirement, API catalog, approval permission matrix, limit increase policy description |

### 11.3 Constraints

- Reuse the existing limit-service and workflow-service; no new approval service is created.
- The approval roles and permission matrix must be aligned with IAM/RBAC before go-live.
- Amounts uniformly use `BigDecimal` / `numeric(12,2)`.
- All write APIs support deduplication keys; approval decisions cannot be overwritten, only appended.
- The demo environment reuses IAM roles `U`/`A`, and the POC does not perform strict API-level authorization (ADR-007), but SoD validation must be retained.

# REQ-2026-003 · Business Rules and Scope

Source: user-provided requirement v1.0. The chapters below are quoted in full from the source; values are used according to their simulated status in the source material.

## 3. Scope definition

### 3.1 In-Scope / Out-of-Scope

**In-Scope**

- Permanent limit applications (initiated by the customer).
- Customer application, document supplement, and progress query.
- Automated pre-review: delinquency, card tenure, number of limit increases in the past 6 months, product maximum.
- Workflow approval (initial review→final approval), limit update, notification, audit.
- Limit increase entry point on the front-end account page, application page, progress page; back-office approval workbench.

**Out-of-Scope**

- Automatic limit increase (initiated by the system).
- Limit decrease, restoration after temporary limit expiry.
- Income proof OCR and external credit bureau integration.

### 3.2 Assumptions and dependencies

| ID | Assumption/Dependency | Description |
|------|----------|------|
| A-01 | account-service provides APIs to read and update the limit | This iteration reuses `PUT /accounts/{id}` |
| A-02 | limit-service maintains limit definitions and the product maximum limit | The pre-review rule upper bound is taken from this service |
| A-03 | workflow-service provides approval tasks and to-do lists | Initial review and final approval are two task nodes |
| A-04 | document-service stores income documents and returns `documentId` | This requirement stores only the reference |
| A-05 | Delinquency data is provided by the statement or collections service | A read-only API is called during pre-review |

## 5. Business rules

| ID | Rule | Source | Priority | Verification point |
|------|------|------|--------|--------|
| BR-LIM-01 | The requested limit must be > the current limit and ≤ the product maximum limit | Simulated risk policy | Must | 8000→8000 rejected; 8000→25000 passes; 8000→25000.01 returns `LIMIT_EXCEEDS_PRODUCT_MAX` |
| BR-LIM-02 | No limit increase when there is delinquency or an unpaid minimum payment in the past 6 months | Simulated risk policy | Must | Fabricate 1 month of delinquency data; pre-review sets `REJECTED` and `preReviewNote` contains BR-LIM-02 |
| BR-LIM-03 | No limit increase when the card has been open for less than 3 months | Simulated risk policy | Must | Application with a card opened for 2 months is rejected, prompting that it can be applied for after 3 months |
| BR-LIM-04 | At most 1 successful limit increase per account within 6 months; only 1 in-progress application is allowed | Simulated risk policy | Must | The second application returns `LIMIT_NOT_ELIGIBLE`; concurrent submissions persist only 1 application |
| BR-LIM-05 | When the requested limit is > 2x the current limit, income documents must be supplied and dual approval is required | Simulated risk policy | Must | 8000→20000.01 without documents rejected; with documents `dualApprovalRequired=true` |
| BR-LIM-06 | The approver must not be the applicant or the initial reviewer (SoD) | Simulated compliance | Must | The same account acting in both roles returns 403 `SOD_VIOLATION` |
| BR-LIM-07 | After approval the limit takes effect immediately; a rejection must state a reason | Simulated risk policy | Must | Within 5 seconds after approval the account limit = `approvedLimit`; rejection without a reason returns `DECISION_NOTE_REQUIRED` |
| BR-LIM-08 | When the limit update fails, the application stays `APPROVED_PENDING` and can be retried | Simulated risk policy | Must | Approve after disabling account-service; the status is `APPROVED_PENDING` and it becomes effective automatically after recovery |

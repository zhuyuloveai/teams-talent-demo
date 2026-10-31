> v2 node materials: the original chapters and historical baseline excerpts below keep their original meaning. The current local test parameters follow `test-profile.md` v2 in this directory; the formal §12.3 items are still to be confirmed. Do not turn any other inferred policy into a confirmed one on your own.

# REQ-2026-004 · Enterprise Test Case Definition and Acceptance

Source: original requirement §9 Scenario matrix and §10 Acceptance criteria (executable). The source excerpts are unchanged; the current case projection version is REQ-2026-004-cases-v2 (formerly REQ-2026-004-cases-v1). All cases below are pending execution, not reports of completed runs; conflicting expectations must be linked to a PRD decision and must not be marked as passed directly. The test asset plugin provides the cases; Talent provides the verification knowledge and Skills.

## 9. Scenario matrix

| Type | Scenario | Role | Data/API | Expected |
|------|------|------|-----------|------|
| Main flow | Dispute a posted transaction within 90 days as FRAUD with 1 PDF uploaded | Cardholder | POST `/disputes` + `/evidence` | 201, case `OPEN`, `sla_due_at` = submission time + 1 business day, the timeline is visible to the customer |
| Main flow | The specialist approves the review and initiates a provisional credit of 299.00 | Dispute specialist | POST `/admin/disputes/{id}/review` + `/provisional-credit` | Case `PROVISIONAL_CREDIT`, account credited 299.00, the credit status is visible to the customer |
| Main flow | chargeback won and the case closed | Dispute specialist | POST `/admin/disputes/{id}/chargeback` + `/resolve` (`won=true`) | Case `WON` then `CLOSED`, the provisional credit is retained, the notification is sent |
| Boundary | Transaction posting date exactly 90 days from today | Cardholder | POST `/disputes` | 201, the case can be opened |
| Boundary | Transaction posting date 91 days from today | Cardholder | POST `/disputes` | 409 `DISPUTE_NOT_ELIGIBLE` |
| Boundary | Provisional credit amount = dispute amount | Dispute specialist | POST `/provisional-credit`, `creditAmount` = `amount` | 200, crediting succeeds |
| Boundary | Upload the 5th piece of evidence for one case | Cardholder | POST `/disputes/{id}/evidence` | 200, the evidence count reaches the limit |
| Exception | Second case opening for the same transaction | Cardholder | POST `/disputes` | 409 `DISPUTE_EXISTS` |
| Exception | FRAUD reason without evidence uploaded | Cardholder | POST `/disputes` | 409 `EVIDENCE_REQUIRED` |
| Exception | Provisional credit submitted twice | Dispute specialist | POST `/provisional-credit`, `provisionalCreditId` fixed | The account is credited only once and the second call returns the first result |
| Exception | Provisional credit amount 300.00 while the dispute amount is 299.00 | Dispute specialist | POST `/provisional-credit` | 409 `PROVISIONAL_CREDIT_EXCEEDS_AMOUNT` |
| Exception | chargeback initiated on day 31 | Dispute specialist | POST `/chargeback` | 409 `CHARGEBACK_WINDOW_EXPIRED` |
| Deadline | 23 hours until the case SLA due time | System scan | Daily 02:00 scan job | The specialist and supervisor receive the reminder, `slaState=DUE_SOON` |
| Permission | Customer A downloads customer B's evidence | Cardholder | GET evidence download URL | 403, no file content returned, the denial is audited |

## 10. Acceptance criteria (executable)

| Story | Given | When | Then | Data preparation |
|------|-------|------|------|---------|
| US-001 | A posted transaction of 299.00 within 90 days with no dispute in progress | Submit a FRAUD dispute and upload 1 PDF | Case `OPEN`, the customer can view the timeline and the SLA due time | Transaction 0000000000000200, account 00000000006 |
| US-002 | The same transaction already has an `OPEN` case | Open the case again | 409 `DISPUTE_EXISTS`, the number of cases is unchanged | Reuse the US-001 data |
| US-003 | The transaction has no evidence uploaded | Submit a FRAUD dispute | 409 `EVIDENCE_REQUIRED` | Reuse the US-001 data |
| US-004 | Case `UNDER_REVIEW` | Provisional credit of 100.00 submitted twice | The account is credited 100.00 once and the case is `PROVISIONAL_CREDIT` | Case number + initial account balance |
| US-005 | The case has been provisionally credited | Initiate chargeback and close with `won=true` | Status `WON` then `CLOSED`, the customer receives the notification, audit records are complete | Reuse the US-004 data |
| US-006 | 23 hours until the case SLA due time | Run the daily 02:00 scan | The specialist and supervisor receive the reminder, `slaState=DUE_SOON` | Adjust the `sla_due_at` data |
| US-007 | The transaction was posted 91 days ago | Open the transaction details | Entry point greyed out, prompting "Please call customer service for transactions older than 90 days" | Transaction 0000000000000199 |
| US-008 | account-service disabled | Initiate a provisional credit of 299.00 | 503 `DOWNSTREAM_UNAVAILABLE`, the case stays `UNDER_REVIEW`, the balance is unchanged | Disable the container |

## Execution Evidence Requirements

Functional tests, static tool checks, Agent Review, security reports and issue re-tests each record the actual command, tool version, code commit, exit code and report path. Owner acceptance is based on these actual results; publishing knowledge does not mean the requirement is accepted.

## test-profile-v2 Additions (not new source ACs)

Withdrawing a provisionally credited case needs a customer request + supervisor confirmation; reverse once against the original creditId, then CLOSED with the reason kept. Normal closing: entry and review by different accounts, and no final funds settlement before review. Asia/Shanghai Monday–Friday business days and 02:00 scan; do not claim a statutory holiday calendar.
All original US-001..008 are kept; real execution reports must distinguish the original ACs from the cases added by this profile.

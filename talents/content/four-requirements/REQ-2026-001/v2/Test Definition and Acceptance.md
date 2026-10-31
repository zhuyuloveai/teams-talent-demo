> v2 node materials: the original chapters and historical baseline excerpts below keep their original meaning. The current local test parameters follow `test-profile.md` v2 in this directory; the formal §12.3 items are still to be confirmed. Do not turn any other inferred policy into a confirmed one on your own.

# REQ-2026-001 · Enterprise Test Case Definition and Acceptance

Source: original requirement §9 Scenario Matrix and §10 Acceptance Criteria (Executable). The source excerpts are unchanged; the current case projection version is REQ-2026-001-cases-v2 (formerly REQ-2026-001-cases-v1). All cases below are pending execution, not reports of completed runs; conflicting expectations must be linked to a PRD decision and must not be marked as passed directly. The test asset plugin provides the cases; Talent provides the verification knowledge and Skills.

## 9. Scenario Matrix

| Type | Scenario | Role | Data/API | Expectation |
|------|------|------|-----------|------|
| Main flow | 1000.00 posted purchase split into 6 periods | Cardholder | POST `/installments`, transaction data 0000000000000200 | 201, plan `ACTIVE`, 6-period repayment schedule generated, limit occupation +1000.00 |
| Main flow | Statement installment of 500.00 split into 3 periods | Cardholder | POST `/preview` + `/installments` | Total fees 9.00, first-period total 175.67 |
| Boundary | Minimum single purchase of 100.00 split into 12 periods | Cardholder | POST `/installments`, principal = 100.00 | 201; 8.33 per period, 8.37 for the last period |
| Boundary | Query the plan list with paging size = 100 | Cardholder | GET `/installments?page=1&size=100` | 200, at most 100 records returned, latency p95 < 800ms |
| Boundary | Submit a preview token exactly at the 30-minute boundary | Cardholder | POST `/installments`, previewToken generated 30 minutes earlier | 409 `PREVIEW_EXPIRED` |
| Exception | Install the same transaction twice | Cardholder | POST `/installments`, sourceId already has an effective plan | 409 `ALREADY_INSTALLED`, no new plan |
| Exception | Submit the same deduplication key 3 times | Cardholder | POST `/installments`, fixed idempotencyKey | The same plan_id is returned 3 times, and only 1 set of accounting entries exists |
| Exception | ledger-service unavailable | Cardholder | POST `/installments` after the ledger is stopped | 503 `DOWNSTREAM_UNAVAILABLE`, no plan or repayment schedule persisted |
| Exception | Settle again after early settlement | Cardholder | POST `/installments/{id}/early-settlement` a second time | 409 `SETTLEMENT_NOT_ALLOWED` |
| Permission | Customer A queries customer B's plan | Cardholder | GET `/installments/{planId}`, where planId belongs to B | 404 `INSTALLMENT_NOT_FOUND`, no data leakage |
| Permission | Operations triggers an assisted settlement | Customer service/operations | POST `/installments/{id}/early-settlement` with a token containing `installment:settle:assist` | 200, audit records the operations account as actor |

## 10. Acceptance Criteria (Executable)

| Story | Given | When | Then | Data preparation |
|------|-------|------|------|---------|
| US-001 | A posted purchase of 1000.00 exists and the account limit is 20000.00 | Preview 6 periods and submit | 166.66 principal and 5.50 fee per period, first-period total 172.16, total fees 33.00; plan `ACTIVE` | Transaction 0000000000000200, account 00000000006 |
| US-002 | A plan was already created with the deduplication key `ins-20261027-001` | Submit again with the same deduplication key | The same plan_id is returned and the `installment_plan` and accounting entry counts do not change | Reuse US-001 data |
| US-003 | The transaction is already on an installment plan | Apply for an installment again | 409 `ALREADY_INSTALLED`, and the page shows the "Already installed" badge | Reuse US-001 data |
| US-004 | The plan was created successfully | Query the account limit view and the plan details | Installment occupation = 1000.00, and the 6 repayment schedule rows total principal + fees | Reuse US-001 data |
| US-005 | The plan has a remaining principal of 600.00 and is `ACTIVE` | Settle early | Remaining principal drops to zero, 600.00 of limit is released, and the 6.00 penalty fee is posted to the ledger | Plan has 3 periods with 1 already repaid |
| US-006 | The transaction amount is 99.99 | Open the transaction details | The entry is greyed out with the message "A single purchase of 100.00 or more is required to apply for an installment" | Transaction 0000000000000201 |
| US-007 | ledger-service is stopped | Submit an installment | 503 `DOWNSTREAM_UNAVAILABLE`, with no half-completed funds state | Stop the ledger container |
| US-008 | The operations account holds `installment:read:any` | Export the installment list for 30 days | A CSV is generated, downloadable within 24 hours, and the export action is audited | At least 20 plan records over 30 days |

## Execution Evidence Requirements

Functional tests, static tool checks, Agent Review, security reports and issue re-tests each record the actual command, tool version, code commit, exit code and report path. Owner acceptance is based on these actual results; publishing knowledge does not mean the requirement is accepted.

## v2 Assertions to Keep and Add

- Original US-005: 900/3 with principal 300 repaid and 600 remaining, penalty fee 6, feeRebate 0, settlement 606; balance/occupation is released only once, based on the principal actually repaid. All original US-001..008 are kept; 500/3 cannot replace US-005.
- Fees are charged on the remaining principal at the start of each period: 1000/6 total fees 19.25, 500/3 total 6; the 33/9 in the text are only differences in the immutable source examples and are not used as test expectations.
- When the same original transaction principal overlaps across BILL/TRANSACTION, reject the duplicate conversion/occupation, covering both directions and concurrency; do not reject non-overlapping principal across the board without a basis.
- Principal already in the account's currentBalance is not deducted again from the authorization available credit; settlement reduces the actual debt and occupation once; repeats, concurrency or downstream failures must not release twice or leave a half-completed state.
- ACTIVE plans: 19→20 succeeds, 20→21 is rejected; at 19, at most one of two concurrent requests succeeds.

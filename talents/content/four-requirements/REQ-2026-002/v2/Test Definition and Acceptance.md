> v2 node materials: the original chapters and historical baseline excerpts below keep their original meaning. The current local test parameters follow `test-profile.md` v2 in this directory; the formal §12.3 items are still to be confirmed. Do not turn any other inferred policy into a confirmed one on your own.

# REQ-2026-002 · Enterprise Test Case Definition and Acceptance

Source: original requirement §9 Scenario Matrix and §10 Acceptance Criteria (Executable). The source excerpts are unchanged; the current case projection version is REQ-2026-002-cases-v2 (formerly REQ-2026-002-cases-v1). All cases below are pending execution, not reports of completed runs; conflicting expectations must be linked to a PRD decision and must not be marked as passed directly. The test asset plugin provides the cases; Talent provides the verification knowledge and Skills.

## 9. Scenario Matrix

| Type | Scenario | Role | Data/API | Expectation |
|------|------|------|-----------|------|
| Main flow | Report an `ACTIVE` card lost | Cardholder | POST `/cards/4000000000005740/loss` | 201, `cardStatus=LOST`, 1 new `card_operation` record, notification sent |
| Main flow | Request a replacement after the loss report (gold card) | Cardholder | POST `/cards/{cardNumber}/replacements` | 201, ticket `REQUESTED`, `feeAmount=50.00`, FEE posting succeeded |
| Main flow | Operations updates the status to `SHIPPED` | Card production operations | POST `/admin/replacements/{id}/status` | 200, the customer progress page shows the tracking number and estimated arrival date |
| Boundary | Platinum card requests a replacement | Cardholder | Platinum card ticket, `feeAmount=0.00` | `feeStatus=WAIVED`, no FEE posting |
| Boundary | Request a replacement 1 second after reporting the loss | Cardholder | POST `/replacements` | 201, the ticket is created successfully with status `REQUESTED` |
| Boundary | The same deduplication key submitted for the 3rd time within a 30-minute window | Cardholder | POST `/replacements`, fixed deduplication key | The same `replacement_id` is returned and the ticket count does not change |
| Exception | Report an already lost card lost again | Cardholder | POST `/loss` | 409 `CARD_ALREADY_LOST`, only 1 LOSS audit record |
| Exception | Request a replacement while one is in progress | Cardholder | POST `/replacements` | 409 `REPLACEMENT_EXISTS` |
| Exception | transaction-service unavailable during fee posting | Cardholder | Request a replacement after stopping transaction-service | The ticket exists with `feeStatus=FEE_PENDING`, and the fee is collected automatically after recovery |
| Exception | Operations sets `REQUESTED` directly to `ACTIVATED` | Card production operations | POST `/admin/replacements/{id}/status` | 409 `INVALID_STATE_TRANSITION` |
| Permission | Customer A views customer B's replacement ticket | Cardholder | GET `/replacements/{id}` | 404, "No replacement record found" |
| Permission | Customer service reports a loss on behalf of the customer | Customer service | POST `/loss` with a token containing `card:loss:assist` | 201, the audit actor is the customer service employee number and the verification method is recorded |

## 10. Acceptance Criteria (Executable)

| Story | Given | When | Then | Data preparation |
|------|-------|------|------|---------|
| US-001 | An `ACTIVE` card 4000000000005740 exists | The customer confirms the loss report | The card status becomes `LOST` immediately, authorization on the old card is declined, and the audit is queryable | Card and account 00000000006 |
| US-002 | The card is already `LOST` | Submit the loss report again | 409 `CARD_ALREADY_LOST`, and only 1 notification exists | Reuse US-001 data |
| US-003 | A platinum card has been reported lost | Submit a replacement request | `feeAmount=0.00`, `feeStatus=WAIVED`, no FEE posting | Platinum card 4000000000009999 |
| US-004 | A gold card has been reported lost | Submit a replacement request | `feeAmount=50.00`, a FEE posting is created, and `fee_batch_id` is filled in | Gold card 4000000000005740 |
| US-005 | A replacement ticket is in progress | Submit a replacement request again | 409 `REPLACEMENT_EXISTS`, and the ticket count does not change | Reuse US-004 data |
| US-006 | The ticket status is `CARD_PRODUCED` | Operations updates it to `SHIPPED` and fills in the tracking number | The customer progress page shows the tracking number and estimated arrival date | Ticket `replacement_id` |
| US-007 | A new card has been generated but not activated | Initiate a transaction with the new card | The transaction is declined with the message "The new card is not activated" | New card number + transaction request |
| US-008 | transaction-service is stopped | Submit a gold card replacement request | The ticket is created successfully with `feeStatus=FEE_PENDING`; the fee is collected within 24 hours after recovery | Stop and restore the container |

## Execution Evidence Requirements

Functional tests, static tool checks, Agent Review, security reports and issue re-tests each record the actual command, tool version, code commit, exit code and report path. Owner acceptance is based on these actual results; publishing knowledge does not mean the requirement is accepted.

## test-profile-v2 Additions (not new source ACs)

REQUESTED cancellation: a collected fee of 50 is reversed once against the original transaction; FEE_PENDING cancels the pending collection; a waived fee of 0 has no refund. Cover concurrency of cancellation with fee retries, and repeated cancellation. Card numbers use only the local seed BIN, 16 digits, Luhn and uniqueness; do not claim card scheme certification.
All original US-001..008 are kept; real execution reports must distinguish the original ACs from the cases added by this profile.

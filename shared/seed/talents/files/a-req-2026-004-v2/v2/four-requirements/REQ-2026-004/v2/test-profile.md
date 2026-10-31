# Four-Requirement Test Profile v2

Scope: real local CLI delivery verification of REQ-2026-001 / 002 / 003 / 004 for this run.
Approval source: on 2026-10-28 the user authorized local end-to-end testing of the four requirements; what follows is the test profile set by the coordination session, not a formal user/business policy sign-off. The v2 additions apply only to new tasks that explicitly select test-profile-v2; they are not written back into v1 or any adopted snapshot. Source v1.0 is kept; this configuration is not a formal product, pricing, risk or compliance sign-off. The original §12.3 pre-production items to be confirmed remain open.

## Baseline and Implementation Scope

- The business baseline is the current develop commit 5eeddd63184eb17876bd09d89ea45082644b56db. The actual task branch may be based on a later develop commit that has been explicitly merged; record the specific SHA.
- This baseline already has eight modules: iam/customer/card/account/transaction/authorization/marketing/web-ui; dev-b is not provided. Missing services that the materials assume to exist are added by this round's four business tasks according to the design; they cannot be replaced by mock business code or fake test reports.
- Request IDs follow the current data contract: account 11 digits, card 16 digits, transaction 16 digits, customer 9 digits. Do not copy the inconsistent lengths in the requirement tables, and do not change existing IDs.

## Difference Handling Adopted for This Run

1. The business rules stated in Chapter 5 take precedence. For installments, the principal of the first N-1 periods is truncated to 2 decimals and the last period absorbs the residual; fees are charged on the remaining principal at the start of each period and rounded HALF_UP to 2 decimals. CNY 1000 over 6 periods: principal 166.66×5 + 166.70, fees 5.50/4.58/3.67/2.75/1.83/0.92, total 19.25; CNY 500 over 3 periods: fees 3.00/2.00/1.00, total 6.00, first-period total 169.66. The source examples 33.00/9.00/175.67 are kept as identified differences and are not asserted in this run.
2. The early-settlement feeRebate defaults to 0; the source's formal pricing stays to be confirmed. Do not invent additional rebates.
3. For loss reporting/replacement, the same deduplication key returns the first result (replay with HTTP 200); a new loss request with a different key on a non-ACTIVE card returns 409. Replacement can be cancelled only in REQUESTED; once the card is produced it cannot be cancelled.
4. The boundary case for a limit increase above 2x the current limit is 8000→16000.01; exactly 16000 does not trigger dual approval and is still subject to the product maximum and other eligibility rules.
5. For FRAUD/UNAUTHORIZED, first upload temporary evidence on the document side and obtain a reference, then create the dispute case; keep the at-least-one-evidence, allowlist, size and ownership checks. Do not open a case without evidence and add evidence later to get around the requirement.
6. New APIs validate the current IAM HMAC token (not JWT), return 401 when the token is missing, and enforce real ownership, role and SoD checks. The difference between the original §6.2 and ADR-007 is kept on record; do not claim that local verification means production authentication is ready.

## Result and Evidence Boundaries

The above are test inputs still to be executed. The PRD, design, code commits/PRs, unit tests, functional tests, static tool checks, Agent Review, security and issue re-tests are all produced by real execution and point to the same actual code version. Other items without values, or new conflicts, continue to be logged or blocked and do not implicitly stand in for Owner decisions. A tool failure cannot be offset by a preset pass.

## v2 Additions: 001 Local Test Profile

The following is specified by the current coordination session within the user-authorized scope of local end-to-end testing; it is not a formal business policy or a personal sign-off. The items in §12.3 of the source remain, one by one, as pre-production items to be confirmed.

- The principal of the same original transaction must not be converted to installments twice. BILL and TRANSACTION must be deduplicated through a real statement–transaction source link; prevent both a single-purchase installment that is later included in a statement installment and a statement installment followed by another single-purchase installment, to avoid double occupation. Do not expand this on your own into "once a statement has one installment, all non-overlapping transactions on that statement are permanently blocked". Linked principal, unlinked principal and concurrent requests must all be verifiable.
- Installment occupation is classified separately by remaining principal. Principal already counted in currentBalance is not deducted again from the authorization available credit; repayment/settlement releases it only once, based on the principal actually repaid. Do not just zero a display field, and do not reduce currentBalance and then release the same authorization credit again; fees/penalty fees are handled separately in the real accounting, keeping cross-service idempotency and consistency on failure.
- The source US-005 is neither a contradiction nor a condition derived from the CNY 500 plan. It must be kept and actually verified: CNY 900.00 over 3 periods, 1 period repaid with principal 300.00, remaining principal 600.00; early-settlement penalty fee 6.00, feeRebate 0.00, settlement total 606.00; principal drops to zero and 600.00 is released once. The 500/3 calculation with 333.34 may be tested separately but cannot replace the original US-005.
- A limit of 20 ACTIVE installments per account is an explicit parameter for this round. Cover: the 20th succeeds, the 21st is rejected, and with 19 existing, at most one of two concurrent requests succeeds. Do not drop it as "to be confirmed" or enforce it only in the page.
- The fees on the opening remaining principal for 1000/6 and 500/3 remain 19.25 and 6.00 respectively; do not fall back to the conflicting source examples 33.00/9.00.

## Reading and Delivery Constraints

Each node reads only the v2 materials pinned for this task, and first checks the source SHA256, the profile SHA256 and the published version. There is only one reference to the full source; a summary cannot replace all 13 chapters. The PRD must map each of the original US-001..008, and additional tests cannot replace the original ACs.

Only the test parameters stated explicitly in this file and the simulated rules stated explicitly in the source may be used as assertions in this round. Any other pending policy or new inference must list its impact and be reported to the coordinator; do not mark it "Must" and merely add an "inferred" label, and do not fake Owner confirmation. If it affects the current execution, block explicitly; do not resolve it by removing features, downgrading ACs, stubs or preset passes. Missing capabilities must still be really implemented and verified by real execution. Historical tasks that have already adopted v1 do not read this file as if it were their original basis.

## v2 Additions: 002 Local Test Profile

- After a loss report, replacement is by default started manually by the customer, not created automatically. Cancellation only in REQUESTED; a fee of CNY 50.00 already collected is reversed once against the original fee transaction, FEE_PENDING stops the pending collection; for platinum cards the waived fee is 0 and no refund transaction is created. Concurrent cancellation and fee retries must not lead to collecting after cancellation or refunding twice.
- New cards use the BIN prefix of the current seed test cards, are 16 digits, pass the Luhn check and are unique. This is only a local test number range and does not claim card scheme certification; the formal BIN, waiver customer segments, minimum payment handling and other original §12.3 items remain to be confirmed, and without given values they must not be treated as confirmed.

## v2 Additions: 003 Local Test Profile

- Income documents for amounts above 2x the current limit are first uploaded temporarily to obtain a documentId that has passed authentication, ownership and type/size checks, and only then is the limit increase application submitted; do not create an application without documents to get around the requirement. Normal applications follow the source.
- A normal limit increase has two approval actions: initial review and final approval; a high-amount application has an additional second approval action by second_approver. For high amounts, the applicant, initial reviewer, final approver and second approver are four mutually independent parties, each acting with their own real IAM token. Entering someone else's ID on the client does not count as their approval, and one person holding several roles cannot replace separation of duties.
- The approval note may be empty; the rejection reason must be 10–256 characters. The source's second-approval fields and all original acceptance criteria are kept; the detailed action profile in this section is a supplement from this profile and does not claim the source already has a complete protocol.

## v2 Additions: 004 Local Test Profile

- Customer withdrawal in OPEN/UNDER_REVIEW follows the source. Withdrawing a PROVISIONAL_CREDIT case: the customer requests, a supervisor confirms, then the provisional credit is reversed once against the original creditId; on success the case moves to CLOSED, keeping the withdraw reason and a complete audit trail. A failure in supervisor confirmation, reversal or status write-back cannot skip funds consistency, and retries must not debit twice.
- Normal case closing uses two real authenticated actions: "enter the conclusion → review by a different account"; the final funds settlement is not executed before review. The original rules (WON keeps the credit, LOST reverses the original credit) are unchanged.
- The original evidence upload, ownership, type, size/count, case-opening eligibility and status rules are kept in full; none of the original ACs is removed because of the new withdrawal/review protocol.

## v2 Shared Time Test Profile

- Time interpretation and the daily 02:00 schedule use Asia/Shanghai.
- Business days are built for local tests as Monday to Friday only, without simulating statutory holidays; do not claim a real bank holiday calendar.
- "Past 6 months" is calculated in calendar months; across months, month-end dates are truncated to the last day of the target month. Test boundaries record the clock and time zone explicitly; do not silently substitute 180 days.

These additions only define the executable test conditions for this run. New cases should be labeled "test-profile-v2 addition" and must not claim to come from the source; the original US-001..008 are each kept, and the original formal §12.3 items to be confirmed are not removed. Any other policy not given a value by the simulated rules stated in the source or by this profile must be reported to the coordinator and given an explicit profile; it cannot be handled by removing features/ACs, fake passes or narrowing scope on your own for safety.

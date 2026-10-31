# Four-Requirement Test Profile v1

Scope: real local CLI delivery verification of REQ-2026-001 / 002 / 003 / 004 for this run.
Approval source: on 2026-10-28 the user asked for end-to-end verification of the requirement package; the test implementation profile was compiled by the current coordination session according to the rule precedence. Source v1.0 is kept; this configuration is not a formal product, pricing, risk or compliance sign-off. The original §12.3 pre-production items to be confirmed remain open.

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

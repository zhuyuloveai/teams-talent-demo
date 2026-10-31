> v2 node materials: the original chapters and historical baseline excerpts below keep their original meaning. The current local test parameters follow `test-profile.md` v2 in this directory; the formal §12.3 items are still to be confirmed. Do not turn any other inferred policy into a confirmed one on your own.

# REQ-2026-002 · Open Questions and Differences

The following is a materials checklist; it does not claim Owner confirmation.

## Internal Differences and Unspecified Protocols

1. §4.2 says a duplicate loss report returns the first result with HTTP 200, while the §7 error table, §9 and §10 US-002 say 409 CARD_ALREADY_LOST. Distinguish a replay with the same deduplication key from a new request with a different key on a card already reported lost, and state the response contract in the PRD.
2. The card_operation.maskedCardNumber field table keeps the first 6 and last 4 digits, while §6.2/§8.2 require only the last 4 in responses, logs and events. The policy for each storage/display channel must be explicit to avoid leaking full card numbers.
3. The replacement cancellation limit is worded as "before card production"; the BR status sequence ends with ACTIVATED/CANCELLED. Describe the state machine with a confirmed table of legal transitions; do not read it as allowing cancellation after activation.
4. The loss/replacement request examples lack some required fields (idempotencyKey for loss reporting, reason for replacement, etc.); the PRD must record the basis for completing the contract.

## Common Boundaries

- §6.2 in all four documents requires JWT and 401, while §11/§12 cite ADR-007, under which the POC does not enforce strong API-level authentication; the baseline IAM has been verified to use a two-part base64 + HMAC-SHA256 token, not JWT. The authentication scope must be made explicit; local ownership checks, separation of duties and sensitive data protection must not be falsely claimed as satisfied.
- The simulated rules and values stated in Chapter 5 are the inputs for this test; the formal §12.3 pre-production items to be confirmed remain in place. Missing values and internal conflicts need an explicit decision or blocker; Talent materials do not replace Owner confirmation.
- These materials provide only knowledge and pending cases; unit test, functional verification, static tool, Agent Review, security and re-test reports must come from actual execution and record the command, version, exit code and report.

## Original Pre-production Items to Be Confirmed

### 12.3 Items to Be Confirmed

1. Whether a replacement is initiated automatically after a loss report (to be confirmed: manual initiation by default; to become an optional automatic mode after product confirmation).
2. Whether customers can cancel a replacement and up to which status cancellation is allowed (to be confirmed: currently designed as cancellable before card production).
3. The new card number generation rule and BIN range for replacements (to be confirmed: alignment with card network specifications).
4. The replacement fee waiver policy and the platinum card scope (to be confirmed: pricing and product confirmation).
5. Whether the replacement fee debt counts toward the minimum payment amount (to be confirmed: confirmation by the statement rules owner).

## v2: Locally Specified Items vs. Formal Items to Be Confirmed

The test-profile.md in this directory holds local test parameters set by the current coordination session; it is not a formal user/business policy sign-off. Apply v2 only to the items it lists explicitly; the original pre-production list above stays in place, and other missing values must not be confirmed on your own.

> v2 node materials: the original chapters and historical baseline excerpts below keep their original meaning. The current local test parameters follow `test-profile.md` v2 in this directory; the formal §12.3 items are still to be confirmed. Do not turn any other inferred policy into a confirmed one on your own.

# REQ-2026-004 · Open Questions and Differences

The following is a materials checklist; it does not claim Owner confirmation.

## Internal Differences and Unspecified Protocols

1. Opening a case within 90 days and chargeback within 30 days after posting are two different windows; cases at 31–90 days must keep a manual escalation path, and an automatic chargeback cannot be assumed.
2. FRAUD/UNAUTHORIZED requires evidence before the case is opened, yet the §7 case-opening example has no evidence reference; the POST /disputes + /evidence order listed in §9 may conflict with the upfront check, so a temporary upload/reference protocol must be specified.
3. §4.2 requires description to be at least 10 characters. Check the §7 request example ("unauthorized transaction") against the field rules before using it as test data; do not assume request examples are valid inputs.
4. The 1-business-day intake, the nightly 02:00 scan and the 24-hour advance reminder need an explicit business calendar and time zone; the materials provide no statutory holiday data.
5. BR-DSP-08 allows withdrawal only in OPEN/UNDER_REVIEW, while also saying a PROVISIONAL_CREDIT case needs supervisor confirmation; confirm the withdrawal states and the order of reversing the credit, and do not skip funds consistency.

## Common Boundaries

- §6.2 in all four documents requires JWT and 401, while §11/§12 cite ADR-007, under which the POC does not enforce strong API-level authentication; the baseline IAM has been verified to use a two-part base64 + HMAC-SHA256 token, not JWT. The authentication scope must be made explicit; local ownership checks, separation of duties and sensitive data protection must not be falsely claimed as satisfied.
- The simulated rules and values stated in Chapter 5 are the inputs for this test; the formal §12.3 pre-production items to be confirmed remain in place. Missing values and internal conflicts need an explicit decision or blocker; Talent materials do not replace Owner confirmation.
- These materials provide only knowledge and pending cases; unit test, functional verification, static tool, Agent Review, security and re-test reports must come from actual execution and record the command, version, exit code and report.

## Original Pre-production Items to Be Confirmed

### 12.3 Open items

1. The 90-day dispute window and the SLA deadlines (open: to be confirmed against card scheme rules and bank policy; currently simulated values).
2. The accounting entries and reversal strategy for provisional credit (open: Finance to confirm the accounts and the reversal trigger conditions).
3. The evidence retention period and privacy compliance (open: Legal to confirm the 7-year retention and archiving method).
4. The scope of fraud case linkage with fraud-service (open: only reserved lead fields in this iteration).
5. The high-value provisional credit threshold of 1000.00 (open: supervisor approval scope).

## v2: Locally Specified Items vs. Formal Items to Be Confirmed

The test-profile.md in this directory holds local test parameters set by the current coordination session; it is not a formal user/business policy sign-off. Apply v2 only to the items it lists explicitly; the original pre-production list above stays in place, and other missing values must not be confirmed on your own.

# REQ-2026-003 · Open Questions and Differences

The following is a materials checklist; it does not claim Owner confirmation.

## Internal Differences and Unspecified Protocols

1. §5 BR-LIM-05 says more than 2x the current limit, but its verification example 8000→20000.01 is not the boundary; §9/§10 make clear that 16000.01 is 2x 8000 + 0.01. Keep the original example and flag the boundary difference.
2. §4.2 marks the decisionNote field as required, while its text says required on rejection; state whether it may be empty on approval.
3. The SoD role relationships, the local U/A roles and the existing HMAC token contract need design confirmation; do not allow an action based only on an actor passed in from the front end.
4. Documents are required above 2x; the product maximum example of 25000 and the dual approval rule apply at the same time; do not read a pre-review pass as meaning no documents or second approver are needed.

## Common Boundaries

- §6.2 in all four documents requires JWT and 401, while §11/§12 cite ADR-007, under which the POC does not enforce strong API-level authentication; the baseline IAM has been verified to use a two-part base64 + HMAC-SHA256 token, not JWT. The authentication scope must be made explicit; local ownership checks, separation of duties and sensitive data protection must not be falsely claimed as satisfied.
- The simulated rules and values stated in Chapter 5 are the inputs for this test; the formal §12.3 pre-production items to be confirmed remain in place. Missing values and internal conflicts need an explicit decision or blocker; Talent materials do not replace Owner confirmation.
- These materials provide only knowledge and pending cases; unit test, functional verification, static tool, Agent Review, security and re-test reports must come from actual execution and record the command, version, exit code and report.

## Original Pre-production Items to Be Confirmed

### 12.3 Open items

1. The specific thresholds of the limit increase eligibility rules (open: risk control to issue the formal rule table; currently simulated values).
2. Whether a credit bureau query or external data source is required (open: risk policy to confirm; no integration in this iteration).
3. The calculation basis for the dual approval threshold (open: currently 2x the current limit).
4. The approval roles and permission matrix (open: to be persisted after alignment with IAM/RBAC).
5. The retention period for income documents (open: currently designed to be archived and deleted after 2 years, subject to legal review).

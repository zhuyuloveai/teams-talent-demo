# REQ-2026-001 · Open Questions and Differences

The following is a materials checklist; it does not claim Owner confirmation.

## Internal Differences and Unspecified Protocols

1. §5 BR-INS-03 and the glossary (§1.3) charge fees on the remaining principal, but §10 US-001 lists a per-period fee of 5.50 and total fees of 33.00 for CNY 1000 over 6 periods; the §9 figures for CNY 500 over 3 periods (total fees 9.00, first-period total 175.67) are also inconsistent. The PRD must state the fee formula adopted and the corrected examples; the source stays unchanged.
2. Rounding principal uniformly to two decimals with HALF_UP differs from the §5/§10 example of 1000/6 = 166.66 with 166.70 for the last period; state the rounding strategy used for principal allocation and for fees separately.
3. §4.2 requires a previewToken on submit, but the §7 request example lacks this field; implementation and tests follow the confirmed field contract.
4. The early-settlement feeRebate policy has no fixed value; keep the §5 rule that fees already collected are not refunded separate from the §4.2 rebate field, and do not treat a policy still to be confirmed as formal pricing.

## Common Boundaries

- §6.2 in all four documents requires JWT and 401, while §11/§12 cite ADR-007, under which the POC does not enforce strong API-level authentication; the baseline IAM has been verified to use a two-part base64 + HMAC-SHA256 token, not JWT. The authentication scope must be made explicit; local ownership checks, separation of duties and sensitive data protection must not be falsely claimed as satisfied.
- The simulated rules and values stated in Chapter 5 are the inputs for this test; the formal §12.3 pre-production items to be confirmed remain in place. Missing values and internal conflicts need an explicit decision or blocker; Talent materials do not replace Owner confirmation.
- These materials provide only knowledge and pending cases; unit test, functional verification, static tool, Agent Review, security and re-test reports must come from actual execution and record the command, version, exit code and report.

## Original Pre-production Items to Be Confirmed

### 12.3 Items to Be Confirmed

1. Fee rate, penalty fee ratio, and first-period effective time (to be confirmed: business and pricing issue a formal pricing table).
2. Whether the installment limit occupation is "remaining principal" or "total principal" (to be confirmed: align with the account/authorization basis).
3. The fee rebate policy for early settlement (to be confirmed: whether to rebate proportionally to unexpired periods).
4. Whether statement installments and single-purchase installments may be combined (to be confirmed: product and risk control provide the combination rules).
5. The cap on installment plans per account (to be confirmed: currently designed as 20).

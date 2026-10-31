# Current workspace design

## Product presentation

Organized along the product navigation (workspace, projects, resources, team, connections), with no separate demo navigation or demo-mode wording. Complex configuration shows the common items first and expands details on demand. Task material is collapsed by default; primary actions and results come first.

## Business contract

Confirmed: platinum card customers, 3 months, an extra 0.5% cashback on spending.

Local verification assumptions (not approved production policy):
- The time window is 2026-11-01T00:00:00+08:00 (inclusive) to 2027-02-01T00:00:00+08:00 (exclusive).
- The acceptance transaction is on 2026-11-15, amount 12000 cents.
- Cashback is calculated in whole cents, rounding half a cent up. CNY 120.00 gives CNY 0.60.
- The old dining campaign's enrollment, spending category, threshold, count and cap constraints are not carried over; their absence does not mean the formal business has no limits.
- Campaign dates, spending scope, limits, refunds and settlement rules still need confirmation.

## State and evidence

Preset check records and capability candidates are for interaction verification and are kept distinct from real native tool reports, model experiments and production scans. Source information stays in the record body and metadata, and they are not described as historical tests that were run. Security status is always independent of functional acceptance.

Old saved campaign state cannot be mixed directly into the new contract; the Owner resets the workspace explicitly. The reset does not delete source code or native tool sessions.

## Verification principles

Tests cover customer eligibility, period boundaries, whole-cent amounts, idempotency, role permissions, submission conditions, keeping a failed form, and the empty state of the knowledge graph. Browser checks cover navigation, the main delivery flow and the cross-service handoff to Talent. External production integration, native desktop tools and real model experiments are outside this acceptance scope.

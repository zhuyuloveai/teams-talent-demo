# User Story List

## Document information

| Item | Value |
|----|------|
| Linked requirement document | <link to the requirement specification> |
| Version | v<version> |
| Author | BA Agent (A-01) |
| Date | <date> |

## Story list

### US-<number> <story title>

| Item | Value |
|----|------|
| User role | <role, e.g. retail customer> |
| Linked requirement | REQ-<xxx> |
| Priority | Must / Should / Could |
| Story description | As a <role>, I want <capability>, so that <value> |
| Dependencies | <requirements/systems/services it depends on; "None" if none> |

**Acceptance criteria:**

| ID | Precondition (Given) | Action (When) | Expected result (Then) | Priority |
|------|------------------|-------------|-----------------|--------|
| AC-<number>-01 | <verifiable precondition> | <observable action> | <verifiable result> | Must |

---

---

## L3 required depth fields

| Field | Requirement |
|------|------|
| Data preparation | How the Given data is constructed (with data source and construction script) |
| Boundary values | Cases covering min/min-1/max/max+1 |
| Exception paths | Separate acceptance criteria for interface error / timeout / concurrency / idempotency |
| Traceability matrix | Four-way trace: AC ID↔US↔REQ↔TC |
| Idempotency | Expected behavior for duplicate submissions of fund operations |
| Compliance boundary | Limit cap / reporting deadline acceptance for regulatory requirements |

### L3 story depth field example

| Item | Value |
|----|------|
| Data preparation | Test user (CUSTOMER-001) + daily cumulative limit parameter (LIMIT-5000) + identity verification token (TOKEN-VALID) |
| Boundary value coverage | min=0, min-1=N/A, max=50000, max+1=50001 |
| Exception paths | Interface timeout (3s), identity verification failure, concurrent submission, idempotent retry |
| Traceability matrix | AC-002-01↔US-002↔REQ-002↔TC-002-01 |
| Idempotency | When the same adjustment request is submitted twice, return the first result and do not change the limit again |
| Compliance boundary | Limit cap CNY 50000 (basis: PBOC Order [2018] No. 2); amounts above it must be handled at the counter |

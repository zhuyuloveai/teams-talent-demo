# Acceptance Criteria (Given/When/Then)

## Story

- Story ID: US-<number>
- Title: <story title>
- Linked requirement: REQ-<xxx>
- Priority: <Must/Should/Could>

## Acceptance criteria

### AC-<number>-01 <criterion title>

| Element | Content |
|------|------|
| Precondition (Given) | <verifiable precondition, e.g. the user is logged in and the current daily cumulative limit is CNY 5000> |
| Action (When) | <observable action, e.g. the user submits a raise of the daily cumulative limit to CNY 20000> |
| Expected result (Then) | <verifiable result, e.g. the system shows "Limit adjusted successfully" and the daily cumulative limit is updated to CNY 20000> |

**Testability self-check:**

- [ ] The precondition can be constructed (data/state can be prepared)
- [ ] The action can be executed (clear entry point and steps)
- [ ] The expected result can be verified (clear output / state change / message)
- [ ] No vague words (roughly / etc. / as soon as possible / as far as possible)

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

### L3 acceptance criteria example (with depth fields)

| ID | Precondition (Given) | Action (When) | Expected result (Then) | Data preparation | Boundary value | Exception path | Trace |
|------|------------------|-------------|-----------------|---------|--------|---------|------|
| AC-002-01 | The user is logged in with a daily cumulative limit of CNY 5000 | Submits a raise to CNY 20000 and passes identity verification | Shows "Adjusted successfully"; the new limit takes effect immediately | Test user + limit parameter configuration | 5000→20000 (normal) | Identity verification fails → rejected | US-002↔REQ-002↔TC-002-01 |
| AC-002-02 | The user submits a limit above the CNY 50000 cap | Submits the adjustment | Shows "Exceeds the allowed range"; limit unchanged | Test user + cap parameter | 50001 (over limit) | - | US-002↔REQ-002↔TC-002-02 |
| AC-002-03 | The same adjustment request is submitted twice | Second submission | The system returns the first result and does not change the limit again | Test user + duplicate request construction | - | Idempotency check | US-002↔REQ-002↔TC-002-03 |

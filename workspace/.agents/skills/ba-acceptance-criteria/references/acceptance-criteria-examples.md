# Acceptance Criteria Example Library (Bank Transfer Limit Scenarios)

## Example 1: Display the limit (REQ-001)

**Story**: As a retail customer, I want to see my current transfer limit, so that I know how much I can still use.

| ID | Given | When | Then |
|------|-------|------|------|
| AC-001-01 | The user is logged in to mobile banking and has a daily cumulative limit set | The user opens "Security settings → Transfer limit" | The system displays the current daily cumulative limit, per-transaction limit, amount used today and remaining amount |
| AC-001-02 | The limit query interface fails | The user opens the limit page | The system shows "Query failed, please try again later" and does not display error details |

## Example 2: Adjust the limit (REQ-002)

**Story**: As a retail customer, I want to raise my transfer limit myself, so that I can make a large transfer.

| ID | Given | When | Then |
|------|-------|------|------|
| AC-002-01 | The user is logged in and the current daily cumulative limit is CNY 5000 | The user submits a raise of the daily cumulative limit to CNY 20000 and passes identity verification | The system shows "Limit adjusted successfully" and the new limit takes effect immediately |
| AC-002-02 | The limit submitted by the user exceeds the system maximum (for example CNY 50000) | The user submits the adjustment | The system shows "The adjustment amount exceeds the allowed range" and the limit stays unchanged |
| AC-002-03 | The user fails identity verification | The user submits the adjustment | The system rejects the adjustment and shows "Verification failed, please verify again" |

## Testability checklist

- [ ] The Given state can be constructed (login state, parameters, data)
- [ ] The When action has a clear entry point (menu path / button / interface)
- [ ] The Then result can be verified (UI prompt / data change / interface return code)
- [ ] Numbers are quantified ("CNY 20000", not "a large amount")
- [ ] Exception paths have their own criteria (interface error, over limit, verification failure)

---

## L3 depth examples: full coverage of boundary values and exception paths

### Example 3: Limit adjustment boundary values (REQ-002 L3)

| ID | Given | When | Then | Boundary type |
|------|-------|------|------|---------|
| AC-002-B01 | Daily cumulative limit = CNY 0 (lower bound) | Submit a raise to CNY 1 | Adjustment succeeds; limit = CNY 1 | min |
| AC-002-B02 | Daily cumulative limit = CNY 49999 | Submit a raise to CNY 50000 | Adjustment succeeds; limit = CNY 50000 | max |
| AC-002-B03 | Daily cumulative limit = CNY 49999 | Submit a raise to CNY 50001 | Shows "Exceeds the allowed range"; limit unchanged | max+1 |
| AC-002-B04 | Daily cumulative limit = CNY 50000 (upper bound) | Submit a decrease to CNY 0 | Shows "The limit cannot be 0"; limit unchanged | min-1 |

### Example 4: Idempotency and concurrency (REQ-002 L3)

| ID | Given | When | Then | Scenario type |
|------|-------|------|------|---------|
| AC-002-I01 | The same adjustment request was already submitted and processed successfully | The same request is submitted again (same request ID) | The first result is returned; the limit is not changed again | Idempotency |
| AC-002-C01 | The user sends two adjustment requests at the same time | Both requests arrive concurrently | Only the first request takes effect; the second returns "Operation in progress" | Concurrency |
| AC-002-T01 | The limit adjustment interface takes more than 3 seconds to respond | The user waits and retries | The system returns a processing status and does not execute again | Timeout retry |

### Example 5: Compliance boundary acceptance (REQ-003 L3)

| ID | Given | When | Then | Compliance basis |
|------|-------|------|------|---------|
| AC-003-01 | The user's cumulative transfer amount is close to the AML threshold (CNY 50,000) | Another transfer brings the cumulative amount to CNY 50,000 | The system raises an AML alert, records the transaction and notifies the compliance officer | PBOC Order [2018] No. 2 |
| AC-003-02 | Regulatory report data is generated | Reporting deadline check | The report is submitted before 10:00 on T+1; an alert is raised if late | Yinfa [2016] No. 261 |

### L3 traceability matrix example

| AC ID | US ID | REQ ID | TC ID | Scenario type | Boundary type |
|--------|--------|---------|--------|---------|---------|
| AC-002-01 | US-002 | REQ-002 | TC-002-01 | Happy path | - |
| AC-002-B01 | US-002 | REQ-002 | TC-002-B01 | Boundary value | min |
| AC-002-B03 | US-002 | REQ-002 | TC-002-B03 | Boundary value | max+1 |
| AC-002-I01 | US-002 | REQ-002 | TC-002-I01 | Idempotency | - |
| AC-002-C01 | US-002 | REQ-002 | TC-002-C01 | Concurrency | - |
| AC-003-01 | US-003 | REQ-003 | TC-003-01 | Compliance boundary | AML |

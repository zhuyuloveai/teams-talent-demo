---
name: qa-integration-test
description: "Ensure cross-system / cross-module integration is correct: integration scope confirmation, SIT environment planning, interface / data flow / business scenario / exception and fault tolerance / idempotency tests, and integration management. Use for designing and running multi-system / multi-module integration tests in the SIT phase."
---

## Metadata

| Item | Value |
|----|------|
| version | 1.0.0 |
| owner | QA / Integration test owner |
| category | Role skill |
| priority | P0 |
| depth | L2 |

# qa-integration-test skill

## Overview

This skill ensures that interfaces, data and business processes integrate correctly across systems / modules.

## Workflow

1. Confirm the integration scope: systems / modules / interfaces / data flows / dependencies
2. Plan the SIT environment: topology, deployment order, data preparation
3. Interface test cases: request / response format, fields, error codes, timeouts, retries
4. Data flow tests: end-to-end consistency, field mapping, transformation rules
5. Business scenario tests: chain business processes across systems
6. Exceptions and fault tolerance: interface timeouts, downstream failures, degradation / circuit breaking, retries
7. Idempotency tests: duplicate submission, message redelivery, network jitter
8. Integration execution management: plan, progress, issue diagnosis, defect ownership
9. Integration test report: coverage, defects, risks, conclusion


## Level switching rules

| Level | Trigger | Approval |
|------|---------|---------|
| L1 Draft | Exploring the SIT design approach, integration scope discussion, demo walkthrough | No review needed |
| L2 Standard (default) | Default level for bank production; integration test design and execution in the SIT phase | Test review meeting + QA owner sign-off |
| L3 Implementation | Involves fund safety / regulatory reporting / cross-system integration / first go-live / high-risk change | ARB / compliance review + all deep gates passed |

**Automatic upgrade to L3**: when the work involves anti-money laundering, limit parameters, customer funds, regulatory reporting, interbank interfaces, production data changes, fund reversal / idempotency integration or cross-system accounting integration, upgrade automatically from L2 to L3. L3 must pass every computable gate in the "Depth level (L3 Implementation)" section below.

## Depth level (L3 Implementation)

| Level | Requirement |
|------|------|
| L1 | Skeleton key points, for discussion |
| L2 | Standard review level (bank production default) |
| L3 | Adds the following depth on top of L2 (mandatory for high-risk / regulatory / complex integration) |

### L3 workflow additions

- Output four kinds of tests: interface contract tests + data flow checks + exception and fault tolerance + idempotency, validated automatically with interface_contract_test.py and data_flow_verify.py
- Interface contract tests cover request / response fields, error codes, timeouts and retries, with no missing contract fields
- Data flow tests cover end-to-end consistency; the key sets of critical fields match across systems (no inconsistent)
- Exception and fault tolerance tests cover interface timeout / downstream failure / degradation / circuit breaking / retry, with a separate case for each
- Idempotency tests cover duplicate submission / message redelivery / network jitter; idempotency of fund-related interfaces is 100% verified
- Defect ownership during integration is decided from contract test results and log diagnosis, to reduce ownership disputes

### L3 quality gates

- [ ] Interface coverage 100% (all key interfaces covered)
- [ ] Interface contract tests passed (interface_contract_test.py exit code 0, no missing fields)
- [ ] Data flow consistency passed (data_flow_verify.py exit code 0, no inconsistent)
- [ ] Exception and fault tolerance cases cover five kinds (timeout / downstream failure / degradation / circuit breaking / retry)
- [ ] Idempotency of fund-related interfaces 100% verified (duplicate submission / message redelivery / network jitter)
- [ ] Core business scenarios run end to end
- [ ] Integration defect ownership backed by contract test and log evidence

> The main template contains the [L3 required] depth fields: `templates/sit-plan-template.md`. For detailed level definitions, see the "Skill Depth Level Specification".

## Templates

| Template | Purpose |
|------|------|
| `templates/sit-plan-template.md` | SIT plan |
| `templates/interface-testcase-template.md` | Interface test case |

## Scripts

| Script | Purpose |
|------|------|
| `scripts/interface_contract_test.py` | Automated interface contract test |
| `scripts/data_flow_verify.py` | End-to-end data consistency check |

## References

| Reference | Purpose |
|------|------|
| `references/sit-guide.md` | SIT guide |

## Quality gates

- [ ] Interface coverage 100%
- [ ] Core scenarios passed
- [ ] Data consistent
- [ ] Idempotency verified

## Common failure modes

| Failure mode | Symptom | Mitigation | Retry strategy |
|---------|------|---------|---------|
| Unstable environment | Frequent SIT environment failures block cases | Environment health checks + automated deployment + environment monitoring | Fix the environment and rerun the cases |
| Defect ownership disputes | Cannot decide which party owns a cross-system defect | Contract tests + log diagnosis (interface_contract_test.py) | Re-decide ownership from the contract test results |
| Interface contract mismatch | Response fields differ from the contract definition | interface_contract_test.py blocks missing fields | Fix the contract or the response and rerun the contract test |
| Data flow inconsistency | Key sets of critical fields differ across systems | data_flow_verify.py blocks inconsistent | Align the field mapping and rerun the data flow check |
| Idempotency not verified | Duplicate submission / message redelivery not tested for fund-related interfaces | 100% idempotency gate for fund-related interfaces | Add idempotency cases and test again |
| Missing exception and fault tolerance cases | No timeout / downstream failure / degradation / circuit breaking / retry cases | Exception and fault tolerance checklist enforces all five kinds | Add the cases and review again |
| Inconsistent test data | Test data not aligned across systems | Scripted data + version control + data reset mechanism | Reset the data and rerun the cases |

## Upgrade path

| Direction | Trigger | Added fields | Rollback condition |
|---------|---------|---------|---------|
| L1 → L2 | Formal SIT review starts | All [L2 required] sections (integration scope / SIT environment / interface cases / data flow / business scenarios / exception and fault tolerance / idempotency / integration management) | Review rejected, downgrade to draft |
| L2 → L3 | Fund safety / regulatory reporting / cross-system integration / first go-live | Interface contract tests, data flow consistency check, five kinds of exception and fault tolerance, 100% idempotency for fund-related interfaces, evidence for integration defect ownership | Risk downgraded or scenario simplified; may return to L2 after compliance confirmation |

**Human fallback point**: at L3, the interface contracts and the idempotency verification of fund-related interfaces must be confirmed jointly by QA and the owner of each system. The Agent drafts; each system owner confirms and finalizes. A downgrade requires PM + compliance approval, with the reason recorded.

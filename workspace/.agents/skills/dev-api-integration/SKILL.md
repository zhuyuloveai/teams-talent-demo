---
name: dev-api-integration
description: "Ensure interface contracts are implemented correctly: contract confirmation, mock-first, integration verification, exception handling and degradation, idempotency, security hardening, observability and contract testing. Use for frontend-backend integration, cross-system interface integration and third-party integration."
---

## Metadata

| Item | Value |
|----|------|
| version | 1.0.0 |
| owner | Dev / Integration owner |
| category | Role skill |
| priority | P0 |
| depth | L2 |

# dev-api-integration skill

## Overview

This skill ensures interface contracts are implemented correctly and integration runs smoothly.

## Workflow

1. Confirm the interface contract (format / fields / error codes / timeouts)
2. Set up a mock service (contract-driven, frontend and backend work in parallel)
3. Implement the interface code (client SDK / HTTP client, including serialization and error handling)
4. Verify the integration (normal → boundary → exception)
5. Exceptions and degradation (timeout retry, circuit breaking, idempotency)
6. Security hardening (authentication, signing, replay protection, encryption)
7. Observability (traceId propagation, masked logs, metrics)
8. Contract testing (contract_validate.py)

## Level switching rules

| Level | Trigger | Approval |
|------|---------|---------|
| L1 Draft | Interface draft discussion, contract field exploration, alignment before mock integration | No review needed |
| L2 Standard (default) | Default level for bank production; frontend-backend integration, cross-system interface integration, third-party integration | Interface review + integration owner sign-off |
| L3 Implementation | Involves fund safety / regulatory reporting / cross-system integration / first go-live / high-risk change | ARB / compliance review + all deep gates passed |

**Automatic upgrade to L3**: when the work involves fund transfers, anti-money-laundering interfaces, regulatory reporting, direct interbank connections, third-party payments or write-back of production data, upgrade automatically from L2 to L3. L3 must pass every computable gate in the "Depth level (L3 Implementation)" section below.

## Depth level (L3 Implementation)

| Level | Requirement |
|------|------|
| L1 | Skeleton key points, for discussion |
| L2 | Standard review level (bank production default) |
| L3 | Adds the following depth on top of L2 (mandatory for high-risk / regulatory / complex integration) |

### L3 workflow additions

- At L3, output the complete interface contract (schema + error codes + timeouts + idempotency) and run contract tests
- Verify exceptions / degradation / security hardening / observability item by item
- Field-level validation: define validation rules and error codes field by field for amount (precision / sign / currency), limits (per transaction / daily cumulative), customer ID (format / validity) and time (time zone / format)
- Exception path coverage: for each of timeout, retry, circuit breaking, degradation, rate limiting, network jitter, 5xx, signature failure and replay-protection failure, give the response and retry strategy
- Interface schema: request / response fields include type, required, enum, length and example value; describe in OpenAPI 3.0 and validate with contract_validate.py
- Idempotency: write interfaces define an idempotency key (business serial number), idempotency validity period and duplicate-response strategy (return the first result vs reject), verified with idempotency_test.py
- Boundary values: build cases for amount min/max and ±1, maximum field length, maximum page size, and timeout threshold ±10%

### L3 quality gates

- [ ] Contract test pass rate 100% (contract_validate.py exit code 0)
- [ ] All exception paths covered (timeout / retry / circuit breaking / degradation / rate limiting / 5xx / signature failure)
- [ ] Idempotency test passed (idempotency_test.py exit code 0, including duplicate submission)
- [ ] Field-level validation rules fully defined (amount / limit / customer ID / time / currency)
- [ ] Interface schema includes type / required / enum / length / example (OpenAPI 3.0)
- [ ] Security hardening in place (authentication / signing / replay protection / encryption / masked logs)
- [ ] Observability complete (traceId propagation / key metric instrumentation / masked logs)

> The main template contains the [L3 required] depth fields: `templates/api-contract-template.md`. For detailed level definitions, see the "Skill Depth Level Specification".

## Templates

| Template | Purpose |
|------|------|
| `templates/api-contract-template.md` | Interface contract template |
| `templates/integration-test-report.md` | Integration report |

## Scripts

| Script | Purpose | Exit codes |
|------|------|--------|
| `scripts/contract_validate.py` | Contract validation (schema) | 0/2/3 |
| `scripts/mock_server.py` | Generate a mock service from the contract | 0/3 |
| `scripts/idempotency_test.py` | Idempotency test | 0/2/3 |

## References

| Reference | Purpose |
|------|------|
| `references/integration-standards.md` | Integration standards |

## Quality gates

- [ ] Contract test pass rate 100%
- [ ] All exception scenarios covered
- [ ] Idempotency test passed
- [ ] Security hardening in place

## Common failure modes

| Failure mode | Symptom | Mitigation | Retry strategy |
|---------|------|---------|---------|
| Contract misunderstanding | Implemented fields differ from the contract / missing fields / wrong types | Shift contract tests left + automatic validation with contract_validate.py | Fix the fields and rerun contract validation |
| Interface performance problems | P95 above threshold / timeouts pile up | Tune timeout / retry strategy + slow query analysis | Rerun the baseline comparison after tuning |
| Version incompatibility | Client errors / missing fields after upgrade | Interface version management + backward-compatible contract | Roll back the version or add compatibility fields, then retry |
| Missing idempotency | Duplicate requests cause duplicate debits / duplicate orders | Idempotency key + verification with idempotency_test.py | Add the idempotency key and rerun the idempotency test |
| Unhandled exception paths | No degradation or unbounded retries on timeout / 5xx | Implement the exception path list item by item + circuit breaking and rate limiting | Add degradation logic and rerun the exception path cases |
| Insufficient security hardening | Missing authentication / replayable signatures / sensitive data in logs | Authentication + signing + replay protection + masked logs | Add the security measures and rerun the security scan |
| Missing field-level validation | Negative amounts / over-limit / malformed customer IDs not blocked | Field-level validation rules + error code mapping | Add the validation rules and rerun the boundary cases |

## Upgrade path

| Direction | Trigger | Added fields | Rollback condition |
|---------|---------|---------|---------|
| L1 → L2 | Formal integration / interface review starts | Complete contract (schema + error codes + timeouts), mock configuration, integration records | Review rejected, downgrade to draft |
| L2 → L3 | Fund safety / regulatory reporting / cross-system integration / first go-live | Field-level validation rules, exception path list, idempotency key definition, security hardening evidence, observability instrumentation | Risk downgraded or scenario simplified; may return to L2 after compliance confirmation |

**Human fallback point**: at L3, field-level validation rules and exception path strategies must be confirmed jointly by the integration owner and the security owner. The Agent drafts; the integration owner confirms and finalizes. A downgrade requires PM + compliance approval, with the reason recorded.

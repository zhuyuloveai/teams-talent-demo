---
name: dev-unit-test
description: "Generate and run high-quality unit tests that cover normal / boundary / exception / rollback paths, and quantify coverage. Use after coding is done and before submitting the MR."
---

## Metadata

| Item | Value |
|----|------|
| version | 1.0.0 |
| owner | Dev / Development line tech lead |
| category | Role skill |
| priority | P0 |
| depth | L2 |

# dev-unit-test skill

## Overview

This skill generates and runs high-quality unit tests so that key logic and boundary / exception paths are covered.

## Workflow

1. Identify key logic and branches
2. Design cases (normal / boundary / exception / rollback paths)
3. Generate the unit test code
4. Run the tests and fix failures
5. Produce the coverage report (coverage_report.py)

## Level switching rules

| Level | Trigger | Approval |
|------|---------|---------|
| L1 Draft | Case design discussion, initial coverage assessment, test strategy alignment | No review needed |
| L2 Standard (default) | Default level for bank production; unit test generation and coverage check after coding and before MR submission | Review + development owner sign-off |
| L3 Implementation | Involves fund safety / regulatory reporting / cross-system integration / first go-live / high-risk change | ARB / compliance review + all deep gates passed |

**Automatic upgrade to L3**: when the code involves fund transfer logic, account balance changes, limit parameters, regulatory reporting fields, cross-service transactions or write-back of production data, upgrade automatically from L2 to L3. L3 must pass every computable gate in the "Depth level (L3 Implementation)" section below.

## Depth level (L3 Implementation)

| Level | Requirement |
|------|------|
| L1 | Skeleton key points, for discussion |
| L2 | Standard review level (bank production default) |
| L3 | Adds the following depth on top of L2 (mandatory for high-risk / regulatory / complex integration) |

### L3 workflow additions

- At L3, unit tests cover 100% of key paths and report both branch and line coverage
- Cases cover four categories: normal / boundary / exception / rollback
- Field-level cases: build boundary cases field by field for amount (min/max/±1/negative/zero/overflow), card number (format / check digit / empty / too long) and customer ID (format / validity)
- Exception path coverage: each of timeout, retry, circuit breaking, degradation, connection failure, data not found and concurrency conflict has a case
- Transaction and rollback cases: each of transaction commit, transaction rollback, compensation path and idempotency (duplicate submission returns the first result) has a case
- Concurrency safety cases: concurrent updates of shared resources (balance / limit / inventory), deadlock detection, lock granularity verification
- Mock standards: mock every external dependency (DB / third party / messaging); unit tests never depend on a real environment; assertions are meaningful (not just not None)

### L3 quality gates

- [ ] Line coverage ≥80% (coverage_report.py exit code 0)
- [ ] Key paths 100% (funds / permissions / limits / regulatory fields fully covered)
- [ ] All four case categories present (normal / boundary / exception / rollback)
- [ ] Branch coverage ≥70% (not only line coverage; key branches have assertions)
- [ ] Field-level boundary cases complete (amount / card number / customer ID min/max/±1)
- [ ] Exception path cases complete (timeout / retry / circuit breaking / degradation / concurrency conflict)
- [ ] No disabled-assertion bypasses (no @Ignore / skip / commented-out assertions)

> The main template contains the [L3 required] depth fields: `templates/unit-test-template.md`. For detailed level definitions, see the "Skill Depth Level Specification".

## Templates

| Template | Purpose |
|------|------|
| `templates/unit-test-template.md` | Unit test structure and assertion template |
| `templates/test-naming-convention.md` | Test naming convention |

## Scripts

| Script | Purpose | Exit codes |
|------|------|--------|
| `scripts/coverage_report.py` | Parse the coverage report and compare with the threshold | 0/2/3 |

## References

| Reference | Purpose |
|------|------|
| `references/coverage-thresholds.md` | Coverage thresholds and key path definition |

## Quality gates

- [ ] Line coverage ≥80%
- [ ] Key branches covered
- [ ] No disabled-assertion bypasses

## Common failure modes

| Failure mode | Symptom | Mitigation | Retry strategy |
|---------|------|---------|---------|
| Inflated coverage (happy path only) | High line coverage but exception paths not covered | Enforce branch coverage + L3 four case categories | Add exception path cases and measure coverage again |
| Brittle tests | Tests break whenever the implementation changes; high maintenance cost | Fixed assertion templates + behavior-driven tests | Rewrite as behavior-driven tests and rerun |
| Key paths not tested | Fund / permission / limit logic has no unit tests | L3 key paths 100% + field-level cases | Add key path cases and test again |
| Missing boundary values | Amount min/max/±1/negative not tested | L3 field-level boundary cases | Add boundary cases and rerun |
| Weak assertions | Only assert not None, values not verified | Assertion standards + test_smell_detector | Strengthen assertions and rerun |
| Non-standard mocks | Unit tests depend on a real DB / third party | Mock everything + mock standards | Switch to mocks and rerun |
| Concurrency paths not tested | No unit tests for concurrent balance / limit updates | L3 concurrency safety cases | Add concurrency cases and rerun |

## Upgrade path

| Direction | Trigger | Added fields | Rollback condition |
|---------|---------|---------|---------|
| L1 → L2 | Unit test generation before MR submission starts | Four case categories, coverage report (≥80%), key branch coverage | Self-check failed, downgrade to draft |
| L2 → L3 | Fund safety / regulatory reporting / cross-system integration / first go-live | Field-level boundary cases, exception path cases, concurrency safety cases, transaction and rollback cases, mock standards | Risk downgraded or scenario simplified; may return to L2 after compliance confirmation |

**Human fallback point**: at L3, the key path list and field-level boundary cases must be confirmed jointly by the development owner and the test architect. The Agent drafts; the development owner confirms and finalizes. A downgrade requires PM + compliance approval, with the reason recorded.

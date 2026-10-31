---
name: dev-code-reviewer
description: "Assist code review: automatically check coding standards, common defects, architecture consistency and security vulnerabilities, and produce review comments classified by severity and located to the code line. Use after the MR is submitted and before code review."
---

## Metadata

| Item | Value |
|----|------|
| version | 1.0.0 |
| owner | Dev / Technical committee |
| category | Role skill |
| priority | P0 |
| depth | L2 |

# dev-code-reviewer skill

## Overview

This skill assists code review by automatically checking standards, defects, architecture consistency and security issues.

## Workflow

1. Read the MR changes
2. Run the static scan + security scan
3. Check each item of the review checklist
4. Produce review comments (classified by severity)
5. Mark the areas that need focused human attention

## Level switching rules

| Level | Trigger | Approval |
|------|---------|---------|
| L1 Draft | Draft review comments, initial hotspot assessment, walkthrough checklist alignment | No review needed |
| L2 Standard (default) | Default level for bank production; after MR submission and before code review | Review meeting + reviewer sign-off |
| L3 Implementation | Involves fund safety / regulatory reporting / cross-system integration / first go-live / high-risk change | ARB / compliance review + all deep gates passed |

**Automatic upgrade to L3**: when the change involves fund transfer code, permission check logic, SQL changes, key / credential handling, regulatory reporting fields or production data access, upgrade automatically from L2 to L3. L3 must pass every computable gate in the "Depth level (L3 Implementation)" section below.

## Depth level (L3 Implementation)

| Level | Requirement |
|------|------|
| L1 | Skeleton key points, for discussion |
| L2 | Standard review level (bank production default) |
| L3 | Adds the following depth on top of L2 (mandatory for high-risk / regulatory / complex integration) |

### L3 workflow additions

- At L3, review comments are classified as fatal / critical / major and located to file:line
- Mark the high-risk areas that need deep human review (amounts / permissions / SQL)
- Field-level security review: mark risk points field by field for amount calculation (precision / overflow / sign), permission checks (authentication / privilege escalation / horizontal privilege escalation) and SQL (injection / full table scan / no index)
- Exception path coverage: whether catch blocks swallow exceptions, leak stack traces, leave resources unreleased, or continue with sensitive operations
- Concurrency safety review: race conditions on shared variables, reasonable lock granularity, deadlock risk, whether ThreadLocal is cleaned up
- Transaction consistency review: correct transaction boundaries, cross-service transactions, compensation and reversal, whether @Transactional actually takes effect
- Idempotency review: whether write operations have an idempotency key, whether duplicate requests are safe, whether the state machine prevents duplicate transitions

### L3 quality gates

- [ ] Fatal detection rate 100% (review_analyzer.py covers all hotspots + confirmed by human review)
- [ ] Review comments located to file:line (each comment includes file:line)
- [ ] False-positive rate <20% (confirmed by human sampling)
- [ ] All high-risk areas marked (amounts / permissions / SQL / keys / regulatory fields)
- [ ] Exception path review complete (swallowed exceptions / unreleased resources / stack trace leaks)
- [ ] Concurrency safety review complete (race conditions / deadlocks / lock granularity)
- [ ] Transaction and idempotency review complete (transaction boundaries / idempotency keys / state machine)

> The main template contains the [L3 required] depth fields: `templates/review-comments-template.md`. For detailed level definitions, see the "Skill Depth Level Specification".

## Templates

| Template | Purpose |
|------|------|
| `templates/code-review-checklist.md` | Review checklist |
| `templates/review-comments-template.md` | Review comments template |

## Scripts

| Script | Purpose | Exit codes |
|------|------|--------|
| `scripts/review_analyzer.py` | Change impact analysis and hotspot risk identification | 0 |

## References

| Reference | Purpose |
|------|------|
| `references/review-focus.md` | Guide to review focus areas |

## Quality gates

- [ ] Fatal issue detection rate 100%
- [ ] Review comments specific to the line
- [ ] False-positive rate <20%

## Common failure modes

| Failure mode | Symptom | Mitigation | Retry strategy |
|---------|------|---------|---------|
| Too many false positives | Normal code flagged as violations | Continuous rule tuning + allowlist of labeled false positives | Label the false positives and recheck |
| Deep logic issues missed | Fund calculation / permission / concurrency issues not found | Mark "needs deep human review" areas + L3 field-level review | Add the L3 review items and review again |
| Hotspots not marked | Large / high-risk files not in the hotspot list | Tune review_analyzer.py thresholds + cover risky suffixes | Adjust thresholds and rerun the analysis |
| Review comments without line numbers | Comments only at file level and cannot be located | Enforce the file:line format + template constraints | Add line numbers and review again |
| Security vulnerabilities missed | SQL injection / privilege escalation / key leaks not found | Integrate a SAST tool + L3 security-specific review | Add the security review and review again |
| Concurrency issues missed | Race conditions / deadlocks not found | L3 concurrency safety review + concurrency unit tests | Add the concurrency review and review again |
| Transaction boundary errors missed | @Transactional not effective / cross-service transaction without compensation | L3 transaction consistency review + transaction unit tests | Add the transaction review and review again |

## Upgrade path

| Direction | Trigger | Added fields | Rollback condition |
|---------|---------|---------|---------|
| L1 → L2 | MR code review starts | Review checklist, severity-classified review comments, hotspot list | Review rejected, downgrade to draft |
| L2 → L3 | Fund safety / regulatory reporting / cross-system integration / first go-live | Field-level security review, exception path review, concurrency safety review, transaction and idempotency review | Risk downgraded or scenario simplified; may return to L2 after compliance confirmation |

**Human fallback point**: at L3, the field-level security review and concurrency safety review must be confirmed jointly by a senior reviewer and the security owner. The Agent drafts; the senior reviewer confirms and finalizes. A downgrade requires PM + compliance approval, with the reason recorded.

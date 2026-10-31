---
name: ba-requirement-tracing
description: Maintain the requirement traceability matrix (RTM) so the full chain requirement → story → test case → test → change is traceable. Use for requirement changes, iteration planning and audit traceability checks.
---

## Metadata

| Item | Value |
|----|------|
| version | 1.0.0 |
| owner | BA / Senior BA, requirements line |
| category | Role skill |
| priority | P1 |
| depth | L2 |

# ba-requirement-tracing Skill

## Overview

This Skill maintains the requirement traceability matrix so the full chain stays traceable.

## Workflow

1. Read the requirement list and the user story list
2. Check the links between stories and requirements (rtm_check.py)
3. Identify orphan stories and requirements without stories
4. Generate the RTM report
5. Update the trace chain whenever a requirement changes


## Depth level switching rules

| Level | Trigger | Approval |
|------|---------|---------|
| L1 Draft | Drafting the RTM, exploring trace links, aligning ideas | No review needed |
| L2 Standard (default) | Default level for bank production; requirement changes / iteration planning / audit traceability checks | BA lead review + PM confirmation |
| L3 Implementation | High-risk project / regulatory reporting / cross-system integration / first go-live / audit traceability | ARB/compliance review + all depth gates passed |

**Automatic upgrade to L3**: when the work involves anti-money laundering, limit parameters, customer funds, regulatory reporting, interbank interfaces, production data changes, audit traceability checks, or a regulatory inspection is near (≤ 30 days), upgrade automatically from L2 to L3. L3 must pass every computable gate in the "Depth level (L3 Implementation)" section below.

## Depth level (L3 Implementation)

| Level | Requirement |
|------|------|
| L1 | Skeleton points for discussion |
| L2 | Standard review level (bank production default) |
| L3 | L2 plus the depth content below (mandatory for high risk / regulatory / complex integration) |

### L3 workflow additions

- L3 produces a full-chain trace: requirement → story → test case → test → change → release
- Automatically identify broken links and generate a gap report
- Quantify trace chain completeness: all six chain nodes present (requirement / story / test case / test / change / release), with a computable coverage rate per node
- Handle broken links by severity: grade each broken link by impact (high/medium/low); high-risk broken links must be fixed within 24 hours and have an owner
- Classify trace items: every trace item has a type (added/modified/deleted) and a status (draft/in review/finalized/obsolete)
- The RTM can be exported in several formats: CSV (for audit), JSON (for the Agent), Markdown (for human review)
- Before an audit traceability check, generate a complete trace report with coverage statistics and a broken-link list

### L3 quality gates

- [ ] rtm_check.py exit code 0 (no unlinked stories, no orphan requirements, acceptance structure complete)
- [ ] 100% coverage of all six chain nodes (requirement / story / test case / test / change / release)
- [ ] Broken links are graded (high/medium/low); high-risk broken links fixed within 24 hours with an owner
- [ ] Every trace item has a type (added/modified/deleted) and a status (draft/in review/finalized/obsolete)
- [ ] The RTM can be exported as CSV/JSON/Markdown
- [ ] The audit trace report contains coverage statistics and a broken-link list
- [ ] The trace chain is updated when a requirement changes (the change ID is linked to the affected stories / test cases / tests)

> The main template contains the [L3 required] depth fields: `templates/rtm-template.md`. For detailed level definitions see the "Skill Depth Level Specification".

## Templates

| Template | Purpose |
|------|------|
| `templates/rtm-template.md` | RTM template |

## Scripts

Reuses `scripts/rtm_check.py (bundled)`.

## Quality gates

- [ ] Every requirement is linked to at least 1 story
- [ ] No orphan items
- [ ] Test results can be traced by requirement ID

## Common failure modes

| Failure mode | Symptom | Mitigation | Retry strategy |
|---------|------|---------|---------|
| Non-standard ID format | Requirement / story / test case IDs use inconsistent formats | Enforced format check (REQ-xxx/US-xxx/TC-xxx) | Normalize the IDs and rerun rtm_check.py |
| Broken links | A story is not linked to a requirement, or a test case is not linked to a story | rtm_check.py detects and warns automatically | Complete the links and rerun the script; it passes only with exit code 0 |
| Orphan requirements | A requirement is not covered by any story | rtm_check.py orphan detection | Split stories to cover the requirement and rerun the script |
| Missing chain nodes | The trace chain lacks test case / test / change nodes | Six-node coverage check | Add the missing nodes and regenerate the RTM |
| Broken links not graded | Broken links have no high/medium/low grade or owner | Broken-link grade field is mandatory | Add the grade and owner and resubmit |
| Change not reflected in the trace | The trace chain was not updated after a requirement change | Change process gate: the change ID must be linked to the affected items | Update the trace chain and resubmit |
| RTM cannot be exported | Markdown only; audit cannot consume it | Mandatory three-format export (CSV/JSON/Markdown) | Add the CSV/JSON export and resubmit |

## Upgrade path

| Direction | Trigger | Added fields | Rollback condition |
|---------|---------|---------|---------|
| L1 → L2 | Requirement change / iteration planning / audit traceability check | All [L2 required] sections (link check / orphan detection / RTM report / change sync) | Review rejected; downgrade to draft |
| L2 → L3 | High-risk project / regulatory reporting / cross-system integration / first go-live / audit traceability | Six-node coverage, broken-link grading, trace item type and status, three-format export, audit trace report | Risk downgraded or scenario simplified; may return to L2 after compliance confirmation |

**Human fallback point**: L3 trace chain completeness and broken-link grading must be confirmed jointly by the BA and the audit owner. The Agent drafts the RTM; the BA lead confirms before finalization. Any downgrade requires PM + compliance approval, with the reason recorded.
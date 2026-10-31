---
name: qa-uat-support
description: "Support business users through UAT: scope confirmation, scenario mapping, case review, environment and data preparation, training and support, execution tracking and acceptance materials. Use for supporting and coordinating user acceptance testing in the UAT phase."
---

## Metadata

| Item | Value |
|----|------|
| version | 1.0.0 |
| owner | QA / UAT coordinator |
| category | Role skill |
| priority | P0 |
| depth | L2 |

# qa-uat-support skill

## Overview

This skill supports business users through UAT so that business acceptance runs smoothly and efficiently.

## Workflow

1. UAT preparation: scope confirmation, scenario mapping, UAT plan
2. Case review: review the UAT cases written by business users
3. Environment and data: deployment check, masked data preparation, accounts and permissions
4. Training and support: operation training, FAQ, live Q&A
5. Execution tracking: progress, issue classification (defect / change / operation)
6. Defect management: logging, assignment, verification and closure, trends
7. UAT report: execution summary, defect analysis, acceptance opinion, residual risks
8. Acceptance support: help the business owner sign off, compile the acceptance materials


## Level switching rules

| Level | Trigger | Approval |
|------|---------|---------|
| L1 Draft | Exploring the UAT support approach, scenario mapping discussion, demo walkthrough | No review needed |
| L2 Standard (default) | Default level for bank production; supporting and coordinating user acceptance testing in the UAT phase | UAT review meeting + QA owner sign-off |
| L3 Implementation | Involves fund safety / regulatory reporting / cross-system integration / first go-live / high-risk change | ARB / compliance review + all deep gates passed |

**Automatic upgrade to L3**: for UAT involving anti-money laundering, limit parameters, customer funds, regulatory reporting, interbank interfaces, production data changes, fund reversal / idempotency scenarios, or the first go-live of a core accounting system, upgrade automatically from L2 to L3. L3 must pass every computable gate in the "Depth level (L3 Implementation)" section below.

## Depth level (L3 Implementation)

| Level | Requirement |
|------|------|
| L1 | Skeleton key points, for discussion |
| L2 | Standard review level (bank production default) |
| L3 | Adds the following depth on top of L2 (mandatory for high-risk / regulatory / complex integration) |

### L3 workflow additions

- Output UAT scenario mapping + issue classification (defect / change / operation) + acceptance materials; issues are classified first by uat_defect_classifier.py
- Core business scenarios 100% covered; the scenario mapping traces three ways: business process ↔ UAT case ↔ acceptance criteria
- uat_progress_tracker.py summarizes UAT progress daily; execution rate and pass rate match the actual data
- Environment and data close to production: masked production data, scaled data volumes, accounts and permissions identical to production
- UAT cases must be confirmed and signed by the business owner; fund-related scenarios must have business acceptance criteria
- Complete acceptance materials: UAT report, defect analysis, acceptance opinion, residual risks, business owner sign-off

### L3 quality gates

- [ ] Core business scenarios 100% covered (nothing missing from the scenario mapping)
- [ ] UAT cases confirmed and signed by the business owner
- [ ] Accurate issue classification (initial classification by uat_defect_classifier.py + human review)
- [ ] UAT progress summarized daily by uat_progress_tracker.py, with consistent data
- [ ] Environment data close to production (masked data + scaled volumes + identical accounts and permissions)
- [ ] Fund-related scenarios have business acceptance criteria
- [ ] Acceptance materials complete (UAT report / defect analysis / acceptance opinion / residual risks / sign-off)

> The main template contains the [L3 required] depth fields: `templates/uat-plan-template.md`. For detailed level definitions, see the "Skill Depth Level Specification".

## Templates

| Template | Purpose |
|------|------|
| `templates/uat-plan-template.md` | UAT plan |
| `templates/uat-report-template.md` | UAT report |

## Scripts

| Script | Purpose |
|------|------|
| `scripts/uat_progress_tracker.py` | UAT progress and issue tracking |
| `scripts/uat_defect_classifier.py` | Automatic UAT issue classification |

## References

| Reference | Purpose |
|------|------|
| `references/uat-guide.md` | UAT management process |

## Quality gates

- [ ] Core business scenarios 100% covered
- [ ] UAT cases confirmed by the business
- [ ] Environment data close to production

## Common failure modes

| Failure mode | Symptom | Mitigation | Retry strategy |
|---------|------|---------|---------|
| Business users short on time | Slow UAT progress, core scenarios not covered | Book time early + focused UAT sessions + parallel execution | Rebook time and continue UAT |
| Requirement misunderstanding | UAT cases do not match the real business process | Business walkthrough before UAT + operation training + signed case confirmation | Fix the cases and confirm again |
| Environment / data problems | UAT environment failures or data not close to production | Dry-run check before UAT + masked data + scaled volumes | Fix the environment / data and rerun |
| Inaccurate issue classification | Defect / change / operation misclassified | Initial classification by uat_defect_classifier.py + human review | Reclassify and review again |
| Core scenarios not covered | Core business scenarios missing after UAT ends | Scenario mapping gate (business process ↔ case ↔ acceptance criteria) | Add scenario cases and test again |
| Cases not confirmed by the business | UAT cases not signed by the business owner | Case confirmation sign-off gate | Get the sign-off and review again |
| Incomplete acceptance materials | Missing UAT report / defect analysis / acceptance opinion / sign-off | Acceptance materials checklist gate (all five elements) | Add the missing materials and review again |

## Upgrade path

| Direction | Trigger | Added fields | Rollback condition |
|---------|---------|---------|---------|
| L1 → L2 | Formal UAT support starts | All [L2 required] sections (scope confirmation / case review / environment and data / training and support / execution tracking / defect management / UAT report / acceptance support) | Review rejected, downgrade to draft |
| L2 → L3 | Fund safety / regulatory reporting / cross-system integration / first go-live | Three-way scenario mapping traceability, automatic initial issue classification, scripted progress summary, environment data close to production, business sign-off, five elements of acceptance materials | Risk downgraded or scenario simplified; may return to L2 after compliance confirmation |

**Human fallback point**: at L3, UAT cases and acceptance criteria must be confirmed and signed by the business owner. The Agent drafts; the business owner confirms and finalizes. A downgrade requires PM + compliance approval, with the reason recorded.

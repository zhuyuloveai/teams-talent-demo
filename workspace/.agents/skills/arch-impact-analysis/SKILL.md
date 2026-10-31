---
name: arch-impact-analysis
description: Identify the full impact of a change (code / data / interfaces / configuration / documentation / permissions) and produce a risk list and rollback recommendations. Use whenever a change enters the design phase or the requirement scope changes.
---

## Metadata

| Item | Value |
|----|------|
| version | 1.0.0 |
| owner | Arch / Architecture line lead |
| category | Role skill |
| priority | P0 |

# arch-impact-analysis Skill

## Overview

This Skill identifies the full impact of a change, so that no integration partner or data impact is missed, and provides the basis for release and risk assessment.

## Workflow

1. Read the change proposal and the existing system information
2. Enumerate the change points (code / data / interfaces / configuration / documentation / permissions)
3. Analyze the data impact (tables, migration, compatibility)
4. Analyze the impact on interfaces and integration partners
5. Produce the risk list and rollback recommendations (each item with an impact level)
6. Produce the impact analysis report


## Depth level (L3 Implementation)

| Level | Requirement |
|------|------|
| L1 | Skeleton points for discussion |
| L2 | Standard review level (bank production default) |
| L3 | L2 plus the depth content below (mandatory for high risk / regulatory / complex integration) |

### L3 workflow additions

- L3 impact analysis covers six dimensions (code / data / interfaces / configuration / documentation / permissions) + rollback recommendations
- High-risk items quantify the impact (number of callers / data volume / effect on the change window)

### L3 quality gates

- [ ] All six dimensions covered
- [ ] High-risk items quantified + responsible party
- [ ] Every item has a rollback recommendation

> The main template contains the [L3 required] depth fields: `templates/impact-analysis-template.md`. For detailed level definitions see the "Skill Depth Level Specification".

## Templates

| Template | Purpose |
|------|------|
| `templates/impact-analysis-template.md` | Impact analysis report template |
| `templates/impact-item-checklist.md` | Impact item checklist (six-dimension enumeration) |

## Scripts

| Script | Purpose |
|------|------|
| `scripts/impact_scan.py` | Scans the codebase for references to the change points (optional helper) |

## References

| Reference | Purpose |
|------|------|
| `references/impact-dimensions.md` | Impact dimension definitions and grading criteria |

## Quality gates

- [ ] All six dimensions covered: data / interfaces / integration / configuration / documentation / permissions
- [ ] Every impact has a level (high/medium/low)
- [ ] High-risk items have a clear owner and handling
- [ ] Rollback recommendations included

## Common failure modes

| Failure mode | Mitigation |
|---------|---------|
| Missed impact | Mandatory checklist enumeration |
| Underestimated impact | Calibrated grading criteria |
| No rollback recommendation | Required template field |
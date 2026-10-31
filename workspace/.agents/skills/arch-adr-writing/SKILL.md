---
name: arch-adr-writing
description: Record the context, decision, alternatives and consequences of an architecture decision in the standard format (MADR), number and archive it, and link it to the design document. Use when making an important technical decision.
---

## Metadata

| Item | Value |
|----|------|
| version | 1.0.0 |
| owner | Arch / Architecture board |
| category | Role skill |
| priority | P0 |

# arch-adr-writing Skill

## Overview

This Skill records architecture decisions in a standard format so that decisions are traceable.

## Workflow

1. Identify the decision points that need an ADR
2. Write the ADR from the template: context / problem / decision / alternatives / consequences
3. Cite the related design documents and review records
4. Number and archive it (ADR-NNN)
5. Link it to the design document


## Depth level (L3 Implementation)

| Level | Requirement |
|------|------|
| L1 | Skeleton points for discussion |
| L2 | Standard review level (bank production default) |
| L3 | L2 plus the depth content below (mandatory for high risk / regulatory / complex integration) |

### L3 workflow additions

- L3 ADRs add a quantified trade-off table: five-dimension comparison of cost / performance / operations / audit / risk
- Record the impact of the decision and the rollback path

### L3 quality gates

- [ ] ≥2 alternatives
- [ ] Quantified trade-off table complete
- [ ] ADR linked to the design document and evidence

> The main template contains the [L3 required] depth fields: `templates/adr-template.md`. For detailed level definitions see the "Skill Depth Level Specification".

## Templates

| Template | Purpose |
|------|------|
| `templates/adr-template.md` | ADR template (MADR format) |
| `templates/adr-index.md` | ADR index |

## Scripts

| Script | Purpose |
|------|------|
| `scripts/adr_lint.py` | ADR format and completeness check |

## References

| Reference | Purpose |
|------|------|
| `references/adr-guide.md` | ADR writing guide |

## Quality gates

- [ ] All four elements present: context / decision / alternatives / consequences
- [ ] Every decision has a rationale
- [ ] Linked to the design document

## Common failure modes

| Failure mode | Mitigation |
|---------|---------|
| Missing ADR | Automatic reminders for identified decision points |
| Hollow content | Template enforces required fields |
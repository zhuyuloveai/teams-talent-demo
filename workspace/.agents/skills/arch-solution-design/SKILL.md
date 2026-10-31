---
name: arch-solution-design
description: Turn a requirement specification into a solution design and architecture decision records (ADRs) that are implementable, compliant and evolvable, covering overall design, modules/services, interfaces, data, deployment, evolution and NFR responses, and use a script to check the requirement coverage matrix. Use when entering the design phase after the G1 requirement sign-off.
---

## Metadata

| Item | Value |
|----|------|
| version | 1.0.0 |
| owner | Arch / Architecture line lead |
| category | Role skill |
| priority | P0 |

# arch-solution-design Skill

## Overview

This Skill turns a requirement specification into a solution design that is **implementable, compliant and evolvable**. It ensures that before the design phase ends, 100% of the requirements are covered, key decisions are justified, and NFRs have quantified responses.

## Workflow

### Step 1: Check the requirements and existing knowledge

Read the requirement specification and, if legacy systems are involved, combine it with the existing knowledge from `cobol-legacy-knowledge` to confirm the impact and constraints. Output: design input list (requirement IDs, legacy impact points, constraints).

### Step 2: Map bounded contexts and dependencies

Determine the business context, boundaries (in-scope/out-of-scope), dependent systems and data boundaries, and technical constraints. Output: bounded context list.

### Step 3: List candidate options

For each key architecture decision point, list **≥2 candidate options** and compare their pros and cons. Giving a conclusion directly without trade-offs is forbidden.

### Step 4: Write ADRs

Write an architecture decision record for each decision using `templates/adr-template.md`: context, candidate options, choice, rationale, consequences, status, evidence.

### Step 5: Write the design document

Write it using `templates/solution-design-template.md`: overall design, modules/services, interfaces, data, deployment, evolution. Include a **requirement coverage matrix** (each REQ ↔ design section).

### Step 6: Respond to each NFR and compliance item

Using `templates/nfr-response-table.md`, respond to performance, security, availability, scalability and maintainability one by one, each with a quantified metric and a verification method; mark compliance items and their owners.

### Step 7: Run the requirement coverage check

Run `scripts/design_coverage.py <requirement-spec.md> <design-doc.md>`:

- Checks that every requirement is covered by the design (orphan requirement detection)
- Outputs a coverage matrix report (JSON)

Exit codes: 0 = pass; 2 = uncovered requirements exist; 3 = argument error.

### Step 8: Produce the G2 review materials

Assemble the design package: design document, ADR list, NFR response table, impact analysis (owned by `arch-impact-analysis`), coverage check report.


## Depth level (L3 Implementation)

| Level | Requirement |
|------|------|
| L1 | Skeleton points for discussion |
| L2 | Standard review level (bank production default) |
| L3 | L2 plus the depth content below (mandatory for high risk / regulatory / complex integration) |

### L3 workflow additions

- Produce interface contracts: request/response schema, field-level definitions, full error code set, timeout/retry/idempotency ([L3 required])
- Produce the data model (field level), security design (authentication / authorization / encryption / audit) and capacity estimate
- ADRs include a quantified trade-off table (cost / performance / operations / audit / risk comparison)

### L3 quality gates

- [ ] Interface contracts can be validated by contract_validate
- [ ] The full error code set covers business / system / security
- [ ] ADRs have ≥2 alternatives with quantified trade-offs
- [ ] Capacity and canary rollback conditions are quantified

> The main template contains the [L3 required] depth fields: `templates/solution-design-template.md`. For detailed level definitions see the "Skill Depth Level Specification".

## Templates

| Template | Purpose |
|------|------|
| `templates/solution-design-template.md` | Standard solution design document template (aligned with the EPS DDD target architecture) |
| `templates/adr-template.md` | Architecture decision record template |
| `templates/nfr-response-table.md` | NFR response table |

## Scripts

| Script | Purpose |
|------|------|
| `scripts/design_coverage.py` | Generates the requirement ↔ design coverage matrix and detects uncovered requirements |

## References

| Reference | Purpose | When to read |
|------|------|---------|
| `references/architecture-standards.md` | Architecture standards, design input boundaries, template alignment | Before the design starts |
| EPS target architecture requirement specification (DDD) | Target architecture reference (workspace root) | When designing the overall architecture |
| cobol-legacy-knowledge output | Legacy system rules and models | When legacy systems are involved |

## Quality gates

- [ ] The requirement coverage matrix is complete (design_coverage.py reports no uncovered items)
- [ ] Every ADR contains context / candidates / choice / rationale / consequences
- [ ] Every NFR is quantified; no empty "met by default" answers
- [ ] Design conclusions cite evidence (requirement ID / legacy knowledge / standard clause)
- [ ] Compliance items have an owner and a verification method
- [ ] Design inputs do not go beyond the requirements and standards (no over-engineering)

## Common failure modes

| Failure mode | Symptom | Mitigation | Retry strategy |
|---------|------|---------|---------|
| Design detached from requirements | The solution does not cover some requirements | Caught by design_coverage.py | Add coverage and retry |
| Arbitrary technology choice | No alternatives, no rationale | The ADR template forces "candidates / choice / rationale" | Add the ADR and retry |
| Missing NFRs | Performance / security / availability not answered | The template forces an NFR section | Add the NFRs and retry |
| Over-engineering | Technical complexity beyond the requirements | Design inputs limited to the requirements and standards | Narrow the scope and retry |
| Unclear legacy coupling | Legacy system constraints not considered | Use cobol-legacy-knowledge | Add the legacy analysis and retry |
---
name: cobol-legacy-knowledge
description: "Extract traceable business and system knowledge (the L1–L5 five-level model) from legacy AS/400 COBOL code, and convert it through an adapter layer into the formats consumed by the BA / Arch roles. Use when a requirement / design task involves a legacy system."
---

## Metadata

| Item | Value |
|----|------|
| version | 1.0.0 |
| owner | BA/Arch / Legacy system owner |
| category | Domain skill |
| priority | P0 |
| depth | L2 |

# cobol-legacy-knowledge skill

## Overview

This skill reuses the `extract-cobol-knowledge` skill that already exists in the workspace (under `.skill_build/extract-cobol-knowledge`). It extracts the five-level business model from legacy AS/400 COBOL code and converts it through the adapter layer (legacy_adapter.py) into the formats consumed by the BA / Arch roles.

## Workflow

1. Locate the codebase and member types (COBOL / copybook / DDS / CL / RPG)
2. Run `scan_as400_codebase.py` (reusing the existing skill script) to produce the technical inventory
3. Read the programs and copybooks / DDS, and extract semantics program by program
4. Build the five-level model bottom-up, L5 → L1
5. Annotate every fact with evidence (program / paragraph / line); mark anything unclear as unresolved
6. Call the adapter layer with the `output_profile` (ba_requirement / arch_design) to output the role-specific format


## Level switching rules

| Level | Trigger | Approval |
|------|---------|---------|
| L1 Draft | First look at legacy code, draft five-level model, approach alignment | No review needed |
| L2 Standard (default) | Default level for bank production; requirement / design task involves a legacy AS/400 COBOL system | BA / Arch owner review + legacy system owner sign-off |
| L3 Implementation | Legacy code migration / business continuity risk / regulatory reporting involving the legacy system / first decoupling of a legacy system | ARB / compliance review + all deep gates passed |

**Automatic upgrade to L3**: when the work involves anti-money laundering, limit parameters, customer funds, regulatory reporting, interbank interfaces, production data changes, legacy code migration, business continuity risk (core accounting / payments / clearing) or the first decoupling of a legacy system, upgrade automatically from L2 to L3. L3 must pass every computable gate in the "Depth level (L3 Implementation)" section below.

## Depth level (L3 Implementation)

| Level | Requirement |
|------|------|
| L1 | Skeleton key points, for discussion |
| L2 | Standard review level (bank production default) |
| L3 | Adds the following depth on top of L2 (mandatory for high-risk / regulatory / complex integration) |

### L3 workflow additions

- At L3, every item of the five-level model carries evidence (program / paragraph / line) + unresolved markers
- The role-specific output (BA / Arch profile) is reproducible
- Quantify the legacy code risk: five computable figures (affected programs, copybooks, DDS files, interfaces, transaction volume); mark high-risk programs (core accounting / payments / clearing)
- Migration impact assessment: state the migration impact of this change on the legacy COBOL programs (programs to modify, programs to add, programs to retire, data migration volume)
- Business continuity: identify the business continuity risks during the change (downtime, rollback plan, emergency procedure); core accounting / payments / clearing programs need their own BCP
- Evidence that the adapter layer is a pure conversion: the legacy_adapter.py output must match the original five-level model (no inference / no fabrication) and be comparable field by field
- Unresolved item tracking: every unresolved item needs an owner, an expected resolution date and an interim handling plan; none may be left out

### L3 quality gates

- [ ] Every fact in the five-level model cites evidence (program name / paragraph name / line number, all three)
- [ ] legacy_adapter.py exit code 0 and the `profile` field not empty (ba_requirement / arch_design)
- [ ] Legacy code risk quantified (programs / copybooks / DDS files / interfaces / transaction volume, all five)
- [ ] Migration impact assessed (programs to modify / add / retire + data migration volume)
- [ ] Business continuity risks identified (downtime / rollback plan / emergency procedure); core programs have their own BCP
- [ ] Adapter output matches the original five-level model field by field (no inference / no fabrication)
- [ ] Unresolved items have owner, expected resolution date and interim handling plan (all three)

> The main template contains the [L3 required] depth fields: `templates/five-level-model.md`. For detailed level definitions, see the "Skill Depth Level Specification".

## Templates

| Template | Purpose |
|------|------|
| `templates/five-level-model.md` | L1–L5 model structure |
| `templates/output-schema.json` | Structured output schema |

## Scripts

| Script | Purpose |
|------|------|
| `scripts/legacy_adapter.py` | Five-level model → role-specific format (pure conversion, no inference) |
| Reused | `scripts/scan_as400_codebase.py (bundled)` |

## References

| Reference | Purpose |
|------|------|
| `references/adaptation-map.md` | Five-level model → SDLC artifact mapping |
| Reused | `references/five-level-model.md (bundled)`, `as400-cobol-guide.md`, `output-schema.md` |

## Quality gates

- [ ] Every fact cites evidence
- [ ] Anything unclear is marked unresolved
- [ ] Adapter output matches the original model (no inference)

## Common failure modes

| Failure mode | Symptom | Mitigation | Retry strategy |
|---------|------|---------|---------|
| Fabricated rules | Facts in the five-level model have no evidence | Mandatory evidence (program name / paragraph name / line number) + unresolved markers | Complete the evidence or mark as unresolved, then resubmit |
| Scan and interpretation disconnected | Scan results disagree with the five-level model | Archive the raw scan results separately + compare field by field | Reinterpret, compare and resubmit |
| Adapter inference | legacy_adapter.py output contains information not in the original model | Check that the adapter is a pure conversion (no inference / no fabrication) | Fix the adapter output and rerun the script |
| Legacy risk not quantified | Only says "large impact", with no number of programs / customers / transactions | Template enforces five quantified fields | Complete the quantified data and resubmit |
| Missing migration impact | No count of programs to modify / add / retire, no data migration volume | Migration impact assessment section is mandatory | Complete the migration impact and resubmit |
| Business continuity missed | Core programs have no BCP / rollback plan | L3 enforces the business continuity section | Complete the BCP and rollback plan and resubmit |
| Unresolved items incomplete | Unresolved items have no owner / expected resolution date | Unresolved item tracking fields are required | Complete all three fields and resubmit |

## Upgrade path

| Direction | Trigger | Added fields | Rollback condition |
|---------|---------|---------|---------|
| L1 → L2 | Requirement / design task involves a legacy AS/400 COBOL system | All [L2 required] sections (codebase location / technical inventory / five-level model / evidence annotation / role adaptation) | Review rejected, downgrade to draft |
| L2 → L3 | Legacy code migration / business continuity risk / regulatory reporting involving the legacy system / first decoupling of a legacy system | Five quantified legacy risk figures, migration impact assessment, business continuity BCP, evidence of pure adapter conversion, unresolved item tracking | Risk downgraded or scenario simplified; may return to L2 after compliance confirmation |

**Human fallback point**: at L3, the legacy code risk quantification and business continuity plan must be confirmed jointly by BA / Arch and the legacy system owner. The Agent drafts the five-level model and the adapted output; the legacy system owner confirms and finalizes. A downgrade requires PM + compliance approval, with the reason recorded.

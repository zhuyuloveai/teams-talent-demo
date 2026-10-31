---
name: bank-domain-payments
description: Unify the payments domain language. Provides the domain glossary, core business processes (payment / reversal / clearing / reconciliation) and regulatory constraints, and checks terminology consistency in outputs. Use for any Agent task that involves payment business.
---

## Metadata

| Item | Value |
|----|------|
| version | 2.0.0 |
| owner | Everyone / Business architecture lead |
| category | Domain skill |
| priority | P0 |
| depth | L2 |

# bank-domain-payments Skill

## Overview

This Skill unifies the payments domain language to prevent terminology drift and misunderstandings of the business. Payment business involves fund safety and regulatory compliance; inconsistent terms lead to development misunderstandings, reconciliation errors and even financial risk.

**Core value:**
- Unify terms and stop mixing "transfer / transferal / fund move"
- Make easily confused concepts explicit, such as clearing ≠ settlement and reversal ≠ cancellation
- Provide business constraints that can be cited directly: limit hierarchy, state machine, reconciliation rules
- Check terminology consistency in output documents

## Workflow

### Step 1: Load domain knowledge

Load references as the task requires:

| Reference | Content | When to load |
|------|------|---------|
| `references/payments-basics.md` | Payment business overview, types, concepts, limit hierarchy, state machine, clearing and reconciliation, regulatory constraints, typical business rules | Any payment-related task |
| `references/iso20022-reference.md` | ISO 20022 message standard, structure, development constraints | Message development/parsing |
| `references/regulatory-requirements.md` | Quick reference for limit / AML / data security / payment clearing regulation | Compliance requirements/design |
| `templates/glossary.md` | Domain glossary (term / definition / alias / source) | Checking terminology consistency |
| `templates/process-map.md` | Core business process map (transfer / reversal / reconciliation / clearing) | Understanding business processes |

### Step 2: Use the terms during the task

When writing requirement / design / test documents:
- Use the standard terms from the glossary; aliases are forbidden
- Cite the rule ID when referring to a business rule (for example BR-PAY-001)
- Cite the regulation reference when referring to a regulatory requirement (for example `[PBOC Order [2018] No. 2]`)
- Use the standard state names when describing state transitions (INIT/PENDING/SUCCESS, etc.)

### Step 3: Terminology consistency check

Run `scripts/term_check.py <target-document.md> [--glossary glossary.md]`:

- Detects the terms used (compared with the glossary)
- Detects forbidden aliases (every hit is a warning and must be fixed)
- Detects suspected uncataloged terms (compound phrases ending in "limit / quota / account / statement" that are not in the glossary)
- Exit codes: 0 = pass, 1 = uncataloged-term warning, 2 = forbidden alias found, 3 = argument error

### Step 4: Handle uncataloged terms

When a suspected uncataloged term is found:
1. Decide whether it is a valid payment term
2. If valid: register it as to be confirmed and submit it for business architecture review
3. If not valid (colloquial/generic): replace it with the standard term
4. After approval, add it to the glossary

### Step 5: Write the domain constraints section

Append a "Domain constraints" section to the output document:
- Payment types and business rule IDs involved in this task
- Regulatory requirements cited (reference + article)
- Limit check requirements (levels and check order)
- State machine constraints (allowed state transition paths)

## Depth level switching rules

| Level | Trigger | Approval |
|------|---------|---------|
| L1 Draft | Aligning concepts, first look at terms, informal discussion | No review needed |
| L2 Standard (default) | Default level for bank production; routine payment requirements / design / testing | Terminology review + business architecture confirmation |
| L3 Implementation | Fund safety / regulatory reporting / interbank interfaces / launch of a new payment type / limit parameter changes | ARB/compliance review + all depth gates passed |

**Automatic upgrade to L3**: when the work involves anti-money laundering, limit parameters, customer funds, regulatory reporting, interbank interfaces, a new payment type or production data changes, upgrade automatically from L2 to L3. L3 must pass every computable gate in the "Depth level (L3 Implementation)" section below.

## Depth level (L3 Implementation)

| Level | Requirement |
|------|------|
| L1 | Skeleton points for discussion |
| L2 | Standard review level (bank production default) |
| L3 | L2 plus the depth content below (mandatory for high risk / regulatory / complex integration) |

### L3 workflow additions

- The glossary covers the core terms of the pilot business line + a forbidden-alias table + a quarterly review process
- Output documents include a "Domain constraints" section (business rule IDs + regulation references + limit levels + state machine paths)
- The payment state machine includes the full state transition matrix and the allowed next states
- Limit parameters state their configuration source and change audit requirements

### L3 quality gates

- [ ] Terms are consistent (term_check.py exit code 0 or 1)
- [ ] Business rule IDs are traceable (BR-PAY-xxx)
- [ ] Regulatory citations include reference and article
- [ ] State transitions follow the state machine definition
- [ ] Limit check order is correct (L1->L2->L3->L4->L5)
- [ ] The quarterly review process is in place

> The main template contains the [L3 required] depth fields: `templates/glossary.md`. For detailed level definitions see the "Skill Depth Level Specification".

## Templates

| Template | Purpose |
|------|------|
| `templates/glossary.md` | Domain glossary (term / definition / alias / source / states / limit levels) |
| `templates/process-map.md` | Core business process map (transfer / reversal / reconciliation / clearing, with branches and error codes) |

## Scripts

| Script | Purpose | Exit codes |
|------|------|--------|
| `scripts/term_check.py` | Terminology consistency check (forbidden alias / uncataloged term detection) | 0/1/2/3 |

### Script usage examples

```bash
# Basic check (built-in glossary)
python term_check.py requirement-spec.md

# Use a custom glossary
python term_check.py requirement-spec.md --glossary glossary.md --json
```

Output JSON:
```json
{
  "terms_found": ["Clearing", "Single Transaction Limit", "Transfer"],
  "terms_count": 3,
  "inconsistent": [{"alias": "transferal", "should_be": "Transfer", "suggestion": "Replace 'transferal' with 'Transfer'"}],
  "inconsistent_count": 1,
  "suspected_uncataloged": ["daily transfer quota"],
  "passed": false,
  "exit_code": 2
}
```

## References

| Reference | Purpose | When to read |
|------|------|---------|
| `references/payments-basics.md` | Payment business overview, types, concepts, limit hierarchy, state machine, clearing and reconciliation, regulatory constraints, business rules | Any payment-related task |
| `references/iso20022-reference.md` | ISO 20022 message standard and development constraints | Message development/parsing |
| `references/regulatory-requirements.md` | Quick reference for limit / AML / data security / payment clearing regulation | Compliance requirements/design |

## Quality gates

- [ ] Terms match the glossary (no forbidden aliases)
- [ ] Business constraints cite a source (regulation reference / internal policy / business rule ID)
- [ ] Uncataloged terms are registered as to be confirmed
- [ ] Limit check order is correct (L1->L2->L3->L4->L5)
- [ ] State transitions follow the state machine definition

## Common failure modes and mitigation

| Failure mode | Symptom | Mitigation | Retry strategy |
|---------|------|---------|---------|
| Terminology drift | Aliases such as "transferal" or "fund move" are used | term_check.py detects forbidden aliases automatically | Fix and rerun the check |
| Clearing and settlement mixed up | "Clearing" and "settlement" used interchangeably | The glossary separates them explicitly; references/payments-basics.md compares the definitions | Fix the terms and retry |
| Hard-coded limits | Limit values hard-coded in code/requirements | Limits must be parameterized, with the configuration source stated | Refactor to parameters and retry |
| State transitions bypass the engine | Status field changed with a direct UPDATE | State machine constraint added to the design review checklist | Switch to the state machine engine and retry |
| Vague regulatory citations | "According to regulatory requirements" with no reference | Citation rules require reference + article | Add the reference and retry |
| Outdated knowledge | Glossary/process map no longer matches the actual business | Quarterly review process, versioned | Update after review |

## Upgrade path

| Direction | Trigger | Added fields | Rollback condition |
|---------|---------|---------|---------|
| L1 → L2 | Entering formal requirement/design review | All [L2 required] sections (standard glossary terms / business rule IDs / regulation references / state machine / limit levels) | Review rejected; downgrade to draft |
| L2 → L3 | Fund safety / regulatory reporting / interbank interfaces / new payment type / limit parameter changes | Field-level limit parameter table, full state transition matrix, quarterly review records, complete forbidden-alias table | Risk downgraded or scenario simplified; may return to L2 after compliance confirmation |

**Human fallback point**: the L3 limit parameter table and state transition matrix must be confirmed jointly by the BA and the business architecture lead. The Agent drafts; the business confirms before finalization. Any downgrade requires PM + compliance approval, with the reason recorded. The quarterly glossary review must be signed off and archived by the business architecture team.
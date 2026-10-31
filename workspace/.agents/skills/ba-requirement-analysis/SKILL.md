---
name: ba-requirement-analysis
description: Turn a raw business request into a structured requirement specification that can be developed and tested, covering background, goals, scope, functional requirements, non-functional requirements, business rules, dependencies, risks and compliance notes.
---

## Metadata

| Item | Value |
|----|------|
| version | 1.0.0 |
| owner | BA / Senior BA, requirements line |
| category | Role skill |
| priority | P0 |
| depth | L2 |

# ba-requirement-analysis Skill

## Overview

This Skill turns a raw business request into a standardized bank software requirement specification. Core goal: **vague request → structured requirements + testable acceptance criteria + complete impact analysis**.

## Workflow

### Step 1: Check the input and identify gaps

Read the raw request and all background material, and identify information gaps against this checklist:

- [ ] What is the business goal? (Why do it? What problem does it solve?)
- [ ] Who are the target users/roles? (Who uses it?)
- [ ] Where are the business scope and boundaries? (What is in? What is out?)
- [ ] What are the priority and timing requirements?
- [ ] Which business rules and regulatory requirements apply?
- [ ] Which existing systems and interfaces are involved?
- [ ] Where does the data come from and where does it go?
- [ ] Are there non-functional requirements (performance / security / availability)?

### Step 2: Produce the clarification question list

If there are information gaps, produce a clarification question list. **Every question must state "why we need to know"**, so the person asked understands the context.

Template: `templates/clarification-questions.md`

> Principle: do not ask what can be inferred from existing material and domain knowledge. Ask only the key questions that truly need business confirmation.

### Step 3: Write the requirement specification

Once the clarifications are complete, write the specification using the `templates/requirement-spec-template.md` template.

**Key points per section:**

1. **Background and goals**: state clearly "why we do it", the business value, and quantified goals (if any)
2. **User roles**: list all stakeholder roles, with each role's responsibilities and usage scenarios
3. **Functional scope**: state in-scope / out-of-scope explicitly with clear boundaries
4. **Functional requirements**: organize by module/feature; each requirement has a unique ID (REQ-xxx)
5. **Business rules**: list one by one and cite the source (regulation reference / business policy / legacy system rule)
6. **Non-functional requirements**: performance, security, availability, maintainability; each one quantified and verifiable
7. **Interfaces and integration**: internal and external interfaces, data flow
8. **Data requirements**: data entities, data volume, data retention, data security
9. **Dependencies and constraints**: technical, time and resource constraints
10. **Risks and assumptions**: identify project risks and key assumptions
11. **Compliance notes**: applicable regulatory requirements, internal bank policies, SoD requirements

### Step 4: Annotate business rules

Every business rule must contain:
- **Rule ID**: BR-xxx
- **Rule description**: a clear and complete statement of the rule
- **Source**: [regulation reference] / [internal policy ID] / [confirmed by business department] / [legacy system]
- **Priority**: Must / Should / Could

### Step 5: Quality self-check

Run `scripts/spec_completeness.py` for the completeness check, plus a manual self-check:

- [ ] No section is empty; sections that do not apply say N/A with the reason
- [ ] No ambiguous vague words (roughly / etc. / as soon as possible / as far as possible / possibly); unconfirmed items are marked [To be confirmed]
- [ ] Every functional requirement can be verified on its own
- [ ] Every business rule cites its source
- [ ] Non-functional requirements have quantified metrics and a verification method
- [ ] Interfaces have clear request/response formats and error codes
- [ ] Every risk has a mitigation

### Step 6: Produce the review version

Produce the requirement package for the G1 review:
- Requirement specification (main document)
- Clarification question list (closed)
- Requirement self-check report
- Business rule source list


## Depth level switching rules

| Level | Trigger | Approval |
|------|---------|---------|
| L1 Draft | Exploration, aligning ideas, demo walkthroughs | No review needed |
| L2 Standard (default) | Default level for bank production | Requirement review meeting + business owner sign-off |
| L3 Implementation | Fund safety / regulatory reporting / cross-system integration / first go-live / high-risk change | ARB/compliance review + all depth gates passed |

**Automatic upgrade to L3**: when the work involves anti-money laundering, limit parameters, customer funds, regulatory reporting, interbank interfaces or production data changes, upgrade automatically from L2 to L3. L3 must pass every computable gate in the "Depth level (L3 Implementation)" section below.

## Depth level (L3 Implementation)

| Level | Requirement |
|------|------|
| L1 | Skeleton points for discussion |
| L2 | Standard review level (bank production default) |
| L3 | L2 plus the depth content below (mandatory for high risk / regulatory / complex integration) |

### L3 workflow additions

- Produce a field-level requirement table: field / type / required / format / validation rule / default / source ([L3 required])
- Produce an exception and error matrix: exception scenario / system behavior / error code / user message, covering 4 categories: parameter / business / system / security
- Produce a data dictionary and a scenario matrix (role × data × interface × expected result); make acceptance criteria executable (Given/When/Then + data preparation)

### L3 quality gates

- [ ] Every functional requirement has field-level definitions (field table not empty)
- [ ] The exception matrix covers all 4 categories, and every item has an error code and a message
- [ ] The scenario matrix covers happy / boundary / exception cases, and acceptance criteria include data preparation

> The main template contains the [L3 required] depth fields: `templates/requirement-spec-template.md`. For detailed level definitions see the "Skill Depth Level Specification".

## Templates

| Template | Purpose |
|------|------|
| `templates/requirement-spec-template.md` | Standard requirement specification template |
| `templates/clarification-questions.md` | Clarification question list template |
| `templates/impact-checklist.md` | Impact analysis checklist |

## Scripts

| Script | Purpose |
|------|------|
| `scripts/spec_completeness.py` | Completeness and empty-field check of the requirement specification |
| `scripts/ambiguity_check.py` | Scan for and flag vague words |

## References

- `references/requirement-writing-guide.md`: requirement writing rules
- `references/regulatory-mapping.md`: regulatory requirement mapping (common in banking)
- `references/bank-domain-glossary.md`: banking business glossary
- `references/sample-requirements/`: examples of good past requirements

## Common failure modes and mitigation

| Failure mode | Symptom | Mitigation |
|---------|------|---------|
| Filling in despite missing information | Hollow requirements, key business rules missing | Always produce the clarification question list; with ≥3 information gaps, do not write the full specification, only a first draft + gap list |
| Ambiguous terms | Vague wording such as "roughly", "as far as possible", "as soon as possible" | Self-check word list scan; every hit is marked [To be confirmed] |
| Invented business rules | Business rules "created" without a source | Every business rule must cite its source; anything that cannot be confirmed is marked [Inferred] and flagged for human confirmation |
| Gaps in impact analysis | Affected systems or stakeholders are missed | Cross-check against the existing system inventory; mandatory checks per dimension |
| Hollow non-functional requirements | Unquantified statements such as "must be fast", "must be secure" | The NFR template forces quantified fields; anything without a metric is marked [To be confirmed] |
| Inconsistent format | Messy requirement IDs, inconsistent writing style | Template enforces the format; IDs are generated and checked automatically |

## Upgrade path

| Direction | Trigger | Added fields | Rollback condition |
|---------|---------|---------|---------|
| L1 → L2 | Entering formal requirement review | All [L2 required] sections (background / roles / scope / functions / rules / NFR / interfaces / data / risks / compliance) | Review rejected; downgrade to draft |
| L2 → L3 | Fund safety / regulatory reporting / cross-system integration / first go-live | Field-level requirement table, exception matrix, data dictionary, scenario matrix | Risk downgraded or scenario simplified; may return to L2 after compliance confirmation |

**Human fallback point**: the L3 field-level requirement table and exception matrix must be confirmed jointly by the BA and the business owner. The Agent drafts; the business confirms before finalization. Any downgrade requires PM + compliance approval, with the reason recorded.
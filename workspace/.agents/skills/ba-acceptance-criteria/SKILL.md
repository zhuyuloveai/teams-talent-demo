---
name: ba-acceptance-criteria
description: Split a requirement specification into user stories, define testable Given/When/Then acceptance criteria for each story, and verify that stories are fully linked to requirement IDs (RTM). Use before the requirements are finalized, when writing acceptance criteria, and when preparing G1 review materials.
---

## Metadata

| Item | Value |
|----|------|
| version | 1.0.0 |
| owner | BA / Senior BA, requirements line |
| category | Role skill |
| priority | P0 |
| depth | L2 |

# ba-acceptance-criteria Skill

## Overview

This Skill turns a requirement specification into **user stories + testable acceptance criteria**, and uses a script to guarantee **story↔requirement traceability**. Core goal: before the requirements are finalized, every requirement has a clear "definition of done".

## Workflow

### Step 1: Read the requirement specification

Read the requirement specification and extract every functional requirement ID (REQ-xxx) and the business rules relevant to acceptance. Output: requirement list (REQ ID, functional description, priority).

### Step 2: Split user stories by user role

Split each functional requirement into user stories by user role (retail customer / customer service / operations, etc.). Principles:

- One story expresses exactly one value the user can perceive
- Every story must map to at least one REQ ID
- When one REQ has several stories, the stories must not overlap

See `templates/user-story-template.md` for the template.

### Step 3: Write Given/When/Then acceptance criteria

Write testable acceptance criteria for each story. Use observable verbs (display / return / allow / reject / prompt / record). Vague words such as "roughly / etc. / as soon as possible / as far as possible" are forbidden.

See `templates/acceptance-criteria-template.md` for the template.

### Step 4: Assign priority

Assign each story a priority: Must / Should / Could, consistent with the priority in the requirement specification.

### Step 5: Run the RTM check

Run `scripts/rtm_check.py <requirement-spec.md> <user-stories.md>`:

- Checks that every story is linked to a valid REQ ID
- Checks that every requirement is covered by a story (orphan requirement detection)
- Checks that every story contains a Given/When/Then structure

Exit codes: 0 = pass; 1 = warning (a story lacks acceptance structure); 2 = fail (unlinked stories or orphan requirements); 3 = argument error.

### Step 6: Produce the review version

Produce the user story and acceptance criteria package for the G1 review:

- User story list (with priority and REQ links)
- Acceptance criteria (Given/When/Then)
- RTM check report (rtm_check.py output)


## Depth level switching rules

| Level | Trigger | Approval |
|------|---------|---------|
| L1 Draft | Exploring story splits, aligning ideas, demo walkthroughs | No review needed |
| L2 Standard (default) | Default level for bank production; before requirements are finalized and when preparing G1 review materials | Requirement review meeting + BA lead sign-off |
| L3 Implementation | Fund safety / regulatory reporting / cross-system integration / first go-live / high-risk change | ARB/compliance review + all depth gates passed |

**Automatic upgrade to L3**: when the work involves anti-money laundering, limit parameters, customer funds, regulatory reporting, interbank interfaces or production data changes, upgrade automatically from L2 to L3. L3 must pass every computable gate in the "Depth level (L3 Implementation)" section below.

## Depth level (L3 Implementation)

| Level | Requirement |
|------|------|
| L1 | Skeleton points for discussion |
| L2 | Standard review level (bank production default) |
| L3 | L2 plus the depth content below (mandatory for high risk / regulatory / complex integration) |

### L3 workflow additions

- Each acceptance criterion states its test data preparation (the Given data can be constructed, with data source and construction script)
- Cover boundary values (min/min-1/max/max+1) and exception paths (interface error / timeout / concurrency / idempotency)
- Acceptance criteria are traceable both ways with the RTM and test cases (AC↔US↔REQ↔TC four-way traceability matrix)
- Fund operations must have acceptance criteria for idempotency and reversal scenarios
- Regulatory requirements must have compliance boundary acceptance criteria (for example limit caps, reporting deadlines)

### L3 quality gates

- [ ] Every Given has constructible data (with boundary values and data source)
- [ ] Exception paths have their own acceptance criteria (interface error / timeout / concurrency / idempotency)
- [ ] Acceptance criteria ↔ requirements ↔ test cases are traceable (four-way traceability matrix complete)
- [ ] Fund operations include idempotency and reversal acceptance
- [ ] Regulatory requirements include compliance boundary acceptance
- [ ] rtm_check.py exit code 0 (no unlinked stories, no orphans)

> The main template contains the [L3 required] depth fields: `templates/acceptance-criteria-template.md`. For detailed level definitions see the "Skill Depth Level Specification".

## Templates

| Template | Purpose |
|------|------|
| `templates/user-story-template.md` | Standard user story template |
| `templates/acceptance-criteria-template.md` | Acceptance criteria (Given/When/Then) template |

## Scripts

| Script | Purpose | Exit codes |
|------|------|--------|
| `scripts/rtm_check.py` | Checks story↔requirement links, orphan requirements and missing acceptance structure | 0/1/2/3 |

### Script usage examples

```bash
# Basic check (human readable)
python skills/ba-acceptance-criteria/scripts/rtm_check.py requirement-spec.md user-stories.md

# JSON output (for the Agent)
python skills/ba-acceptance-criteria/scripts/rtm_check.py requirement-spec.md user-stories.md --json
```

Output JSON:
```json
{
  "total_stories": 5,
  "linked": 4,
  "unlinked": [
    {
      "story_id": "US-005",
      "found_reqs": ["REQ-999"],
      "reason": "Not linked to a valid REQ ID in the requirement document"
    }
  ],
  "orphan_stories": ["REQ-003"],
  "stories_without_acceptance": [
    {"story_id": "US-003", "missing": ["given", "then"]}
  ],
  "requirement_ids": ["REQ-001", "REQ-002", "REQ-003"]
}
```

## References

| Reference | Purpose | When to read |
|------|------|---------|
| `references/user-story-writing-guide.md` | User story writing rules and splitting principles | Before writing stories |
| `references/acceptance-criteria-examples.md` | Acceptance criteria example library (bank transfer scenarios) | When writing acceptance criteria |

## Quality gates

- [ ] Every story is linked to a valid REQ ID (rtm_check.py reports no unlinked items)
- [ ] Requirement coverage is 100% (no orphan requirements)
- [ ] Every story contains all three elements: Given/When/Then
- [ ] Acceptance criteria use observable verbs and no vague words
- [ ] Priorities match the requirement specification

## Common failure modes

| Failure mode | Symptom | Mitigation | Retry strategy |
|---------|------|---------|---------|
| Acceptance criteria disconnected from requirements | A story references a REQ that does not exist, or a requirement is not covered | Caught by rtm_check.py | Fix the story links and retry |
| Criteria not testable | Vague words such as "roughly / as soon as possible" | Observable-verb template + word list scan | Rewrite as verifiable statements and retry |
| Overlapping story splits | Unclear boundaries between stories under the same REQ | Splitting principle check (one story, one value) | Re-split and retry |
| Missing exception paths | Only the happy path is written; no interface error / timeout / concurrency scenarios | L3 requires separate acceptance criteria for exception paths | Add exception-path ACs and retry |
| Boundary values not covered | Limit requirements lack min/max and ±1 cases | L3 requires full boundary value coverage | Add boundary-value ACs and retry |
| Missing idempotency | A fund operation does not define the expected behavior for duplicate submissions | Fund operations must include idempotency acceptance | Add idempotency ACs and retry |

## Upgrade path

| Direction | Trigger | Added fields | Rollback condition |
|---------|---------|---------|---------|
| L1 → L2 | Entering formal requirement review | All [L2 required] sections (user stories / acceptance criteria / priority / REQ links / RTM check) | Review rejected; downgrade to draft |
| L2 → L3 | Fund safety / regulatory reporting / cross-system integration / first go-live | Field-level acceptance data (with boundary values), exception-path acceptance criteria, two-way acceptance↔requirement↔test case traceability matrix | Risk downgraded or scenario simplified; may return to L2 after compliance confirmation |

**Human fallback point**: L3 field-level acceptance data and exception-path acceptance criteria must be confirmed jointly by the BA and the business owner. The Agent drafts; the business confirms before finalization. Any downgrade requires PM + compliance approval, with the reason recorded.
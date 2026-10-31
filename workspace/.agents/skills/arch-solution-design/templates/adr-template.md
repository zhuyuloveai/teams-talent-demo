# ADR-<seq>: <decision title>

| Item | Value |
|----|------|
| ID | ADR-<seq> |
| Date | <date> |
| Linked requirement | REQ-<xxx> |
| Status | Proposed / Accepted / Deprecated |
| Author | Arch Agent (A-02) |

## Context

<the problem to decide, its context and constraints>

## Candidate options

| Option | Description | Pros | Cons |
|------|------|------|------|
| Option A | <description> | <pros> | <cons> |
| Option B | <description> | <pros> | <cons> |

## Decision

<the chosen option and key conclusions>

## Rationale

<why this option was chosen, citing requirements, standards or evidence>

## Consequences

<impact on systems / interfaces / data / operations / compliance>

## Evidence

- <requirement ID / standard clause / legacy knowledge evidence>

---

## L3 required depth fields

| Field | Requirement |
|------|------|
| Interface contracts | Request/response schema + field level + full error code set |
| Data model | Field-level ER and constraints |
| Security design | Four elements: authentication / authorization / encryption / audit |
| Capacity estimate | QPS / resources / caching strategy |

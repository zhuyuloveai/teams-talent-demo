# <Feature name> Requirement Specification

> Depth markers: [L2 required] must be present at the standard review level; [L3 required] must be present at the implementation level (high risk / regulatory / complex integration).

## Document information

| Item | Value |
|----|------|
| Document ID | REQ-<year>-<seq> |
| Version | v<version> |
| Business owner | <role> |
| Requirement source | <source ticket/request> |

## Revision history

| Version | Date | Changed by | Change |
|------|------|--------|---------|
| v1.0 | <date> | BA Agent | First draft |

## 1. Background and goals [L2 required]

### 1.1 Business background

<why we do it>

### 1.2 Business goals (quantified)

| Goal | Metric |
|------|---------|
| <goal> | <metric> |

### 1.3 Glossary [L3 required]

| Term | Definition |
|------|------|
| <term> | <definition> |

## 2. User roles and permissions [L2 required]

| Role | Responsibilities | Permissions |
|------|------|--------|
| <role> | <responsibilities> | <permissions> |

## 3. Scope definition [L2 required]

### 3.1 In-Scope / Out-of-Scope

<scope>

### 3.2 Assumptions and dependencies

<assumptions/dependencies>

## 4. Functional requirements [L2 required]

### 4.1 Feature overview

| Module | Feature | Priority | Source |
|------|--------|--------|------|
| <module> | <feature> | Must/Should/Could | <source> |

### 4.2 Detailed functional requirements (one per REQ)

#### REQ-<seq> <feature name>

**Description**: <description>

**Field-level requirement table [L3 required]**:

| Field | Type | Required | Format/validation | Default | Source |
|------|------|------|----------|--------|------|
| <field> | <type> | Yes/No | <validation rule> | <default> | <source> |

**Exception matrix [L3 required]**:

| Exception scenario | System behavior | Error code | User message |
|---------|---------|--------|---------|
| <exception> | <behavior> | <code> | <message> |

## 5. Business rules [L2 required]

| ID | Rule | Source | Priority | Verification point |
|------|------|------|--------|--------|
| BR-<seq> | <rule> | <source> | Must | <verification point> |

## 6. Non-functional requirements [L2 required]

| Dimension | Metric | Verification method |
|------|------|---------|
| Performance | <metric> | <method> |
| Security | <requirement> | <method> |

## 7. Interfaces and integration [L2 required]

| Interface | Direction | Description |
|------|------|------|
| <interface> | <direction> | <description> |

## 8. Data requirements [L2 required]

### 8.1 Data dictionary [L3 required]

| Entity/field | Meaning | Type/constraint | Source |
|-----------|------|----------|------|
| <field> | <meaning> | <constraint> | <source> |

### 8.2 Data security [L2 required]

<masking/encryption/retention requirements>

## 9. Scenario matrix [L3 required]

| Scenario | Role | Data/interface | Expected result |
|------|------|-----------|------|
| <scenario> | <role> | <data> | <expected result> |

## 10. Acceptance criteria (executable) [L2 required]

| Story | Given | When | Then | Data preparation |
|------|-------|------|------|---------|
| US-<seq> | <precondition> | <action> | <expected result> | <data> |

## 11. Dependencies and constraints [L2 required]

<constraints>

## 12. Risks and assumptions [L2 required]

| Risk/assumption | Impact | Mitigation |
|-----------|------|------|
| <item> | <impact> | <mitigation> |

## 13. Compliance notes [L2 required]

<regulatory/policy/SoD requirements>

---

## L3 required depth fields

| Field | Requirement |
|------|------|
| Field-level requirement table | Type / required / format / validation / default / source defined per field of each functional requirement |
| Exception and error matrix | Four elements: exception scenario / system behavior / error code / user message |
| Data dictionary | Entity / field / meaning / constraint / source |
| Scenario matrix | Happy / boundary / exception × role / data / interface × expected result |

---
template_name: impact-checklist
version: 1.0.0
owner: BA / Arch
description: Requirement impact analysis checklist
---

# {{Requirement name}} Impact Analysis Checklist

| Item | Value |
|----|------|
| Requirement ID | REQ-{{YYYY}}-{{NNN}} |
| Analysis date | {{YYYY-MM-DD}} |
| Analyst | {{analyst}} |

## Impact dimension checks

### Business impact [mandatory]

- [ ] Affected business lines/departments
- [ ] Affected business processes
- [ ] Impact on business operations (positive/negative)
- [ ] Do business users need training?
- [ ] Do business policies/operating procedures need updating?

### System impact [mandatory]

- [ ] List of systems involved
- [ ] New/modified functional modules
- [ ] Interface changes (inbound/outbound)
- [ ] Data model changes
- [ ] Performance impact
- [ ] Security impact
- [ ] Availability impact

### Data impact [mandatory]

- [ ] New/modified data entities
- [ ] Migration of existing data
- [ ] Change in data volume
- [ ] Change in data security level
- [ ] Change in data retention period

### Interface impact [conditionally required]

- [ ] New interfaces
- [ ] Changes to existing interfaces (do they affect existing callers?)
- [ ] Interface protocol changes
- [ ] Impact on upstream and downstream systems

### People/organization impact [mandatory]

- [ ] New roles/positions
- [ ] Changes to job responsibilities
- [ ] Training needs
- [ ] Changes to working habits

### Compliance impact [mandatory]

- [ ] New regulatory requirements involved
- [ ] Changes to existing compliance requirements
- [ ] Changes to SoD (segregation of duties)
- [ ] Changes to audit requirements

### Operations impact [conditionally required]

- [ ] New monitoring items
- [ ] Changes to operational procedures
- [ ] Change in release/rollback complexity
- [ ] Change in support/maintenance cost

## Impact summary

| Dimension | Impact level | Notes |
|------|---------|------|
| Business | High/Medium/Low | ... |
| System | High/Medium/Low | ... |
| Data | High/Medium/Low | ... |
| People | High/Medium/Low | ... |
| Compliance | High/Medium/Low | ... |
| Operations | High/Medium/Low | ... |

## Affected stakeholders

| Role/department | Impact | Notification |
|-----------|---------|---------|
| {{department/role}} | {{impact}} | Meeting/email/notice |

## Risks and recommendations

(Main risks of this change and recommended mitigations)

---

## L3 required depth fields

| Field | Requirement |
|------|------|
| Field-level requirement table | Type / required / format / validation / default / source defined per field of each functional requirement |
| Exception and error matrix | Four elements: exception scenario / system behavior / error code / user message |
| Data dictionary | Entity / field / meaning / constraint / source |
| Scenario matrix | Happy / boundary / exception × role / data / interface × expected result |

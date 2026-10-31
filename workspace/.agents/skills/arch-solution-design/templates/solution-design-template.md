# <System/feature name> Solution Design

> Depth markers: [L2 required] must be present at the review level; [L3 required] must be present at the implementation level.

## Document information

| Item | Value |
|----|------|
| Document ID | ARCH-<seq> |
| Linked requirement | REQ-<xxx> |
| Version | v<version> |

## 1. Design scope [L2 required]

| In-Scope | Out-of-Scope | Dependent systems | Technical constraints |
|----------|--------------|----------|---------|
| <scope> | <excluded> | <dependencies> | <constraints> |

## 2. Requirement coverage matrix [L2 required]

| Requirement | Description | Design section |
|------|---------|---------|
| REQ-<xxx> | <description> | §<section> |

## 3. Overall design [L2 required]

### 3.1 Components and call chain

<component diagram / call chain description>

### 3.2 Module/service breakdown

| Module/service | Responsibility | Boundary | Dependencies |
|----------|------|------|------|
| <name> | <responsibility> | <boundary> | <dependencies> |

## 4. Interface contracts [L3 required]

### 4.1 <interface name> (request/response schema)

Request parameters:
| Parameter | Type | Required | Validation |
|------|------|------|------|
| <parameter> | <type> | Yes/No | <validation> |

Response:
```json
{ "code": "200", "message": "success", "data": { <field>: <value> } }
```

**Full error code set**:
| Error code | Scenario | Description |
|--------|------|------|
| <code> | <scenario> | <description> |

**Timeout/retry/idempotency**: <strategy>

## 5. Data model [L3 required]

| Entity/field | Type | Constraint | Description |
|-----------|------|------|------|
| <field> | <type> | <constraint> | <description> |

## 6. Security design [L3 required]

| Item | Design |
|----|------|
| Authentication | <approach> |
| Authorization | <roles/permissions> |
| Input validation | <allowlist/validation> |
| Sensitive information | <encryption/masking> |
| Audit | <trail> |

## 7. Performance and capacity estimate [L3 required]

| Item | Estimate |
|----|------|
| Critical path overhead | <estimate> |
| QPS/capacity | <estimate> |
| Caching strategy | <strategy> |

## 8. Deployment and canary release [L2 required]

| Order | Step | Verification |
|------|------|------|
| 1 | <step> | <verification> |

**Canary thresholds and rollback triggers** [L3 required]: <percentage/metric/trigger condition>

## 9. Evolution and compatibility [L3 required]

| Item | Description |
|----|------|
| Backward compatibility | <description> |
| Interface compatibility | <description> |
| Future extensions | <extension points> |

## 10. NFR and compliance responses [L2 required]

| Category | Metric | Design measure | Verification |
|------|------|---------|------|
| Performance | <metric> | <measure> | <verification> |

## 11. Risks and open questions [L2 required]

| Risk/open question | Impact | Mitigation |
|-------------|------|------|
| <item> | <impact> | <mitigation> |

---

## L3 required depth fields

| Field | Requirement |
|------|------|
| Interface contracts | Request/response schema + field level + full error code set |
| Data model | Field-level ER and constraints |
| Security design | Four elements: authentication / authorization / encryption / audit |
| Capacity estimate | QPS / resources / caching strategy |

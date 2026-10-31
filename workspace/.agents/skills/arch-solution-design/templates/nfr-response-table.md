# NFR and Compliance Response Table

| Category | Requirement item | Quantified metric | Design response | Verification method | Owner |
|------|--------|---------|---------|---------|--------|
| Performance | <e.g. query P95 response time> | ≤1s | <how the design meets it> | Load test plan | <role> |
| Security | <e.g. sensitive data encryption> | Encrypted in transit/at rest | <how the design meets it> | Security review/scan | <role> |
| Availability | <e.g. service availability> | ≥99.9% | <how the design meets it> | Failure drill | <role> |
| Scalability | <e.g. capacity> | Supports N TPS | <how the design meets it> | Capacity test | <role> |
| Maintainability | <e.g. logging/monitoring> | Observable metrics | <how the design meets it> | Monitoring acceptance | <role> |
| Compliance | <regulatory/internal requirement> | <clause> | <how the design meets it> | Compliance review | <role> |

> Empty "met by default" answers are forbidden: every item must give a concrete design measure and verification method.

---

## L3 required depth fields

| Field | Requirement |
|------|------|
| Interface contracts | Request/response schema + field level + full error code set |
| Data model | Field-level ER and constraints |
| Security design | Four elements: authentication / authorization / encryption / audit |
| Capacity estimate | QPS / resources / caching strategy |

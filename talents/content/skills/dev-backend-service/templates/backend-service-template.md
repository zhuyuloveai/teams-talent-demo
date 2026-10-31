# Backend service implementation template

```text
application/
  UseCase/Service        # Use case orchestration
domain/
  model/                 # Entities / value objects / aggregate roots
  service/               # Domain services and rules
infrastructure/
  repository/            # Data access
  client/                # External interfaces
api/
  dto/                   # DTO/VO/Entity mapping
  controller/            # REST/gRPC
```

Annotate every business rule with its requirement / rule ID.

---

## L3 required depth fields

| Field | Requirement |
|------|------|
| Rule traceability | Business rule ↔ requirement ID ↔ unit test |
| Error codes | Unified error code mapping table |

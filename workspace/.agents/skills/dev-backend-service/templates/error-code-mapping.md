# Unified error code mapping

| Scenario | Error code | Description |
|------|--------|------|
| Invalid parameter | 40000 | Request parameter validation failed |
| Unauthorized | 40100 | Not logged in / credentials expired |
| Forbidden | 40300 | No permission for the operation |
| Business failure | 500xx | Business rule not satisfied |
| System error | 99999 | Unknown error |

---

## L3 required depth fields

| Field | Requirement |
|------|------|
| Rule traceability | Business rule ↔ requirement ID ↔ unit test |
| Error codes | Unified error code mapping table |

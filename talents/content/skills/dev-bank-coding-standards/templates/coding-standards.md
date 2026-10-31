# Coding standards checklist (five categories)

| Category | Check items |
|------|--------|
| Naming | Class / method / variable naming conventions, constant naming, no pinyin abbreviations |
| Exception | No swallowed exceptions; handle exceptions by severity; never catch and ignore |
| Logging | Log key operations with a summary of inputs and outputs, without sensitive data |
| Security | Parameterized queries, no hardcoded keys, input validation, injection prevention |
| Resource | Connections / streams / locks released correctly, try-with-resources |

---

## L3 required depth fields

| Field | Requirement |
|------|------|
| Line-level issues | file:line + rule + suggestion |
| Tool mapping | SonarQube rule ID |

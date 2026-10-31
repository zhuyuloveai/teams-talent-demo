# Interface contract

| Item | Value |
|----|------|
| Interface | <path/method> |
| Protocol | REST/gRPC/MQ |
| Request | <schema> |
| Response | <schema> |
| Error codes | <error code table> |
| Timeout | <duration> |
| Idempotency | <idempotency key> |
| Authentication | <Token/signature> |

---

## L3 required depth fields

| Field | Requirement |
|------|------|
| Contract schema | Request/response at field level |
| Idempotency | Idempotency key and strategy |

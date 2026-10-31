# Development Pattern Index

> Generated automatically; do not edit by hand. The icode-miner engine rebuilds it each time a spec is archived.

| Name | Description | First archived |
| --- | --- | --- |
| [Spending Cashback and Reward Issuance](<./Spending Cashback and Reward Issuance/summary.md>) | Development pattern for cashback/points rewards after spending: campaign eligibility checks, proportional reward calculation, reward issuance triggered after posting, idempotent posting and failure retry | 2026-10-27T11:06:20+08:00 |
| [Cross-Service Idempotent Posting and Retry](<./Cross-Service Idempotent Posting and Retry/summary.md>) | Development pattern for idempotent cross-service reward posting: duplicate-evaluation check, account posting deduplication, keeping failures in pending status, and manual retry | 2026-10-27T17:44:44+08:00 |
| [Campaign Eligibility and Validity Control](<./Campaign Eligibility and Validity Control/summary.md>) | Development pattern for marketing campaign eligibility checks and validity control: campaign state machine and time window, account status and target account groups, and the decision chain for enrollment and participation limits | 2026-10-27T17:50:06+08:00 |
| [Account Balance Optimistic Lock Update](<./Account Balance Optimistic Lock Update/summary.md>) | Optimistic locking pattern for concurrent account balance updates: entity version field, in-transaction balance changes, and a unified 409 conflict response | 2026-10-27T18:45:20+08:00 |
| [User Maintenance and Delete Protection](<./User Maintenance and Delete Protection/summary.md>) | Development pattern for creating, updating and deleting users: type validation, hashed password storage, no self-deletion, and keeping the last admin | 2026-10-27T18:50:50+08:00 |
| [Unified Error Codes and Exception Handling](<./Unified Error Codes and Exception Handling/summary.md>) | Error handling pattern for adding validations or calling other services: domain exceptions, outbound failure translation, and global exception mapping to a unified error response | 2026-10-24T17:10:00+08:00 |

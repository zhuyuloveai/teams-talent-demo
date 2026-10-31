# User Story Writing Guide

## Story format

Standard format: **As a <role>, I want <capability>, so that <value>**.

Example: As a retail customer, I want to adjust my mobile banking transfer limit myself, so that I can manage the safety of my funds without visiting a branch.

## Splitting principles

1. **One story, one value**: do not pack several features into one story
2. **Maps to requirements**: every story must link to a REQ ID in the requirement specification
3. **Clear boundaries**: stories under the same REQ do not overlap
4. **User perspective**: describe the story from the user's point of view; no implementation details
5. **Right size**: a story should fit in one iteration (if not, split it further)

## Signals that a story needs splitting

- The requirement has several entry points or branching flows
- The requirement involves several user roles at once
- The requirement includes exception and boundary handling beyond the happy path

## Priority

| Priority | Meaning | Acceptance criteria requirement |
|--------|------|-------------|
| Must | Core feature; cannot go live without it | All acceptance criteria must pass |
| Should | Important feature; may go live with known defects | Key acceptance criteria must pass |
| Could | Enhancement; may be deferred | Executed as planned |

## Common problems

| Problem | Example | Fix |
|------|------|------|
| Implementation wording | "Call the limit interface" | "After the user submits the adjustment, the system saves the new limit" |
| Mixed values | "Query and export limits" | Split into two stories: "Query limit" and "Export limit" |
| No acceptance criteria | Only a story description | Add Given/When/Then |

---

## L3 depth story writing rules

### Splitting by boundary values

For requirements with numeric parameters (limit / credit limit / count / time limit), split boundary values into separate stories or acceptance criteria:

| Boundary type | Description | Example (limit adjustment) |
|---------|------|----------------|
| min | Minimum valid value | Submit an adjustment when the limit = CNY 0 |
| min-1 | Minimum - 1 (invalid) | Lower the limit to CNY -1 (must be rejected) |
| max | Maximum valid value | Raise the limit to CNY 50000 |
| max+1 | Maximum + 1 (invalid) | Raise the limit to CNY 50001 (must be rejected) |

### Splitting by exception paths

Every happy-path story needs matching exception-path acceptance criteria:

| Exception type | Acceptance focus |
|---------|---------|
| Interface error | User prompt and state preservation when the interface returns an error code |
| Timeout | Retry strategy and user experience when the interface times out |
| Concurrency | Processing order and consistency when several requests arrive at once |
| Idempotency | Result of duplicate requests (return the first result; do not execute again) |
| Insufficient permission | Rejection and prompt for unauthorized operations |

### Compliance boundary stories

Requirements that involve regulation must have compliance boundary acceptance criteria:

| Compliance scenario | Acceptance focus | Regulatory basis |
|---------|---------|---------|
| Anti-money laundering | Raise an alert when the cumulative amount reaches the threshold | PBOC Order [2018] No. 2 |
| Limit management | Reject the operation when it exceeds the regulatory limit | Yinfa [2016] No. 261 |
| Reporting deadline | Regulatory data is reported before the required deadline | Yinfa [2016] No. 261 |
| Customer funds | Fund operations must be traceable and auditable | Commercial Banking Law |

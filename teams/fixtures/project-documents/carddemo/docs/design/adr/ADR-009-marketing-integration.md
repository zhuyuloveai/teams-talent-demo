# ADR-009: Integration Approach for Marketing Reward Evaluation and Posting

| Item | Content |
|----|------|
| ID | ADR-009 |
| Date | 2026-10-26 |
| Status | Accepted |
| Related requirements | `docs/design/08-marketing-capability.md`, MK-REW-* |

## Context

With the new marketing capability, purchase posting must trigger reward evaluation, and cashback must actually reach the account balance. In the current system,
transaction posting completes inside a local transaction in transaction-service, the account balance lives in account-service, and the two cooperate through synchronous
REST calls (ADR-005); there is no messaging middleware. We must decide:

1. Where in the posting path reward evaluation is triggered;
2. Whether marketing unavailability affects posting;
3. How cashback posting stays idempotent and retryable.

## Alternatives

| Option | Description | Pros | Cons |
|---|---|---|---|
| A: synchronous call after posting + failure alert + idempotent retry | Call marketing evaluation after the posting transaction commits; failures are only logged; marketing calls account to post cashback idempotently, and failures stay PENDING and can be retried | No middleware; short call chain; financial facts are not affected by marketing | Rewards are delayed when marketing is unavailable; a retry entry point is needed |
| B: transactional outbox + MQ event-driven | Posting writes to an outbox; marketing subscribes to `TransactionPosted` | Fully decoupled; replayable | Requires MQ, consumer idempotency, backlog and dead-letter governance; high cost for the demo environment |
| C: end-of-day batch settlement | Scan the day's transactions daily and issue rewards in batch | Simple to implement; consistent with accounting batch processing | Rewards are not real-time; poor user experience; delayed campaign budget feedback |

## Quantitative Trade-off Table

| Option | Implementation cost | Performance overhead | Operational agility | Auditability | Risk |
|---|---|---|---|---|---|
| A | Low | Posting +2s worst case (timeout) | Seconds; failures can be retried immediately | High (reward records include the transaction ID) | Medium (rewards delayed while marketing is briefly unavailable) |
| B | High | No extra blocking on posting | Eventual consistency within minutes | High (events are traceable) | Low (governance required) |
| C | Low | No online overhead | Next day | Medium | Medium-high (poor budget control/user experience) |

## Decision

Adopt Option A, with the following constraints:

1. **Marketing does not block accounting**: the local posting transaction commits first, then `POST /api/v1/reward-evaluations` is called;
   call exceptions are only logged as `WARN` (the log contains only the transactionId), the transaction is not rolled back, and the posting result is unaffected.
2. **Idempotency**: `reward_grant` is unique on `(campaign_id, transaction_id)`; a repeated evaluation returns the existing reward
   (`duplicate=true`) and does not issue the reward again.
3. **Idempotent cashback posting**: account-service adds a unique key on `reward_credit.reward_id`;
   repeated calls with the same `rewardId` return the current account and do not reduce the balance owed again.
4. **Retryable failures**: when the downstream fails for a cash reward, it stays `PENDING` and can be retried manually through
   `POST /api/v1/rewards/{rewardId}/fulfill`; retries remain idempotent.
5. **Visibility**: the campaign performance API shows the issuance success rate and budget usage rate, and the PENDING count is monitored.

Option B is the next evolution step: posting writes to an outbox and marketing subscribes to events; the existing idempotency keys and API semantics are kept.

## Rationale

1. Purchase posting is a financial fact and marketing is an add-on benefit; their failure domains must be separated.
2. The current architecture has no MQ, so introducing Option B would significantly widen the scope of this phase; Option A matches the synchronous call style of ADR-005.
3. The idempotency keys (transaction ID, reward ID) serve both synchronous retries and future event replay, so no rework is needed.

## Consequences (Impact and Rollback Path)

- Impact: the posting path gains at most 2 seconds in the worst case (marketing timeout); when marketing is unavailable, rewards are delayed and need a manual retry or a later compensation job.
- Rollback: turning off the `marketing.enabled` switch in transaction-service stops the calls; marketing data lives in its own database,
  so accounting is unaffected; for full decoupling, add the outbox and subscription per Option B, with APIs and idempotency keys unchanged.

## Evidence

- `docs/design/08-marketing-capability.md` §3.1
- `docs/design/adr/ADR-005-cross-service-consistency.md`
- `docs/design/05-api-catalog.md` §8

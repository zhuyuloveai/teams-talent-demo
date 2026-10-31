# Cross-Service Idempotent Posting and Retry: Reward Issuance Code Analysis Report

> Scenario: idempotent cross-service reward posting: duplicate-evaluation check, account posting deduplication, keeping failures in pending status, and manual retry.
> Basis: code snippets 01 (reward-orchestration), 02 (account-credit) and 03 (tests), verified against the code committed in the repository.

## 1. Repository knowledge layers

This requirement is a cross-service integration between the **Marketing supporting domain (marketing reward issuance)** and the **Account existing domain (account posting)** in the CardDemo microservice architecture. At its core it is a "distributed consistency" use case:

- **Marketing bounded context (`marketing-service`, outbound consumer)**:
  - `RewardEvaluationService` (application service): orchestrates evaluation + issuance, new file
  - `RewardGrant` (reward record entity, unique on `(campaign_id, transaction_id)`): the idempotency carrier on the evaluation side, new file
  - `RewardGrantRepository` (repository port, implemented by `RewardGrantJpaRepository`): new file
  - `AccountClient` (outbound adapter, `account-service` client): reads snapshots + cashback posting, new file
  - `V1__marketing_schema.sql` (tables such as `reward_grant`): new migration
- **Account bounded context (`account-service`, posting provider)**:
  - `AccountApplicationService.creditCashback()`: idempotent cashback posting use case, new method
  - `RewardCredit` entity + `reward_credit` table (`reward_id` primary key): the idempotency carrier on the posting side, new file
  - `RewardCreditRepository` port + `RewardCreditJpaRepository` implementation: new files
  - `V3__reward_credit.sql`: new migration
- **Transaction domain (trigger, verified in the repository)**: `PostingService.evaluateRewards()` + `MarketingClient` are the marketing trigger point after posting (outside the snippets; see the committed code `PostingService.java:137-150`).

Layer positioning:

> Marketing capability (Marketing) → reward issuance use case (RewardEvaluationService) → idempotency check (RewardGrantRepository.existsByCampaignAndTransaction) → reward record (RewardGrant) → account posting (AccountApplicationService.creditCashback) → posting idempotency (RewardCredit); failure path → manual retry (RewardEvaluationService.fulfill → creditCashback).

## 2. Dependency analysis of affected locations

### Marketing domain (marketing-service)

| Dependency | Type | Reason and location |
|---|---|---|
| `RewardGrantRepository` | Port interface | `RewardEvaluationService.evaluate()` `:71` `existsByCampaignAndTransaction()` duplicate-evaluation check; `:79` `countByCampaignAndCard()`; `:112`/`:135` `saveReward()`; `:120` `findReward()` (fulfill) |
| `AccountClient` | Outbound adapter | `:63` `findAccount()` reads the account snapshot; `:103`/`:130` `creditCashback()` cashback posting (idempotency key rewardId) |
| `Clock` | Spring bean | `:69` `LocalDateTime.now(clock)`; injection makes time controllable in tests |
| `RewardGrant` | Entity | State transitions `markGranted/markPending` (`:105-108`); `isCashback()` (`:115-117`) decides whether to call the account service |
| `Campaign`/`Enrollment` aggregate roots | Depended-on aggregate roots | `campaign.consumeCashback()` deducts the budget (`:91`); `enrollments.findEnrollment()` checks enrollment (`:76`) |
| `RewardController` (inbound) | REST entry | `RewardController.java:44-47` evaluation entry; `:62-65` `fulfill` retry entry (committed in the repository) |

### Account domain (account-service)

| Dependency | Type | Reason and location |
|---|---|---|
| `RewardCreditRepository` | Port interface | `creditCashback()` `:78` `existsByRewardId()` idempotency check; `:84` `saveCredit()` records the posting fact |
| `Account` aggregate root | Depended-on aggregate root | `:82` `applyCashback(amount)` (`Account.java:118-124`, reduces the amount owed; the balance may be negative) |
| `AccountController` | Inbound adapter | `AccountController.java:74-79` exposes `POST /api/v1/accounts/{id}/cashback-credits` with input `CashbackCreditRequest` (`rewardId` idempotency key) |
| `reward_credit` table | Database | `V3__reward_credit.sql`, `reward_id` primary key + `account_id` index |

### Key cross dependencies

- marketing → account: `AccountClient.creditCashback()` (synchronous REST, 3s read timeout `RestClientConfig.java:18`; wrapped as `RemoteServiceException`).
- The idempotency key semantics run through three places: evaluation side `(campaign_id, transaction_id)` → unique reward record; posting side `reward_id` → posting record primary key; the `fulfill` retry relies on "short-circuit when already GRANTED + the posting-side idempotency key as safety net".

## 3. Call trace

### Main path: evaluation → posting (sequence)

```
RewardEvaluationService.evaluate(EvaluationCommand)
  │ validate(): transactionId non-empty, cardNumber \d{16}, accountId \d{11}, amount > 0 (InvalidRequestException)
  │ accountClient.findAccount() → none: skipped(ACCOUNT_NOT_FOUND)
  │ for (campaign : campaigns.findActiveAt(now))                    [per campaign]
  │   1. rewards.existsByCampaignAndTransaction() → true: skipped(ALREADY_EVALUATED), continue   ← duplicate-evaluation check
  │   2. enrollments.findEnrollment() / countByCampaignAndCard() → participation eligibility
  │   3. EligibilityPolicy.evaluateTransaction() → not met: skipped(reason), continue
  │   4. campaign.consumeCashback() (BusinessRuleException → skip with BUDGET_EXHAUSTED)
  │   5. new RewardGrant(UUID, ..., PENDING)
  │   6. isCashback() ?
  │        ├─ true: accountClient.creditCashback(accountId, rewardId, campaignId, amount)
  │        │     ├─ success → grant.markGranted(now)
  │        │     └─ RemoteServiceException → grant.markPending("Cashback credit pending: ...")   ← failure kept as pending
  │        └─ false (points): grant.markGranted(now)
  │   7. rewards.saveReward(grant); campaigns.saveCampaign(campaign)   [same local transaction, noRollbackFor=RemoteServiceException]
  ▼
Account AccountApplicationService.creditCashback(accountId, rewardId, campaignId, amount)
  │ rewardCredits.existsByRewardId(rewardId) → true: return getById directly          ← posting deduplication
  │ account.applyCashback(amount) (currentBalance -= amount; a negative balance = overpayment)
  │ accounts.saveAccount(account) → rewardCredits.saveCredit(RewardCredit(...))  [account first, then idempotency record, same transaction]
```

### Failure path: manual retry

```
RewardEvaluationService.fulfill(rewardId)
  │ rewards.findReward() → none: NotFoundException(REWARD_NOT_FOUND)
  │ grant.isGranted() → true: short-circuit return (no further account call)
  │ not granted:
  │    ├─ points: markGranted(now)
  │    └─ cash: accountClient.creditCashback(...) (account-side idempotency key as safety net)
  │         ├─ success → markGranted(now)
  │         └─ RemoteServiceException → markPending(reason) + saveReward + throw ex (keeps PENDING, HTTP 503)
```

## 4. Requirement classification

This is **new feature development (a new cross-service business capability)**: add "marketing reward issuance" to the existing CardDemo. The core challenges are **cross-service idempotency** (evaluation idempotency + posting idempotency) and **no lost postings on downstream failure** (PENDING status + manual retry). It corresponds to requirement items MK-REW-01..08 (evaluation/issuance/idempotency) and NR-REWARD-01 (idempotent account posting).

## 5. Example usage context

- **When it is triggered**: after a transaction is posted successfully, transaction-service synchronously calls `POST /api/v1/reward-evaluations` (`PostingService.evaluateRewards()`; a marketing failure only logs log.warn and does not roll back, per ADR-009); operations retry PENDING rewards manually through `POST /api/v1/rewards/{rewardId}/fulfill`.
- **Why it matters**: cashback is "an add-on benefit after the spending fact", so the failure domains of marketing and accounting must be separated; the idempotency key design serves both synchronous retries and future event replay (ADR-009 rationale 3).
- **Concurrency scenario**: batch posting usually runs one transaction at a time, but the `uk_reward_campaign_txn` unique constraint is the safety net for concurrent repeated evaluations; the `@Version` optimistic lock protects budget consumption.

## 6. Root cause analysis (how)

- **Why idempotency in two places**: the evaluation-side unique key `(campaign_id, transaction_id)` only guarantees "one evaluation per campaign per transaction" and cannot cover repeated calls on the account-service side (network replay, cross-service retries); the account side must guarantee "each reward is posted only once" again with the business idempotency key `reward_id`. The comments state this division of responsibility explicitly: `RewardEvaluationService.java:34-35`.
- **Why keep PENDING on failure instead of rolling back**: when the account service is unavailable, the campaign budget already consumed and the reward record should not be rolled back and discarded; `@Transactional(noRollbackFor = RemoteServiceException.class)` (`:37`) lets the transaction commit and keeps PENDING for manual retry.
- **Why the double safeguard of check-before-write**: `existsByCampaignAndTransaction` / `existsByRewardId` are the fast path in the application layer, and the database unique constraint/primary key is the concurrency safety net: the check prevents duplicates, the constraint prevents races.
- **Environment constraints**: JDK 21 / Spring Boot 3.3 / PostgreSQL (H2 for unit tests), no MQ (ADR-009 option A: local transaction + synchronous call + idempotency key + manual retry); identifiers are zero-padded strings (transaction ID 16 digits, card number 16 digits, account 11 digits); amounts `BigDecimal(12,2)`; times `LocalDateTime`; each service has its own database and cross-database JOINs are forbidden (`07-java-conventions.md`).

## 7. Current and expected behavior

- **Before**: the account only had posting/repayment/interest posting use cases and no concept of cashback; the marketing domain had no reward records; there were no idempotent cross-service writes.
- **After**:
  1. Repeated evaluation of the same transaction for the same campaign → skipped with `ALREADY_EVALUATED`, no duplicate reward (`RewardEvaluationServiceTest.isIdempotentPerCampaignAndTransaction`, `verify(rewards, never()).saveReward()`).
  2. Repeated posting with the same `rewardId` → the account balance changes only once (`AccountControllerTest.cashbackCreditIsIdempotentPerRewardId`, the balance is unchanged the second time).
  3. Account service unavailable → reward is PENDING + failureReason; a successful `fulfill` retry moves it to GRANTED (`keepsPendingWhenAccountUnavailable`, `fulfilsPendingCashback`).
- **Distinctive aspects that are easily overlooked**:
  1. The posting order "account first, then idempotency record" (`AccountApplicationService.java:82-85`): recording the credit first and then failing the posting would leave a false "already posted" record; with the current order, a failure rolls back the whole transaction and neither remains.
  2. When `fulfill` fails it explicitly calls `rewards.saveReward(grant)` and then `throw ex`: it uses `noRollbackFor` to persist the PENDING status before the caller sees the 503.
  3. Points rewards skip the account call and go straight to GRANTED; both `evaluate()` and `fulfill()` branch on `isCashback()`.
  4. Amount assertions always use `isEqualByComparingTo`, avoiding the BigDecimal equality trap.

## 8. Requirement implementation logic (how/why)

- **`RewardEvaluationService` (new, application layer)**: orchestrates "validate → idempotency check → eligibility → deduct budget → create record → post → persist". Every failure point inside the loop becomes `skipped`/`PENDING` instead of throwing upward, so a failure in one campaign does not interrupt the whole batch (`:70-115`).
- **`RewardGrant` (new, domain layer)**: state machine `PENDING → GRANTED / FAILED` (`RewardStatus.java`); `markGranted/markPending/markFailed` wrap the transitions and maintain `failureReason`/`grantedAt`; the constructor validates reward > 0; `@Version` optimistic lock; table unique constraint `uk_reward_campaign_txn` (`V1__marketing_schema.sql:505`).
- **`AccountClient` (new, infrastructure layer)**: `findAccount()` uses `RestClient.exchange()` to distinguish 404 (returns empty) from other non-2xx (throws `RemoteServiceException`); `creditCashback()` POSTs the posting. The RestClient is wired by `RestClientConfig` (3s read timeout).
- **`AccountApplicationService.creditCashback()` (new use case in the account domain)**: short-circuit on `existsByRewardId` → `applyCashback` → save the account first, then `RewardCredit` (same `@Transactional`).
- **`RewardCredit` + `reward_credit` table (new)**: the `reward_id` primary key is the idempotency key, with an `account_id` index to support queries by account.
- **Tests (03-tests.patch)**: on the account side, `@SpringBootTest` + MockMvc end to end verifies idempotency (with real database constraints in effect); on the marketing side, `@ExtendWith(MockitoExtension.class)` unit tests stub the repositories/client, use a fixed `Clock` to verify GRANTED/PENDING/idempotent skips/fulfill, and use `ArgumentCaptor` to check what was saved.

## 9. Concrete implementation steps

1. **Define the reward record entity and unique constraint** (the idempotency carrier): `RewardGrant` (`rewardId` UUID primary key, `(campaign_id, transaction_id)` unique constraint, `@Version`), with state methods wrapping the transitions; the `RewardStatus` enum PENDING/GRANTED/FAILED. Purpose: make repeated evaluation impossible at the database level.
2. **Define the repository port and implementation**: `RewardGrantRepository` (`existsByCampaignAndTransaction`, `countByCampaignAndCard`, `findReward`, `saveReward`, etc.), with `RewardGrantJpaRepository` bridging to Spring Data derived queries through default methods. Purpose: dependency inversion for the domain, no Spring annotations.
3. **Write the evaluation orchestration (application service)**: `RewardEvaluationService.evaluate()`: parameter validation → read the account snapshot → per campaign (idempotency check → eligibility decision → deduct budget → create grant → post by type or go straight to GRANTED → persist); class-level `@Transactional(noRollbackFor = RemoteServiceException.class)`. Purpose: a failure in one campaign does not interrupt the batch, and a downstream failure keeps PENDING.
4. **Write the outbound adapter**: `AccountClient.creditCashback(accountId, rewardId, campaignId, amount)` POSTs `/api/v1/accounts/{id}/cashback-credits` and wraps `RestClientException` as `RemoteServiceException`; `findAccount()` distinguishes 404. Purpose: isolate HTTP details and unify exception semantics.
5. **Idempotent posting in the downstream account service**: `AccountApplicationService.creditCashback()` first short-circuits on `existsByRewardId` (the idempotency key), then `applyCashback` reduces the amount owed, saving the account first and then the `RewardCredit` idempotency record; `RewardCredit` uses `reward_id` as its primary key. Purpose: each reward is posted only once, and repeated calls are harmless.
6. **Provide the manual retry entry**: `RewardEvaluationService.fulfill(rewardId)`: a missing record throws 404; `isGranted()` short-circuits; cash rewards call the account service again (the posting-side idempotency key is the safety net), and on failure `markPending` + save + throw 503. REST `POST /api/v1/rewards/{rewardId}/fulfill`. Purpose: the closed-loop entry for handling PENDING.
7. **Database migrations**: marketing `V1__marketing_schema.sql` creates `reward_grant` (unique constraint + query indexes); account `V3__reward_credit.sql` creates `reward_credit` (`reward_id` PK + `account_id` index). Purpose: idempotency constraints live at the database level and evolve with Flyway versioning.
8. **Tests cover idempotency and failure paths**: on the account side, MockMvc end-to-end repeated calls assert the balance is unchanged; on the marketing side, Mockito asserts `never().saveReward()` (repeated evaluation), PENDING + failureReason (downstream failure), and a successful fulfill moving to GRANTED.

## 10. Requirement implementation checklist

- [ ] The idempotency key is in place at **both ends**: evaluation side `(campaign_id, transaction_id)` unique constraint + `exists` check; posting side `reward_id` primary key + `exists` check.
- [ ] Downstream failures are **not lost**: transaction `noRollbackFor = RemoteServiceException`; failed records are PENDING + failureReason; the retry entry `fulfill` exists and short-circuits on `isGranted()`.
- [ ] The order is correct: check before write, account before idempotency record (so no false "already posted" record remains).
- [ ] Amounts are `BigDecimal` throughout, compared with `compareTo/signum`, and tests assert with `isEqualByComparingTo`.
- [ ] Exception semantics are unified: bad parameters `InvalidRequestException` (400), missing record `NotFoundException` (404), downstream unavailable `RemoteServiceException` (503); error body `{"code","message","details"}`.
- [ ] The time source is an injected `Clock` so tests are controllable; sensitive fields such as card numbers are never logged.
- [ ] Migration scripts are replayable (Flyway), table and column names correspond to the data dictionary, and `@Column` maps one-to-one to SQL.

## 11. Summary

This is a new feature for idempotent cross-service posting: marketing-service adds `RewardEvaluationService` to orchestrate "evaluate → issue reward → post", guaranteeing evaluation-side idempotency with the `(campaign_id, transaction_id)` unique constraint of `RewardGrant` + an `exists` check; account-service adds `AccountApplicationService.creditCashback()`, guaranteeing posting-side deduplication with the `RewardCredit.reward_id` primary key + an `exists` check; downstream failures keep PENDING status through `@Transactional(noRollbackFor = RemoteServiceException.class)`, and `RewardEvaluationService.fulfill()` provides the closed manual retry loop. The implementation follows DDD layering (interfaces → application → domain ← infrastructure), dependency inversion through repository ports, unified domain exceptions, Flyway migrations and the `BigDecimal/LocalDateTime` conventions; it is a complete implementation of the "local transaction + synchronous call + idempotency key + manual retry" cross-service consistency approach (ADR-009 option A).

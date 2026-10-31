# Spending Cashback and Reward Issuance Code Analysis Report

> Case analyzed: dining spending cashback (CATEGORY_CASHBACK).

## Repository knowledge layers

This requirement belongs to the **marketing supporting domain (Marketing, a new boundary)** of the CardDemo microservice architecture and its cross-cutting integration with three existing domains:

- **Marketing bounded context (new supporting domain, `marketing-service` :8087, database `carddemo_marketing`)**:
  - `Campaign` aggregate root (campaign rules + state machine + budget)
  - `Enrollment` entity (enrollment, `(campaign_id, card_number)` unique)
  - `RewardGrant` entity (reward record, `(campaign_id, transaction_id)` unique)
  - Domain services `EligibilityPolicy` (eligibility decision) and `RewardCalculator` (pricing)
  - Application service `RewardEvaluationService` (evaluation + issuance orchestration), `RewardController` (`POST /api/v1/reward-evaluations`, `POST /api/v1/rewards/{id}/fulfill`)
  - Outbound adapter `AccountClient` (reads account snapshots, writes cashback postings)
- **Transaction bounded context (`transaction-service` :8085)**:
  - `PostingService.post()` (end-of-day posting use case CBTRN02C, with a new marketing trigger point)
  - `MarketingClient` (new outbound adapter, `POST /api/v1/reward-evaluations`)
- **Account bounded context (`account-service` :8084)**:
  - `AccountApplicationService.creditCashback()` (new idempotent cashback posting use case)
  - `RewardCredit` entity + `reward_credit` table (idempotency key `reward_id`)

Layer placement:

> Marketing capability (Marketing) → campaign domain (Campaign/Enrollment/RewardGrant) → evaluation use case (RewardEvaluationService) → eligibility policy (EligibilityPolicy) → calculator (RewardCalculator) → cashback posting (account-service creditCashback); transaction domain → posting use case (PostingService.post) → marketing trigger (MarketingClient.evaluateRewards).

## Dependency analysis of affected locations

### Marketing domain (marketing-service)

| Dependency | Kind | Why and where |
|---|---|---|
| `Campaign` | Depended-on aggregate root | `RewardEvaluationService.evaluate()` (`RewardEvaluationService.java:70-114`) loops over `campaigns.findActiveAt(now)`; `campaign.consumeCashback()` deducts the budget (:91); `EligibilityPolicy.evaluateTransaction()` reads the rule fields |
| `EligibilityPolicy` | Static domain service | `RewardEvaluationService.evaluate()` :80-82 calls `evaluateTransaction()`; the `Evaluation` record carries `eligible/reason/reward` |
| `RewardCalculator` | Static domain service | `EligibilityPolicy.evaluateTransaction()` (inside `EligibilityPolicy.java`) calls `compute()` to calculate the reward |
| `RewardComputation` | Value object record | Produced by `EligibilityPolicy`, consumed by the `RewardGrant` constructor (`RewardGrant.java:75-93`); distinguishes `CASHBACK`/`POINTS` |
| `CampaignRepository` | Port interface | Injected into `RewardEvaluationService` (:40); `findActiveAt()` only returns ACTIVE campaigns within their period |
| `EnrollmentRepository` | Port interface | :76-78 `findEnrollment(campaignId, cardNumber)` decides enrollment |
| `RewardGrantRepository` | Port interface | :65 `existsByCampaignAndTransaction()` (idempotency), :79 `countByCampaignAndCard()` (per-card count), :112/:139 `saveReward()`, :120 `findReward()` (fulfill) |
| `AccountClient` | Outbound adapter | :63 `findAccount()` (snapshot), :97/:124 `creditCashback()` (cashback posting, idempotency key rewardId) |
| `Clock` | Spring injection | :44/:69/:127 `LocalDateTime.now(clock)`, a testable time source |
| `RewardController` → `EvaluationRequest` | Inbound adapter | :45 `evaluate()` turns the request into an `EvaluationCommand`; `RewardController.java:44-47` |
| `RewardGrant` | Depended-on entity | State transitions `markGranted/markPending` (:105-109); `isCashback()` (:115-117) decides whether to call the account service |
| `RewardView` | Application-layer record | Wraps grant + campaignName for the interface layer (:114/:141) |

### Transaction domain (transaction-service)

| Dependency | Kind | Why and where |
|---|---|---|
| `MarketingClient` | Outbound adapter (new) | Called by `PostingService.evaluateRewards()` (`PostingService.java:301-314`), which builds a `RewardEvaluationCommand` and calls `restClient.post()` to `/api/v1/reward-evaluations` (`MarketingClient.java:28`) |
| `PostingPolicy` | Domain service | `PostingService.post()` :260-261 checks card/account/credit limit/expiry before the marketing trigger |
| `TransactionRepository` / `DailyTransactionRepository` / `TranCategoryBalanceRepository` | Port interfaces | :242 `existsByTransactionId()` posting idempotency; :266/:289 write daily transactions; :274-279 category totals |
| `AccountClient` (transaction domain) | Outbound adapter | :281 `applyPosting()` books synchronously |
| `TransactionIdGenerator` | Application component | :248 generates a 16-digit zero-padded transaction ID when there is none |
| `@Value("${marketing.enabled:true}")` | Configuration switch | :221/:302 turning it off stops all marketing calls (ADR-009 rollback path) |

### Account domain (account-service)

| Dependency | Kind | Why and where |
|---|---|---|
| `RewardCreditRepository` | Port interface | `AccountApplicationService.creditCashback()` :72 `existsByRewardId()` idempotency check; :84 `saveCredit()` |
| `Account` | Aggregate root | :81-83 `getById()` + `applyCashback(amount)` (`Account.java:212-218`, the balance may be negative) |
| `AccountController` | Inbound adapter | `AccountController.java:74-79` exposes `POST /api/v1/accounts/{id}/cashback-credits` with a `CashbackCreditRequest` parameter |
| `reward_credit` table | Database | `V3__reward_credit.sql` (`:403-417`), `reward_id` primary key + `account_id` index |

### Key cross-dependencies

- transaction → marketing: `MarketingClient.evaluateRewards()` (synchronous REST, `/api/v1/reward-evaluations`, 2s timeout, failures only raise an alert).
- marketing → account: `AccountClient.findAccount()` (reads the snapshot) + `creditCashback()` (writes the cashback, idempotency key rewardId).
- web-ui → marketing: `ApiProxyController` routes `/api/v1/reward-evaluations`, `/api/v1/rewards` and others to `marketing:8087` (see the grep results).

## Call trace

### Main path: purchase posting → cashback (sequence)

```
Transaction end-of-day posting (CBTRN02C)
  PostingService.post(List<PostingCommand>)
    │ 1. Transaction ID idempotency check: transactions.existsByTransactionId() → if it exists, count as duplicate and skip
    │ 2. Without a transaction ID, TransactionIdGenerator generates a 16-digit zero-padded one
    │ 3. cardClient.findCard() → accountClient.findAccount() resolve the card/account snapshots
    │ 4. PostingPolicy.evaluate() → on decline record REJECTED (does not interrupt the batch)
    │ 5. balance.apply(amount) category totals + accountClient.applyPosting() booking + save transaction/daily transaction
    ▼
  evaluateRewards(record, card, command)   [after the local transaction has committed]
    │  marketing.enabled switch check → MarketingClient.evaluateRewards(Command)
    │  RestClientException → log.warn("Reward evaluation failed ..."), no rollback (ADR-009)
    ▼
Marketing RewardEvaluationService.evaluate(EvaluationCommand)
    │ validate() parameter checks (transaction ID / card number 16 digits / account 11 digits / amount > 0)
    │ accountClient.findAccount() → if null, skip with ACCOUNT_NOT_FOUND
    │ now = clock; for (campaign : campaigns.findActiveAt(now))
    │   1. rewards.existsByCampaignAndTransaction() → if true, record ALREADY_EVALUATED and skip (idempotency)
    │   2. enrollments.findEnrollment() → enrolled
    │   3. rewards.countByCampaignAndCard() → rewardsOnCard
    │   4. EligibilityPolicy.evaluateTransaction(campaign, account, amount, category, enrolled, rewardsOnCard, now)
    │        └─ evaluateParticipation() first: NOT_ACTIVE / ACCOUNT_NOT_FOUND / ACCOUNT_INACTIVE / GROUP_MISMATCH / NOT_ENROLLED
    │        └─ CATEGORY_MISMATCH / AMOUNT_TOO_LOW / CARD_LIMIT_REACHED / ALREADY_REWARDED
    │        └─ RewardCalculator.compute() → REWARD_ZERO / BUDGET_EXHAUSTED as the last guard
    │   5. Not eligible → skipped.add(reason), continue (other campaigns are not interrupted)
    │   6. Eligible → campaign.consumeCashback(amount) (BusinessRuleException → skip with BUDGET_EXHAUSTED)
    │   7. new RewardGrant(UUID, ...) (initially PENDING)
    │   8. isCashback() ? accountClient.creditCashback(accountId, rewardId, campaignId, amount)
    │        ├─ success → grant.markGranted(now)
    │        └─ RemoteServiceException → grant.markPending(...) (stays PENDING, retryable)
    │   9. rewards.saveReward(grant); campaigns.saveCampaign(campaign)   [same local transaction]
    ▼
Account AccountApplicationService.creditCashback(accountId, rewardId, campaignId, amount)
    │ rewardCredits.existsByRewardId() → if true, return the current account directly (idempotent, no repeated deduction)
    │ account.applyCashback(amount) → currentBalance -= amount (a negative balance = overpayment)
    │ accounts.saveAccount(account); rewardCredits.saveCredit(RewardCredit(rewardId, ...))
    ▼
(failure path) RewardEvaluationService.fulfill(rewardId)  [manual retry]
    findReward → NotFoundException(REWARD_NOT_FOUND)
    !isGranted() && isCashback() → creditCashback again (idempotency key as the safety net) → markGranted
    RemoteServiceException → markPending + saveReward + rethrow (HTTP 503)
```

### Key design points

- **Posting transaction commits first, marketing is triggered afterwards**: `PostingService.post()` completes the transaction + category totals + account balance in the local transaction; `evaluateRewards()` is still inside the method body, but a failed marketing call only does `log.warn` and throws nothing (`@Transactional` rolls back on `RuntimeException` by default, but here the RuntimeException is caught and swallowed, so the transaction commits normally). This is ADR-009's "marketing does not block accounting".
- **Transaction annotation of RewardEvaluationService**: `@Transactional(noRollbackFor = RemoteServiceException.class)` (`RewardEvaluationService.java:37`), so a failed account cashback call does not roll back the saved PENDING grant.
- **On fulfill failure, an explicit `rewards.saveReward(grant)` followed by `throw ex`**: `noRollbackFor` keeps the PENDING status for another retry.

## Requirement classification

This is a **new business capability (new feature development)**: it adds a "dining spending cashback" campaign scenario to the existing CardDemo (which has no marketing capability). It is scenario S2 of `docs/design/08-marketing-capability.md`: `CATEGORY_CASHBACK`, dining category 0001, per transaction ≥ 50, 5% back, per-transaction cap 30, at most 5 times per card, enrollment required. It also involves **cross-service consistency design** (ADR-009's synchronous call + idempotency key option) and **invasive extensions** of the transaction and account domains (a trigger point in the posting path, a new cashback posting use case in account).

## Usage context

- **When it is triggered**: after each successful transaction in end-of-day batch posting (`PostingService.post`); a person can also retry a single PENDING reward with `POST /api/v1/rewards/{rewardId}/fulfill`.
- **Callers**: transaction-service (the only evaluation caller) and the web-ui proxy (the campaign center shows eligibility, the reward list and the retry button).
- **Why it matters**: cashback is "an add-on benefit after the purchase fact" (ADR-009); evaluation results affect campaign budget consumption (`consumedAmount`), the account balance (reducing the amount owed) and the issuance success metric. Eligibility reason codes (`skipped.reason`) are shown directly to campaign center users.
- **Concurrency**: batch posting usually processes transactions one by one, but a database unique constraint is still needed as a safety net (`uk_reward_campaign_txn`); budget consumption relies on the `@Version` optimistic lock (under extreme concurrency 1 extra grant may be issued, see `08-marketing-capability.md` §8 risks).

## Root cause analysis (how)

- **Why add marketing-service**: the existing repository has no marketing capability at all (`08-marketing-capability.md` §1), and all four scenarios (S1-S4) are built from scratch, so `Campaign/Enrollment/RewardGrant` are all new files rather than modifications.
- **Why change transaction-service**: cashback must be triggered "after the purchase is posted"; the posting use case `PostingService.post()` is the single unified entry point (end-of-day CBTRN02C), so a trigger point there covers every transaction and can reuse the already resolved `CardSnapshot/AccountSnapshot` (`card.customerId()` and so on) to build the evaluation command.
- **Why change account-service**: the balance is an invariant of the Account aggregate, and the marketing domain "does not store account balances" (§3), so Account must perform the posting; the new `reward_credit` idempotency table is the only workable place to guarantee "each reward is posted only once" (the evaluation-side `reward_grant` unique key cannot cover repeated calls on the account-service side).
- **Environment constraints**: JDK 21 / Spring Boot 3.3.6 / PostgreSQL 16 (H2 for unit tests), no MQ (ADR-009 option A), legacy identifiers as zero-padded strings, amounts `BigDecimal(12,2)`, times `LocalDateTime`, Flyway migrations, a separate database per service (`07-java-conventions.md`).
- **Why the eligibility decision is a pure static service**: `EligibilityPolicy` has no Spring dependency and no I/O, so it can be called directly by the application service and by plain JUnit unit tests; the same goes for `RewardCalculator`. This follows the dependency inversion convention "domain does not depend on frameworks" (`07-java-conventions.md` §2).

## Current and expected behavior

- **Before**: processing ends once the transaction is posted (`PostingService` only books and updates category totals); the account only has balance changes (no concept of cashback); there is no campaign/enrollment/reward data model at all.
- **After**: posting succeeds → campaigns are evaluated synchronously → on a match the reward is issued (cashback is posted directly / points go straight to GRANTED); resubmitting the same transaction → skipped idempotently (`ALREADY_EVALUATED`, no repeated reward or posting); account cashback fails → the reward stays PENDING and `fulfill` can retry it; marketing entirely unavailable → posting continues as usual and the log raises an alert.
- **Distinctive aspects that are easy to miss**:
  1. `Campaign.consumeCashback()` uses `LocalDateTime.now()` (`Campaign.java:209`) instead of the passed-in `now`, unlike `applyDraft/activate`, which use the `now` parameter. Whether this is deliberate or a flaw needs attention (meaning of `updatedAt`).
  2. `RewardEvaluationService` calls the external account service inside the transaction (a long transaction holding locks) and relies on `noRollbackFor` on failure; this is an explicit trade-off of option A.
  3. The marketing call in `PostingService` happens **inside the same local transaction before it commits** (`evaluateRewards` is called inside the `post()` method body), but marketing exceptions are caught and not rethrown, so no rollback is triggered; the real "transaction commits first" behavior comes from "the exception is swallowed", not from "a callback after the transaction commits".

## Implementation logic (how/why)

### New files (marketing-service, an entirely new domain)

| File | Responsibility |
|---|---|
| `domain/model/Campaign.java` | Aggregate root: state machine (DRAFT→ACTIVE⇄PAUSED→ENDED), rule validation in `applyDraft`, checks `isActiveAt/matchesGroup/matchesCategory`, budget invariants `hasBudgetFor/consumeCashback/remainingBudget` |
| `domain/model/Enrollment.java` | Enrollment entity, `(campaign_id, card_number)` unique constraint |
| `domain/model/RewardGrant.java` | Reward entity, `(campaign_id, transaction_id)` unique constraint, `PENDING→GRANTED/FAILED` status and `failureReason` |
| `domain/model/CampaignDraft.java` | Rule draft record (input for create/edit) |
| `domain/model/RewardComputation.java` | Pricing result record (CASHBACK amount / POINTS points) |
| `domain/service/EligibilityPolicy.java` | Eligibility order = reason code priority; `evaluateParticipation` (for the campaign center) and `evaluateTransaction` (full check after a transaction) |
| `domain/service/RewardCalculator.java` | Pricing: fixed amount first, rate HALF_UP to 2 decimals, per-transaction cap, points rounded down |
| `application/RewardEvaluationService.java` | Evaluation + issuance orchestration, idempotency, PENDING/retry |
| `interfaces/rest/RewardController.java` | `reward-evaluations` / `rewards` / `fulfill` APIs |
| `infrastructure/client/AccountClient.java` | Reads the account snapshot + writes the cashback posting (idempotency key rewardId) |
| `infrastructure/persistence/RewardGrantJpaRepository.java` | Spring Data adapter implementing the domain port (exists/count/paginated findRewards) |
| `db/migration/V1__marketing_schema.sql` | The three tables campaign/enrollment/reward_grant + unique constraints + indexes |

### Modified files (changes in existing domains)

| File | Change and why |
|---|---|
| `transaction-service/.../PostingService.java` | In `post()`, call `evaluateRewards()` after each successful transaction; `marketingEnabled` switch; failures raise an alert without rollback (ADR-009) |
| `transaction-service/.../infrastructure/client/MarketingClient.java` | New outbound adapter, `RestClient` POST to `/api/v1/reward-evaluations`, failures become `RemoteServiceException` |
| `account-service/.../AccountApplicationService.java` | New `creditCashback(accountId, rewardId, campaignId, amount)`: `existsByRewardId` idempotency + `applyCashback` + two writes |
| `account-service/.../domain/model/Account.java` | New `applyCashback()` (reduces the amount owed; the balance may be negative) |
| `account-service/.../domain/model/RewardCredit.java` | New idempotency record entity |
| `account-service/.../interfaces/rest/AccountController.java` | New `POST /api/v1/accounts/{id}/cashback-credits` endpoint |
| `account-service/.../db/migration/V3__reward_credit.sql` | New `reward_credit` table (reward_id PK + account_id index) |

### Why this layering

- Eligibility and pricing live in **domain/service** (pure logic with no Spring dependency); the application service only orchestrates and owns the transaction, and tests can target the domain services directly (`EligibilityPolicyTest`/`RewardCalculatorTest` are plain JUnit).
- Cross-service calls are wrapped in **infrastructure/client** (`AccountClient`/`MarketingClient`); the application layer depends on ports rather than HTTP details, and unit tests replace them with `@Mock`.
- Idempotency has a double safeguard of **database unique constraint + check-then-write**: `uk_reward_campaign_txn` on the evaluation side, `reward_credit.reward_id` PK on the posting side.

## Implementation steps

1. **Build the campaign rule model (Campaign aggregate root)**: define `campaign_type` (FIRST_PURCHASE_CASHBACK / CATEGORY_CASHBACK / POINTS_MULTIPLIER), the state machine, pricing fields and budget fields; construction and `applyDraft` go through the same `validate(draft)` (per-type checks: fixed amount > 0 / rate ≤ 100% and budget > 0 / multiplier > 0); `activate` checks that the campaign has not expired and that cash cashback has a budget > 0. See `Campaign.java:103-277`.
2. **Define pricing and eligibility (domain services)**: `RewardCalculator.compute()` distinguishes points (multiplier, rounded down) from cash (fixed amount first → rate × amount HALF_UP to 2 decimals → `min` with the per-transaction cap); `EligibilityPolicy` checks in MK-ELI order and returns reason codes (`Evaluation(eligible, reason, reward)`). See `RewardCalculator.java:495-516`, `EligibilityPolicy.java:403-470`.
3. **Create the reward record (RewardGrant)**: the constructor checks reward > 0; initially `PENDING`; `markGranted/markPending/markFailed`; table unique key `(campaign_id, transaction_id)`. See `RewardGrant.java:75-109`, `V1__marketing_schema.sql:463-479`.
4. **Write the evaluation application service (RewardEvaluationService)**: constructor injection of 4 repositories + AccountClient + Clock; `evaluate()` loops over campaigns (idempotency check → enrollment/count lookup → eligibility decision → deduct budget → create grant → cashback posting / direct GRANTED → save both); `fulfill()` retries PENDING. See `RewardEvaluationService.java:58-142`.
5. **Expose the evaluation/retry APIs**: `POST /api/v1/reward-evaluations` (validates the DTO and turns it into a command), `GET /api/v1/rewards`, `POST /api/v1/rewards/{id}/fulfill`. See `RewardController.java:34-65`.
6. **Transaction posting trigger point**: `PostingService.post()` calls `evaluateRewards()` after each POSTED transaction; `MarketingClient` wraps the call; `marketing.enabled` switch + catch RuntimeException with an alert. See `PostingService.java:290-314`, `MarketingClient.java:28-56`.
7. **Idempotent account cashback posting**: `Account.applyCashback()` reduces the balance; `AccountApplicationService.creditCashback()` checks `existsByRewardId` before the two writes; `RewardCredit` entity + `V3` migration + `cashback-credits` endpoint. See `Account.java:212-218`, `AccountApplicationService.java:71-87`, `AccountController.java:73-79`, `V3__reward_credit.sql:1-9`.
8. **Unit test coverage**: `RewardEvaluationServiceTest` (normal issuance, account unavailable → PENDING, idempotent skip, not enrolled → skip, fulfill retry); `EligibilityPolicyTest` (each reason code branch); `RewardCalculatorTest` (fixed amount/rate/cap/points rounding).

## Implementation checklist

- [ ] Does the eligibility order match MK-ELI-01..09 in the documents, returning at the first failing check?
- [ ] Does cash cashback check both a sufficient budget (`hasBudgetFor`) and the type (`isCashback`)?
- [ ] Pricing precision: rate `HALF_UP` to 2 decimals; points rounded `DOWN`; are all amounts `BigDecimal` with database `numeric(12,2)`?
- [ ] Is idempotency double-safeguarded: on the evaluation side `(campaign_id, transaction_id)` unique + a prior `existsByCampaignAndTransaction` check; on the posting side `reward_credit.reward_id` unique + a prior `existsByRewardId` check?
- [ ] When the account cashback fails, does the grant stay `PENDING` and has it been saved with `saveReward` (for fulfill to retry)? Is `fulfill` idempotent (short-circuits on `isGranted()`)?
- [ ] Does a posting failure leave the rest of the batch unaffected (a single REJECTED, then continue with later commands)? Does a marketing failure leave the posting result unaffected (catch + warn)?
- [ ] Is the transaction ID a 16-digit zero-padded string, and do the 16-digit card number and 11-digit account checks match the legacy conventions?
- [ ] Optimistic locking: do `Campaign/RewardGrant/Enrollment/Account` carry `@Version` (a `version` column)?
- [ ] Do the tests cover reason codes (asserting `reason` rather than implementation details) and idempotency (`verify(rewards, never()).saveReward`)?
- [ ] Does the code follow `07-java-conventions.md`: package structure, domain exception `BusinessRuleException("CODE", msg)`, `@Transactional` boundaries, a separate database per service?

## Summary

This requirement adds a **marketing supporting domain (Marketing)** to the existing CardDemo and implements the "dining spending cashback" scenario: the `Campaign` aggregate root holds the campaign rules, the state machine (DRAFT→ACTIVE⇄PAUSED→ENDED) and the budget invariants; `EligibilityPolicy` decides eligibility in MK-ELI order (the reason code is the priority); `RewardCalculator` handles rate/fixed/points pricing (HALF_UP to 2 decimals, per-transaction cap, points rounded down); `RewardGrant` guarantees evaluation idempotency with the `(campaign_id, transaction_id)` unique key and carries the `PENDING→GRANTED/FAILED` status; `RewardEvaluationService` orchestrates evaluation, budget deduction, account posting and failure retry (`fulfill`); transaction-service triggers evaluation synchronously after a successful posting in `PostingService.post()` (ADR-009: failures only raise an alert without rollback, and `marketing.enabled` allows rollback); account-service adds the `reward_credit` idempotency table and the `creditCashback` use case, so the same `rewardId` is posted only once. Before the change the system had no marketing capability; afterwards it forms a synchronous "posting → evaluation → reward → posting" call chain that replaces distributed transactions with "local transaction + idempotency key + manual retry" (ADR-005/009), and keeps the architecture consistent through `@Version` optimistic locking, pure domain service layering and plain JUnit unit tests.

# Campaign Eligibility and Validity Control Code Analysis Report

> Requirement: implement marketing campaign eligibility checks and validity control, covering campaign status, time window, account status, target account group, enrollment and participation limits.
> Code snippets: `01-campaign-policy.patch` (Campaign aggregate root, CampaignDraft, CampaignStatus, AccountSnapshot, EligibilityPolicy), `02-tests.patch` (CampaignTest, EligibilityPolicyTest).

## 1. Repository knowledge layers

The requirement sits in the **Marketing supporting domain** of the `carddemo-java-1025` microservice system, within the DDD layers of `marketing-service` (port 8087):

```
carddemo-java-1025 microservice architecture
└── Marketing supporting domain (marketing-service :8087, database carddemo_marketing)
    ├── domain/model (domain model)              ← main change: Campaign (aggregate root), CampaignDraft, CampaignStatus, AccountSnapshot
    ├── domain/service (domain services)         ← main change: EligibilityPolicy (eligibility decision)
    ├── domain/repository (repository ports)     ← CampaignRepository.findActiveAt is called by the decision chain (existing)
    ├── application (application services)       ← RewardEvaluationService / MarketingQueryService call the decision chain (existing)
    ├── interfaces/rest (inbound adapters)       ← CampaignController, MarketingController expose state transitions and the campaign center (existing)
    └── infrastructure/client (outbound adapters)← AccountClient fetches the account snapshot (existing)
```

Per `docs/design/08-marketing-capability.md`: the legacy CardDemo had no marketing capability at all, so this is a **new supporting domain**. The eligibility decision is the core domain logic of the marketing capability and is reused by two business entry points: the campaign center (shows "can participate") and post-transaction reward evaluation (full eligibility + pricing).

## 2. Dependency analysis of affected locations

### 2.1 Dependencies within the snippets (between the new code)

| Dependency | Type | Reason and location |
|---|---|---|
| `EligibilityPolicy` → `Campaign` | Call | `EligibilityPolicy.java:478-489` (`evaluateParticipation` calls `campaign.isActiveAt()`, `matchesGroup()`, `isEnrollmentRequired()`); `:503-528` (`evaluateTransaction` calls `matchesCategory()`, `getMinTransactionAmount()`, `getMaxRewardsPerCard()`, `getCampaignType()`, `hasBudgetFor()`) |
| `EligibilityPolicy` → `AccountSnapshot` | Call | `:484` (`account.activeStatus()`, `account.groupId()`) |
| `EligibilityPolicy` → `RewardComputation` / `RewardCalculator` | Call | `:521-522` (`RewardCalculator.compute()` calculates the reward, `RewardComputation` carries the result) |
| `Campaign` → `CampaignDraft` | Call | `Campaign.java:130-151` (`applyDraft` reads the draft fields), `:234-292` (`validate` static validation) |
| `Campaign` → `CampaignStatus` / `CampaignType` | Enum use | State machine and type branches (`:131`, `:154`, `:263-290`) |
| `Campaign` → `BusinessRuleException` | Dependency | Business assertions always throw the domain exception (`:132`, `:155-163`, etc.) |
| Tests → domain classes | Call | `CampaignTest` / `EligibilityPolicyTest` construct entities and call state transitions and decisions |

### 2.2 Dependencies on existing repository code (not in the snippets, needs repository context)

| Dependency | Type | Reason and location |
|---|---|---|
| `EligibilityPolicy` ← `RewardEvaluationService` (application) | Call | Post-transaction evaluation: `RewardEvaluationService.java:74-76` calls `evaluateTransaction`, `:78-80` takes `evaluation.reason()` to record the skip reason |
| `EligibilityPolicy` ← `MarketingQueryService` (application) | Call | Campaign center: `MarketingQueryService.java:54-56` calls `evaluateParticipation` and shows `eligible`/`reason` |
| `AccountSnapshot` ← `AccountClient` (infrastructure) | Data source | `AccountClient.java:28-46` calls account-service to read the account snapshot, 404 becomes `Optional.empty()`, `:60-63` private record conversion |
| `Campaign.isActiveAt` ← `CampaignRepository.findActiveAt` | Query cooperation | `CampaignJpaRepository.java:39-42` pre-filters with a derived query `status=ACTIVE && startAt<=now && endAt>now` |
| `Campaign` ← `CampaignApplicationService` / `EnrollmentApplicationService` | Call | `CampaignApplicationService.java:81-97` state transitions (activate/pause/end); `EnrollmentApplicationService.java:41-43` enrollment only when ACTIVE |
| `RewardCalculator` (existing, only referenced in the snippets) | Call | `RewardCalculator.java:18-39` pricing for cash cashback (fixed amount first/rate HALF_UP/per-transaction cap) and points (floor) |
| `RewardGrant` (existing) | Data | The `rewardsOnCard` and `BUDGET_EXHAUSTED` semantics in the decision chain go with the `RewardGrant` state machine (`RewardGrant.java:75-109`) |

## 3. Call trace

### 3.1 Campaign center (shows "can participate")

```
GET /api/v1/eligibilities?cardNumber=&accountId=
  └─ MarketingController.offers()
       └─ MarketingQueryService.offers() (@Transactional(readOnly=true))
            ├─ accountClient.findAccount(accountId) → AccountSnapshot (404 → throws ACCOUNT_NOT_FOUND)
            ├─ campaigns.findActiveAt(now) → List<Campaign> (SQL pre-filter on status + time window)
            └─ for each Campaign:
                 enrollments.findEnrollment(campaignId, cardNumber) → enrolled or not
                 EligibilityPolicy.evaluateParticipation(campaign, account, enrolled, now)
                     ├─ campaign.isActiveAt(now): status==ACTIVE && [startAt, endAt)
                     ├─ account.activeStatus()=="Y"
                     ├─ campaign.matchesGroup(account.groupId()): targetGroupId empty or equal
                     └─ enrolled==true when enrollment is required
                 produces Evaluation(eligible, reason) → OfferResponse (with reason code copy)
```

### 3.2 Post-transaction reward evaluation (full eligibility + pricing)

```
POST /api/v1/reward-evaluations (called by transaction-service after posting)
  └─ RewardEvaluationService.evaluate() (@Transactional(noRollbackFor=RemoteServiceException))
       ├─ parameter validation (validate: transaction ID/card number 16 digits/account 11 digits/amount>0)
       ├─ accountClient.findAccount(...) (missing → skipped ACCOUNT_NOT_FOUND)
       ├─ idempotency check rewards.existsByCampaignAndTransaction (hit → skipped ALREADY_EVALUATED)
       └─ for each campaign in campaigns.findActiveAt(now):
            ├─ enrolled = enrollments.findEnrollment(...) enrolled or not
            ├─ rewardsOnCard = rewards.countByCampaignAndCard(...)
            ├─ EligibilityPolicy.evaluateTransaction(campaign, account, amount, category, enrolled, rewardsOnCard, now)
            │    ├─ evaluateParticipation(...) (campaign time window/account status/account group/enrollment)
            │    ├─ campaign.matchesCategory(categoryCode)
            │    ├─ amount >= minTransactionAmount
            │    ├─ rewardsOnCard < maxRewardsPerCard
            │    ├─ FIRST_PURCHASE_CASHBACK requires rewardsOnCard==0 (never rewarded)
            │    ├─ RewardCalculator.compute(campaign, amount) → RewardComputation
            │    ├─ reward > 0 (otherwise REWARD_ZERO)
            │    └─ campaign.hasBudgetFor(reward.amount()) (otherwise BUDGET_EXHAUSTED)
            ├─ not met → skipped(reason), continue with the next campaign
            ├─ met → campaign.consumeCashback(amount) deducts budget → create RewardGrant → call account posting/switch to PENDING
```

### 3.3 Campaign lifecycle (state machine controls validity)

```
POST /api/v1/campaigns/{id}/activate|pause|end
  └─ CampaignController → CampaignApplicationService.activate/pause/end
       └─ campaign.activate(now):
            ├─ precondition state: DRAFT or PAUSED
            ├─ now.isBefore(endAt) (not expired)
            ├─ CATEGORY_CASHBACK requires budget>0
            └─ status = ACTIVE
```

## 4. Requirement classification

This is a **new feature (new supporting domain)** requirement: building the "marketing campaign eligibility check and validity control" domain capability from scratch on a legacy card system with no marketing capability. It is a domain modeling + business rule engine requirement; the core output is the **aggregate root state machine** and the **stateless eligibility policy**, not plain CRUD.

## 5. Example usage context

- **Campaign center page** (`MarketingQueryService.offers`): the cardholder sees "which campaigns can I join, and why not", with `evaluateParticipation` producing reason codes for the frontend copy. This is the user's entry point to marketing and directly shapes the user experience (reason codes must be readable and explainable).
- **Reward evaluation after posting** (`RewardEvaluationService.evaluate`): once a purchase is recorded, every currently ACTIVE campaign is decided one by one and rewards are issued. Here the decision chain is the **filter for the issuance decision**; a hit means no reward.
- **Campaign admin back office** (`CampaignController`): admins create drafts, edit, and publish/pause/end campaigns; `Campaign.activate/pause/end` is the operating side of "validity control": **state machine + time window are the two time dimensions of the eligibility decision**. Status is a manual switch, the time window is a natural boundary, and `isActiveAt` combines them into one decision.

## 6. Root cause analysis (how)

1. **Why add the `Campaign` aggregate root**: the eligibility decision requires one authoritative source for "the campaign's rules and status". Encapsulating the rule fields, state machine and budget invariants in the aggregate root ensures every entry point (admin transitions, budget deduction during transaction evaluation) goes through the same invariant checks, so rules are not scattered across services. `docs/design/08-marketing-capability.md` §2.1 defines the aggregate and invariants explicitly (name ≤80, `startAt < endAt`, pricing fields match the type, legal state transitions, `consumedAmount ≤ budget`).
2. **Why a separate `EligibilityPolicy` domain service**: the eligibility decision is pure logic reused by two different contexts (campaign center query, transaction evaluation). As a static policy class with no Spring dependency it is easy to test with plain JUnit (no container), and its decision order maps one to one to MK-ELI in the requirement document; maintaining it in one place keeps both entry points consistent.
3. **Why the decision order is the priority**: the requirement states "return the reason code at the first unmet condition" (`docs/design/08` §2.3). The order is deliberate: campaign first (controlled by marketing) → then account (customer side) → then transaction (this action), putting the cheapest and most stable checks first.
4. **Why `AccountSnapshot` is a record and not persisted**: account status and account group belong to the Account domain's **read model**. Marketing is a supporting domain and follows ADR-003 data ownership: it does not copy account data, only uses a read-only snapshot transfer object fetched live through `AccountClient`, so the account status is current at decision time.
5. **Environment constraints**: JDK 21, Spring Boot 3.3.6, JPA + H2/PostgreSQL, JUnit 5 + AssertJ. The `@Version` optimistic lock covers budget concurrency (`docs/design/08` §8 risk item: under extreme concurrency one extra reward may be issued). Legacy identifiers are zero-padded fixed-length strings (`07-java-conventions.md` §3), so `AccountSnapshot.accountId` is a String.

## 7. Current and expected behavior

- **Before the requirement**: the repository has no marketing capability and no campaign concept, so naturally no eligibility check either; there is no reward logic after a transaction is posted (`docs/design/08`: a new supporting domain, not a legacy migration item).
- **After the requirement**:
  - Campaigns have an explicit lifecycle: `DRAFT → ACTIVE ⇄ PAUSED → ENDED`; only an ACTIVE campaign within its time window is "in effect" (`Campaign.isActiveAt`, `01-campaign-policy.patch:185-189`).
  - There is a unified eligibility decision chain: campaign validity → account exists/status → account group → category → amount → enrollment → per-card count → first-purchase uniqueness → budget → non-zero reward; a failure returns a reason code.
  - The campaign center and transaction evaluation get consistent semantics through the same policy class (`EligibilityPolicy.java:476-528`).
- **Distinctive aspects that are easy to miss**:
  - **Status and time window are two locks**: `activate` only checks "not expired", while `isActiveAt` checks both status and time window; an expired campaign set to ACTIVE by mistake still issues nothing (double safeguard).
  - **Null semantics**: a null `targetGroupId`/`categoryCode` means "no restriction" (`matchesGroup`/`matchesCategory` pass on null); this is the "wildcard" design for target account group/category restrictions.
  - **`remainingBudget()` returns null for a budget of 0** (`Campaign.java:227-232`): points campaigns have no budget concept, and null means "no budget constraint" rather than "budget 0, cannot issue", avoiding confusion with "budget exhausted".
  - **Check separate from deduction**: `hasBudgetFor` (check) and `consumeCashback` (deduction) come in pairs but are separate, and `consumeCashback` re-checks internally (`Campaign.java:216-225`) in case the state changes between check and deduction (the optimistic lock covers concurrency).

## 8. Implementation logic (how/why)

### 8.1 New files

| File (in the patch) | Responsibility | Key points |
|---|---|---|
| `domain/model/AccountSnapshot.java` | Read-only account snapshot | record with 4 fields (accountId/activeStatus/currentBalance/groupId); its comment states "read-only for marketing, never stored", an explicit statement of the data ownership boundary |
| `domain/model/CampaignStatus.java` | Campaign status enum | `DRAFT/ACTIVE/PAUSED/ENDED`, persisted with `@Enumerated(EnumType.STRING)` (`Campaign.java:61-63`) to avoid enum ordinal drift |
| `domain/model/CampaignDraft.java` | Rule draft (CQ separation) | 15-field record that passes all editable rules at once; shared by create and edit (`applyDraft`) |
| `domain/model/Campaign.java` | Aggregate root | State machine methods (activate/pause/end), decision methods (isActiveAt/matchesGroup/matchesCategory/hasBudgetFor), budget consumption (consumeCashback/remainingBudget), rule validation (validate), JPA mapping (@Version optimistic lock) |
| `domain/service/EligibilityPolicy.java` | Eligibility policy | Reason code constants, `Evaluation` record, two entry points `evaluateParticipation`/`evaluateTransaction` |

### 8.2 Why it is designed this way

- **The aggregate root carries the state machine (rich domain model)**: this follows `07-java-conventions.md` §3 "domain behavior lives on entities". Each state transition method checks its precondition state and constraints (`activate` checks DRAFT/PAUSED + not expired + budget for cash cashback; `pause` only ACTIVE; `end` only ACTIVE/PAUSED), and illegal transitions throw `BusinessRuleException` (409 semantics, translated uniformly by `GlobalExceptionHandler`).
- **Shared validation**: `applyDraft` uses the same `validate(draft)` on both the create (constructor) and edit paths (`Campaign.java:118-151`), checking the consistency of the pricing fields per `campaignType` (`switch` expression, `:263-290`). This avoids the classic hole "valid on create, validation bypassed on edit".
- **Decision separate from execution, result as an object**: `EligibilityPolicy` does not throw to express "not eligible" but returns an `Evaluation(eligible, reason, reward)` record, because "not eligible" is a normal business outcome (users browsing the campaign center, batch transaction evaluation skipping), not an exception; internal states such as "calculated reward is zero/budget insufficient" also use reason codes so the caller has one handling path. Contrast this with the `RewardGrant` constructor throwing `REWARD_ZERO` (invariant check): **domain service decisions use return values, entity invariants use exceptions**.
- **Different granularity of the two decision entry points**: `evaluateParticipation` (for the campaign center) only decides "can participate", without transaction amount/category/count; `evaluateTransaction` (after a transaction) reuses participation first and then adds transaction-level checks: **shared logic sinks down, differences are layered on top**, so the two places cannot drift.
- **Reason codes defined as constants in one place**: 11 reason code constants (`EligibilityPolicy.java:447-457`) share the same symbols with test assertions, the skipped records of `RewardEvaluationService` and frontend copy, avoiding scattered magic strings.

### 8.3 Non-code configuration

The snippets contain no migration scripts (`V1__marketing_schema.sql` and others already exist in the repository; the `campaign` table is created by an existing migration). The rules come from `docs/design/08-marketing-capability.md` (MK-ELI-01..09), and the code comments keep the requirement IDs (such as MK-ELI-09 at `Campaign.java:204` and MK-CAM-01..06 at `Campaign.java:127`): **requirement traceability is maintained through ID comments**, an existing convention of this repository.

## 9. Concrete implementation steps

1. **Define the status enum and the rule draft record**
   - Create `CampaignStatus` (4 states) and `CampaignDraft` (15-field rule draft).
   - Key points: persist the status with `EnumType.STRING`; the draft is an immutable record that carries all editable rules at once, shared by create/edit.
   - Purpose: give "the campaign's rules and status" a type-safe, immutable transfer carrier.

2. **Implement the `Campaign` aggregate root: rule fields + JPA mapping**
   - Fields correspond one to one to `@Column`; amounts are `BigDecimal(precision=12, scale=2)` (never double), times are `LocalDateTime`, with a `@Version` optimistic lock.
   - Provide a protected no-arg constructor (for JPA) and a business constructor (`campaignId, draft, now`, initial `DRAFT` + `consumedAmount=0`).
   - Key point: `now` is passed in by the caller instead of `LocalDateTime.now()` internally, keeping tests controllable and semantics consistent (`updatedAt` consistency).

3. **Implement rule validation `validate(draft)` and editing `applyDraft`**
   - General validation: name not blank ≤80, type required, `startAt < endAt`, minimum amount/budget non-negative, category code `\d{4}`, per-card count >0.
   - Per `campaignType`: first purchase needs `fixedRewardAmount > 0`; category cashback needs "at least one of rate or fixed amount", rate ≤100%, budget >0; points need `pointsMultiplier > 0`.
   - `applyDraft` can only edit in DRAFT; fields are normalized with trim/blankToNull, written, and `updatedAt` is updated uniformly.
   - Purpose: concentrate all constraints of "can the campaign be published" in one place in the aggregate root, enforced for every entry point (create/edit).

4. **Implement the state machine methods (the operating side of validity control)**
   - `activate(now)`: only DRAFT/PAUSED; `now < endAt` not expired; cash cashback types need budget >0.
   - `pause(now)`: only ACTIVE; `end(now)`: only ACTIVE/PAUSED (ENDED is final).
   - Illegal transitions always throw `BusinessRuleException("INVALID_CAMPAIGN_STATE", ...)`.
   - Key point: **the state machine is the "switch", the time window is the "natural boundary", and they are checked independently**.

5. **Implement the decision query methods (the decision side of validity control)**
   - `isActiveAt(moment)`: `status==ACTIVE && !moment.isBefore(startAt) && moment.isBefore(endAt)` (start inclusive, end exclusive).
   - `matchesGroup(groupId)`/`matchesCategory(category)`: an empty target is a wildcard (null semantics).
   - `hasBudgetFor(amount)`: only checked for cash cashback, `consumedAmount + amount <= budget`; `remainingBudget()` returns null for a budget of 0, meaning no constraint.
   - Purpose: encapsulate "is the campaign currently in effect, does it match the target" as unit-testable pure domain methods.

6. **Implement the `EligibilityPolicy` eligibility policy (core)**
   - Define 11 reason code constants + the `Evaluation(eligible, reason, reward)` record (with `eligible(reward)`/`rejected(reason)` factories).
   - `evaluateParticipation(campaign, account, enrolled, now)`: campaign in effect → account exists → account status Y → account group matches → enrolled when enrollment is required.
   - `evaluateTransaction(campaign, account, amount, category, enrolled, rewardsOnCard, now)`: reuse participation → category matches → amount ≥ minimum → per-card count below the limit → no previous reward for first-purchase types → calculate reward (`RewardCalculator.compute`) → reward non-zero → budget sufficient.
   - Key point: **the order is the reason code priority**, returning at the first unmet condition; `rewardsOnCard`/`enrolled` in the decision chain are counted from the repositories by the caller (application service) and passed in, so the policy stays stateless with no IO.

7. **Write domain unit tests covering the state machine and decision branches**
   - `CampaignTest`: construction → DRAFT initial state and budget; `activate → consumeCashback` consumption; exceeding the budget throws `BUDGET_EXHAUSTED`; illegal state transitions (DRAFT cannot pause, ACTIVE cannot activate again, ENDED cannot activate again); ACTIVE cannot be edited (`CAMPAIGN_NOT_EDITABLE`); rule validation for invalid period/missing reward/cash cashback without budget.
   - `EligibilityPolicyTest`: all conditions met yields a reward; assert the reason code for each rejection branch (NOT_ACTIVE/ACCOUNT_INACTIVE/GROUP_MISMATCH/CATEGORY_MISMATCH/AMOUNT_TOO_LOW/NOT_ENROLLED/CARD_LIMIT_REACHED/ALREADY_REWARDED/BUDGET_EXHAUSTED).
   - Assertion style: `assertThatThrownBy(...).extracting("code").isEqualTo("...")` asserts the error code, not the message; amounts are asserted with `isEqualByComparingTo` (BigDecimal equality).
   - Purpose: turn every rule of MK-ELI-01..09 in the requirement document into an executable assertion as the regression baseline.

## 10. Implementation checklist

- [ ] **State machine completeness**: every state transition method checks its precondition state; ENDED is final; illegal transitions throw `INVALID_CAMPAIGN_STATE`. Tests must cover illegal transitions (such as activating an ACTIVE campaign again).
- [ ] **Time window start inclusive, end exclusive**: `isActiveAt` uses `!moment.isBefore(startAt) && moment.isBefore(endAt)`; `activate` uses `now.isBefore(endAt)` to check not expired. Compare `LocalDateTime` with `isBefore/isAfter`; do not convert to strings.
- [ ] **Amount comparison**: always `BigDecimal.compareTo/signum`, never `double`/`==`; check reward rate ≤1 (100%) with `compareTo(ONE) > 0`.
- [ ] **Null is a wildcard**: an empty `targetGroupId`/`categoryCode` means unrestricted, and the decision methods must handle null explicitly (`targetGroupId == null || Objects.equals(...)`).
- [ ] **Consistent type branches**: each `CampaignType`'s pricing field combination is validated (first purchase → fixed amount, category cashback → rate or fixed amount + budget, points → multiplier); the switch must have a `default` branch.
- [ ] **Check separate from deduction**: after `hasBudgetFor` checks, `consumeCashback` re-checks internally; concurrent budget relies on `@Version`, and under extreme concurrency one extra reward may be issued (design document §8 risk, needs reconciliation).
- [ ] **`now` always passed in**: all times in aggregate root methods are passed in by the caller (application layer `LocalDateTime.now(clock)`); `consumeCashback` is the only exception (current state of the repository); do not mix in `LocalDateTime.now()` in new code.
- [ ] **Reason codes as constants**: decision failure reasons use the `EligibilityPolicy` constants, and tests assert the same symbols; the mapping between frontend copy and reason codes must be kept in step.
- [ ] **Identifiers**: account 11 digits, card number 16 digits, zero-padded strings; decision/query parameters are validated accordingly (`\d{11}`/`\d{16}`).
- [ ] **Requirement ID comments**: keep MK-ELI/MK-CAM requirement IDs where rules are implemented, matching `docs/design/08-marketing-capability.md`, for traceability.
- [ ] **Consistent semantics across the two entry points**: when adding a decision dimension, update both `evaluateParticipation` and `evaluateTransaction` (the latter reuses the former) and add tests.

## 11. Summary

This is the **new "Campaign Eligibility and Validity Control" capability of the marketing supporting domain (marketing-service)**. The requirement lands in DDD layers: the `Campaign` aggregate root (`domain/model/Campaign.java`) carries **validity control** through the state machine `DRAFT → ACTIVE ⇄ PAUSED → ENDED` + the time window `[startAt, endAt)` (operating side `activate/pause/end`, decision side `isActiveAt`), and constrains rule consistency with per-type validation (`validate`) and budget invariants (`hasBudgetFor`/`consumeCashback`); the `EligibilityPolicy` domain service (`domain/service/EligibilityPolicy.java`) carries the **eligibility check** with a decision chain whose **order is its priority** (campaign in effect → account status → account group → category → amount → enrollment → count/first purchase → budget → non-zero reward), returning results as an `Evaluation(eligible, reason, reward)` record instead of throwing; `AccountSnapshot`, a read-only snapshot transfer object of the Account domain, keeps the data ownership boundary. The decision logic is reused by two entry points, the campaign center (`evaluateParticipation`, `MarketingQueryService`) and post-transaction reward evaluation (`evaluateTransaction`, `RewardEvaluationService`); shared checks sink down and transaction-level checks are layered on top, keeping semantics consistent. `CampaignTest` and `EligibilityPolicyTest` lock every MK-CAM/MK-ELI rule into executable assertions. The whole follows the repository baseline (`docs/design/07-java-conventions.md`): rich domain model, domain exception `BusinessRuleException("CODE", msg)`, `BigDecimal` amounts, zero-padded identifiers, `@Version` optimistic lock, and requirement ID comments for traceability.

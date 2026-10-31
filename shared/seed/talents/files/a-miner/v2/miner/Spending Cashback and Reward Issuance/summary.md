# Spending Cashback and Reward Issuance: Development Pattern Summary

> Scenario: add a "spending cashback / reward issuance" capability to an existing microservice system: campaign eligibility checks, reward calculation by rate / fixed amount / points, reward issuance triggered after a purchase is posted, idempotent posting and failure retry.
> Basis: `analyzer.md` (analysis of the dining cashback CATEGORY_CASHBACK case) and code snippets 01–04.

## 1. Overall pattern

| Dimension | Convention |
|---|---|
| Architecture | A separate supporting-domain microservice (such as marketing-service) + cross-cutting touch points in existing domains (posting trigger in transaction, idempotent posting in account) |
| Consistency | Without MQ, use "local transaction + synchronous call + idempotency key + manual retry" (ADR-009 option A); marketing failures do not affect the main accounting path |
| Layering | interfaces → application → domain ← infrastructure (dependency inversion, domain has no Spring dependency) |
| Idempotency | Evaluation side: `(campaign_id, transaction_id)` unique; posting side: `reward_credit.reward_id` unique; check-then-write as a double safeguard |
| Amounts/identifiers | `BigDecimal(12,2)` throughout; legacy identifiers are zero-padded strings (transaction ID 16 digits, card number 16 digits, account 11 digits); times are `LocalDateTime` |
| Concurrency | Aggregate roots carry an `@Version` optimistic lock; under extreme concurrency the budget may be overspent by 1 grant, which requires reconciliation |

## 2. Implementation steps

### Step 1: Define the campaign aggregate root and rule model

**Implementation logic**: the aggregate root holds the campaign rules, state machine and budget invariants; construction and editing share one validation method that checks the pricing field combination per campaign type; state transition methods check the prior state and time/budget constraints.

**Standards and constraints**:
- State machine: `DRAFT → ACTIVE ⇄ PAUSED → ENDED`; ENDED is final, and rules can only be edited in DRAFT.
- Pricing fields must be consistent with the type: fixed cashback requires `fixedRewardAmount > 0`; rate-based cashback requires `rewardRate ∈ (0, 1]` and a budget `> 0` (cash cashback types); points require `pointsMultiplier > 0`.
- General rule checks: name not empty and ≤ the length limit, `startAt < endAt`, minimum amount/budget non-negative, category code format.
- Business assertions always throw `BusinessRuleException("CODE", "message")`; never return null or sentinels.

**Notes**: use `compareTo/signum` for decisions and amount comparisons, never `double`; deduction and checks of the budget invariant (`consumedAmount ≤ budget`) come in pairs, and the budget must be checked again right before deducting; keep the meaning of the aggregate root's `updatedAt` consistent (always use the `now` parameter instead of mixing in `LocalDateTime.now()`).

**Generalized reference code**:
```java
@Entity
@Table(name = "campaign")
public class Campaign {
    // State machine and rule fields (type enum, start/end time, minimum amount, rate/fixed amount/per-transaction cap/per-card count/budget/consumed/multiplier/enrollment required)
    public void applyDraft(CampaignDraft draft, LocalDateTime now) {
        if (status != DRAFT) throw new BusinessRuleException("CAMPAIGN_NOT_EDITABLE", ...);
        validate(draft);   // validate per type
        // copy the draft fields, normalizing with trim / blankToNull
    }
    public void activate(LocalDateTime now) { /* only DRAFT/PAUSED; not expired; cash cashback needs a positive budget */ }
    public boolean isActiveAt(LocalDateTime moment) { /* status==ACTIVE && [startAt, endAt) */ }
    public boolean hasBudgetFor(BigDecimal amount) { /* consumedAmount+amount <= budget */ }
    public void consumeCashback(BigDecimal amount) { /* check, then add to consumedAmount */ }
}
```

**Reference files**: `marketing-service/.../domain/model/Campaign.java` lines 103–277; `CampaignDraft.java` in full.

### Step 2: Implement the calculator and eligibility decision (pure domain services)

**Implementation logic**: pricing and eligibility are static/stateless domain services with no Spring dependency; they take the aggregate root and the transaction context and return a result object. The order of the eligibility checks is the priority of the reason codes; the first failing check returns, so the frontend can show the reason directly.

**Standards and constraints**:
- Pricing: cash uses the fixed amount (preferred) or `round(amount × rate, 2)` (HALF_UP), then `min` with the per-transaction cap; points use `floor(amount × multiplier)`; the reward must be > 0, otherwise nothing is issued.
- Eligibility order: campaign ACTIVE and within its period → account status Y → account group matches → category matches → amount ≥ minimum → enrolled when enrollment is required → per-card count below the limit → no previous reward for first-purchase campaigns → sufficient budget.
- Results are immutable records (such as `Evaluation(eligible, reason, reward)`); failure reasons are constant codes (such as `AMOUNT_TOO_LOW`), not exceptions.

**Notes**: the check order maps one to one to the documents (such as MK-ELI), and the order is the external meaning; participation checks (can the customer take part at all) and transaction checks (full check + pricing) can be two separate entry points; reason codes are defined centrally as constants.

**Generalized reference code**:
```java
public final class EligibilityPolicy {
    public static final String AMOUNT_TOO_LOW = "AMOUNT_TOO_LOW";
    public record Evaluation(boolean eligible, String reason, RewardComputation reward) { /* eligible/rejected factories */ }
    public static Evaluation evaluateTransaction(Campaign c, AccountSnapshot a, BigDecimal amount,
                                                 String category, boolean enrolled, long rewardsOnCard, LocalDateTime now) {
        // one if per check in order, returning rejected(reason); when all pass, compute and check REWARD_ZERO / BUDGET_EXHAUSTED
    }
}
public final class RewardCalculator {
    public static RewardComputation compute(Campaign c, BigDecimal amount) { /* POINTS rounded down / CASHBACK fixed amount first + cap */ }
}
```

**Reference files**: `EligibilityPolicy.java` lines 403–470; `RewardCalculator.java` lines 495–516; `RewardComputation.java` in full.

### Step 3: Create the reward record entity (carrier of evaluation idempotency)

**Implementation logic**: the reward record entity holds the reward type/amount/points, its state machine and the failure reason; a database unique constraint on the business natural key is the final guarantee of evaluation-side idempotency.

**Standards and constraints**:
- Table unique key `(campaign_id, transaction_id)` (such as `uk_reward_campaign_txn`), indexed to support `exists/count` queries.
- State machine `PENDING → GRANTED / FAILED`; cash cashback must end as GRANTED or as a retryable PENDING.
- The constructor checks that the reward is > 0 (at least one of amount and points positive); the table has an `@Version` optimistic lock column.
- A Flyway migration script creates the table (`V1__xxx_schema.sql`); table names are lower case with underscores and columns map one to one to the entity's `@Column`s.

**Notes**: the unique constraint and the `exists` check in code are a double safeguard: the check prevents duplicate rewards, the constraint prevents concurrency races; the state methods (markGranted/markPending) are idempotent and clear/set failureReason.

**Generalized reference code**:
```java
@Entity
@Table(name = "reward_grant", uniqueConstraints = @UniqueConstraint(name = "uk_reward_campaign_txn",
        columnNames = {"campaign_id", "transaction_id"}))
public class RewardGrant {
    public void markGranted(LocalDateTime now) { status = GRANTED; grantedAt = now; failureReason = null; }
    public void markPending(String reason) { status = PENDING; failureReason = reason; }
}
```

**Reference files**: `RewardGrant.java` lines 75–109; `V1__marketing_schema.sql` lines 463–479.

### Step 4: Write the evaluation and issuance orchestration (application service)

**Implementation logic**: the application service injects repository ports, outbound clients and a `Clock`, and orchestrates "idempotency check → eligibility decision → deduct budget → create record → downstream posting → save"; a downstream failure turns into PENDING without interrupting other campaigns; a manual retry entry point is provided.

**Standards and constraints**:
- Transaction boundary: `@Transactional(noRollbackFor = RemoteServiceException.class)`, so that when the downstream cashback fails the saved PENDING record is kept, not rolled back.
- Multi-campaign loop: a campaign that does not qualify is only added to `skipped` and the loop continues; no exception interrupts the batch.
- Idempotency: each campaign first checks `existsByCampaignAndTransaction`; on a hit it records `ALREADY_EVALUATED` and skips; a repeated evaluation returns the existing result.
- Retry (fulfill): load the record first and retry only when `!isGranted()`; cashback calls the account again (the idempotency key is the safety net) and calls `markGranted` on success; on failure `markPending` + save + throw (noRollbackFor keeps the status).
- Inject `Clock` as the time source (fixed time in tests); amount parameter validation (not null, > 0, digit format) lives at the application entry point.
- Parameter validation failures throw `InvalidRequestException` (400); a missing record throws `NotFoundException` (404).

**Notes**: making the external call inside the transaction is an explicit trade-off of option A (a long transaction holds locks) and relies on noRollbackFor for protection; every downstream failure point inside the loop must try/catch and turn into a status instead of throwing upward; `Clock` keeps timestamps uniform so tests stay deterministic.

**Generalized reference code**:
```java
@Service
@Transactional(noRollbackFor = RemoteServiceException.class)
public class RewardEvaluationService {
    public EvaluationOutcome evaluate(EvaluationCommand cmd) {
        validate(cmd);
        for (Campaign c : campaigns.findActiveAt(now)) {
            if (rewards.existsByCampaignAndTransaction(c.id, cmd.transactionId())) { skipped(...); continue; }
            Evaluation e = EligibilityPolicy.evaluateTransaction(c, account, ...);
            if (!e.eligible()) { skipped(reason); continue; }
            try { c.consumeCashback(e.reward().amount()); }
            catch (BusinessRuleException ex) { skipped(BUDGET_EXHAUSTED); continue; }
            RewardGrant g = new RewardGrant(uuid(), ...);
            if (g.isCashback()) {
                try { accountClient.creditCashback(accountId, g.rewardId, campaignId, amount); g.markGranted(now); }
                catch (RemoteServiceException ex) { g.markPending(...); }
            } else { g.markGranted(now); }
            rewards.saveReward(g); campaigns.saveCampaign(c);
        }
    }
    public RewardView fulfill(String rewardId) { /* idempotent retry: short-circuit when isGranted */ }
}
```

**Reference files**: `RewardEvaluationService.java` lines 58–142; `RewardController.java` lines 34–65.

### Step 5: Add the trigger point on the main path (posting side); failures only raise an alert

**Implementation logic**: after each successful transaction in the posting use case, call marketing evaluation synchronously; catch call failures and raise an alert without affecting the posting result; provide a configuration switch to turn it off entirely.

**Standards and constraints**:
- Call location: after a successful posting inside the local transaction (in the same method body, but the exception is swallowed so it does not trigger a rollback).
- Call wrapper: a separate outbound adapter (such as `MarketingClient`) that turns HTTP exceptions into the domain `RemoteServiceException`; parameters are record DTOs.
- Failure semantics: `catch (RuntimeException)` → `log.warn` (the log contains only business identifiers such as transactionId); no rollback, no rethrow.
- Switch: `@Value("${marketing.enabled:true}")`; turning it off stops the calls (rollback path).
- Posting itself is idempotent: check the transaction ID before writing, and count repeated submissions as duplicates and skip them; a single declined transaction does not interrupt the batch (record the REJECTED reason code).

**Notes**: this is the key implementation of "marketing does not block accounting": it relies on "catching the exception without rethrowing", not on "a callback after the transaction commits"; the trigger point should reuse the already resolved snapshots (card/account) to build the command and avoid a second lookup; logs must not print sensitive fields such as card numbers.

**Generalized reference code**:
```java
// after each successful transaction in PostingService.post():
private void evaluateRewards(TransactionRecord record, CardSnapshot card, PostingCommand cmd) {
    if (!marketingEnabled) return;
    try {
        marketingClient.evaluateRewards(new MarketingClient.RewardEvaluationCommand(
                record.getTransactionId(), cmd.cardNumber(), record.getAccountId(), card.customerId(),
                record.getAmount(), cmd.categoryCode(), cmd.typeCode(), cmd.description(), record.getProcessedTimestamp()));
    } catch (RuntimeException ex) {
        log.warn("Reward evaluation failed for transaction {}: {}", record.getTransactionId(), ex.getMessage());
    }
}
```

**Reference files**: `PostingService.java` lines 290–314; `MarketingClient.java` lines 28–56.

### Step 6: Idempotent posting in the downstream account service

**Implementation logic**: the account domain adds an idempotent posting use case: check-then-write by the business idempotency key (rewardId) and record that the posting happened; the balance change is encapsulated in an aggregate root method.

**Standards and constraints**:
- Idempotency table: `reward_credit(reward_id PK, account_id, campaign_id, amount, created_at)`; `reward_id` is the idempotency key, and a repeated call returns the current account directly without deducting again.
- Aggregate root method (such as `applyCashback`): check amount > 0, reduce the amount owed; the balance may be negative (overpayment/credit); a comment states the direction.
- Write order: account first, then the idempotency record (same local transaction); check before writing.
- API: `POST /api/v1/accounts/{id}/cashback-credits`, with a record parameter + validation annotations.

**Notes**: write the meaning of the idempotency key into comments and documents (such as NR-REWARD-01); the direction of the cashback reduction (lowering the amount owed) is opposite to posting (raising the amount owed), so watch the sign; table names/columns map to the legacy data dictionary.

**Generalized reference code**:
```java
public Account creditCashback(String accountId, String rewardId, String campaignId, BigDecimal amount) {
    if (rewardCredits.existsByRewardId(rewardId)) return getById(accountId);   // idempotent
    Account account = getById(accountId);
    account.applyCashback(amount);
    Account saved = accounts.saveAccount(account);
    rewardCredits.saveCredit(new RewardCredit(rewardId, accountId, campaignId, amount, LocalDateTime.now()));
    return saved;
}
```

**Reference files**: `AccountApplicationService.java` lines 71–87; `Account.java` lines 212–218; `RewardCredit.java` in full; `V3__reward_credit.sql` in full; `AccountController.java` lines 73–79.

### Step 7: Unit tests covering rule branches and idempotency

**Implementation logic**: test each reason code branch of the pure domain services; for the application service, stub the repositories and clients with Mockito and verify issuance, PENDING, idempotent skipping and retry.

**Standards and constraints**:
- Domain tests: plain JUnit + AssertJ, no Spring; assert reason code constants rather than strings; cover every eligibility branch and pricing precision (HALF_UP, cap, rounding down).
- Application tests: `@ExtendWith(MockitoExtension.class)` + `@Mock` ports; a fixed `Clock`; `ArgumentCaptor` to verify what is saved.
- Idempotency assertions: `verify(rewards, never()).saveReward(any())` (a repeated evaluation saves nothing); assert the downstream was not called with `verify(client, never()).creditCashback(...)`.
- Failure branches: `doThrow(RemoteServiceException)` → assert the grant is PENDING and has a reason.
- Assert amounts with `isEqualByComparingTo` (BigDecimal value comparison).

**Notes**: do not assert logs or implementation details (`07-java-conventions.md` §7); tests must not depend on external networks or other services.

**Reference files**: `RewardEvaluationServiceTest.java` lines 45–179; `EligibilityPolicyTest.java` in full; `RewardCalculatorTest.java` in full.

## 3. Other concepts and best practices

- **Three options for cross-service consistency**: option A, synchronous + idempotency key + retry (no middleware, short path, financial facts unaffected by marketing); option B, Outbox + MQ (fully decoupled, replayable, costly); option C, end-of-day batch (simple but not real time). The idempotency key design serves both synchronous retry and future event replay, so nothing has to be redone (ADR-009 reason 3).
- **Separate failure domains**: posting a purchase is a financial fact and marketing is an add-on benefit, so their failure domains must be separate: a failed evaluation only raises an alert and does not roll back; a failed cashback stays PENDING and can be retried.
- **Three layers of idempotency**: business check-then-write (application layer) → database unique constraint (concurrency safety net) → short-circuit at the retry entry point (no repeated call once GRANTED).
- **Optimistic locking**: every aggregate root/entity carries `@Version`, replacing the legacy READ-UPDATE + manual concurrency comparison (ADR-006); under extreme concurrency budget consumption may overspend by 1 grant, which requires reconciliation (design document §8 risks).
- **Architecture conventions** (`07-java-conventions.md`): package structure interfaces/application/domain/infrastructure; domain exceptions are always `BusinessRuleException("CODE", msg)`; each service has its own database, no cross-database JOINs; REST base path `/api/v1/<plural resource>`, error responses always `{"code","message","details"}`, HTTP semantics 400/404/409/503; Flyway `V1__schema` + `V2__seed` (idempotent INSERTs); identifiers are zero-padded strings, amounts BigDecimal, times LocalDateTime.
- **Observability and rollback**: services expose `/actuator/health`; logs never print card numbers/SSNs; a switch (such as `marketing.enabled`) provides an overall rollback path; the retry API (fulfill) is the required entry point for handling PENDING.
- **Test layers**: pure domain unit tests (no Spring) + `@SpringBootTest`/MockMvc end to end + H2 running both migrations and seed data.

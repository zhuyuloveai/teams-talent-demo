# Campaign Eligibility and Validity Control: Development Pattern Summary

> Scenario: implement marketing campaign eligibility checks and validity control, covering campaign status, time window, account status, target account group, enrollment and participation limits.
> Basis: `analyzer.md` (case analysis of Campaign Eligibility and Validity Control in marketing-service) and code snippets 01–02.

## 1. Overall pattern

| Dimension | Convention |
|---|---|
| Architecture | Separate microservice for a supporting domain (such as marketing-service), DDD four layers: interfaces → application → domain ← infrastructure; eligibility decisions live in a **stateless policy class in domain/service**, rules and state live in the **aggregate root in domain/model** |
| Validity control | Two dimensions: **state machine** (manual switch: `DRAFT → ACTIVE ⇄ PAUSED → ENDED`, ENDED is final) + **time window** (natural boundary: `[startAt, endAt)`, start inclusive, end exclusive); the decision method `isActiveAt` combines them into "campaign in effect" |
| Eligibility check | The decision chain checks conditions in a **fixed order**; the order is the reason code priority and it returns the reason at the first unmet condition; the result is returned as an immutable record (not an exception), and reason code constants are defined in one place |
| Data boundary | Read-only data from other domains uses a **snapshot transfer object** (record, not persisted, not part of the aggregate); the account status/account group needed for the decision is fetched live by an outbound adapter |
| Domain invariants | Rule validation is concentrated in the aggregate root (construction and editing share the same `validate`); business assertions always throw `BusinessRuleException("CODE", msg)`; amounts are `BigDecimal`, never double; identifiers are zero-padded fixed-length strings |
| Concurrency | The aggregate root has a `@Version` optimistic lock; for budget-like resources "the check (hasBudgetFor) is separate from the deduction (consumeCashback), with a re-check before deducting"; under extreme concurrency one extra reward may be issued and needs reconciliation |

## 2. Implementation steps

### Step 1: Define the status enum and the rule draft carrier

**Implementation logic**: an enum expresses the campaign status (persisted with `EnumType.STRING`); an immutable record serves as the "campaign rule draft" that carries all editable fields at once, shared by create and edit.

**Standards and constraints**:
- The status enum contains only status values (such as `DRAFT/ACTIVE/PAUSED/ENDED`), no rule fields; JPA persists it with `@Enumerated(EnumType.STRING)`, never ORDINAL.
- The draft record's fields map one to one to the "editable rules"; immutable and logic-free, it is only a transfer carrier.
- Enum/record file names follow the domain language (such as `CampaignStatus`, `CampaignDraft`).

**Notes**: separating the draft from the entity (CQ idea) avoids coupling the "editable rule set" with the "aggregate root state"; when a rule field is added later, change both places.

**Historical reference code (generalized)**:
```java
public enum CampaignStatus { DRAFT, ACTIVE, PAUSED, ENDED }   // four states of the state machine

public record CampaignDraft(   // rule draft: all editable fields
        String name, String description, CampaignType campaignType,
        LocalDateTime startAt, LocalDateTime endAt,
        String targetGroupId, String categoryCode,
        BigDecimal minTransactionAmount, BigDecimal rewardRate,
        BigDecimal fixedRewardAmount, BigDecimal maxRewardPerTransaction,
        Integer maxRewardsPerCard, BigDecimal budget,
        BigDecimal pointsMultiplier, boolean enrollmentRequired) {
}
```

**Reference files**: `CampaignStatus.java` whole file; `CampaignDraft.java` whole file.

### Step 2: Implement the aggregate root (rule fields + JPA mapping)

**Implementation logic**: the aggregate root carries all campaign rule fields and invariants; JPA `@Column` mappings correspond one to one to table columns; it has a `@Version` optimistic lock; it provides a protected no-arg constructor for JPA and a business constructor (initial state + initial accumulated amounts).

**Standards and constraints**:
- Amount columns are `BigDecimal` + `@Column(precision=12, scale=2)`, never `double`; time columns are `LocalDateTime`; identifier columns are fixed length (such as a 36-character UUID string).
- The `@Version long version` optimistic lock column is mandatory (replaces the legacy READ-UPDATE + manual comparison, ADR-006).
- The business constructor takes a `now` parameter (instead of calling `LocalDateTime.now()` internally) and initializes the created/updated timestamps and the initial accumulated amounts.
- The class comment states the state machine and where the rules come from (such as "State machine: DRAFT → ACTIVE ⇄ PAUSED → ENDED").

**Notes**: keep `updatedAt` semantics consistent throughout (use the `now` parameter); mixing in `LocalDateTime.now()` makes tests uncontrollable. Field defaults (such as the `ZERO` constant) use `BigDecimal("0.00")` to state the precision explicitly.

**Historical reference code (generalized)**:
```java
@Entity
@Table(name = "<activity_table>")
public class <ActivityAggregate> {
    @Id @Column(name = "activity_id", length = 36, nullable = false, updatable = false) private String activityId;
    @Enumerated(EnumType.STRING) @Column(name = "status", length = 16, nullable = false) private <Status> status;
    @Column(name = "start_at", nullable = false) private LocalDateTime startAt;
    @Column(name = "end_at", nullable = false) private LocalDateTime endAt;
    @Version @Column(name = "version", nullable = false) private long version;

    protected <ActivityAggregate>() { /* for JPA */ }

    public <ActivityAggregate>(String id, <Draft> draft, LocalDateTime now) {
        this.activityId = id;
        this.status = <Status>.DRAFT;               // initial state
        this.consumed = ZERO;                        // initial accumulated amount
        this.createdAt = now; this.updatedAt = now;
        applyDraft(draft, now);                      // creation goes through the same validation
    }
}
```

**Reference files**: `Campaign.java` lines 41–125 (fields and constructors).

### Step 3: Rule validation (shared by create/edit) + edit entry point

**Implementation logic**: the static validation method `validate(draft)` covers the general rules and, per type, the consistency of the pricing fields; `applyDraft` only allows the editable state (such as DRAFT), normalizes fields (trim, blank to null), writes them, and updates `updatedAt`.

**Standards and constraints**:
- General validation: name not blank and within the length limit, type required, `startAt < endAt`, minimum amount/budget non-negative, category code format (such as 4 digits), count fields > 0.
- Per type (switch expression): fixed cashback types need a positive fixed amount; rate cashback types need "at least one of rate or fixed amount", rate ≤ 1 (100%), and a positive budget; points types need a positive multiplier; the `default` branch rejects unsupported types.
- Validation failures throw `BusinessRuleException("CODE", "message")`; never return null/a sentinel.
- Normalization helpers (such as `blankToNull` + `trim`) handle the blank semantics of optional fields.

**Notes**: **create and edit must share the same `validate`**, otherwise you get "valid on create, validation bypassed on edit"; list the field combinations of each switch branch against the requirement one by one; use `compareTo/signum` for numeric comparison, and check the reward rate cap with `compareTo(BigDecimal.ONE) > 0`.

**Historical reference code (generalized)**:
```java
public void applyDraft(<Draft> draft, LocalDateTime now) {
    if (status != <Status>.DRAFT) throw new BusinessRuleException("<CODE>_NOT_EDITABLE", "Only DRAFT can be edited.");
    validate(draft);
    // copy fields: name.trim(); optional fields blankToNull(...)
    this.updatedAt = now;
}
private static void validate(<Draft> draft) {
    if (draft.name() == null || draft.name().isBlank()) throw new BusinessRuleException("INVALID_<ENTITY>", "...");
    if (!draft.startAt().isBefore(draft.endAt())) throw new BusinessRuleException("INVALID_PERIOD", "...");
    switch (draft.type()) {
        case FIXED -> { /* needs a positive fixed amount */ }
        case RATE  -> { /* at least one of rate or fixed amount; rate ≤ 100%; budget > 0 */ }
        case POINTS-> { /* needs a positive multiplier */ }
        default    -> throw new BusinessRuleException("INVALID_TYPE", "Unsupported type.");
    }
}
```

**Reference files**: `Campaign.java` lines 130–151 (applyDraft), 234–292 (validate), 294–296 (blankToNull).

### Step 4: State machine methods (the operating side of validity control)

**Implementation logic**: each state transition method checks "precondition state + time/resource constraints", then sets the next state and updates the timestamp; illegal transitions throw a business exception.

**Standards and constraints**:
- `activate(now)`: only DRAFT/PAUSED can be activated; `now` must be before the end time (not expired); cash cashback types require budget > 0 (otherwise `BUDGET_REQUIRED`).
- `pause(now)`: only ACTIVE; `end(now)`: only ACTIVE/PAUSED (ENDED is final and cannot transition again).
- Each method ends with `status = ...; updatedAt = now;`.

**Notes**: **check the state machine (manual switch) and the time window (natural boundary) separately**: `activate` only checks "not expired", while actual "campaign in effect" is decided by `isActiveAt`, which checks both status and time window, giving a double safeguard; an expired campaign set to ACTIVE by mistake still issues nothing.

**Historical reference code (generalized)**:
```java
public void activate(LocalDateTime now) {
    if (status != <Status>.DRAFT && status != <Status>.PAUSED)
        throw new BusinessRuleException("INVALID_<ENTITY>_STATE", "Only DRAFT or PAUSED can be activated.");
    if (!now.isBefore(endAt))
        throw new BusinessRuleException("<ENTITY>_EXPIRED", "End time has passed.");
    if (<type> == <CASHBACK_TYPE> && budget.signum() <= 0)
        throw new BusinessRuleException("BUDGET_REQUIRED", "Cashback requires a positive budget.");
    this.status = <Status>.ACTIVE;
    this.updatedAt = now;
}
public void pause(LocalDateTime now)  { /* only ACTIVE → PAUSED */ }
public void end(LocalDateTime now)    { /* only ACTIVE/PAUSED → ENDED (final) */ }
```

**Reference files**: `Campaign.java` lines 153–183 (activate/pause/end).

### Step 5: Decision query methods (the decision side of validity control)

**Implementation logic**: implement pure domain decision methods on the aggregate root for "is the campaign currently in effect, does it match the target", called by the eligibility policy.

**Standards and constraints**:
- `isActiveAt(moment)`: `status == ACTIVE && !moment.isBefore(startAt) && moment.isBefore(endAt)`, i.e. **start inclusive, end exclusive**.
- Target matching methods (`matchesGroup`/`matchesCategory`): **a null target field is a wildcard (no restriction)**, `target == null || Objects.equals(target, actualValue)`.
- Resource check (`hasBudgetFor(amount)`): only applies to resource-based campaigns (such as cash cashback), `consumedAmount + amount <= budget` with `compareTo`; no budget constraint (signum<=0) counts as passing.
- Resource query (`remainingBudget()`): returns null when there is no budget constraint (meaning "not applicable", not "0"), to avoid confusion with "budget exhausted".

**Notes**: null as wildcard is the key semantics of the "target account group/category restriction", so the decision methods must handle null explicitly; the budget "check and deduct" methods come in pairs but have separate responsibilities (this step only checks).

**Historical reference code (generalized)**:
```java
public boolean isActiveAt(LocalDateTime moment) {
    return status == <Status>.ACTIVE && !moment.isBefore(startAt) && moment.isBefore(endAt);
}
public boolean matchesGroup(String accountGroupId) {
    return targetGroupId == null || Objects.equals(targetGroupId, accountGroupId);   // null is a wildcard
}
public boolean hasBudgetFor(BigDecimal rewardAmount) {
    if (!isCashback()) return true;
    if (budget.signum() <= 0) return true;
    return consumedAmount.add(rewardAmount).compareTo(budget) <= 0;
}
```

**Reference files**: `Campaign.java` lines 185–232 (isActiveAt/matchesGroup/matchesCategory/hasBudgetFor/remainingBudget).

### Step 6: Implement the stateless eligibility policy (core)

**Implementation logic**: a domain service checks eligibility with a **decision chain in fixed order**; the order is the reason code priority and it returns at the first unmet condition; the result is carried by an immutable record (`eligible` + reason code + reward), and "not eligible" is not expressed by throwing.

**Standards and constraints**:
- All reason codes are `public static final String` constants defined in one place (such as `AMOUNT_TOO_LOW`, `GROUP_MISMATCH`), shared by the decision, the caller's skipped records, frontend copy and tests.
- The result object `Evaluation(boolean eligible, String reason, <Reward>)` provides the factory methods `eligible(reward)`/`rejected(reason)`.
- **Two entry points**: participation decision (only "can participate", without transaction amount/category/count) and full transaction decision (reuses the participation decision, then adds transaction-level checks + pricing).
- Decision chain order (generalized): campaign in effect → account exists → account status → target account group → category → amount threshold met → enrolled when enrollment is required → participation count below the limit → uniqueness limit (such as no history for a first purchase) → calculate reward → reward non-zero → resources sufficient.
- External facts needed by the decision (enrolled or not, participation count so far) are passed in by the caller; **the policy stays stateless, with no IO and no Spring dependency**.

**Notes**: the decision order corresponds item by item to the requirement document, and the order is external semantics (the frontend's displayed reason and batch evaluation skips both depend on it); shared checks sink into the participation entry point and transaction-level checks are layered on top, so the two places cannot drift; "not eligible" is a normal business outcome and uses a return value, while "invariant broken" (such as constructing a zero reward) uses an exception: keep the boundary between these two kinds of error handling clear.

**Historical reference code (generalized)**:
```java
public final class <Eligibility>Policy {
    public static final String NOT_ACTIVE = "<ENTITY>_NOT_ACTIVE";
    public static final String GROUP_MISMATCH = "<ENTITY>_GROUP_MISMATCH";
    // ... all reason code constants

    public record Evaluation(boolean eligible, String reason, <Reward> reward) {
        static Evaluation eligible(<Reward> reward)      { return new Evaluation(true, null, reward); }
        static Evaluation rejected(String reason)        { return new Evaluation(false, reason, null); }
    }

    public static Evaluation evaluateParticipation(<Aggregate> e, <AccountSnapshot> a, boolean enrolled, LocalDateTime now) {
        if (!e.isActiveAt(now))                  return Evaluation.rejected(NOT_ACTIVE);
        if (a == null)                            return Evaluation.rejected(ACCOUNT_NOT_FOUND);
        if (!"Y".equals(a.activeStatus()))        return Evaluation.rejected(ACCOUNT_INACTIVE);
        if (!e.matchesGroup(a.groupId()))         return Evaluation.rejected(GROUP_MISMATCH);
        if (e.isEnrollmentRequired() && !enrolled) return Evaluation.rejected(NOT_ENROLLED);
        return Evaluation.eligible(null);
    }

    public static Evaluation evaluateTransaction(<Aggregate> e, <AccountSnapshot> a, BigDecimal amount,
                                                 String category, boolean enrolled, long timesOnCard, LocalDateTime now) {
        Evaluation p = evaluateParticipation(e, a, enrolled, now);   // reuse the shared decision
        if (!p.eligible()) return p;
        if (!e.matchesCategory(category))                 return Evaluation.rejected(CATEGORY_MISMATCH);
        if (amount.compareTo(e.getMinAmount()) < 0)       return Evaluation.rejected(AMOUNT_TOO_LOW);
        if (e.getMaxTimes() != null && timesOnCard >= e.getMaxTimes()) return Evaluation.rejected(TIMES_LIMIT_REACHED);
        if (e.getType() == <FIRST_TYPE> && timesOnCard > 0) return Evaluation.rejected(ALREADY_REWARDED);
        <Reward> reward = <Calculator>.compute(e, amount);
        if (reward.amount().signum() <= 0 && reward.points() <= 0) return Evaluation.rejected(REWARD_ZERO);
        if (!e.hasBudgetFor(reward.amount()))             return Evaluation.rejected(BUDGET_EXHAUSTED);
        return Evaluation.eligible(reward);
    }
}
```

**Reference files**: `EligibilityPolicy.java` whole file (focus on lines 447–471 constants and Evaluation, 476–494 participation, 499–529 transaction).

### Step 7: Cross-domain account snapshot and decision wiring (application layer)

**Implementation logic**: Account domain data is fetched by an outbound adapter as a read-only snapshot record; the application services (campaign center query / transaction evaluation) run "get account snapshot → get campaign list → decide per campaign → assemble result" inside a transaction, and the enrollment/count facts needed for the decision are counted from the repositories and passed into the policy.

**Standards and constraints**:
- The snapshot record contains only the fields needed for the decision (such as `accountId/activeStatus/currentBalance/groupId`), and its comment states "read-only for marketing, never stored", keeping the data ownership boundary (ADR-003).
- Outbound adapter: a 404 from a read API becomes `Optional.empty()` (does not exist), non-2xx becomes the domain `RemoteServiceException` (real failure), and network exceptions are wrapped uniformly; the response body is converted into the snapshot through an internal record.
- The campaign list uses the repository query `findActiveAt(now)` (SQL pre-filter `status=ACTIVE && startAt<=now && endAt>now`) to narrow the set to decide.
- The participation entry point (campaign center) returns `eligible + reason` for the frontend to display; the transaction entry point records a skip reason (skipped) for ineligible campaigns without interrupting other campaigns in the same batch.
- The time source is an injected `Clock`, always `LocalDateTime.now(clock)`.

**Notes**: the snapshot is live (account status is not cached), so the account status is current at decision time; the participation decision and the transaction decision must go through the same policy class to avoid semantic drift; a missing account is a "whole-page failure" (404) in the campaign center but "skip this campaign" (ACCOUNT_NOT_FOUND) in transaction evaluation: the caller decides by business scenario.

**Historical reference code (generalized)**:
```java
// domain/model: read-only snapshot (not persisted)
public record <AccountSnapshot>(String accountId, String activeStatus,
                                BigDecimal currentBalance, String groupId) { }

// application: participation query (campaign center)
for (<Aggregate> e : repo.findActiveAt(now)) {
    boolean enrolled = enrollments.findEnrollment(e.getId(), cardNumber).isPresent();
    Evaluation ev = <Eligibility>Policy.evaluateParticipation(e, account, enrolled, now);
    views.add(new OfferView(e, enrolled, ev.eligible(), ev.reason()));
}

// application: transaction evaluation
for (<Aggregate> e : repo.findActiveAt(now)) {
    if (rewards.existsBy<Key>(e.getId(), txnId)) { skipped(...ALREADY_*); continue; }
    boolean enrolled = enrollments.findEnrollment(...).isPresent();
    long times = rewards.countBy<Dim>(e.getId(), cardNumber);
    Evaluation ev = <Eligibility>Policy.evaluateTransaction(e, account, amount, category, enrolled, times, now);
    if (!ev.eligible()) { skipped(e.getId(), ev.reason()); continue; }
    // deduct resources → create record → persist/call downstream
}
```

**Reference files**: `AccountSnapshot.java` whole file; `AccountClient.java` lines 28–63; `MarketingQueryService.java` lines 46–59; `RewardEvaluationService.java` lines 57–81.

### Step 8: Lock down rule branches with domain unit tests

**Implementation logic**: plain JUnit + AssertJ asserts the aggregate root's state machine and the policy's decision chain branch by branch; the tests are the executable regression baseline for the MK-ELI requirement IDs.

**Standards and constraints**:
- Aggregate root tests: assert the initial state/initial accumulated amounts; the full legal transition chain (activate→consume→pause→activate→end); assert an exception for each illegal transition (DRAFT cannot pause, ACTIVE cannot activate again, ENDED cannot activate again, ACTIVE cannot be edited); assert the error code for rule validation branches (invalid period, missing pricing fields, cash cashback without budget).
- Policy tests: one "all conditions met" positive case asserting the reward amount; assert the reason code constant for each rejection branch (NOT_ACTIVE/ACCOUNT_INACTIVE/GROUP_MISMATCH/CATEGORY_MISMATCH/AMOUNT_TOO_LOW/NOT_ENROLLED/TIMES_LIMIT_REACHED/ALREADY_REWARDED/BUDGET_EXHAUSTED).
- Assertion style: exceptions with `assertThatThrownBy(...).isInstanceOf(BusinessRuleException.class).extracting("code").isEqualTo("...")`; amounts with `isEqualByComparingTo` (BigDecimal equality, not `isEqualTo`).
- Test helpers: fixed `LocalDateTime` constants + a factory method that builds the rule draft (shorter cases); assert reason codes with the policy constants, not literals.

**Notes**: do not assert logs or implementation details (`07-java-conventions.md` §7); tests must not depend on the Spring container/external networks; **every decision branch needs one case**: the policy class has many branches, and a missed branch means a missed rule.

**Historical reference code (generalized)**:
```java
@Test
void budgetCannotBeExceeded() {
    Campaign c = new Campaign("c1", draft(), NOW);
    c.activate(NOW);
    assertThatThrownBy(() -> c.consume(new BigDecimal("1000.01")))
            .isInstanceOf(BusinessRuleException.class)
            .extracting("code").isEqualTo("BUDGET_EXHAUSTED");
}

@Test
void rejectsWrongCategory() {
    Evaluation ev = EligibilityPolicy.evaluateTransaction(campaign(), ACCOUNT,
            new BigDecimal("120.00"), "9999", true, 0, NOW);
    assertThat(ev.reason()).isEqualTo(EligibilityPolicy.CATEGORY_MISMATCH);
}
```

**Reference files**: `CampaignTest.java` whole file; `EligibilityPolicyTest.java` whole file.

## 3. Other concepts and best practices

- **Two locks of validity control**: the state machine is a manual switch (controlled by operations), the time window is a natural boundary (`[startAt, endAt)`, start inclusive, end exclusive); they are checked separately and combined in `isActiveAt`. Editing/publishing/issuing must all prevent "reviving an expired campaign": `activate` checks not expired, `isActiveAt` checks both, and the repository pre-filters `endAt > now`.
- **Eligibility decision: return value vs. exception**: in the decision chain "not eligible" is a normal business outcome (shown in the campaign center, skipped in batch evaluation) and is returned as an `Evaluation(eligible, reason)` record; only "business rule broken" (such as still constructing a record with a zero reward) throws `BusinessRuleException`. The order of the decision chain is external semantics; a new rule must be inserted at the right priority and its document ID updated (such as MK-ELI-xx).
- **Null wildcard pattern**: a null target dimension field (account group/category) means "no restriction": `target == null || Objects.equals(target, actual)`. This is the unified model for "targeted vs. all-customer" marketing campaigns; mind the boundary with "required field validation" (nullable = wildcard, non-null = exact match).
- **Separate check from deduction**: resource limits (budget) are first "checked as sufficient" and then "deducted", and the deduction method re-checks internally; the concurrency fallback is the `@Version` optimistic lock; under extreme concurrency one extra reward may be issued, a recorded risk that needs reconciliation (risk section of the design document).
- **Domain modeling (rich domain model)**: rules, the state machine and invariants are all concentrated in the aggregate root; the domain service is stateless, with no IO and no Spring dependency, so the pure logic is unit-testable and both entry points reuse the same policy for consistent semantics.
- **Cross-domain data boundary (ADR-003)**: account status/account group belong to the Account domain; marketing only transfers them as read-only snapshot records and never persists them; the outbound adapter must distinguish 404 from real failures (does not exist → Optional.empty, failure → RemoteServiceException).
- **Explainable reason codes**: eligibility reason codes are the contract for frontend copy and user communication; they must be defined as constants in one place, share the same symbols with tests, and be passed through unchanged in API responses; error responses are always `{"code","message","details"}` (400/404/409/503 semantics).
- **Amount and identifier baseline** (`07-java-conventions.md`): amounts are always `BigDecimal(precision=12, scale=2)` + `compareTo/signum`; legacy identifiers are zero-padded fixed-length strings (account 11 digits, card number 16 digits); times are `LocalDateTime` + an injected `Clock`.
- **Requirement traceability**: keep requirement ID comments where rules are implemented (such as MK-ELI-01..09, MK-CAM-01..06), matching the design document `docs/design/08-marketing-capability.md`, so gate reviews and audits can trace them.

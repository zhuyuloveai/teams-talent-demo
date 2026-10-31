# Core Business Process Map

## 1. Transfer process (intra-bank / interbank)

```
Customer initiates
  │
  ├─[1] Authentication (password / USB key / biometrics)
  │     └─ Failed -> return authentication error
  │
  ├─[2] Limit check (single transaction -> daily cumulative -> annual cumulative -> channel -> customer tier)
  │     └─ Exceeded -> return PAY-AMT-LIMIT-EXCEEDED + available amount
  │
  ├─[3] Risk screening (blacklist / AML / suspicious patterns)
  │     └─ Hit -> return PAY-RISK-REJECTED
  │
  ├─[4] Payee account check (validity / status / frozen)
  │     └─ Invalid -> return PAY-ACCT-INVALID
  │
  ├─[5] Posting (debit payer / credit payee)
  │     └─ Failed -> return PAY-ACCT-FAILED
  │
  ├─[6] Clearing (submitted to CNAPS / Super Internet Banking for interbank)
  │     └─ Failed -> enter the reversal process
  │
  ├─[7] Transaction status update (SUCCESS)
  │
  └─[8] Customer notification (SMS / app push)
```

### Key constraints

| Constraint | Description |
|------|------|
| Limit check before posting | Check first, then post, to avoid rolling back an over-limit posting |
| Every transaction traceable | Transaction ID unique across the chain; reference number supports reconciliation |
| Atomic posting | Debit and credit must succeed or fail together |
| Masking of sensitive fields | Card numbers / ID numbers masked on display; never in plain text in logs |
| Driven by the state machine | State transitions go through the engine; direct UPDATE is forbidden |

## 2. Reversal process

```
Original transaction SUCCESS
  │
  ├─[1] Start reversal (original transaction ID required)
  │     └─ Original transaction not SUCCESS -> reversal rejected
  │
  ├─[2] Reversal amount check (must equal the original transaction amount)
  │     └─ Amount mismatch -> reversal rejected
  │
  ├─[3] Reversal time check (automatic on day T; later days need approval)
  │     └─ Too late -> manual approval
  │
  ├─[4] Reverse posting (debit payee / credit payer)
  │     └─ Failed -> reversal FAILED, manual intervention
  │
  ├─[5] Clearing reversal (pacs.004 submitted for interbank)
  │
  ├─[6] Status update (original transaction REVERSED)
  │
  └─[7] Customer notification
```

### Reversal rules

| Rule | Description |
|------|------|
| BR-PAY-010 | Only transactions in SUCCESS state can be reversed |
| BR-PAY-011 | The reversal amount must equal the original transaction amount (full reversal) |
| BR-PAY-012 | A reversal must be completed on day T; a reversal on a later day requires manual approval |
| BR-PAY-013 | After a successful reversal the original transaction changes to REVERSED and cannot be reversed again |

## 3. Reconciliation process

```
T+1 end-of-day batch
  │
  ├─[1] Export transaction data (grouped by channel / counterparty bank)
  │
  ├─[2] Internal reconciliation (transaction system vs accounting system)
  │     └─ General ledger and sub-ledgers do not balance -> block end of day, alert
  │
  ├─[3] External reconciliation (our bank vs counterparty bank / UnionPay)
  │     ├─ Generate the difference report
  │     └─ Difference categories: excess record / short record / amount mismatch / wrong account
  │
  ├─[4] Put differences in suspense
  │     └─ Resolution required before T+2
  │
  └─[5] Resolve differences
        ├─ Excess record -> contact the other party to verify
        ├─ Short record -> add the record or raise an inquiry
        ├─ Amount mismatch -> correct according to the original transaction
        └─ Wrong account -> adjust the accounts, keep an audit log
```

### Reconciliation rules

| Rule | Description |
|------|------|
| BR-PAY-020 | Internal reconciliation runs automatically at the end of T+1; if the general ledger and sub-ledgers do not balance, the end-of-day batch is blocked |
| BR-PAY-021 | Every reconciliation difference put in suspense must have a resolution within T+2 |
| BR-PAY-022 | Difference handling must leave an audit log (operator / time / reason / adjustment amount) |

## 4. Clearing process

```
End-of-day batch
  │
  ├─[1] Aggregate transaction data (grouped by counterparty bank / channel / currency)
  │
  ├─[2] Net calculation (receivable - payable = net)
  │
  ├─[3] Generate the clearing report (batch header / details / trailer check)
  │
  ├─[4] Submit for settlement (exchange through central bank reserve accounts)
  │
  └─[5] Clearing completion notification
```

---

## L3 required depth fields

| Field | Requirement | Example |
|------|------|------|
| Process map | Includes branches / failure paths / state transitions | See above |
| Key constraints | Each step states its constraints and business rule IDs | BR-PAY-001 |
| Error codes | Each failure path states its error code | PAY-AMT-LIMIT-EXCEEDED |
| Source | Source of the process/constraint | CNAPS specification, internal management measures |
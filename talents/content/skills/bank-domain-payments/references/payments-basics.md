# Payment Business Basics and Regulatory Constraints

## 1. Payment business overview

The bank payment system covers the full chain from the customer initiating a fund movement to the final exchange of funds. Core steps:

```
Customer initiates -> Channel validation -> Risk screening -> Posting -> Clearing -> Reconciliation -> Settlement -> Customer notification
```

### 1.1 Payment types

| Type | Description | Typical scenario | Regulatory focus |
|------|------|---------|---------|
| Intra-bank transfer | Fund movement between accounts at the same bank | Counter / internet banking / mobile banking transfer | Limits, identity verification |
| Interbank transfer | Fund movement between accounts at different banks | Internet banking interconnection, Super Internet Banking | CNAPS channel, crediting time |
| Batch disbursement | Paying funds to many accounts in a batch | Payroll, subsidy payments | Batch completeness, failure handling |
| Batch deduction | Debiting many accounts in a batch | Utility bills, loan repayments | Authorization chain, retry of failed debits |
| Bill payment | Paying public utility fees | Water, electricity and gas bills, traffic fines | Payee qualification, reconciliation |
| Cross-border remittance | Cross-border fund movement | Tuition abroad, international trade | SAFE declaration, AML |
| QR code payment | Paying and collecting by scanning a code | Merchant collection, C2C transfer | QR code standard, limits |
| Agreement payment | Automatic debit after signing an agreement | Fund investment plans, insurance renewals | Agreement validity, termination process |

### 1.2 Core concepts

| Concept | Definition | Notes |
|------|------|---------|
| Initiator | The customer or system that initiates the payment instruction | Must be authenticated and authorized |
| Payee | The account holder who receives the funds | The payee account must be validated |
| Transaction ID | Globally unique transaction identifier | Primary key for end-to-end tracing; never reused |
| Reference number | Auxiliary identifier at channel/batch level | Used for reconciliation matching; may repeat |
| Posting | Reflecting a fund movement in the account balance | Double-entry bookkeeping, debit first, then credit |
| Clearing | Aggregating transaction data and calculating net amounts | No actual movement of funds |
| Settlement | Actual exchange of funds | Through central bank reserve accounts |
| Reconciliation | Checking that transaction records and accounting records agree | T+1 end-of-day batch |

> **Key distinction**: clearing ≠ settlement. Clearing is "doing the sums" (net calculation); settlement is "paying the money" (fund movement). Never mix them up in day-to-day development. See "Easily confused terms" in the glossary.

### 1.3 Limit hierarchy

Payment limits are a multi-level parameterized control, from loose to tight:

| Level | Limit type | When checked | Typical default |
|------|---------|---------|-----------|
| L1 | Single transaction limit | When the transaction is initiated | CNY 50,000 per transaction |
| L2 | Daily cumulative limit | When the transaction is initiated | CNY 200,000 per day |
| L3 | Annual cumulative limit | When the transaction is initiated | CNY 1,000,000 per year |
| L4 | Channel limit | When the transaction is initiated | Configured per channel |
| L5 | Customer tier limit | When the transaction is initiated | By customer risk level |

**Limit check rules:**
- Check order: single transaction -> daily cumulative -> annual cumulative -> channel -> customer tier (short-circuit evaluation; reject as soon as one fails)
- Limit parameters must be configurable (not hard-coded) and support parameterized migration
- Limit changes must leave an audit log; the effective time is precise to the minute
- An exceeded limit must return a clear error code and the currently available amount

### 1.4 State machine

Core state machine of a payment transaction:

```
[INIT] --submit--> [PENDING] --risk passed--> [PROCESSING] --posting succeeded--> [SUCCESS]
                    |                           |                                   |
                    |                           |--posting failed--> [FAILED]       |--timeout--> [TIMEOUT]
                    |                           |--risk rejected--> [REJECTED]
                    |--risk rejected--> [REJECTED]
                    
[SUCCESS] --start reversal--> [REVERSING] --reversal succeeded--> [REVERSED]
```

| State | Meaning | Allowed next states |
|------|------|--------------|
| INIT | Created, not submitted | PENDING, CANCELLED |
| PENDING | Submitted, awaiting risk control | PROCESSING, REJECTED |
| PROCESSING | Risk passed, processing | SUCCESS, FAILED, TIMEOUT |
| SUCCESS | Transaction succeeded | REVERSING |
| FAILED | Transaction failed (retryable) | PENDING (retry) |
| REJECTED | Rejected by risk control (not retryable) | Final state |
| TIMEOUT | Timed out, unconfirmed | SUCCESS, FAILED (after manual confirmation) |
| REVERSING | Reversal in progress | REVERSED, FAILED |
| REVERSED | Reversed | Final state |
| CANCELLED | Cancelled | Final state |

> **Development constraint**: state transitions must go through the state machine engine; a direct UPDATE of the status field is forbidden. Every transition must record the operator, time and reason.

## 2. Clearing and reconciliation

### 2.1 Clearing process

```
End-of-day batch -> Aggregate transaction data -> Group by counterparty bank/channel -> Net calculation -> Generate clearing report -> Submit for settlement
```

- **Clearing batch**: grouped by channel / counterparty bank / currency; each batch produces its own clearing report
- **Net calculation**: receivable - payable = net; a positive net is received, a negative net is paid
- **Clearing file**: standard format (for example the central bank CNAPS 8583 message), with batch header / details / trailer check

### 2.2 Reconciliation

| Reconciliation type | Parties | Frequency | Difference handling |
|---------|---------|------|---------|
| Internal reconciliation | Transaction system vs accounting system | T+1 end of day | Excess/short records put in suspense, verified manually |
| External reconciliation | Our bank vs counterparty bank / UnionPay | T+1 end of day | Difference report, resolved before T+2 |
| Channel reconciliation | Our bank vs payment channel | T+1 end of day | Difference categories: excess record / short record / wrong account |
| General ledger to sub-ledger check | General ledger vs sub-ledger accounts | T+1 end of day | Alert on any imbalance; blocks end of day |

**Reconciliation difference types:**

| Difference type | Definition | Handling |
|---------|------|---------|
| Excess record | We have a record, the other party does not | Put in suspense; contact the other party on T+2 |
| Short record | The other party has a record, we do not | Add the record or raise an inquiry |
| Amount mismatch | Both have a record but the amounts differ | The original transaction prevails; correct the record |
| Wrong account | The record is correct but booked to the wrong account | Adjust the accounts and keep an audit log |

## 3. Regulatory constraints

### 3.1 Anti-money laundering (AML)

| Requirement | Description | System implementation |
|------|------|---------|
| Large-value transaction report | Single or cumulative amounts above CNY 50,000 must be reported | Report triggered after the transaction completes |
| Suspicious transaction report | Transactions matching suspicious patterns must be reported | Real-time screening by the rules engine |
| Customer identification | KYC requirement; the customer's identity must be verified | Mandatory verification at account opening / first transaction |
| Blacklist screening | Screening against sanctions lists / high-risk lists | Real-time matching before the transaction |
| Transaction trail | All transaction records must be kept for at least 5 years | Tamper-proof audit log |

### 3.2 Data security and privacy

| Requirement | Source | System implementation |
|------|------|---------|
| Masking of sensitive information | Personal Information Protection Law | Card numbers / ID numbers masked on display |
| Data classification and grading | Data Security Law / internal standard | Labeled by classification level with access control |
| Encryption in transit | PCI DSS / internal security standard | TLS 1.2+, sensitive fields with SM4 (Chinese national cryptographic standard) |
| Log masking | Internal logging standard | Full card numbers / passwords must never appear in logs |

### 3.3 Payment clearing regulations

| Regulation/standard | Constraint |
|----------|------|
| Regulations on Non-Bank Payment Institutions | Payment business licensing and reserve fund management |
| CNAPS specification | Message formats and timing of the high-value/low-value payment systems |
| ISO 20022 | International standard for payment messages (pain/pacs/camt series) |
| Cross-border payment rules | SAFE declaration, enhanced AML screening |
| Centralized deposit of reserve funds | Reserve funds deposited in full with the central bank, in dedicated accounts |

## 4. Typical business rules

### 4.1 Transfer limit rules

```
Rule BR-PAY-001: A single transfer amount must not exceed the single transaction limit parameter (parameterized, not hard-coded)
Rule BR-PAY-002: The daily cumulative transfer amount must not exceed the daily cumulative limit parameter
Rule BR-PAY-003: The limit check runs before posting, with short-circuit evaluation
Rule BR-PAY-004: An exceeded limit returns error code PAY-AMT-LIMIT-EXCEEDED + the currently available amount
Rule BR-PAY-005: Limit parameter changes require an audit log and take effect with minute precision
```

### 4.2 Reversal rules

```
Rule BR-PAY-010: Only transactions in SUCCESS state can be reversed
Rule BR-PAY-011: The reversal amount must equal the original transaction amount (full reversal)
Rule BR-PAY-012: A reversal must be completed on day T; a reversal on a later day requires manual approval
Rule BR-PAY-013: After a successful reversal the original transaction changes to REVERSED and cannot be reversed again
```

### 4.3 Reconciliation rules

```
Rule BR-PAY-020: Internal reconciliation runs automatically at the end of T+1; if the general ledger and sub-ledgers do not balance, the end-of-day batch is blocked
Rule BR-PAY-021: Every reconciliation difference put in suspense must have a resolution within T+2
Rule BR-PAY-022: Difference handling must leave an audit log (operator / time / reason / adjustment amount)
```

## 5. Forbidden terms for terminology consistency

> The full list is in `templates/glossary.md`. The most frequent forbidden aliases:

| Forbidden word | Correct term | Reason |
|--------|---------|---------|
| transferal | Transfer | Non-standard variant, easily confused |
| fund move | Transfer | Colloquial, non-standard |
| daily limit | Daily Cumulative Limit | Ambiguous abbreviation |
| txn limit | Single Transaction Limit | Ambiguous abbreviation |
| account check | Reconciliation | Colloquial, non-standard |
| serial number | Transaction ID | Ambiguous (can also mean a batch number) |
| batch transfer | Batch Disbursement | Confuses transfer and disbursement |
| batch debit | Batch Deduction | Colloquial |
| international transfer | Cross-border Remittance | Colloquial; cross-border payments require a SAFE declaration |
| over-recorded | Excess Record | Colloquial, not a standard reconciliation term |
| under-recorded | Short Record | Colloquial, not a standard reconciliation term |
| wrong posting | Wrong Account | Too generic; wrong account is a specific type |
| security deposit | Reserve Fund | Different concept: a security deposit is collateral, a reserve fund is customer money |
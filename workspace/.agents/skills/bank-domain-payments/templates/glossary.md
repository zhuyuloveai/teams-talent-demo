# Payments Domain Glossary

> This glossary is the unified terminology standard for the payments domain. Every payment term in Agent outputs must match this table; aliases are forbidden.

## How to use

- Terminology consistency is checked automatically by `scripts/term_check.py` (case-insensitive, whole words)
- New terms are registered as to be confirmed and added after business architecture confirmation
- Words in the alias column are **forbidden** in outputs; `term_check.py` raises a hit for them
- L3 fields: alias table (forbidden aliases and reasons) + source (source of the term/constraint)

## Core terms

| Term | Definition | Alias (forbidden) | Source |
|------|------|-------------|------|
| Transfer | Movement of funds between accounts | transferal, fund move | Internal business terminology standard |
| Daily Cumulative Limit | Maximum cumulative transfer amount per day | daily limit | Internal limit management measures |
| Single Transaction Limit | Maximum amount of one transaction | txn limit | Internal limit management measures |
| Annual Cumulative Limit | Maximum cumulative transfer amount per year | annual limit | Internal limit management measures |
| Clearing | Aggregating transaction data and calculating net fund amounts | - | CNAPS specification |
| Settlement | Actual exchange of funds | - | CNAPS specification |
| Reconciliation | Checking that transaction records and accounting records agree | account check | Internal reconciliation management measures |
| Reversal | Full offset of a completed transaction | - | PBOC payment system operating rules |
| Posting | Reflecting a fund movement in the account balance | - | Basic accounting standards |
| Transaction ID | Globally unique transaction identifier | serial number | Internal coding standard |
| Reference Number | Auxiliary identifier at channel/batch level | - | Internal coding standard |
| Risk Control | Assessing and controlling transaction risk | - | Internal risk management measures |
| Batch Disbursement | Paying funds to many accounts in a batch | batch transfer | Internal business terminology standard |
| Batch Deduction | Debiting many accounts in a batch | batch debit | Internal business terminology standard |
| Agreement Payment | Automatic debit under a signed agreement | - | Regulations on Non-Bank Payment Institutions |
| Cross-border Remittance | Cross-border fund movement | international transfer | SAFE regulations |
| Excess Record | We have a record, the other party does not | over-recorded | Internal reconciliation management measures |
| Short Record | The other party has a record, we do not | under-recorded | Internal reconciliation management measures |
| Wrong Account | The record is correct but booked to the wrong account | wrong posting | Internal reconciliation management measures |
| Reserve Fund | Reserve that a payment institution deposits with the central bank | security deposit | Regulations on Non-Bank Payment Institutions |

## Easily confused terms

> These terms have different meanings; choose the right one from the context. `term_check.py` does not block them (they are all valid terms), but reviews must confirm they are used correctly.

| Term A | Term B | Difference | Common mistake |
|------|------|------|---------|
| Clearing | Settlement | Clearing = doing the sums (net calculation); settlement = paying the money (fund movement) | Writing "clearing" for "settlement" or the other way round |
| Reversal | Cancellation | Reversal = offset after the transaction (SUCCESS->REVERSED); cancellation = cancel before the transaction (INIT->CANCELLED) | Using "cancellation" instead of "reversal" for a completed transaction |
| Return | Refund | Return = funds go back along the original route (automatic); refund = an actively initiated repayment | Calling an automatic return a refund |
| Deduction | Debit entry | Deduction = business action; debit entry = accounting term | Using "debit entry" in business documents |
| Excess Record | over-recorded | Excess record = reconciliation difference type; over-recorded = non-standard colloquial | Using "over-recorded" instead of "excess record" |

## State terms

| Term | Definition | Allowed next states |
|------|------|-------------|
| INIT | Created, not submitted | PENDING, CANCELLED |
| PENDING | Submitted, awaiting risk control | PROCESSING, REJECTED |
| PROCESSING | Risk passed, processing | SUCCESS, FAILED, TIMEOUT |
| SUCCESS | Transaction succeeded | REVERSING |
| FAILED | Transaction failed (retryable) | PENDING |
| REJECTED | Rejected by risk control (not retryable) | Final state |
| TIMEOUT | Timed out, unconfirmed | SUCCESS, FAILED |
| REVERSING | Reversal in progress | REVERSED, FAILED |
| REVERSED | Reversed | Final state |
| CANCELLED | Cancelled | Final state |

## Limit terms

| Term | When checked | Level |
|------|---------|------|
| Single Transaction Limit | When the transaction is initiated | L1 |
| Daily Cumulative Limit | When the transaction is initiated | L2 |
| Annual Cumulative Limit | When the transaction is initiated | L3 |
| Channel Limit | When the transaction is initiated | L4 |
| Customer Tier Limit | When the transaction is initiated | L5 |

> Limit check order: L1 -> L2 -> L3 -> L4 -> L5 (short-circuit evaluation; reject as soon as one fails)

---

## L3 required depth fields

| Field | Requirement | Example |
|------|------|------|
| Alias table | Forbidden aliases and reasons | transferal (non-standard variant), fund move (colloquial) |
| Source | Source of the term/constraint | CNAPS specification, internal management measures |
| Definition | One-sentence business definition | Transfer: movement of funds between accounts |
| Level | Check level of limit terms | L1/L2/L3/L4/L5 |
# REQ-2026-004 · Business Rules and Scope

Source: user-provided requirement v1.0. The chapters below are quoted in full from the source; values are used according to their simulated status in the source material.

## 3. Scope definition

### 3.1 In-Scope / Out-of-Scope

**In-Scope**

- Raise a dispute from the transaction details (reason code, description, amount, evidence files).
- Case progress, document supplement, case withdrawal.
- Back-office case workbench: intake, review, provisional credit, chargeback, closing.
- Integration with transaction, document, account, notification, audit.
- Deadline reminders: 1 business day for intake, 30 days for chargeback.

**Out-of-Scope**

- Direct connection to card scheme arbitration networks and automatic message exchange.
- Fraud investigation (deep integration with fraud-service).
- Multi-currency dispute conversion.

### 3.2 Assumptions and dependencies

| ID | Assumption/Dependency | Description |
|------|----------|------|
| A-01 | dispute-service already has the `dispute_case` table and a basic state machine | This requirement extends the fields and states |
| A-02 | Transaction snapshots are provided read-only by transaction-service | Disputes rely on the transaction snapshot and do not modify the original transaction |
| A-03 | Evidence files are stored in document-service | This service stores only metadata |
| A-04 | Provisional credit goes through the account-service credit API | `creditId` is identical to `provisionalCreditId` |
| A-05 | Notifications use notification-service templates | Notification failures do not roll back case handling |

## 5. Business rules

| ID | Rule | Source | Priority | Verification point |
|------|------|------|--------|--------|
| BR-DSP-01 | Only posted transactions can be disputed; the transaction date must be ≤ 90 days from today | Simulated business confirmation | Must | A 91-day transaction returns `DISPUTE_NOT_ELIGIBLE`; a 90-day transaction can be disputed |
| BR-DSP-02 | Only one dispute in progress per transaction | Simulated business confirmation | Must | Open cases twice concurrently; only 1 in-progress record exists in `dispute_case` |
| BR-DSP-03 | Dispute amount > 0 and ≤ transaction amount | Simulated business confirmation | Must | Amount 0 and an amount above the transaction amount both return `INVALID_DISPUTE_AMOUNT` |
| BR-DSP-04 | Reason codes FRAUD/UNAUTHORIZED/DUPLICATE/SERVICE_NOT_RECEIVED/OTHER | Simulated business confirmation | Must | All 5 reason codes can be submitted; an illegal value returns 400 |
| BR-DSP-05 | FRAUD/UNAUTHORIZED requires at least 1 piece of evidence | Simulated compliance | Must | Submission without evidence returns `EVIDENCE_REQUIRED` |
| BR-DSP-06 | Provisional credit requires review approval and an amount ≤ dispute amount; only one credit per case | Simulated funds policy | Must | A repeated credit returns the first result and the account balance increases only once |
| BR-DSP-07 | Case states: OPEN→UNDER_REVIEW→PROVISIONAL_CREDIT→CHARGEBACK→WON/LOST→CLOSED | Simulated business confirmation | Must | An illegal transition returns `INVALID_DISPUTE_STATE` |
| BR-DSP-08 | Customers can withdraw only in OPEN/UNDER_REVIEW; a case already provisionally credited requires supervisor confirmation | Simulated business confirmation | Should | Withdrawal of a `PROVISIONAL_CREDIT` case requires a supervisor token, otherwise 403 |
| BR-DSP-09 | All state transitions, evidence, and amount changes are audited; evidence access is recorded | Simulated compliance | Must | Audit events cover 5 kinds of action; evidence downloads produce access records |

# REQ-2026-001 · Business Rules and Scope

Source: user-provided requirement v1.0. The chapters below are quoted in full from the source; values are used according to their simulated status in the source material.

## 3. Scope Definition

### 3.1 In-Scope / Out-of-Scope

**In-Scope**

- Single-purchase installment (3/6/12 periods) and statement installment (3/6/12 periods).
- Calculation and preview of period count, fee rate, fees, per-period principal, and per-period fees.
- Installment plans, repayment schedules, early settlement.
- Front-end entry points, plan page, back-office query.
- Integration with transaction, account, billing, ledger, notification, and audit.

**Out-of-Scope**

- Merchant subsidies, zero-fee campaigns, combined installments.
- Overdue penalty interest and credit bureau reporting (the existing statement and collections flows are reused).
- Multi-currency installments.

### 3.2 Assumptions and Dependencies

| ID | Assumption/Dependency | Description |
|------|----------|------|
| A-01 | The transaction has been posted by transaction-service and marked `POSTED` | Installment eligibility requires this status |
| A-02 | The installment-eligible statement amount is calculated and provided by billing-service | Statement calculation logic is not changed in this phase |
| A-03 | Limit reservation and release are completed through account-service | Changes affecting balances are never written directly by this service |
| A-04 | Fee income is posted to ledger-service | The existing fee accounts are reused |
| A-05 | Notifications use notification-service templates | Notification failures do not roll back the installment main flow |

## 5. Business Rules

| ID | Rule | Source | Priority | Verification point |
|------|------|------|--------|--------|
| BR-INS-01 | Single-purchase installment amount ≥ 100.00; statement installment ≥ 500.00 | Simulated business confirmation | Must | 99.99 is rejected with `INSTALLMENT_NOT_ELIGIBLE`; 100.00 can be submitted |
| BR-INS-02 | Only 3/6/12 periods; monthly fee rate 0.60%/0.55%/0.50% | Simulated pricing | Must | Preview results for the three period options match the pricing table item by item; other period counts return `INVALID_TERM` |
| BR-INS-03 | Per-period principal = principal/periods, with the last period absorbing the rounding residual; fees are charged as remaining principal × monthly fee rate, HALF_UP to 2 decimals | Simulated pricing | Must | 1000.00 over 6 periods: 166.66 per period, 166.70 for the last period, total = 1000.00 |
| BR-INS-04 | The same transaction or the same statement can be successfully installed only once; the deduplication key is unique | Simulated business confirmation | Must | Duplicate submissions return the same plan number and the `installment_plan` count does not change |
| BR-INS-05 | The limit occupied by an installment = remaining principal; early settlement releases it | Simulated business confirmation | Must | After plan creation the account installment occupation = 1000.00; after settlement it returns to zero |
| BR-INS-06 | Overdue, disputed, or already installed transactions cannot be installed | Simulated risk policy | Must | The entry is greyed out for these three transaction types, and calling the API directly returns `INSTALLMENT_NOT_ELIGIBLE` |
| BR-INS-07 | Early settlement charges a penalty fee of 1% of the remaining principal; fees already collected are not refunded | Simulated pricing | Should | With a remaining principal of 600.00 the penalty fee is 6.00 and `settlementTotal` = 606.00 minus the fee rebate |
| BR-INS-08 | A plan takes effect at T+1 after creation, and the first period falls into the next statement | Simulated business confirmation | Must | When the creation date is D, the first due date falls in a statement cycle after D+1 |

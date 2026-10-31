# REQ-2026-002 · Business Rules and Scope

Source: user-provided requirement v1.0. The chapters below are quoted in full from the source; values are used according to their simulated status in the source material.

## 3. Scope Definition

### 3.1 In-Scope / Out-of-Scope

**In-Scope**

- Card loss reporting (immediate hold), replacement requests, replacement progress, replacement tickets.
- Replacement fee (simulated 50.00) charged to the account.
- New card number generation and old card invalidation, notifications, audit.
- Front-end card details, loss reporting wizard, progress page; back-office replacement queue.

**Out-of-Scope**

- Real-time courier tracking (only the tracking number and mailing status are recorded).
- Overseas emergency replacement, temporary virtual cards.
- Handling disputed transactions after a loss report (see REQ-2026-004).

### 3.2 Assumptions and Dependencies

| ID | Assumption/Dependency | Description |
|------|----------|------|
| A-01 | card-service provides the card state machine and supports the `LOST` status | This requirement extends state transitions and does not create a card table |
| A-02 | Fees are posted through the `FEE` batch of transaction-service | The replacement fee does not use a separate charging channel |
| A-03 | Account balance changes are completed by account-service | The replacement fee affects the available balance and the general ledger |
| A-04 | Tracking numbers are filled in manually by card production operations | No courier API integration in this phase |
| A-05 | Notifications use notification-service templates | Notification failures do not roll back loss reporting or replacement |

## 5. Business Rules

| ID | Rule | Source | Priority | Verification point |
|------|------|------|--------|--------|
| BR-LOST-01 | Only `ACTIVE` cards can be reported lost; already lost/held/closed cards return 409 | Simulated business confirmation | Must | Calling the loss reporting API for all three non-ACTIVE card types returns `CARD_NOT_ACTIVE` |
| BR-LOST-02 | Loss reporting cannot be undone; replacement can be cancelled (before card production) | Simulated business confirmation | Must | The loss reporting API has no undo path; cancelling after `SHIPPED` returns `REPLACEMENT_NOT_CANCELLABLE` |
| BR-LOST-03 | Replacement fee 50.00, free for platinum cards; the fee is charged to the account | Simulated pricing | Must | Platinum card `feeStatus=WAIVED`; gold/classic cards post a 50.00 FEE |
| BR-LOST-04 | Replacement generates a new card number and the old card is permanently invalidated; the new card cannot be used for transactions before activation | Simulated business confirmation | Must | Authorization on the old card number is declined; transactions on the new card are declined before `ACTIVATED` |
| BR-LOST-05 | Replacement ticket statuses: REQUESTED→CARD_PRODUCED→SHIPPED→ACTIVATED/CANCELLED | Simulated business confirmation | Must | Invalid transitions are rejected with `INVALID_STATE_TRANSITION` |
| BR-LOST-06 | Only one replacement ticket in progress per card at a time | Simulated business confirmation | Must | With two concurrent requests, `card_replacement` has only 1 record in progress |
| BR-LOST-07 | Loss reporting/replacement must write an audit record (actor, masked card number, reason) | Simulated compliance | Must | The audit event contains the actor, maskedCardNumber, and reason fields |

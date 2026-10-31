# Acceptance Cases for the Benefit Entry and Description Page

These are case definitions still to be executed; there are no execution records, pass conclusions or security scan reports. The specific expectations follow the PRD confirmed for the current task. When isolated eligibility input is used, note the fixture source in the report; do not claim that a real platinum eligibility service is connected.

| Case | Input and action | Expectation to verify |
| --- | --- | --- |
| Platinum entry | Provide a platinum customer under the confirmed eligibility contract and open the card details | "Spending cashback benefit" is visible and opens the description page |
| Non-platinum entry | Provide a customer who is clearly non-platinum under the same contract | The entry is not shown; direct access to the description path is handled as the PRD specifies |
| Unknown eligibility | Field missing, read failure, or contract not configured | The tier is not guessed; show/hide/retry behavior matches what the PRD states |
| Benefit copy | View eligible customers, period and rate | Platinum card, next 3 months and an extra 0.5% respectively; the extra rate is not presented as the total rate |
| Open items | View the policy description | Start date, spending scope, cap, rounding, crediting time and refund treatment each stay "To be confirmed"; no invented dates or amounts appear |
| Back and refresh | Details -> description -> back, refresh/deep link | The matching card context is kept, no other card's data is shown, and errors show a clear message |
| Narrow screen and accessibility | Narrow screen, long description, keyboard access | No horizontal overflow; entry and back are focusable; confirmed/to-be-confirmed content has a clear hierarchy |
| Content safety | Display data containing HTML special characters | Correctly escaped, injected content is not executed; sensitive values such as CVV/token are never shown |
| No fund side effects | Only open/refresh/go back on the description page | No enrollment, transaction, reward evaluation or posting write requests are sent; amounts and reward status do not change |

Review checks scope, the eligibility data source and the existing static web structure; unit/integration verification covers the input boundaries above; the security check states the actual/preset source. A blocking failure cannot be offset by another passing case; after the Owner returns the work, it is verified again under the existing gates.

Owner acceptance checklist: PRD, design, code PR/commit, unit tests and functional/Review/security reports of the same version, issues and retests, handling of open items. Pass or return is recorded explicitly by the Owner; this case file cannot produce an acceptance result in advance.

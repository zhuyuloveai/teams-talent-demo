# Platinum Card Spending Cashback Benefit Page: Display Rules

This material belongs to the requirement with the same name in the Credit Card project. It is input for requirement clarification and implementation, not a confirmed PRD, an executed check or an accepted result. If the actual task description adds, removes or conflicts with anything here, confirm with the Owner first; do not claim this material has been adopted just because the title matches.

## Confirmed business and display scope

- Add a "Spending cashback benefit" entry to the credit card details. It is visible to platinum card customers and hidden for customers confirmed as non-platinum.
- The description page shows eligible customers, period and rate separately: platinum card, next 3 months, extra 0.5%. The extra rate must be clearly distinguished from the base benefit; do not turn "extra" into the total cashback rate.
- Confirmed and to-be-confirmed content are shown in separate groups. The start date is not set, so "next 3 months" can only describe the period; do not calculate start/end dates, show a countdown or promise an end date.
- This delivery includes only the benefit entry and the description page. It adds no campaign enrollment, marketing eligibility execution, cashback calculation, reward evaluation or posting.

## Boundaries and error cases

"Not a platinum card" and "eligibility data missing" are different cases. The current card API has no platinum tier field, so the eligibility source and the display when it is missing must be stated in the PRD/design. A missing value must not be treated as eligible, and the platinum tier must not be inferred from the card number, embossed name or activeStatus.

The campaign start date, spending scope, cashback cap, amount rounding, crediting time and refund treatment are not confirmed yet. The description page must state them as "To be confirmed"; do not show promises derived from existing campaign seed values, the system clock or marketing calculation defaults.

## Handoff across the four nodes

Requirement clarification produces the PRD (goals, scope, rules, acceptance criteria, open questions); Feature development produces the design, code PR/commit and unit tests; verification produces the functional, Review and security reports plus issue retests; the Owner performs manual acceptance against the same PRD/code version. This document does not replace those new task artifacts.

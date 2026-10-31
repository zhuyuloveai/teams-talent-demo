# Platinum card extra spending cashback

Confirmed scope: platinum card customers, a 3-month spending period, an extra 0.5% cashback.

The local flow parameters are for verifying product interaction; they are not approved formal campaign policy:
- Start and end: 2026-11-01 00:00:00 +08:00 (inclusive) to 2027-02-01 00:00:00 +08:00 (exclusive).
- Amounts are calculated in whole cents; the extra cashback is 1/200 of the purchase amount, rounding half a cent up to a whole cent.
- A CNY 120.00 platinum card purchase earns an extra CNY 0.60 cashback; the original balance owed of CNY 2550.75 becomes CNY 2670.15.
- Standard cards and purchases outside the period do not qualify; invalid amounts or amounts that are not a positive whole number of cents are rejected.
- This scope has no enrollment step; spending categories, thresholds, caps and refund rules are not defined, and you cannot infer from this that the formal policy has no limits.

The current executable rule is in teams/src/cashback.ts, and the flow state is in teams/src/domain.ts.
Static check records are fixtures for the complete delivery workflow; they do not mean a real iCode session, Java service tests or a model evaluation has run.

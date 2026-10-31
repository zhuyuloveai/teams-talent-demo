# Open Questions Checklist and Terms

This checklist records questions; it does not decide open items in advance. Each item in the PRD should have a confirmer, a conclusion/basis, or an explicit "To be confirmed" status.

| Item | Current status | Must not be inferred |
| --- | --- | --- |
| Start date | To be confirmed | Do not default to starting from today, the enrollment date, the card opening date or a fixed seed date |
| Spending scope | To be confirmed | Do not assume all merchants, all currencies or all transaction types qualify |
| Cashback cap | To be confirmed | Do not assume no cap, a per-transaction/daily/monthly cap, or the cap of an old campaign |
| Amount rounding | To be confirmed | Do not assume round-half-up, truncation or a precision rule |
| Crediting time | To be confirmed | Do not promise real time, next day, statement date or a fixed number of business days |
| Refund treatment | To be confirmed | Do not define cashback reversal, reversal order or partial refund ratios yourself |
| Platinum eligibility source | API gap, to be confirmed | CardResponse has no cardType/tier/eligibility field; do not guess from card number, name or status |
| Eligibility missing/read failure | Page behavior to be confirmed | Do not treat an unreadable value as platinum or non-platinum; a conservative message and retry interaction must be decided |

"Platinum card" describes customer eligibility; "next 3 months" describes a period that has no start basis yet; "extra 0.5%" is the extra benefit rate. This change only explains the benefit; it performs no payment, reward or accounting processing after an eligibility decision.

The actual task description is a separate, independent input. If the description was changed at creation, for example to a different rate, this document is still only a reference for this scenario and cannot override that description; list the difference as an open question before forming the PRD.

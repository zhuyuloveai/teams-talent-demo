# Banking Business Glossary (Payments)

> This glossary is a reference for writing requirements and keeps terms consistent. Where it differs from the bank's internal standard glossary, the internal standard prevails.

## Core concepts

| Term | Abbreviation | Definition |
|------|----------|------|
| Payment | - | The process of moving funds from the payer to the payee to discharge a debt |
| Clearing | - | Sorting transaction instructions and calculating the amounts receivable and payable (no actual movement of funds) |
| Settlement | - | Moving funds according to the clearing result to discharge the obligations |
| Netting | - | Offsetting receipts and payments and settling the net amount |
| Gross Settlement | - | Each transaction is settled individually in full |
| Net Settlement | - | Transactions over a period are netted and the net amount is settled |

## Payment methods

| Term | Abbreviation | Definition |
|------|----------|------|
| Transfer / Remittance | - | Movement of funds initiated by the payer |
| Direct Debit | - | The payee debits the payer's account under an authorization |
| Collection | - | The payee instructs a bank to collect funds from the payer |
| Bill / Note | - | Payment instruments such as bills of exchange, promissory notes and cheques |
| Card Payment | - | Payment by bank card such as debit or credit card |
| Third-party Payment | - | Payment services provided by non-bank payment institutions |
| Cross-border Payment | - | Movement of funds between countries/regions |

## Transaction statuses

| Term | Abbreviation | Definition |
|------|----------|------|
| Pending | - | The transaction is received and awaits further confirmation |
| Processing | - | The transaction is being processed |
| Success | - | Processing is complete and the funds have moved |
| Failed | - | Processing failed and the funds did not move |
| Cancelled | - | The transaction was cancelled (before success) |
| Reversed | - | A successful transaction was reversed |
| Refunded | - | The amount was refunded in full or in part |
| Timeout | - | No final result was received within the defined time |
| Suspicious | - | The transaction status is unclear and needs manual confirmation |

## Accounts

| Term | Abbreviation | Definition |
|------|----------|------|
| Internal Account | - | Account used for the bank's internal bookkeeping |
| Customer Account | - | Account a customer opens at the bank |
| Inter-bank Account | - | Account used for fund movements between banks |
| Clearing Account | - | Dedicated account used for clearing |
| Reserve Account | - | Customer reserve account that a payment institution holds at a bank |

## Security and risk control

| Term | Abbreviation | Definition |
|------|----------|------|
| Anti-Money Laundering | AML | Measures to prevent money laundering |
| Large Transaction | - | A transaction at or above the defined amount; must be reported |
| Suspicious Transaction | - | A transaction suspected of money laundering; must be reported |
| Know Your Customer | KYC | The procedure for verifying a customer's identity |
| Real-name System | - | Accounts and transactions must use a real identity |
| Two-factor / Multi-factor Authentication | 2FA / MFA | Identity verification using two or more methods |
| Transaction Limit | - | Limit on the amount/count of transactions per transaction, day or month |
| Risk Rating | - | Assigning a risk level to a customer/transaction |

## Regulation and compliance

| Term | Abbreviation | Definition |
|------|----------|------|
| Payment System Supervision | - | Supervision of payment systems by the central bank |
| NetsUnion Clearing Corporation | NUCC | Online payment clearing platform for non-bank payment institutions |
| China UnionPay | CUP | China's bank card association |
| People's Bank of China | PBOC | The central bank of China |
| China Banking and Insurance Regulatory Commission | CBIRC | China's banking and insurance regulator |
| Order No.2 | - | Measures for the Administration of Payment Services Provided by Non-Financial Institutions |
| Personal Information Protection Law | PIPL | Personal Information Protection Law of the PRC |
| Data Security Law | DSL | Data Security Law of the PRC |

## Systems

| Term | Abbreviation | Definition |
|------|----------|------|
| Core Banking System | - | System that handles core banking business such as deposits, loans and settlement |
| Payment System | - | System that handles payment business |
| Clearing System | - | System that handles clearing |
| General Ledger | GL | General ledger system; the core of financial accounting |
| Middleware Platform | - | Platform for intermediary business such as collection and payment agency |
| Channel System | - | Front-end channels such as internet banking, mobile banking and branch counters |
| Enterprise Service Bus | ESB | Integration bus between systems |
| Operational Data Store | ODS | Near-real-time aggregated operational data |

> Note: these are general terms. A specific project must calibrate and extend them against the bank's internal standard glossary.

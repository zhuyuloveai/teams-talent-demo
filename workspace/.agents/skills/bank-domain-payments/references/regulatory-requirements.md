# Regulatory Rules Quick Reference

## 1. Limit regulation

| Rule | Source | System requirement |
|------|------|---------|
| Internet banking transfers CNY 50,000 per transaction / CNY 200,000 per day | Default values in the Electronic Payment Guidelines | Adjustable parameters; must not exceed the regulatory cap |
| Large-value transactions of CNY 50,000 reported | Measures for Reporting Large-Value Transactions by Financial Institutions | Report triggered when the transaction completes |
| Customer tier limits | Internal risk management policy | Adjusted dynamically by customer risk level |

## 2. Anti-money laundering

| Rule | Source | System requirement |
|------|------|---------|
| Large-value transaction report | PBOC Order [2018] No. 2 | Single/cumulative ≥ CNY 50,000, reported on T+1 |
| Suspicious transaction report | Measures for Reporting Suspicious Transactions by Financial Institutions | Real-time screening by the rules engine; reported after manual review |
| Blacklist screening | UN / Ministry of Foreign Affairs sanctions lists | Real-time matching before the transaction; blocked on a hit |
| Customer identification | Anti-Money Laundering Law, Article 16 | KYC verification before account opening / large-value transactions |
| Retention of transaction records | Anti-Money Laundering Law, Article 19 | Kept for at least 5 years, tamper-proof |

## 3. Data security

| Rule | Source | System requirement |
|------|------|---------|
| Masking of personal information | Personal Information Protection Law, Article 51 | Masked on display, encrypted at rest |
| Data classification and grading | Data Security Law, Article 21 | Labeled by classification level with access control |
| Cross-border data transfer | Personal Information Protection Law, Article 38 | Cross-border transfer requires a security assessment or certification |
| Critical information infrastructure | Regulations on the Security Protection of Critical Information Infrastructure | MLPS level 3 or above |

## 4. Payment clearing

| Rule | Source | System requirement |
|------|------|---------|
| CNAPS high-value real-time | PBOC payment system operating rules | Business days 8:30-17:00, credited in real time |
| CNAPS low-value batch | PBOC payment system operating rules | 7×24, batch processing by session |
| Internet banking interconnection | Super Internet Banking specification | 7×24, credited in real time, CNY 50,000 per transaction |
| Cross-border remittance | SAFE regulations | Declaration required, enhanced AML screening |

## 5. Regulatory citation format

When citing a regulatory requirement in a requirement/design document, use the standard format:

```
[Regulation reference] Article number Article summary
```

Examples:
- `[PBOC Order [2018] No. 2] Article 8 Financial institutions shall report a large-value transaction within 5 business days of the date it occurs`
- `[Personal Information Protection Law] Article 51 Processors shall apply security measures such as encryption and de-identification to personal information`

> Citations must be traceable to the original text. Generic citations are forbidden (for example "according to regulatory requirements" must be replaced by the specific reference and article).
# Regulatory Requirement Mapping (Common for Bank Payments)

> This mapping lists regulatory requirements common to bank payment systems, for reference when writing requirements.
> For a specific project, use the latest regulatory documents and internal bank policies; the official documents prevail.

## Main regulatory sources

| Category | Name | Reference / issuer | Core requirement |
|------|------|---------|---------|
| Payment business | Regulations on Non-Bank Payment Institutions | State Council Order | Payment institution licensing, business rules, customer rights protection |
| Payment business | Payment and Settlement Measures | PBOC | Basic payment and settlement rules |
| Payment systems | Measures for the Supervision and Administration of Payment Systems | PBOC | Payment system access, operation, supervision |
| Anti-money laundering | Anti-Money Laundering Law of the PRC | Presidential Order | Basic AML framework |
| Anti-money laundering | Anti-Money Laundering Provisions for Financial Institutions | PBOC | AML obligations of financial institutions |
| Anti-money laundering | Measures for Reporting Large-Value and Suspicious Transactions by Financial Institutions | PBOC | Reporting criteria for large-value and suspicious transactions |
| Personal information | Personal Information Protection Law of the PRC | Presidential Order | Rules for processing personal information, rights protection |
| Data security | Data Security Law of the PRC | Presidential Order | Data security framework, data protection obligations |
| Cybersecurity | Cybersecurity Law of the PRC | Presidential Order | Multi-level protection scheme, operator obligations |
| Critical infrastructure | Regulations on the Security Protection of Critical Information Infrastructure | State Council Order | Security protection of critical information infrastructure |
| Consumer rights | PBOC Implementation Measures for the Protection of Financial Consumers' Rights | PBOC | Protection of financial consumers' rights |
| Account management | Measures for the Administration of RMB Bank Settlement Accounts | PBOC | Opening, use, change and closure of bank settlement accounts |
| Electronic banking | Measures for the Administration of Electronic Banking Business | CBIRC | E-banking licensing, risk management, data exchange |

## Summary of core regulatory requirements for payments

### Customer identification (KYC)
- Customer identification is mandatory when opening accounts and handling business
- Know your customer (KYC): basic identity information, occupation, purpose of transactions, source of funds
- Retention of customer identity data and transaction records: at least 5 years after the business relationship ends
- Customer risk rating; enhanced due diligence for high-risk customers

### Large-value and suspicious transaction reporting
- Large-value transaction criteria (see the latest rules for the amounts):
  - Single or cumulative RMB transactions on one day reaching the defined amount
  - Foreign currency equivalent reaching the defined amount
  - Cross-border fund transactions
- Suspicious transactions: anomalies in customer behavior, transaction purpose, source of funds, etc.
- Reporting deadline: large-value transactions within 5 business days of the transaction date; suspicious transactions reported promptly

### Transaction security
- High-risk operations require two-factor authentication
- Transaction limit management (per transaction, daily cumulative, monthly cumulative)
- Transaction confirmation (second confirmation for important transactions)
- Non-repudiation (digital signature / operation trail)

### Data security
- Classified, graded protection of personal financial information
- Encrypted storage and transmission of sensitive data
- Data masking (display, export, development and test environments)
- Data access control and audit
- Cross-border data transfer requires a security assessment

### Segregation of duties (SoD)
- Business operations are separated from review and approval
- Transaction entry is separated from verification
- System administration is separated from business operations
- Incompatible roles cannot be held by one person

### Audit and trail
- Every key operation must be recorded in the audit log
- The audit log contains: operator, time, operation type, operation content, result, IP address
- Audit logs are kept for at least 5 years (longer for some businesses)
- Audit logs cannot be modified or deleted

> **Important**:
> 1. The above is a general summary; the latest official documents prevail for specific requirements
> 2. Internal bank policies are usually stricter than regulation; requirements follow the internal policies
> 3. New businesses / new products must pass a compliance review
> 4. Regulatory requirements change and must be recalibrated regularly

# Requirement Writing Guide

## Basic principles

### 1. Testable
Every requirement must be verifiable. Do not say "the system should be fast"; say "95% of transactions respond in under 2 seconds".

### 2. Unambiguous
A term means the same thing throughout the document. Avoid vague wording such as "roughly", "possibly", "as far as possible". If something truly cannot be confirmed, mark it [To be confirmed] and follow up.

### 3. Traceable
Every functional requirement has a unique ID (REQ-xxx), every business rule has a unique ID (BR-xxx), and each one can be traced to its source.

### 4. Complete
Cover every dimension (functions, data, interfaces, non-functional, compliance, operations) without gaps. Sections that do not apply say N/A with the reason.

## Requirement writing checklist

### Document structure
- [ ] Document information complete (ID, version, author, date, status)
- [ ] Revision history complete
- [ ] Glossary defines terms (if there are industry terms / abbreviations)
- [ ] Referenced documents have links or IDs

### Content quality
- [ ] Background and goals explain "why we do it"
- [ ] Scope boundaries are clear, with an explicit out-of-scope list
- [ ] Every functional requirement can be understood and verified on its own
- [ ] Input and output fields are complete (type, length, rules, required)
- [ ] All exception scenarios are covered
- [ ] Business rules are well organized with nothing missing
- [ ] Every business rule cites its source
- [ ] Non-functional requirements are quantified and verifiable
- [ ] The interface list is complete, with protocols and formats
- [ ] Data security levels and masking rules are explicit
- [ ] Every risk has a mitigation
- [ ] Compliance requirements are annotated

### Format rules
- [ ] ID format: REQ-xxx, BR-xxx
- [ ] Consistent terms: the same terms are used throughout
- [ ] No ambiguous vague words (or they are marked [To be confirmed])
- [ ] Consistent table format
- [ ] Clear list hierarchy

## Bank-specific points

### Regulatory compliance
- Requirements that involve regulation must cite the regulation reference
- Regulatory requirements are turned into concrete functional/non-functional requirements
- Audit requirements are explicit (what is audited, how long it is kept, who can see it)

### Data security
- Sensitive data such as customer and transaction information must have a security level
- State the encryption requirements explicitly (in transit / at rest)
- State the masking rules explicitly (display masking, export masking)

### Segregation of duties (SoD)
- Operations involving several roles must have an SoD matrix
- Key operations (transactions, approvals, configuration changes) must be double-checked by two people
- Data entry and approval cannot be done by the same person

### Transactions and accounting
- Transactions must be idempotent (a duplicate submission does not create a duplicate transaction)
- Accounting must have complete debit and credit records
- Error handling must have a clear process and approval

## Common problems and solutions

| Problem | Symptom | Solution |
|------|------|---------|
| Requirement too coarse | Says what to do, but not how or to what extent | Break it down; add inputs, outputs, rules and exceptions |
| Ambiguous requirement | Different people read it differently | Use precise terms, define a glossary, give examples |
| Missing exception flows | Only the happy path; nothing on what happens when it fails | Check by exception category: input error / system failure / network error / data inconsistency |
| Missing business rules | Describes the function but not the validation rules or calculation logic | Go through the business rules one by one and cite sources |
| Hollow NFRs | "Must be high performance", "must be secure" | Quantify, give metrics, state the verification method |
| Scope creep | The requirement keeps growing while it is being written | State in/out of scope explicitly; changes go through the change process |

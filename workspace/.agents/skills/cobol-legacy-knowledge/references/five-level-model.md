# Five-Level Business Model

## Table of Contents

1. [What the model is](#what-the-model-is)
2. [Level definitions](#level-definitions)
3. [What to extract at each level](#what-to-extract-at-each-level)
4. [Traceability](#traceability)
5. [Worked example for a payment subsystem](#worked-example-for-a-payment-subsystem)

## What the model is

The full-stack five-level model is the analysis method used in Chinese banking core-system rebuild projects to decompose a system from business intent down to technical implementation. Applied to COBOL extraction, it turns source code into a layered, traceable knowledge model of the **As-Is** system:

| Level | Name |
|---|---|
| L1 | Business Model |
| L2 | Domain Model |
| L3 | Process Model |
| L4 | System Model |
| L5 | Implementation Model |

The model is built **bottom-up (L5 to L1)** so every statement at a higher level is supported by evidence from a lower level. It is As-Is: it describes what the legacy code actually does today, not what a target architecture should do.

## Level definitions

### L1 - Business Model

Answers "what business does this subsystem support, and where are its boundaries?"

- Business capabilities the subsystem provides (e.g., payment acceptance, payment validation, settlement)
- Macro processes the subsystem participates in (e.g., customer payment lifecycle, end-of-day processing)
- Domain boundaries: what belongs to this subsystem and what belongs elsewhere

### L2 - Domain Model

Answers "what are the core business objects and how do they relate?"

- Business entities/objects (e.g., Customer, Payment Transaction, Account, Payment Limit)
- Attributes of each entity (from record layouts, DDS fields, SQL columns)
- Relationships (e.g., Customer has Transactions; Transaction references an Account)
- Ubiquitous language: the business terms the code uses, including 88-level values and status codes

### L3 - Process Model

Answers "how is the business actually done, step by step?"

- Business flows implemented by programs (e.g., validate customer, check limit, post transaction)
- Activities and steps with their order and decision points
- Business rules that govern the flow (e.g., only active customers may pay; amounts above a limit are rejected)

### L4 - System Model

Answers "which programs and data stores implement the business?"

- Programs and modules with their responsibilities
- Call relationships between programs
- Data stores: DDS physical/logical files and SQL tables with their usage
- Interfaces: parameters passed between programs, files consumed/produced

### L5 - Implementation Model

Answers "how is it packaged, scheduled, and run on IBM i?"

- Batch jobs (CL programs) and what they orchestrate
- Scheduling context (nightly, end-of-day, event-triggered) from CL and comments
- Runtime topology: libraries, file overrides, job queues, message handling

## What to extract at each level

| Level | Extract from COBOL/400 evidence | Output artifacts |
|---|---|---|
| L1 | Subsystem name and purpose, capabilities implied by program families and copybook/file naming | Capability list, macro process list, domain boundary statement |
| L2 | Record layouts (copybooks, DDS), 88-level values, field names, SQL tables, field lineage links from the scanner | Entity list with attributes and relationships, ubiquitous language glossary |
| L3 | PROCEDURE DIVISION paragraphs, PERFORM flows, IF/EVALUATE conditions, error messages | Flow diagrams in text/Mermaid, activity lists, business rule catalog |
| L4 | PROGRAM-ID, FILE-CONTROL, FD, EXEC SQL, CALL graph, binding directories from scanner | Program inventory, module map, data store list, interface list |
| L5 | CL programs, OVRDBF, DCLF, MONMSG, batch comments | Batch job list, schedule notes, runtime topology |

## Traceability

Every element in the model must be traceable both ways:

- **Down**: an L3 flow must reference the L4 programs and L5 jobs that implement it
- **Up**: an L4 program must map to the L3 flow and L1 capability it serves
- **Evidence**: every L3-L5 element records its source (program, paragraph/section, line)

Represent traceability in the structured inventory as explicit entries, for example:

```json
{
  "from": "PROGRAM PAYMAIN",
  "to": "PROCESS payment-entry",
  "level_pair": "L4-L3"
}
```

If a program cannot be mapped to a business process, keep the mapping empty and mark it unresolved rather than guessing.

## Worked example for a payment subsystem

For a small payment subsystem with PAYMAIN (entry), PAYVAL (limit validation), PAYBATCH (settlement), CUSTMAS, TRANHST, LIMITF, and GLFILE:

| Level | Extracted knowledge |
|---|---|
| L1 | Capabilities: payment acceptance, payment validation, payment settlement. Boundary: payment operations, outside: general ledger ownership |
| L2 | Entities: Customer (CUSTMAS), Payment Transaction (TRANHST), Payment Limit (LIMITF), GL Entry (GLFILE). Statuses: customer A/C/D; transaction P/S/R |
| L3 | Flow: accept payment -> validate customer status -> check limit (PAYVAL) -> post pending transaction; nightly settlement flow: settle pending -> update account balance -> write GL entry |
| L4 | Programs PAYMAIN, PAYVAL, PAYBATCH; files CUSTMAS, TRANHST, TRANL01, LIMITF, GLFILE; table ACCTBAL; calls PAYMAIN -> PAYVAL, EODPAY -> PAYBATCH |
| L5 | Batch job EODPAY runs PAYBATCH nightly, overrides TRANHST with logical view TRANL01, sends completion/failure messages |

The same pattern applies to any banking subsystem: identify the entity-bearing files and copybooks first, then trace which programs read/write them and which business rules sit around those accesses.

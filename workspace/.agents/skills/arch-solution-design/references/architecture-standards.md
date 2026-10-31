# Architecture Standards and Design Input Boundaries

## Design inputs

A design may only be based on the following inputs; anything beyond them is "over-engineering":

1. The requirement specification (functional / non-functional / business rules)
2. Architecture standards and existing platform constraints
3. Legacy system knowledge (cobol-legacy-knowledge output)
4. Explicit regulatory and compliance requirements

## Template alignment

- The design document structure follows the EPS target architecture requirement specification (DDD): overall architecture → modules/services → interfaces → data → deployment → evolution
- ADRs use the common template: context / candidates / choice / rationale / consequences / evidence
- Every NFR is quantified; empty "met by default" answers are forbidden

## Key constraints

- Requirement coverage: every REQ must have a matching section in the design document
- Evidence: design conclusions cite requirement IDs, standard clauses or legacy evidence
- Compliance first: security, regulation and SoD are answered in the design phase, with nothing left outstanding
- Minimal design: solve only the problems within the requirement scope; add no extra complexity

## Pre-review self-check

- [ ] The requirement coverage matrix is complete
- [ ] Every ADR has alternatives and a rationale
- [ ] Every NFR is quantified
- [ ] The impact analysis is a separate document (owned by arch-impact-analysis)
- [ ] Cited evidence is complete

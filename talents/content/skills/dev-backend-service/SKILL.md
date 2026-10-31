---
name: dev-backend-service
description: "Implement business logic according to the bank backend architecture standards (DDD layering, microservices): Application layer → Domain layer → Infrastructure layer, including DTO mapping, business rule traceability, unified error codes, logging and interface implementation. Use for backend service / business logic layer development tasks."
---

## Metadata

| Item | Value |
|----|------|
| version | 1.0.0 |
| owner | Dev / Backend tech lead |
| category | Role skill |
| priority | P0 |
| depth | L2 |

# dev-backend-service skill

## Overview

This skill implements business logic with high quality according to the bank backend architecture standards.

## Workflow

1. Read the domain model and interface contract; identify aggregate roots / entities / value objects
2. Implement by layer: Application layer → Domain layer → Infrastructure layer
3. Define and map DTO / VO / Entity (consistent with the design)
4. Implement business rules (annotate each with its requirement / rule ID)
5. Exception handling and unified error codes
6. Logging instrumentation (key operations, sensitive data masked)
7. Database access (prevent SQL injection)
8. API implementation (REST / gRPC, with authentication)
9. Self-check: layer responsibilities, circular dependencies, standards scan

## Level switching rules

| Level | Trigger | Approval |
|------|---------|---------|
| L1 Draft | Layer skeleton discussion, domain model exploration, interface draft alignment | No review needed |
| L2 Standard (default) | Default level for bank production; backend service / business logic layer development tasks | Backend architecture review + tech lead sign-off |
| L3 Implementation | Involves fund safety / regulatory reporting / cross-system integration / first go-live / high-risk change | ARB / compliance review + all deep gates passed |

**Automatic upgrade to L3**: when the work involves fund transfers, account balance changes, limit parameters, regulatory reporting, cross-service transactions or write-back of production data, upgrade automatically from L2 to L3. L3 must pass every computable gate in the "Depth level (L3 Implementation)" section below.

## Depth level (L3 Implementation)

| Level | Requirement |
|------|------|
| L1 | Skeleton key points, for discussion |
| L2 | Standard review level (bank production default) |
| L3 | Adds the following depth on top of L2 (mandatory for high-risk / regulatory / complex integration) |

### L3 workflow additions

- At L3, output layered code + interface contract + unified error code mapping
- Annotate each business rule with its requirement / rule ID and list its unit test coverage points
- Transaction consistency: state the transaction boundary, isolation level and distributed transaction approach (Saga / TCC / eventual consistency); fund operations must include compensation and reversal paths
- Concurrency safety: identify shared resources (account balance / limits / inventory), define the locking strategy (optimistic / pessimistic / distributed lock) and deadlock detection; unit tests on key paths cover concurrent scenarios
- Idempotency: write operations define an idempotency key (business serial number + operation type); the idempotency check runs first, and a duplicate request returns the first result instead of throwing an error
- Field-level validation: DTO fields specify type / required / length / enum / regex; validation happens at the Application layer entry point, and the Domain layer validates business rules
- Exception path coverage: define error codes and degradation strategies per class for domain exceptions (business rule violations), technical exceptions (DB / network / timeout) and external dependency exceptions

### L3 quality gates

- [ ] Layering compliant (layer_check.py exit code 0, no reverse dependencies)
- [ ] No circular dependencies (circular_dep_check.py exit code 0)
- [ ] Business rules traceable (each rule annotated with its REQ / rule ID)
- [ ] Unified error codes (the unified error code mapping table covers all exception paths)
- [ ] Clear transaction boundaries (fund operations include compensation and reversal paths)
- [ ] Concurrency safety verified (locking strategy for shared resources + concurrency unit tests)
- [ ] Idempotency verified (write operations have an idempotency key + duplicate submission test)

> The main template contains the [L3 required] depth fields: `templates/backend-service-template.md`. For detailed level definitions, see the "Skill Depth Level Specification".

## Templates

| Template | Purpose |
|------|------|
| `templates/backend-service-template.md` | Layered code structure template |
| `templates/error-code-mapping.md` | Error code mapping |

## Scripts

| Script | Purpose | Exit codes |
|------|------|--------|
| `scripts/layer_check.py` | Layer dependency check | 0/2 |
| `scripts/circular_dep_check.py` | Circular dependency detection | 0/2 |

## References

| Reference | Purpose |
|------|------|
| `references/backend-standards.md` | Backend architecture and coding standards |

## Quality gates

- [ ] Layering correct
- [ ] Business logic in the Domain layer
- [ ] Business rules traceable
- [ ] Unified error codes
- [ ] No circular dependencies

## Common failure modes

| Failure mode | Symptom | Mitigation | Retry strategy |
|---------|------|---------|---------|
| Tangled layers | Infrastructure calls back into Application / API | Blocked by layer_check.py + layering standards review | Fix the dependency direction and rerun the layer check |
| Anemic domain model | Domain layer has only getters/setters; business logic leaks into Application | DDD review + business rule ownership check | Move the logic down into Domain and review again |
| Circular dependency | Module A depends on B and B depends on A; compile / startup fails | Detection with circular_dep_check.py + dependency inversion refactoring | Break the cycle with an interface or mediator layer and rerun detection |
| Over-engineering | Simple CRUD gets complex abstractions and patterns | Requirement-driven; implement only necessary abstractions | Simplify the abstractions and review again |
| Unclear transaction boundary | Fund operation spans several Services with no unified transaction / no compensation | L3 requires a clear transaction boundary and compensation path | Add the compensation path and review the transaction design again |
| Concurrency safety issues | Concurrent balance / limit updates cause over-debit / overselling | Locking strategy + concurrency unit test coverage | Add the locking strategy and rerun the concurrency unit tests |
| Missing idempotency | Duplicate requests cause duplicate debits / duplicate state changes | Idempotency key + duplicate submission test | Add the idempotency key and rerun the idempotency test |

## Upgrade path

| Direction | Trigger | Added fields | Rollback condition |
|---------|---------|---------|---------|
| L1 → L2 | Formal backend development / architecture review starts | Layered code, domain model, interface contract, error code mapping | Review rejected, downgrade to draft |
| L2 → L3 | Fund safety / regulatory reporting / cross-system integration / first go-live | Transaction boundary and compensation path, concurrency locking strategy, idempotency key definition, field-level validation rules, exception path list | Risk downgraded or scenario simplified; may return to L2 after compliance confirmation |

**Human fallback point**: at L3, the transaction boundary and concurrency locking strategy must be confirmed jointly by the backend architect and the DBA. The Agent drafts; the architect confirms and finalizes. A downgrade requires PM + compliance approval, with the reason recorded.

# ADR-007: Scope of Mandatory Authentication Checks (POC Phase)

| Item | Content |
|----|------|
| ID | ADR-007 |
| Date | 2026-10-25 |
| Status | Accepted (with known risks) |
| Related requirements | BR-SGN-01..05, BR-USER-* |

## Context

The legacy system authenticates through CICS terminal sessions + the USRSEC file and splits administrators/normal users by menu, but there is **no server-side
fine-grained authorization**: COADM01C does not check `CDEMO-USER-TYPE` (`COADM01C.cbl:86-158`), and the "A" markers in the normal-user menu are all "U",
so the permission difference only manifests in which menu is entered after login (`COMEN02Y.cpy:21-90`).

The target system is a set of HTTP microservices without terminal sessions. A complete solution requires a gateway + OAuth2/JWT resource server + permission model,
whose effort and validation cost exceed the scope of this phase.

## Alternatives

| Option | Description | Pros | Cons |
|---|---|---|---|
| Option A: iam issues an HMAC token; resource services do not enforce validation in this phase | Login works; the token can be validated by the gateway/future iterations | Controllable scope; contract first | Risk of unauthorized access (local demo only) |
| Option B: a token validation filter built into every service | Resource services validate tokens themselves | Protects even without a gateway | 6 copies of duplicated code; complex key rotation; high testing and integration cost |
| Option C: introduce Spring Cloud Gateway + JWT resource server | Unified authentication, rate limiting, routing | Complete architecture; evolvable to production | New components and dependencies; increased deployment and troubleshooting complexity |

## Quantitative Trade-off Table

| Option | Implementation cost | Performance overhead | Operational agility | Auditability | Risk |
|---|---|---|---|---|---|
| A | Low | None | Immediate | Medium (login and issuance are logged) | High (deny-by-default is missing) |
| B | Medium | Low (one validation per request) | Immediate | Medium | Low |
| C | High | Low (one gateway hop) | Requires gateway releases | High (unified access logs) | Low |

## Decision

Adopt Option A and **expose ports only on the loopback address / local Compose demo environment**; Option C must be implemented before going to production.
iam-service provides `POST /api/v1/auth/login` and `POST /api/v1/auth/verify`; the token is
`base64(payload).base64(HMAC-SHA256(payload, secret))`, and the payload contains userId, userType, and the expiration time.

Risk register: `docs/ops/01-docker-runbook.md` §7 "Known Security Gaps" explicitly states that "unauthenticated APIs must not be exposed to the public internet".

## Rationale

1. The goal of this phase is to validate domain decomposition and business semantics migration, not a production security baseline.
2. Authentication is a cross-cutting concern that must be enforced centrally by the gateway; duplicating it in every service creates unmaintainable security fragments.
3. The token contract comes first, so connecting a gateway later requires no changes to business services.

## Consequences (Impact and Rollback Path)

- Impact: local curl calls work directly; a gateway plus mTLS/intranet isolation must be added before production deployment.
- Rollback: if going live immediately is mandatory, use Option B as a transition (add the same `TokenValidationFilter` to all 6 services).

## Evidence

- `COSGN00C.cbl:209-257`
- `COADM01C.cbl:86-158` (no identity check)
- `COMEN02Y.cpy:21-90` (permission markers are all U)

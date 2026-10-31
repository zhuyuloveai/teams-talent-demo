---
name: dev-bank-coding-standards
description: "Run static checks on changed code against the bank coding standards and security baseline, classify findings as fatal / critical / major, and output a check report. Use during coding or for self-checks after coding is done."
---

## Metadata

| Item | Value |
|----|------|
| version | 1.0.0 |
| owner | Dev / Development line tech lead |
| category | Role skill |
| priority | P0 |
| depth | L2 |

# dev-bank-coding-standards skill

## Overview

This skill makes sure code complies with the bank coding standards and security baseline, with the standards scan and fixes done before the MR is submitted.

## Workflow

1. Load the standards checklist (five categories: naming / exception handling / logging / security / resource release)
2. Run static checks on the changed code (check_standards.py)
3. Produce the issue list (classified as fatal / critical / major)
4. Fix the fatal and critical items
5. After the recheck passes, output the check report

## Level switching rules

| Level | Trigger | Approval |
|------|---------|---------|
| L1 Draft | Standards draft discussion, rule trial run, false-positive labeling | No review needed |
| L2 Standard (default) | Default level for bank production; coding self-check and standards scan before MR submission | Tech lead sign-off + standards scan passed |
| L3 Implementation | Involves fund safety / regulatory reporting / cross-system integration / first go-live / high-risk change | ARB / compliance review + all deep gates passed |

**Automatic upgrade to L3**: when the work involves fund transfer code, key / credential handling, regulatory reporting fields, production data access or third-party payment integration, upgrade automatically from L2 to L3. L3 must pass every computable gate in the "Depth level (L3 Implementation)" section below.

## Depth level (L3 Implementation)

| Level | Requirement |
|------|------|
| L1 | Skeleton key points, for discussion |
| L2 | Standard review level (bank production default) |
| L3 | Adds the following depth on top of L2 (mandatory for high-risk / regulatory / complex integration) |

### L3 workflow additions

- At L3, the standards check outputs a file / line-level issue list mapped to SonarQube rules
- Zero tolerance for fatal / critical; major items carry an explanation or a tracking ticket
- Field-level security checks: for keys / credentials / sensitive fields (card number / ID card number / mobile number), check field by field whether they are hardcoded, masked and stored encrypted
- Exception path coverage: check each of empty catch, swallowed exceptions, resources not released after catch, and sensitive operations continuing after catch
- Resource release: check that acquire and release of file handles / database connections / network connections / locks are paired; try-finally / try-with-resources is mandatory
- Logging standards: log levels (DEBUG / INFO / WARN / ERROR) used correctly, no sensitive data printed, key operations correlated with a traceId
- Naming standards: check class / method / variable / constant names rule by rule against the bank standards (camelCase / snake_case / UPPER_CASE)

### L3 quality gates

- [ ] Zero fatal / critical (check_standards.py by_severity.fatal=0 and critical=0)
- [ ] File / line-level issue list (each violation has file+line+severity+rule+text)
- [ ] Rules cover all five categories (naming / exception / logging / security / resource)
- [ ] Major items have an explanation or tracking ticket (major items carry a comment or ticket number)
- [ ] Sensitive field handling compliant (no hardcoded keys, masked logs, encrypted storage)
- [ ] Resource release fully paired (acquire and release 1:1)
- [ ] SonarQube rule mapping complete (every rule maps to a SonarQube rule key)

> The main template contains the [L3 required] depth fields: `templates/coding-standards.md`. For detailed level definitions, see the "Skill Depth Level Specification".

## Templates

| Template | Purpose |
|------|------|
| `templates/coding-standards.md` | Coding standards checklist |
| `templates/review-checklist.md` | Standards review checklist |

## Scripts

| Script | Purpose | Exit codes |
|------|------|--------|
| `scripts/check_standards.py` | Static check of five rule categories (naming / exception / logging / security / resource) | 0/2 |

## References

| Reference | Purpose |
|------|------|
| `references/rule-mapping.md` | Rule → SonarQube mapping and severity levels |

## Quality gates

- [ ] Zero fatal / critical
- [ ] Major items have an explanation or tracking ticket
- [ ] All five rule categories enabled

## Common failure modes

| Failure mode | Symptom | Mitigation | Retry strategy |
|---------|------|---------|---------|
| Over-strict rules, false positives | Short variable names / normal logs flagged as violations | Rule severity levels and false-positive labeling + quarterly calibration | Label the false positives and recheck |
| Gaps in the standards | New scenarios not covered by rules (for example a new encryption algorithm) | Quarterly rule calibration + standards gap scan | Add rules and rerun the scan |
| Hardcoded keys | Passwords / tokens written into the code | Fatal rule + key management service | Read from the key service instead, then recheck |
| Swallowed exceptions | except: pass or empty catch | Critical rule + exception handling standards | Add logging or rethrow, then recheck |
| Sensitive data in logs | Card numbers / ID card numbers / passwords printed in plain text | Major rule + masking tool | Output masked values instead, then recheck |
| Resources not released | Files / connections / locks not released in finally | Resource release pairing check + try-with-resources | Add release in finally, then recheck |
| Rules not in CI | Standards check only run manually on local machines | MR gate enforces check_standards.py | After CI integration, every MR is scanned |

## Upgrade path

| Direction | Trigger | Added fields | Rollback condition |
|---------|---------|---------|---------|
| L1 → L2 | Self-check before MR submission starts | Five rule categories enabled, file / line-level issue list, severity report | Self-check failed, downgrade to draft |
| L2 → L3 | Fund safety / regulatory reporting / cross-system integration / first go-live | Field-level security checks, exception path list, resource release pairing, SonarQube rule mapping | Risk downgraded or scenario simplified; may return to L2 after compliance confirmation |

**Human fallback point**: at L3, the field-level security checks and SonarQube rule mapping must be confirmed jointly by the tech lead and the security owner. The Agent drafts; the tech lead confirms and finalizes. A downgrade requires PM + compliance approval, with the reason recorded.

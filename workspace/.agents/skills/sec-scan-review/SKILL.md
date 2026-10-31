---
name: sec-scan-review
description: "Classify SAST / DAST / dependency scan results by CVSS and internal standards, identify false positives, give fix / waiver recommendations, and conclude with release / reject. Use after the build, before release, or after dependency updates."
---

## Metadata

| Item | Value |
|----|------|
| version | 1.0.0 |
| owner | Sec / Security line owner |
| category | Role skill |
| priority | P0 |
| depth | L2 |

# sec-scan-review skill

## Overview

This skill turns scan results into actionable vulnerability levels and a release recommendation.

## Workflow

1. Pull the SAST / DAST / dependency scan results
2. Classify by CVSS and internal standards
3. Identify and mark false positives
4. Give a handling recommendation (fix / waiver)
5. Summarize the release / reject conclusion


## Level switching rules

| Level | Trigger | Approval |
|------|---------|---------|
| L1 Draft | Initial triage of scan results, quick false-positive marking, internal discussion | No review needed |
| L2 Standard (default) | Default level for bank production; scan review after the build or before release | Security engineer + Sec owner sign-off |
| L3 Implementation | Involves fund safety / external interfaces / regulatory reporting / first go-live / many high-severity vulnerabilities (CVSS≥9.0) at once | ARB / compliance review + all deep gates passed |

**Automatic upgrade to L3**: when the scan finds critical vulnerabilities with CVSS≥9.0, vulnerabilities involving anti-money laundering / customer funds / interbank interfaces, vulnerabilities of the same origin as a regulatory notice, vulnerabilities on a production data leak path, or dependency components with known exploited vulnerabilities (KEV), upgrade automatically from L2 to L3. L3 must pass every computable gate in the "Depth level (L3 Implementation)" section below.


## Depth level (L3 Implementation)

| Level | Requirement |
|------|------|
| L1 | Skeleton key points, for discussion |
| L2 | Standard review level (bank production default) |
| L3 | Adds the following depth on top of L2 (mandatory for high-risk / regulatory / complex integration) |

### L3 workflow additions

- At L3, the scan review outputs CVSS levels + false-positive explanations + handling / waivers (with validity period)
- The release conclusion is consistent with the evidence
- Each vulnerability is annotated with its CWE ID and attack path (entry point → affected asset → potential impact); high-severity vulnerabilities need a PoC or reachability evidence
- A waiver must include a list of compensating controls (such as WAF rules / network isolation / rate limiting) and the compensating controls must be verified as effective; waiver validity ≤90 days, with automatic re-review on expiry
- A vulnerability fix needs regression verification evidence (scan exit code 0 after the fix, or the same-origin scan items cleared); "PR merged" alone is not grounds for closure
- Attack surface coverage matrix: SAST / DAST / dependency scan / container / secret scan coverage reaches 100%; any gap must state the alternative control
- Critical / high vulnerabilities are tracked against SLA (critical: assign within 24h / fix within 72h; high: assign within 48h / fix within 7d); overdue items escalate automatically

### L3 quality gates

- [ ] Medium and high cleared or waived (waiver includes reason + owner + validity ≤90 days + compensating controls)
- [ ] Every vulnerability has a CWE mapping and an attack path description
- [ ] High-severity fixes have regression verification evidence (same-origin scan cleared)
- [ ] Compensating controls for waived items verified as effective
- [ ] Attack surface coverage 100% (SAST + DAST + dependency + container + secret)
- [ ] SLA compliance for critical / high vulnerabilities ≥95% (24h assignment / 72h fix)
- [ ] triage_vulns.py exit code 0 (verdict=PASS, no open_high)

> The main template contains the [L3 required] depth fields: `templates/vuln-review-template.md`. For detailed level definitions, see the "Skill Depth Level Specification".

## Templates

| Template | Purpose |
|------|------|
| `templates/vuln-review-template.md` | Vulnerability review template |
| `templates/waiver-template.md` | Waiver request template |

## Scripts

| Script | Purpose |
|------|------|
| `scripts/triage_vulns.py` | Level aggregation, false-positive marking, waiver expiry reminders |

## References

| Reference | Purpose |
|------|------|
| `references/cvss-levels.md` | CVSS levels and internal standards |

## Quality gates

- [ ] Medium and high cleared or formally waived (reason + validity period + owner)
- [ ] Levels consistent with the evidence
- [ ] False positives explained

## Common failure modes

| Failure mode | Symptom | Mitigation | Retry strategy |
|---------|------|---------|---------|
| Misclassification | CVSS and internal standards disagree; a high is misjudged as medium | Classification with triage_vulns.py + security engineer spot-checks ≥20% | Fix the classification, rerun the script and retry |
| Waiver without expiry | Waiver has no validity period, or has expired without re-review | Waiver template strictly enforces validity ≤90 days + automatic expiry alert | Add the validity period and compensating controls, then review again |
| False positives not marked | False positives still consume handling effort and distort the release conclusion | False positives must carry evidence (PoC failed / unreachable) and a stated reason | Add the false-positive evidence and reclassify |
| Fix not verified | Vulnerability closed only because "the PR was merged", without a regression scan | After the fix, rerun the same-origin scan and confirm it is cleared | Rerun the scan and retry; reopen if not cleared |
| Attack surface gaps | Container / secret / dependency scans skipped; incomplete coverage | L3 requires a 100% coverage matrix; gaps must state the alternative control | Complete the scan coverage and retry |
| Missing CWE | Vulnerability has no CWE mapping and cannot be linked to the fix knowledge base | CWE field mandatory, mapped from the raw scanner results | Add the CWE and retry |
| SLA overdue | Critical vulnerability not assigned within 24h or not fixed within 72h | SLA tracking dashboard + automatic escalation to the CISO when overdue | Assign immediately and start the emergency fix process |

## Upgrade path

| Direction | Trigger | Added fields | Rollback condition |
|---------|---------|---------|---------|
| L1 → L2 | Formal pre-release scan review starts | All [L2 required] sections (CVSS levels / false-positive marking / handling recommendations / release conclusion) | Review rejected, downgrade to draft |
| L2 → L3 | CVSS≥9.0 / fund safety / regulatory reporting / interbank interfaces / KEV vulnerabilities | CWE mapping + attack path + compensating controls + regression verification evidence + SLA tracking + attack surface coverage matrix | Risk downgraded or all vulnerabilities cleared; may return to L2 after ARB confirmation |

**Human fallback point**: at L3, the verification of compensating controls for waivers and the attack surface coverage matrix must be confirmed jointly by the security engineer and the Sec owner. The Agent drafts the classification and handling recommendations; the Sec owner confirms and finalizes. A downgrade requires ARB + compliance approval, with the reason recorded.

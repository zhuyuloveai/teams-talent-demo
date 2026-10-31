---
name: dev-frontend-ui
description: "Implement frontend UIs pixel-accurately from UI designs and interaction specs: component reuse, state management, form validation, API integration, responsive layout, A11y, i18n and performance optimization. Use for frontend page / component development tasks."
---

## Metadata

| Item | Value |
|----|------|
| version | 1.0.0 |
| owner | Dev / Frontend tech lead |
| category | Role skill |
| priority | P0 |
| depth | L2 |

# dev-frontend-ui skill

## Overview

This skill implements frontend UIs with high quality according to the designs and interaction specs.

## Workflow

1. Read the UI design and interaction spec; extract sizes / colors / fonts / spacing
2. Analyze component breakdown and reuse (prefer the component library)
3. Implement page layout and styles (responsive)
4. Implement interaction logic (form validation, state switching, loading / error / empty states)
5. Implement state management
6. Integrate APIs (mock first, loading / error boundaries)
7. Internationalization (i18n) and accessibility (A11y)
8. Performance optimization (on-demand loading, caching, bundle size)
9. Self-check: design fidelity, interaction walkthrough, compatibility

## Level switching rules

| Level | Trigger | Approval |
|------|---------|---------|
| L1 Draft | Page prototype discussion, component breakdown exploration, design alignment | No review needed |
| L2 Standard (default) | Default level for bank production; frontend page / component development tasks | Frontend review + designer walkthrough sign-off |
| L3 Implementation | Involves fund safety / regulatory reporting / cross-system integration / first go-live / high-risk change | ARB / compliance review + all deep gates passed |

**Automatic upgrade to L3**: for pages with fund operations (transfer / payment / wealth management), display of sensitive customer data (card number / ID card number / balance), regulatory reporting pages, or forms that write back production data, upgrade automatically from L2 to L3. L3 must pass every computable gate in the "Depth level (L3 Implementation)" section below.

## Depth level (L3 Implementation)

| Level | Requirement |
|------|------|
| L1 | Skeleton key points, for discussion |
| L2 | Standard review level (bank production default) |
| L3 | Adds the following depth on top of L2 (mandatory for high-risk / regulatory / complex integration) |

### L3 workflow additions

- At L3, output the three component states (loading / error / empty), i18n, A11y and a design fidelity self-check
- Interaction walkthrough checklist and compatibility matrix
- Field-level validation: define validation rules and error messages field by field for amount input (precision / sign / upper limit), card number (format / check digit / Luhn), mobile number (11 digits / regex) and ID card number (18 digits / check digit)
- Exception path coverage: for each of API timeout, 5xx, network disconnect, signature failure and replay-protection failure, provide the loading / error / retry UI
- Form security: sensitive fields (password / card number) never echo plain text, block paste, disable autocomplete, protect against keylogging, debounce submission and prevent duplicate submission
- State management: fund-related state machines (pending submission → processing → success / failure) prevent duplicate transitions; failures can be retried idempotently
- Boundary values: build cases for amount min/max and ±1, maximum field length, maximum page size and maximum upload file size

### L3 quality gates

- [ ] Design fidelity ≥95% (ui_lint.py finds no raw colors, design tokens fully used)
- [ ] All three states present (every data component covers loading / error / empty)
- [ ] A11y compliant (a11y_check.py exit code 0, img has alt, clickable elements have a label)
- [ ] i18n complete (no hardcoded UI text; all copy comes from i18n resources)
- [ ] Field-level validation complete (validation rules for amount / card number / mobile number / ID card number)
- [ ] Bundle size within limits (bundle_analyze.py finds no oversized files, total_kb within threshold)
- [ ] Form security in place (sensitive fields not echoed / duplicate submission prevented / paste blocked)

> The main template contains the [L3 required] depth fields: `templates/component-template.md`. For detailed level definitions, see the "Skill Depth Level Specification".

## Templates

| Template | Purpose |
|------|------|
| `templates/component-template.md` | Component structure template |
| `templates/page-template.md` | Page structure template |

## Scripts

| Script | Purpose | Exit codes |
|------|------|--------|
| `scripts/ui_lint.py` | Design fidelity check (colors / sizes) | 0/1 |
| `scripts/a11y_check.py` | Accessibility scan | 0/1 |
| `scripts/bundle_analyze.py` | Bundle size analysis | 0 |

## References

| Reference | Purpose |
|------|------|
| `references/frontend-standards.md` | Frontend standards and compatibility matrix |

## Quality gates

- [ ] Design fidelity ≥95%
- [ ] Interaction walkthrough complete
- [ ] Compatibility requirements met
- [ ] No console errors

## Common failure modes

| Failure mode | Symptom | Mitigation | Retry strategy |
|---------|------|---------|---------|
| Design misunderstanding | Sizes / colors / spacing differ from the design | Walkthrough confirmation of key pages + ui_lint.py | Fix and rerun lint |
| Insufficient component reuse | Reinventing the wheel / component library not adopted | Component library review + adoption | Switch to the component library and review again |
| Performance problems | Bundle too large / slow first screen | bundle_analyze.py + on-demand loading | Split bundles / lazy load, then measure size again |
| Missing states | Only the normal state; loading / error / empty missing | L3 enforces three states + template constraints | Add the three states and review again |
| A11y not compliant | img without alt / button without label / insufficient contrast | a11y_check.py scan + A11y standards | Add alt / label and rerun the scan |
| Missing field validation | Negative amounts / malformed card numbers not blocked | L3 field-level validation rules | Add validation and rerun the boundary cases |
| Insecure forms | Password echoed in plain text / duplicate submission possible / paste allowed | L3 form security standards | Add the security measures and review again |

## Upgrade path

| Direction | Trigger | Added fields | Rollback condition |
|---------|---------|---------|---------|
| L1 → L2 | Formal frontend development / frontend review starts | Three component states, design tokens, A11y, i18n, interaction walkthrough checklist | Review rejected, downgrade to draft |
| L2 → L3 | Fund safety / regulatory reporting / cross-system integration / first go-live | Field-level validation rules, exception path UI, form security, state machine duplicate prevention, bundle size gate | Risk downgraded or scenario simplified; may return to L2 after compliance confirmation |

**Human fallback point**: at L3, field-level validation rules and form security must be confirmed jointly by the frontend owner and the security owner. The Agent drafts; the frontend owner confirms and finalizes. A downgrade requires PM + compliance approval, with the reason recorded.

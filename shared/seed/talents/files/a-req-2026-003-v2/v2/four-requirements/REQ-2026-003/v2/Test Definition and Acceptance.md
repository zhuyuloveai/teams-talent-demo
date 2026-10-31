> v2 node materials: the original chapters and historical baseline excerpts below keep their original meaning. The current local test parameters follow `test-profile.md` v2 in this directory; the formal §12.3 items are still to be confirmed. Do not turn any other inferred policy into a confirmed one on your own.

# REQ-2026-003 · Enterprise Test Case Definition and Acceptance

Source: original requirement §9 Scenario matrix and §10 Acceptance criteria (executable). The source excerpts are unchanged; the current case projection version is REQ-2026-003-cases-v2 (formerly REQ-2026-003-cases-v1). All cases below are pending execution, not reports of completed runs; conflicting expectations must be linked to a PRD decision and must not be marked as passed directly. The test asset plugin provides the cases; Talent provides the verification knowledge and Skills.

## 9. Scenario matrix

| Type | Scenario | Role | Data/API | Expected |
|------|------|------|-----------|------|
| Main flow | Limit 8000, apply for 12000, initial review and final approval pass | Cardholder + initial reviewer + approver | POST `/limit-applications` → `/review` → `/approve` | Status goes from `SUBMITTED` to `APPROVED`, the account limit becomes 12000 within 5 seconds, and the notification is sent |
| Main flow | Initial review rejects with a reason | Initial reviewer | POST `/admin/limit-applications/{id}/review` | Status `REJECTED`, the reason is shown on the customer progress page |
| Boundary | Requested limit = current limit × 2 (8000→16000) | Cardholder | POST `/limit-applications` | Dual approval is not triggered, `dualApprovalRequired=false` |
| Boundary | Requested limit = current limit × 2 + 0.01 (8000→16000.01) | Cardholder | POST `/limit-applications` | Dual approval is triggered, `dualApprovalRequired=true` |
| Boundary | Requested limit = product maximum 25000 | Cardholder | POST `/limit-applications` | Pre-review passes and initial review is allowed |
| Exception | 1 delinquent month in the past 6 months | Cardholder | POST `/limit-applications` | Pre-review sets `REJECTED` and shows the delinquency record |
| Exception | Second submission within 7 days for the same account | Cardholder | POST `/limit-applications` | 409 `LIMIT_APPLICATION_EXISTS` |
| Exception | Initial reviewer and final approver are the same account | Approver | POST `/admin/limit-applications/{id}/approve` | 403 `SOD_VIOLATION` |
| Exception | account-service unavailable after approval | Approver | POST `/approve` after disabling account-service | Status `APPROVED_PENDING`, becomes effective automatically after recovery, no duplicate approval |
| Exception | Upload a 6MB PDF as income proof | Cardholder | POST `/limit-applications/{id}/documents` | 400 `INVALID_DOCUMENT` |
| Permission | Customer A queries customer B's application | Cardholder | GET `/limit-applications/{id}` | 404, no data leakage |
| Permission | Risk control compliance account attempts to approve | Risk control/compliance | POST `/admin/limit-applications/{id}/approve` | 403, missing `limit:approve` |

## 10. Acceptance criteria (executable)

| Story | Given | When | Then | Data preparation |
|------|-------|------|------|---------|
| US-001 | Current limit 8000, product maximum 25000, no delinquency, card open for 24 months | Apply for 12000 and pass initial review and final approval | Status `APPROVED`, account limit 12000, the customer receives the notification | Account 00000000006 |
| US-002 | 1 delinquent month in the past 6 months | Submit an application for 12000 | Pre-review `REJECTED`, showing "There is a delinquency record in the past 6 months" | 1 delinquent statement record |
| US-003 | An in-progress application already exists | Submit the application again | 409 `LIMIT_APPLICATION_EXISTS`, only 1 application record | Reuse the US-001 data |
| US-004 | Initial reviewer and final approver are the same account | Perform the final approval | 403 `SOD_VIOLATION`, application status unchanged | Single account with both roles |
| US-005 | Apply for 8000→16000.01 | Submit and enter approval | `dualApprovalRequired=true`; returns `DUAL_APPROVAL_REQUIRED` when the second approver is missing | US-001 account + documents |
| US-006 | account-service disabled after approval | Perform the final approval | Status `APPROVED_PENDING`; becomes effective automatically after recovery with only 1 limit update | Disable and restore the container |
| US-007 | The application was rejected | Open the customer progress page | Shows the rejection reason and the customer service entry; submission is blocked when the rejection reason is empty | US-002 data |
| US-008 | An account whose card was opened 2 months ago | Submit a limit increase application | Pre-review rejects, prompting "You can apply for a limit increase once the card has been open for 3 months" | Newly opened account 00000000007 |

## Execution Evidence Requirements

Functional tests, static tool checks, Agent Review, security reports and issue re-tests each record the actual command, tool version, code commit, exit code and report path. Owner acceptance is based on these actual results; publishing knowledge does not mean the requirement is accepted.

## test-profile-v2 Additions (not new source ACs)

Documents are uploaded temporarily before applying; normal applications have initial review + final approval, and high-amount ones additionally have second_approver. For high amounts, the four parties act with their own tokens; the front end cannot fill in IDs on their behalf; same-person or forged approvals are rejected. Approval notes may be empty; rejection reasons are 10–256 characters; "past 6 months" uses Asia/Shanghai calendar months with month-end truncation.
All original US-001..008 are kept; real execution reports must distinguish the original ACs from the cases added by this profile.

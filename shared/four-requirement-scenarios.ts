/** Reviewed source fixtures. Exact business identity is separate from runtime task UUID. */
export type FourRequirementNode = 'prepare'|'develop'|'verify'|'accept';
export const fourRequirementScenarios = [
  {
    "businessId": "REQ-2026-001",
    "id": "req-2026-001-v1",
    "projectId": "carddemo",
    "title": "Credit Card Statement/Purchase Installment",
    "artifactId": "a-req-2026-001",
    "version": 1,
    "sourceFile": "REQ-2026-001-installment.md",
    "sourceSha256": "ff96572f45e1b510018156ca0932ec98af611f39ea9599754223946adf373ee8",
    "manifest": "four-requirements/REQ-2026-001/provenance.json",
    "files": {
      "requirement": "four-requirements/REQ-2026-001/Original Requirement.md",
      "rules": "four-requirements/REQ-2026-001/Business Rules and Scope.md",
      "questions": "four-requirements/REQ-2026-001/Open Questions and Differences.md",
      "implementation": "four-requirements/REQ-2026-001/Baseline and Implementation Constraints.md",
      "acceptance": "four-requirements/REQ-2026-001/Test Definition and Acceptance.md",
      "profile": "four-requirements/REQ-2026-001/test-profile.md"
    },
    "creationDescription": "Business requirement ID: REQ-2026-001\nOriginal requirement SHA256: ff96572f45e1b510018156ca0932ec98af611f39ea9599754223946adf373ee8\nFull requirement: Talents published material four-requirements/REQ-2026-001/Original Requirement.md (source v1.0).\nScope: Credit Card Statement/Purchase Installment. Read all 13 chapters of the full source before starting; this task summary does not narrow the functional, interface, data, security or acceptance scope. Chapter 5 states that its simulated values are used for this test; the §12.3 items remain open for production sign-off, internal contradictions are clarified using the material's differences list, and Owner confirmation must not be faked.",
    "casesVersion": "REQ-2026-001-cases-v1",
    "cases": [
      {
        "id": "REQ-2026-001-US-001",
        "title": "US-001 · A posted purchase of 1000.00 exists and the account limit is 20000.00",
        "given": "A posted purchase of 1000.00 exists and the account limit is 20000.00; data setup: Transaction 0000000000000200, account 00000000006",
        "steps": "Preview 6 periods and submit",
        "expected": "Per test-profile-v1: principal 166.66 for each of the first 5 periods and 166.70 for the last; per-period fees 5.50/4.58/3.67/2.75/1.83/0.92, total 19.25; first period 172.16, plan ACTIVE. The source total fee of 33.00 stays in the original file.",
        "sourceSection": "§10 US-001"
      },
      {
        "id": "REQ-2026-001-US-002",
        "title": "US-002 · A plan was already created with the deduplication key `ins-20261027-001`",
        "given": "A plan was already created with the deduplication key `ins-20261027-001`; data setup: Reuse US-001 data",
        "steps": "Submit again with the same deduplication key",
        "expected": "The same plan_id is returned and the `installment_plan` and accounting entry counts do not change",
        "sourceSection": "§10 US-002"
      },
      {
        "id": "REQ-2026-001-US-003",
        "title": "US-003 · The transaction is already on an installment plan",
        "given": "The transaction is already on an installment plan; data setup: Reuse US-001 data",
        "steps": "Apply for an installment again",
        "expected": "409 `ALREADY_INSTALLED`, and the page shows the \"Already installed\" badge",
        "sourceSection": "§10 US-003"
      },
      {
        "id": "REQ-2026-001-US-004",
        "title": "US-004 · The plan was created successfully",
        "given": "The plan was created successfully; data setup: Reuse US-001 data",
        "steps": "Query the account limit view and the plan details",
        "expected": "Installment occupation = 1000.00, and the 6 repayment schedule rows total principal + fees",
        "sourceSection": "§10 US-004"
      },
      {
        "id": "REQ-2026-001-US-005",
        "title": "US-005 · The plan has a remaining principal of 600.00 and is `ACTIVE`",
        "given": "The plan has a remaining principal of 600.00 and is `ACTIVE`; data setup: Plan has 3 periods with 1 already repaid",
        "steps": "Settle early",
        "expected": "Remaining principal drops to zero, 600.00 of limit is released, and the 6.00 penalty fee is posted to the ledger",
        "sourceSection": "§10 US-005"
      },
      {
        "id": "REQ-2026-001-US-006",
        "title": "US-006 · The transaction amount is 99.99",
        "given": "The transaction amount is 99.99; data setup: Transaction 0000000000000201",
        "steps": "Open the transaction details",
        "expected": "The entry is greyed out with the message \"A single purchase of 100.00 or more is required to apply for an installment\"",
        "sourceSection": "§10 US-006"
      },
      {
        "id": "REQ-2026-001-US-007",
        "title": "US-007 · ledger-service is stopped",
        "given": "ledger-service is stopped; data setup: Stop the ledger container",
        "steps": "Submit an installment",
        "expected": "503 `DOWNSTREAM_UNAVAILABLE`, with no half-completed funds state",
        "sourceSection": "§10 US-007"
      },
      {
        "id": "REQ-2026-001-US-008",
        "title": "US-008 · The operations account holds `installment:read:any`",
        "given": "The operations account holds `installment:read:any`; data setup: At least 20 plan records over 30 days",
        "steps": "Export the installment list for 30 days",
        "expected": "A CSV is generated, downloadable within 24 hours, and the export action is audited",
        "sourceSection": "§10 US-008"
      }
    ]
  },
  {
    "businessId": "REQ-2026-002",
    "id": "req-2026-002-v1",
    "projectId": "carddemo",
    "title": "Credit Card Loss Reporting and Replacement",
    "artifactId": "a-req-2026-002",
    "version": 1,
    "sourceFile": "REQ-2026-002-card-loss.md",
    "sourceSha256": "0ee5e11722f512cde04fe2aefc044ff357dcf131345709dbf06ba0f8817a841f",
    "manifest": "four-requirements/REQ-2026-002/provenance.json",
    "files": {
      "requirement": "four-requirements/REQ-2026-002/Original Requirement.md",
      "rules": "four-requirements/REQ-2026-002/Business Rules and Scope.md",
      "questions": "four-requirements/REQ-2026-002/Open Questions and Differences.md",
      "implementation": "four-requirements/REQ-2026-002/Baseline and Implementation Constraints.md",
      "acceptance": "four-requirements/REQ-2026-002/Test Definition and Acceptance.md",
      "profile": "four-requirements/REQ-2026-002/test-profile.md"
    },
    "creationDescription": "Business requirement ID: REQ-2026-002\nOriginal requirement SHA256: 0ee5e11722f512cde04fe2aefc044ff357dcf131345709dbf06ba0f8817a841f\nFull requirement: Talents published material four-requirements/REQ-2026-002/Original Requirement.md (source v1.0).\nScope: Credit Card Loss Reporting and Replacement. Read all 13 chapters of the full source before starting; this task summary does not narrow the functional, interface, data, security or acceptance scope. Chapter 5 states that its simulated values are used for this test; the §12.3 items remain open for production sign-off, internal contradictions are clarified using the material's differences list, and Owner confirmation must not be faked.",
    "casesVersion": "REQ-2026-002-cases-v1",
    "cases": [
      {
        "id": "REQ-2026-002-US-001",
        "title": "US-001 · An `ACTIVE` card 4000000000005740 exists",
        "given": "An `ACTIVE` card 4000000000005740 exists; data setup: Card and account 00000000006",
        "steps": "The customer confirms the loss report",
        "expected": "The card status becomes `LOST` immediately, authorization on the old card is declined, and the audit is queryable",
        "sourceSection": "§10 US-001"
      },
      {
        "id": "REQ-2026-002-US-002",
        "title": "US-002 · The card is already `LOST`",
        "given": "The card is already `LOST`; data setup: Reuse US-001 data",
        "steps": "Submit the loss report again",
        "expected": "409 `CARD_ALREADY_LOST`, and only 1 notification exists",
        "sourceSection": "§10 US-002"
      },
      {
        "id": "REQ-2026-002-US-003",
        "title": "US-003 · A platinum card has been reported lost",
        "given": "A platinum card has been reported lost; data setup: Platinum card 4000000000009999",
        "steps": "Submit a replacement request",
        "expected": "`feeAmount=0.00`, `feeStatus=WAIVED`, no FEE posting",
        "sourceSection": "§10 US-003"
      },
      {
        "id": "REQ-2026-002-US-004",
        "title": "US-004 · A gold card has been reported lost",
        "given": "A gold card has been reported lost; data setup: Gold card 4000000000005740",
        "steps": "Submit a replacement request",
        "expected": "`feeAmount=50.00`, a FEE posting is created, and `fee_batch_id` is filled in",
        "sourceSection": "§10 US-004"
      },
      {
        "id": "REQ-2026-002-US-005",
        "title": "US-005 · A replacement ticket is in progress",
        "given": "A replacement ticket is in progress; data setup: Reuse US-004 data",
        "steps": "Submit a replacement request again",
        "expected": "409 `REPLACEMENT_EXISTS`, and the ticket count does not change",
        "sourceSection": "§10 US-005"
      },
      {
        "id": "REQ-2026-002-US-006",
        "title": "US-006 · The ticket status is `CARD_PRODUCED`",
        "given": "The ticket status is `CARD_PRODUCED`; data setup: Ticket `replacement_id`",
        "steps": "Operations updates it to `SHIPPED` and fills in the tracking number",
        "expected": "The customer progress page shows the tracking number and estimated arrival date",
        "sourceSection": "§10 US-006"
      },
      {
        "id": "REQ-2026-002-US-007",
        "title": "US-007 · A new card has been generated but not activated",
        "given": "A new card has been generated but not activated; data setup: New card number + transaction request",
        "steps": "Initiate a transaction with the new card",
        "expected": "The transaction is declined with the message \"The new card is not activated\"",
        "sourceSection": "§10 US-007"
      },
      {
        "id": "REQ-2026-002-US-008",
        "title": "US-008 · transaction-service is stopped",
        "given": "transaction-service is stopped; data setup: Stop and restore the container",
        "steps": "Submit a gold card replacement request",
        "expected": "The ticket is created successfully with `feeStatus=FEE_PENDING`; the fee is collected within 24 hours after recovery",
        "sourceSection": "§10 US-008"
      }
    ]
  },
  {
    "businessId": "REQ-2026-003",
    "id": "req-2026-003-v1",
    "projectId": "carddemo",
    "title": "Credit Card Limit Increase Application and Approval",
    "artifactId": "a-req-2026-003",
    "version": 1,
    "sourceFile": "REQ-2026-003-limit-increase.md",
    "sourceSha256": "19fd80d4079973ee03836edd82041d429ff840baf93a540eb09d1a36377e766c",
    "manifest": "four-requirements/REQ-2026-003/provenance.json",
    "files": {
      "requirement": "four-requirements/REQ-2026-003/Original Requirement.md",
      "rules": "four-requirements/REQ-2026-003/Business Rules and Scope.md",
      "questions": "four-requirements/REQ-2026-003/Open Questions and Differences.md",
      "implementation": "four-requirements/REQ-2026-003/Baseline and Implementation Constraints.md",
      "acceptance": "four-requirements/REQ-2026-003/Test Definition and Acceptance.md",
      "profile": "four-requirements/REQ-2026-003/test-profile.md"
    },
    "creationDescription": "Business requirement ID: REQ-2026-003\nOriginal requirement SHA256: 19fd80d4079973ee03836edd82041d429ff840baf93a540eb09d1a36377e766c\nFull requirement: Talents published material four-requirements/REQ-2026-003/Original Requirement.md (source v1.0).\nScope: Credit Card Limit Increase Application and Approval. Read all 13 chapters of the full source before starting; this task summary does not narrow the functional, interface, data, security or acceptance scope. Chapter 5 states that its simulated values are used for this test; the §12.3 items remain open for production sign-off, internal contradictions are clarified using the material's differences list, and Owner confirmation must not be faked.",
    "casesVersion": "REQ-2026-003-cases-v1",
    "cases": [
      {
        "id": "REQ-2026-003-US-001",
        "title": "US-001 · Current limit 8000, product maximum 25000, no delinquency, card open for 24 months",
        "given": "Current limit 8000, product maximum 25000, no delinquency, card open for 24 months; data setup: Account 00000000006",
        "steps": "Apply for 12000 and pass initial review and final approval",
        "expected": "Status `APPROVED`, account limit 12000, the customer receives the notification",
        "sourceSection": "§10 US-001"
      },
      {
        "id": "REQ-2026-003-US-002",
        "title": "US-002 · 1 delinquent month in the past 6 months",
        "given": "1 delinquent month in the past 6 months; data setup: 1 delinquent statement record",
        "steps": "Submit an application for 12000",
        "expected": "Pre-review `REJECTED`, showing \"There is a delinquency record in the past 6 months\"",
        "sourceSection": "§10 US-002"
      },
      {
        "id": "REQ-2026-003-US-003",
        "title": "US-003 · An in-progress application already exists",
        "given": "An in-progress application already exists; data setup: Reuse the US-001 data",
        "steps": "Submit the application again",
        "expected": "409 `LIMIT_APPLICATION_EXISTS`, only 1 application record",
        "sourceSection": "§10 US-003"
      },
      {
        "id": "REQ-2026-003-US-004",
        "title": "US-004 · Initial reviewer and final approver are the same account",
        "given": "Initial reviewer and final approver are the same account; data setup: Single account with both roles",
        "steps": "Perform the final approval",
        "expected": "403 `SOD_VIOLATION`, application status unchanged",
        "sourceSection": "§10 US-004"
      },
      {
        "id": "REQ-2026-003-US-005",
        "title": "US-005 · Apply for 8000→16000.01",
        "given": "Apply for 8000→16000.01; data setup: US-001 account + documents",
        "steps": "Submit and enter approval",
        "expected": "`dualApprovalRequired=true`; returns `DUAL_APPROVAL_REQUIRED` when the second approver is missing",
        "sourceSection": "§10 US-005"
      },
      {
        "id": "REQ-2026-003-US-006",
        "title": "US-006 · account-service disabled after approval",
        "given": "account-service disabled after approval; data setup: Disable and restore the container",
        "steps": "Perform the final approval",
        "expected": "Status `APPROVED_PENDING`; becomes effective automatically after recovery with only 1 limit update",
        "sourceSection": "§10 US-006"
      },
      {
        "id": "REQ-2026-003-US-007",
        "title": "US-007 · The application was rejected",
        "given": "The application was rejected; data setup: US-002 data",
        "steps": "Open the customer progress page",
        "expected": "Shows the rejection reason and the customer service entry; submission is blocked when the rejection reason is empty",
        "sourceSection": "§10 US-007"
      },
      {
        "id": "REQ-2026-003-US-008",
        "title": "US-008 · An account whose card was opened 2 months ago",
        "given": "An account whose card was opened 2 months ago; data setup: Newly opened account 00000000007",
        "steps": "Submit a limit increase application",
        "expected": "Pre-review rejects, prompting \"You can apply for a limit increase once the card has been open for 3 months\"",
        "sourceSection": "§10 US-008"
      }
    ]
  },
  {
    "businessId": "REQ-2026-004",
    "id": "req-2026-004-v1",
    "projectId": "carddemo",
    "title": "Transaction Dispute Online Application and Handling",
    "artifactId": "a-req-2026-004",
    "version": 1,
    "sourceFile": "REQ-2026-004-dispute.md",
    "sourceSha256": "5a50a0d85149db6df99f7273ef67251ca4729945aa33245d127f6dba937bd92e",
    "manifest": "four-requirements/REQ-2026-004/provenance.json",
    "files": {
      "requirement": "four-requirements/REQ-2026-004/Original Requirement.md",
      "rules": "four-requirements/REQ-2026-004/Business Rules and Scope.md",
      "questions": "four-requirements/REQ-2026-004/Open Questions and Differences.md",
      "implementation": "four-requirements/REQ-2026-004/Baseline and Implementation Constraints.md",
      "acceptance": "four-requirements/REQ-2026-004/Test Definition and Acceptance.md",
      "profile": "four-requirements/REQ-2026-004/test-profile.md"
    },
    "creationDescription": "Business requirement ID: REQ-2026-004\nOriginal requirement SHA256: 5a50a0d85149db6df99f7273ef67251ca4729945aa33245d127f6dba937bd92e\nFull requirement: Talents published material four-requirements/REQ-2026-004/Original Requirement.md (source v1.0).\nScope: Transaction Dispute Online Application and Handling. Read all 13 chapters of the full source before starting; this task summary does not narrow the functional, interface, data, security or acceptance scope. Chapter 5 states that its simulated values are used for this test; the §12.3 items remain open for production sign-off, internal contradictions are clarified using the material's differences list, and Owner confirmation must not be faked.",
    "casesVersion": "REQ-2026-004-cases-v1",
    "cases": [
      {
        "id": "REQ-2026-004-US-001",
        "title": "US-001 · A posted transaction of 299.00 within 90 days with no dispute in progress",
        "given": "A posted transaction of 299.00 within 90 days with no dispute in progress; data setup: Transaction 0000000000000200, account 00000000006",
        "steps": "Submit a FRAUD dispute and upload 1 PDF",
        "expected": "Case `OPEN`, the customer can view the timeline and the SLA due time",
        "sourceSection": "§10 US-001"
      },
      {
        "id": "REQ-2026-004-US-002",
        "title": "US-002 · The same transaction already has an `OPEN` case",
        "given": "The same transaction already has an `OPEN` case; data setup: Reuse the US-001 data",
        "steps": "Open the case again",
        "expected": "409 `DISPUTE_EXISTS`, the number of cases is unchanged",
        "sourceSection": "§10 US-002"
      },
      {
        "id": "REQ-2026-004-US-003",
        "title": "US-003 · The transaction has no evidence uploaded",
        "given": "The transaction has no evidence uploaded; data setup: Reuse the US-001 data",
        "steps": "Submit a FRAUD dispute",
        "expected": "409 `EVIDENCE_REQUIRED`",
        "sourceSection": "§10 US-003"
      },
      {
        "id": "REQ-2026-004-US-004",
        "title": "US-004 · Case `UNDER_REVIEW`",
        "given": "Case `UNDER_REVIEW`; data setup: Case number + initial account balance",
        "steps": "Provisional credit of 100.00 submitted twice",
        "expected": "The account is credited 100.00 once and the case is `PROVISIONAL_CREDIT`",
        "sourceSection": "§10 US-004"
      },
      {
        "id": "REQ-2026-004-US-005",
        "title": "US-005 · The case has been provisionally credited",
        "given": "The case has been provisionally credited; data setup: Reuse the US-004 data",
        "steps": "Initiate chargeback and close with `won=true`",
        "expected": "Status `WON` then `CLOSED`, the customer receives the notification, audit records are complete",
        "sourceSection": "§10 US-005"
      },
      {
        "id": "REQ-2026-004-US-006",
        "title": "US-006 · 23 hours until the case SLA due time",
        "given": "23 hours until the case SLA due time; data setup: Adjust the `sla_due_at` data",
        "steps": "Run the daily 02:00 scan",
        "expected": "The specialist and supervisor receive the reminder, `slaState=DUE_SOON`",
        "sourceSection": "§10 US-006"
      },
      {
        "id": "REQ-2026-004-US-007",
        "title": "US-007 · The transaction was posted 91 days ago",
        "given": "The transaction was posted 91 days ago; data setup: Transaction 0000000000000199",
        "steps": "Open the transaction details",
        "expected": "Entry point greyed out, prompting \"Please call customer service for transactions older than 90 days\"",
        "sourceSection": "§10 US-007"
      },
      {
        "id": "REQ-2026-004-US-008",
        "title": "US-008 · account-service disabled",
        "given": "account-service disabled; data setup: Disable the container",
        "steps": "Initiate a provisional credit of 299.00",
        "expected": "503 `DOWNSTREAM_UNAVAILABLE`, the case stays `UNDER_REVIEW`, the balance is unchanged",
        "sourceSection": "§10 US-008"
      }
    ]
  }
] as const;
export type FourRequirementScenario = Omit<typeof fourRequirementScenarios[number], 'id'|'artifactId'|'version'|'manifest'|'files'|'creationDescription'|'casesVersion'|'cases'> & {
 id:string;artifactId:string;version:number;manifest:string;files:Record<keyof typeof fourRequirementScenarios[number]['files'],string>;creationDescription:string;casesVersion:string;
 cases:ReadonlyArray<{id:string;title:string;given:string;steps:string;expected:string;sourceSection:string}>;profileSha256?:string;
};
/** v1 is immutable. New tasks must explicitly pin both v2 and its profile digest. */
export const fourRequirementProfileV2Sha256 = '31d037f280a38855b4744b14c0ba95b48b9651becf32d604986230de4de0d2ff';
export const fourRequirementScenariosV2: readonly FourRequirementScenario[] = fourRequirementScenarios.map(source=>({
 ...source,id:source.id.replace(/-v1$/,'-v2'),artifactId:source.artifactId+'-v2',version:2,
 manifest:`four-requirements/${source.businessId}/v2/provenance.json`,
 files:{...source.files,...Object.fromEntries(Object.entries(source.files).filter(([key])=>key!=='requirement').map(([key,path])=>[key,path.replace(/\/([^/]+)$/,'/v2/$1')]))},
 profileSha256:fourRequirementProfileV2Sha256,
 creationDescription:source.creationDescription+'\nTest profile version: test-profile-v2\nTest profile SHA256: '+fourRequirementProfileV2Sha256+'\nThis task explicitly pins the v2 local test profile; all 13 chapters of the source and the original US-001..008 must be kept. Apart from the test parameters stated explicitly, report any other pending policy to the coordinator; do not mark it as Must/Confirmed on your own.',
 casesVersion:source.casesVersion.replace(/-v1$/,'-v2'),
 cases:source.cases.map(item=>source.businessId==='REQ-2026-001'&&item.id.endsWith('US-005')?{...item,given:'CNY 900.00 split into 3 periods, first-period principal of 300.00 actually repaid, plan ACTIVE with remaining principal 600.00; keep the original US-005 conditions, do not substitute 500/3',expected:'Remaining principal drops to zero and the actually repaid principal of 600.00 is released only once; penalty fee 6.00, feeRebate 0.00, settlement total 606.00; real accounting and occupation agree; repeated/concurrent retries do not release twice'}:{...item,expected:item.expected.replaceAll('test-profile-v1','test-profile-v2')})
}));
export const fourRequirementScenarioVersions: readonly FourRequirementScenario[] = [...fourRequirementScenarios,...fourRequirementScenariosV2];
export const fourRequirementNodes: Record<FourRequirementNode,{knowledge:Array<{file:keyof FourRequirementScenario['files'];slot:string;reason:string}>;skills:string[];skillSlot:string}> = {
 prepare:{knowledge:[{file:'profile',slot:'business-documents',reason:'Independent test profile used for this verification; the original requirement is not rewritten'},{file:'requirement',slot:'business-documents',reason:'Read the full original requirement and acceptance scope'},{file:'rules',slot:'business-documents',reason:'Check the test rules stated in the requirement'},{file:'questions',slot:'business-documents',reason:'Keep open questions and internal differences'},{file:'implementation',slot:'business-documents',reason:'Identify the real baseline and integration gaps'}],skills:['ba-requirement-analysis','ba-acceptance-criteria','bank-domain-payments'],skillSlot:'business-skills'},
 develop:{knowledge:[{file:'profile',slot:'development-knowledge',reason:'Independent test profile used for this verification; the original requirement is not rewritten'},{file:'requirement',slot:'development-knowledge',reason:'Implementation must trace back to the full requirement'},{file:'implementation',slot:'development-knowledge',reason:'Design against the real modules, protocols and data constraints'},{file:'rules',slot:'development-knowledge',reason:'Implement the business rules and cover the boundaries'},{file:'questions',slot:'development-knowledge',reason:'Do not decide unconfirmed policies on your own'}],skills:['arch-solution-design','dev-backend-service','dev-api-integration','dev-frontend-ui','dev-unit-test'],skillSlot:'development-skills'},
 verify:{knowledge:[{file:'profile',slot:'verification-knowledge',reason:'Independent test profile used for this verification; the original requirement is not rewritten'},{file:'requirement',slot:'verification-knowledge',reason:'Check coverage of all requirements'},{file:'acceptance',slot:'verification-knowledge',reason:'Produce real test evidence from the original scenarios'},{file:'questions',slot:'verification-knowledge',reason:'Confirm conflicts are clarified or blockers remain explicit'}],skills:['dev-bank-coding-standards','dev-code-reviewer','qa-integration-test','sec-scan-review'],skillSlot:'quality-skills'},
 accept:{knowledge:[{file:'profile',slot:'acceptance-knowledge',reason:'Independent test profile used for this verification; the original requirement is not rewritten'},{file:'requirement',slot:'acceptance-knowledge',reason:'Check the original scope against the actual delivery item by item'},{file:'acceptance',slot:'acceptance-knowledge',reason:'Check the test reports and issue re-verification'},{file:'questions',slot:'acceptance-knowledge',reason:'Confirm open items and the basis for decisions'}],skills:['qa-uat-support'],skillSlot:'acceptance-skills'},
};
/** An unrelated same-title task cannot acquire a scenario; the exact source fingerprint is required. */
export function fourRequirementScenario(projectId:string,task:{id:string;title:string;description?:string}) {
 if(projectId!=='carddemo'||!/^REQ-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(task.id))return undefined;
 const lines=task.description?.split('\n')??[],versions=lines.filter(line=>line.startsWith('Test profile version: ')),digests=lines.filter(line=>line.startsWith('Test profile SHA256: '));
 const candidates=versions.length===0&&digests.length===0?fourRequirementScenarios:versions.length===1&&versions[0]==='Test profile version: test-profile-v2'&&digests.length===1&&digests[0]==='Test profile SHA256: '+fourRequirementProfileV2Sha256?fourRequirementScenariosV2:[];
 return candidates.find(s=>task.title===s.title&&lines.includes('Business requirement ID: '+s.businessId)&&lines.includes('Original requirement SHA256: '+s.sourceSha256));
}

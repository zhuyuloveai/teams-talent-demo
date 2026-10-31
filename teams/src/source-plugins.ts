import { fourRequirementScenario } from '../../shared/four-requirement-scenarios.js';
import { approvedRequirementSchedule } from './requirement-schedule.js';
import { matchesPlatinumCashbackPage } from '../../shared/platinum-cashback-page.js';
import type { Presentation } from './api.js';
import { externalPlatforms } from './external-platforms.js';

export type SourcePluginId = typeof externalPlatforms[number]['id'];
export type SourceProjectId = string;
export type SourceAssetKind = 'repository' | 'code' | 'requirement' | 'defect' | 'document' | 'test-case';

export interface SourceAssetReference {
  readonly collection: 'sources' | 'teams-documents' | 'graph';
  readonly path: string;
  readonly label: string;
  readonly extent: 'full-file' | 'excerpt';
  readonly origin: 'existing-local-file';
}

/** A source record is available for selection; it is never a project association. */
export interface SourcePluginAsset {
  readonly id: string;
  readonly pluginId: SourcePluginId;
  readonly sourceRecordId: string;
  readonly kind: SourceAssetKind;
  readonly title: string;
  readonly summary: string;
  readonly detail: string;
  readonly sourceProjectId: SourceProjectId;
  readonly sourceProjectName: string;
  readonly origin: 'plugin-mock' | 'teams-task';
  readonly version?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly references: readonly SourceAssetReference[];
  /** Stable asset IDs in the requirements plugin, within the same source project. */
  readonly relatedRequirementIds: readonly string[];
  readonly requirement?: { category: 'requirement' | 'research' | 'issue-input'; owner: string; plannedEnd?: string; taskId?: string; delivery?: { phase: '准备' | '开发' | '验证' | '待验收' | '已交付'; summary: string } };
  readonly testCase?: { readonly given:string; readonly steps:string; readonly expected:string };
  readonly issue?: { owner: string; severity: string; status: string; closed: boolean | null; confirmed: boolean; blocksDelivery: boolean; progress: string };
}

export type SourcePluginData = Pick<Presentation, 'blueprint' | 'teamsProject' | 'sources'> & Partial<Pick<Presentation, 'graph'>>;
export interface SourceAssetFilter { pluginId?: SourcePluginId; sourceProjectId?: SourceProjectId }
export interface SourcePluginProvider {
  readonly id: SourcePluginId;
  readonly name: string;
  readonly kinds: readonly SourceAssetKind[];
  provide(data: SourcePluginData): readonly SourcePluginAsset[];
}
export interface SourcePluginCatalog {
  readonly plugins: readonly SourcePluginProvider[];
  list(filter?: SourceAssetFilter): readonly SourcePluginAsset[];
  get(assetId: string): SourcePluginAsset | undefined;
  readReference(reference: SourceAssetReference): string | undefined;
}

export const sourceAssetKindLabels: Record<SourceAssetKind, string> = {
  repository: 'Repository', code: 'Code asset', requirement: 'Requirement', defect: 'Issue / Defect', document: 'Design and business materials', 'test-case': 'Test case',
};
const deliveryPhaseText: Record<'准备' | '开发' | '验证' | '待验收' | '已交付', string> = { '准备': 'Preparation', '开发': 'Development', '验证': 'Verification', '待验收': 'Awaiting acceptance', '已交付': 'Delivered' };
export const sourceAssetId = (pluginId: SourcePluginId, projectId: SourceProjectId, sourceRecordId: string) => `${pluginId}:${projectId}:${sourceRecordId}`;

const cardRequirement = sourceAssetId('requirements', 'carddemo', 'DEMO-MKT-001');
const teamRequirement = (id: string) => sourceAssetId('requirements', 'teams', id);
const marketingDesign = 'teams/docs/cashback-contract.md';
const marketingIntegration = 'teams/fixtures/project-documents/carddemo/docs/design/adr/ADR-009-marketing-integration.md';
const authenticationScope = 'teams/fixtures/project-documents/carddemo/docs/design/adr/ADR-007-authentication-scope.md';
const localFile = (collection: SourceAssetReference['collection'], path: string, label: string): SourceAssetReference => ({
  collection, path, label, extent: collection === 'graph' ? 'excerpt' : 'full-file', origin: 'existing-local-file',
});
const cardDesignReference = () => localFile('sources', marketingDesign, 'Read the existing marketing capability design');
const teamDocumentReference = (path: string, label: string) => localFile('teams-documents', path, label);

type AssetInput = Pick<SourcePluginAsset, 'sourceRecordId' | 'kind' | 'title' | 'summary' | 'detail'> & Partial<Pick<SourcePluginAsset, 'version' | 'createdAt' | 'updatedAt' | 'references' | 'relatedRequirementIds' | 'requirement' | 'issue' | 'testCase'>>;
const cardAdditionalRequirements: readonly AssetInput[] = [
  { sourceRecordId: 'MKT-002', kind: 'requirement', title: 'Cashback Detail Query', summary: 'View the amount, processing status and source of existing cashback by transaction, with paging and filters.',
    requirement: { category: 'requirement', plannedEnd: approvedRequirementSchedule['MKT-002'].due, owner: 'Chen Chen', delivery: { phase: '开发', summary: 'Detail query and paging are in development; the duplicate-record issue is being fixed.' } },
    detail: 'Scope: show existing cashback records, queried by transaction and processing status.\nAcceptance focus: details map to transactions; paging has no duplicates or gaps.\nThis requirement does not change cashback eligibility, rate or settlement rules.' },
  { sourceRecordId: 'MKT-003', kind: 'requirement', title: 'Statement Cashback Summary', summary: 'Summarize existing cashback records by statement cycle, with drill-down to details.',
    requirement: { category: 'requirement', plannedEnd: approvedRequirementSchedule['MKT-003'].due, owner: 'Su Qing', delivery: { phase: '验证', summary: 'Checking that the summary matches the details; a total mismatch is awaiting a fix.' } },
    detail: 'Scope: aggregate existing cashback records by statement cycle.\nAcceptance focus: the summary drills down, and its total equals the included details.\nTotals use existing posting records; no new posting or refund rules.' },
  { sourceRecordId: 'MKT-004', kind: 'requirement', title: 'Cashback Credited Notification', summary: 'Show cashback credited messages with the amount, credit time and a link to the related transaction.',
    requirement: { category: 'requirement', plannedEnd: approvedRequirementSchedule['MKT-004'].due, owner: 'Yang Fan', delivery: { phase: '待验收', summary: 'Notification content is submitted for confirmation; the related-transaction summary issue awaits retest.' } },
    detail: 'Scope: show notifications and details based on existing credit records.\nAcceptance focus: messages map to credit records, and the related transaction can be located.\nNotifications do not post cashback and do not change campaign benefits.' },
  { sourceRecordId: 'MKT-005', kind: 'requirement', title: 'Historical Benefit Query', summary: 'Query the valid period and original terms of ended benefits, keeping benefit versions.',
    requirement: { category: 'requirement', plannedEnd: approvedRequirementSchedule['MKT-005'].due, owner: 'Zhao Ning', delivery: { phase: '已交付', summary: 'Delivered per the source record; the date-sorting issue is closed, the filter interaction issue is open.' } },
    detail: 'Scope: view historical benefits and the terms version valid at the time.\nAcceptance focus: historical periods map to versions; current rules do not override old terms.\nHistorical benefits are not business constraints for the new MKT-001 requirement.' },
];
const cardAdditionalIssues: readonly AssetInput[] = [
  { sourceRecordId: 'CARD-BUG-003', kind: 'defect', title: 'Duplicate records when paging cashback details', summary: 'Some transactions appear again after paging, affecting delivery of the detail query.',
    issue: { owner: 'Chen Chen', severity: 'High', status: 'In progress', closed: false, confirmed: true, blocksDelivery: true, progress: 'Adjusting paging sort order and cursor; cross-page de-duplication will be checked after the fix.' },
    detail: 'Issue: records at page boundaries are duplicated.\nExpected: each record appears only once within the same query range.\nImpact: blocks delivery of the cashback detail query.', relatedRequirementIds: [sourceAssetId('requirements', 'carddemo', 'MKT-002')] },
  { sourceRecordId: 'CARD-BUG-004', kind: 'defect', title: 'Statement cashback summary does not match detail total', summary: 'The summary amount differs from the total of the drill-down details.',
    issue: { owner: 'Su Qing', severity: 'High', status: 'To fix', closed: false, confirmed: true, blocksDelivery: true, progress: 'Root cause found: different aggregation scopes; waiting to align summary and detail filters.' },
    detail: 'Issue: the summary and the details for the same statement cycle use different filter scopes.\nExpected: the summary equals the total of the details in the current scope.\nImpact: blocks delivery of the statement cashback summary.', relatedRequirementIds: [sourceAssetId('requirements', 'carddemo', 'MKT-003')] },
  { sourceRecordId: 'CARD-BUG-005', kind: 'defect', title: 'Cashback credited notification lacks related transaction summary', summary: 'The notification amount and time are visible, but the related transaction summary is incomplete.',
    issue: { owner: 'Yang Fan', severity: 'Medium', status: 'Awaiting retest', closed: false, confirmed: true, blocksDelivery: false, progress: 'Summary display adjusted; to be closed after retest.' },
    detail: 'Issue: notification details lack the related transaction summary.\nExpected: users can identify the transaction behind a credited message.\nCurrent status: awaiting retest, not closed.', relatedRequirementIds: [sourceAssetId('requirements', 'carddemo', 'MKT-004')] },
  { sourceRecordId: 'CARD-BUG-006', kind: 'defect', title: 'Historical benefit query keeps old filters after switching criteria', summary: 'Switching the benefit type keeps the previous filter criteria.',
    issue: { owner: 'Zhao Ning', severity: 'Low', status: 'To handle', closed: false, confirmed: true, blocksDelivery: false, progress: 'Interaction issue recorded; waiting to be scheduled.' },
    detail: 'Issue: old criteria stay in effect after switching the query type.\nExpected: show the criteria currently in effect and allow clearing filters.\nScope: follow-up issue on the delivered historical benefit query.', relatedRequirementIds: [sourceAssetId('requirements', 'carddemo', 'MKT-005')] },
  { sourceRecordId: 'CARD-BUG-007', kind: 'defect', title: 'Historical benefits sorted by date incorrectly', summary: 'Historical benefits are sorted by display string instead of actual date order.',
    issue: { owner: 'Zhao Ning', severity: 'Low', status: 'Closed', closed: true, confirmed: true, blocksDelivery: false, progress: 'The source record confirms it is fixed and closed.' },
    detail: 'Issue: benefit records spanning months are out of order.\nFix: sort by benefit date.\nCurrent status: closed in the source record.', relatedRequirementIds: [sourceAssetId('requirements', 'carddemo', 'MKT-005')] },
];
/** Explicit built-in project links; another project must associate each source separately. */
export const cardProjectOverviewSourceIds = [
  cardRequirement, sourceAssetId('defects', 'carddemo', 'CARD-BUG-001'), sourceAssetId('defects', 'carddemo', 'CARD-BUG-002'),
  ...cardAdditionalRequirements.map(item => sourceAssetId('requirements', 'carddemo', item.sourceRecordId)),
  ...cardAdditionalIssues.map(item => sourceAssetId('defects', 'carddemo', item.sourceRecordId)),
] as const;
function asset(data: SourcePluginData, pluginId: SourcePluginId, projectId: SourceProjectId, value: AssetInput): SourcePluginAsset {
  return Object.freeze({
    ...value,
    id: sourceAssetId(pluginId, projectId, value.sourceRecordId), pluginId,
    sourceProjectId: projectId,
    sourceProjectName: projectId === 'teams' ? data.teamsProject.project.name : 'Credit Card',
    origin: 'plugin-mock' as const,
    detail: `Source record · ${value.sourceRecordId}\n\n${value.detail}`,
    references: Object.freeze((value.references ?? []).map(reference => Object.freeze({ ...reference }))),
    relatedRequirementIds: Object.freeze([...(value.relatedRequirementIds ?? [])]),
  });
}

function repositoryAssets(data: SourcePluginData): readonly SourcePluginAsset[] {
  const card = (value: AssetInput) => asset(data, 'repository', 'carddemo', value);
  const repo = data.teamsProject.project.repos[0];
  return [
    card({
      sourceRecordId: 'carddemo-java-1025', kind: 'repository', title: 'CardDemo business code repository',
      summary: 'Standalone GitHub repository; the local path comes from the project workspace configuration.', version: 'Project workspace configuration',
      detail: 'Repository: https://github.com/JeffyLiu003/carddemo-java-1025.git\nThe local directory, delivery baseline and task branch follow the project workspace configuration and bindings. Source excerpts in knowledge are fixed historical samples and do not represent the current business repository version.',
      relatedRequirementIds: [cardRequirement],
    }),
    ...(data.graph ?? []).map(source => card({
      sourceRecordId: `code-${source.id}`, kind: 'code', title: `${source.name} · Source code`,
      summary: source.file, version: 'Historical source excerpt',
      detail: `Historical rule source sample\nFile: ${source.file}\nFixed sample, for knowledge display only.`,
      references: [localFile('graph', source.file, 'Read the existing source excerpt')], relatedRequirementIds: [cardRequirement],
    })),
    asset(data, 'repository', 'teams', {
      sourceRecordId: 'icode-teams', kind: 'repository', title: repo.name,
      summary: repo.note, version: `Source snapshot ${data.teamsProject.sourceCommit.slice(0, 7)}`,
      detail: `Project: ${data.teamsProject.project.name}\nRepository: ${repo.name}\nBranch: ${repo.branch}\nSource directory: ${repo.path}\n${repo.note}\nRecord from the imported Teams project snapshot; referenced files keep their original text.`,
      references: [teamDocumentReference('README.md', 'Read the repository README'), teamDocumentReference('AGENTS.md', 'Read the repository standards AGENTS.md')],
    }),
  ];
}

function requirementAssets(data: SourcePluginData): readonly SourcePluginAsset[] {
  const reconnect = data.teamsProject.inputs.find(input => input.id === 'D201');
  if (!reconnect) throw new Error('Teams project data is missing the D201 requirement basis');
  return [
    asset(data, 'requirements', 'carddemo', {
      sourceRecordId: 'DEMO-MKT-001', kind: 'requirement', title: 'Credit Card Spending Cashback', version: 'Requirement r1',
      requirement: { category: 'requirement', owner: 'Unassigned', taskId: 'DEMO-MKT-001' },
      summary: data.blueprint.scenario.slice,
      detail: `Requirement scope: ${data.blueprint.scenario.slice}\n\nConfirmed:\n1. Target customers are platinum card customers.\n2. The spending period is the next 3 months.\n3. The extra cashback rate on spending is 0.5%.\n\nTo be confirmed: campaign dates, cycle start, spending scope and exclusions, whether enrollment is required, spending threshold, cashback cap, settlement posting and refund rules.\n\nCurrent local rules and the formal policy are recorded separately; the formal business details need confirmation.`,
      references: [cardDesignReference()],
    }),
    ...cardAdditionalRequirements.map(item => asset(data, 'requirements', 'carddemo', {
      ...item, version: 'Requirement r1',
      detail: `Requirement source: requirement platform\nOwner: ${item.requirement!.owner}\nDelivery status: ${deliveryPhaseText[item.requirement!.delivery!.phase]}\nProgress: ${item.requirement!.delivery!.summary}\n\n${item.detail}\n\nProgress comes from the requirement platform record; no iCode execution session or acceptance evidence is linked yet.`,
    })),
    ...data.teamsProject.tasks.map(task => asset(data, 'requirements', 'teams', {
      sourceRecordId: `REQ-${task.id}`, kind: 'requirement', title: task.title,
      requirement: { category: task.type === '需求' ? 'requirement' : 'research', owner: 'Member ' + task.owner, plannedEnd: task.due, taskId: task.id },
      summary: task.goal, version: 'Teams requirement snapshot',
      detail: `Basis: imported Teams item ${task.id} (${task.type === '需求' ? 'requirement' : 'research'}).\nGoal: ${task.goal}\n\nRequirement criteria:\n${task.criteria.map((criterion, index) => `${index + 1}. ${criterion}`).join('\n')}\n\nThis shows only the item's requirement definition; it does not include delivery nodes, sessions, execution status or publish results.`,
    })),
    asset(data, 'requirements', 'teams', {
      sourceRecordId: 'REQ-WINDOWS-RECONNECT', kind: 'requirement', title: reconnect.title,
      requirement: { category: 'issue-input', owner: 'Member C' },
      summary: 'Restore the Agent connection after a restart, separating the normal-restart and abnormal-exit paths.', version: 'Requirement r1',
      detail: `Basis: imported Teams input ${reconnect.id}.\nSource reference: ${reconnect.ref}\n\n${reconnect.text}\n\nThis requirement is compiled from the imported input.`,
    }),
  ];
}

function defectAssets(data: SourcePluginData): readonly SourcePluginAsset[] {
  const reconnect = data.teamsProject.inputs.find(input => input.id === 'D201');
  if (!reconnect) throw new Error('Teams project data is missing the D201 issue basis');
  const web = data.graph?.find(source => source.id === 'web');
  return [
    asset(data, 'defects', 'carddemo', {
      sourceRecordId: 'CARD-BUG-001', kind: 'defect', title: 'Standard cards must not enter the platinum cashback scope', version: 'Issue r1',
      issue: { owner: 'Chen Chen', severity: 'Unlabeled', status: 'Awaiting review', closed: null, confirmed: true, blocksDelivery: false, progress: 'Check that card tier and amount calculation are linked correctly.' },
      summary: 'Add a negative case for standard cards so that not only positive platinum card input is verified.',
      detail: 'Scenario: a standard card spends CNY 120.00.\nIssue: if only the spending time is checked and the card tier is missed, a CNY 0.60 reward is calculated by mistake.\nExpected: standard cards do not participate; the reward is 0.\nThe current handling status is filled in by this delivery check record.',
      references: [cardDesignReference(), ...(web ? [localFile('graph', web.file, 'Read the existing campaign center source excerpt')] : [])], relatedRequirementIds: [cardRequirement],
    }),
    asset(data, 'defects', 'carddemo', {
      sourceRecordId: 'CARD-BUG-002', kind: 'defect', title: 'Repeated evaluation must keep one reward and one posting', version: 'Issue r1',
      issue: { owner: 'Unassigned', severity: 'Unlabeled', status: 'Awaiting reproduction', closed: null, confirmed: false, blocksDelivery: false, progress: 'No defect reproduction or close record yet.' },
      summary: 'The idempotency boundary of repeated evaluation needs verification.',
      detail: 'Issue: the same campaign and transaction receive repeated evaluation requests.\nExpected: the first request calculates the reward per the rules; later requests detect the prior evaluation and reuse the original reward ID, avoiding duplicate posting.\nReproduction: not yet reproduced; verify against the linked requirement and test cases.',
      references: [cardDesignReference(), localFile('sources', marketingIntegration, 'Read the existing marketing integration decision')], relatedRequirementIds: [cardRequirement],
    }),
    ...cardAdditionalIssues.map(item => asset(data, 'defects', 'carddemo', {
      ...item, version: 'Issue r1',
      detail: `Issue source: defect platform\nOwner: ${item.issue!.owner}\nHandling status: ${item.issue!.status}\nProgress: ${item.issue!.progress}\n\n${item.detail}\n\nThe handling status comes from the defect platform record; no iCode execution evidence is linked yet.`,
    })),
    asset(data, 'defects', 'teams', {
      sourceRecordId: 'TEAMS-BUG-001', kind: 'defect', title: reconnect.title, version: 'Teams issue snapshot',
      issue: { owner: 'Member C', severity: 'Unlabeled', status: 'Reproduction needed · close state not recorded', closed: null, confirmed: true, blocksDelivery: false, progress: 'D201 → R20 under discussion; reproduction steps for normal restart and abnormal exit are needed.' },
      summary: 'Agent connection recovery after a Windows restart.',
      detail: `Source basis: Teams input ${reconnect.id}.\nSource reference: ${reconnect.ref}\n\n${reconnect.text}\n\nThe source input is kept as the issue description; handling and verification results are pending.`,
      relatedRequirementIds: [teamRequirement('REQ-WINDOWS-RECONNECT')],
    }),
  ];
}

function designAssets(data: SourcePluginData): readonly SourcePluginAsset[] {
  const cards = [
    { sourceRecordId: 'marketing-capability', title: 'Marketing capability design', path: marketingDesign, summary: 'Platinum card eligibility, the three-month period, the extra 0.5% and amount rounding rules.' },
    { sourceRecordId: 'ADR-009', title: 'Marketing integration and posting boundary', path: marketingIntegration, summary: 'Call, commit and retry conventions between transaction posting and marketing evaluation.' },
    { sourceRecordId: 'ADR-007', title: 'Authentication scope design decision', path: authenticationScope, summary: 'Authentication scope and limits of the existing system; design material.' },
  ];
  return [
    ...cards.map(document => asset(data, 'design-library', 'carddemo', {
      sourceRecordId: document.sourceRecordId, kind: 'document', title: document.title, summary: document.summary,
      version: 'Current rule file',
      detail: `Document path: ${document.path}\n${document.summary}\n\nThe plugin provides only the document catalog record; the read entry returns the current rule document.`,
      references: [localFile('sources', document.path, `Read ${document.title}`)], relatedRequirementIds: [cardRequirement],
    })),
    ...[{ name: 'Project standards AGENTS.md', path: 'AGENTS.md', description: data.teamsProject.project.agentsNote }, ...data.teamsProject.project.docs].map(document => asset(data, 'design-library', 'teams', {
      sourceRecordId: document.path, kind: 'document', title: document.name, summary: document.description,
      version: `Source snapshot ${data.teamsProject.sourceCommit.slice(0, 7)}`,
      detail: `Project: ${data.teamsProject.project.name}\nDocument path: ${document.path}\n${document.description}\n\nThe plugin record references the original Teams import snapshot; the read entry keeps the original text.`,
      references: [teamDocumentReference(document.path, `Read ${document.name}`)],
    })),
  ];
}

function testAssets(data: SourcePluginData): readonly SourcePluginAsset[] {
  const titles: Record<string, string> = {
    'AC-01': 'Platinum card customer scope', 'AC-02': 'Spending period: next 3 months', 'AC-03': 'Extra 0.5% cashback on spending',
  };
  const definitions = [
    { id: 'TEAMS-TC-001', requirement: 'REQ-T104', title: 'New member reviews scope before getting project configuration', given: 'The user has joined the team, and the project has materials and configuration.', steps: 'Open the team project, select the configuration to apply, and review its content and scope of impact.', expected: 'Project materials, configuration content and scope are shown; this only defines the expectation and does not record an actual apply result.' },
    { id: 'TEAMS-TC-002', requirement: 'REQ-T105', title: 'After switching projects only the target project content is shown', given: 'Two projects have different materials and source links.', steps: 'Open both projects in turn from the sidebar, then open a new project with no linked assets.', expected: 'Existing projects show their own links; the new project starts empty and does not inherit data from other projects.' },
    { id: 'TEAMS-TC-003', requirement: 'REQ-T107', title: 'Working directory and repository identity check', given: 'The project has a registered repository and there is a candidate working directory on this machine.', steps: 'Select a matching directory, then a non-matching one, and check the page feedback.', expected: 'A matching directory can be linked per the contract; a non-matching directory gets a clear warning and is never assumed verified.' },
    { id: 'TEAMS-TC-004', requirement: 'REQ-WINDOWS-RECONNECT', title: 'Connection recovery after a normal Windows restart and an abnormal exit', given: 'One Agent instance is connected in a Windows environment.', steps: 'Run the normal-restart and abnormal-exit scenarios separately, then start the client and check the connection prompt.', expected: 'The real connection status and an actionable next step are shown; this case definition does not mean it has run or passed.' },
  ];
  return [
    ...data.blueprint.acceptance_criteria.filter(criterion => criterion.id in titles).map(criterion => asset(data, 'test-assets', 'carddemo', {
      sourceRecordId: `CARD-TC-${criterion.id.slice(3)}`, kind: 'test-case', title: titles[criterion.id],
      summary: criterion.given, version: 'Case v1',
      testCase:{given:criterion.given,steps:'Check against the confirmed PRD scope; no invented expectations for open policies.',expected:criterion.expected},
      detail: `Case basis: acceptance criterion ${criterion.id}.\nPrecondition / input: ${criterion.given}\nAction: check against the confirmed requirement scope; concrete steps will be added once the business details are clear.\nExpected result: ${criterion.expected}\n\nThis record is a test case definition; it contains no test run, test report or acceptance decision.`,
      references: [cardDesignReference()], relatedRequirementIds: [cardRequirement],
    })),
    ...definitions.map(definition => asset(data, 'test-assets', 'teams', {
      sourceRecordId: definition.id, kind: 'test-case', title: definition.title, summary: definition.given,
      version: 'Case v1', testCase:{given:definition.given,steps:definition.steps,expected:definition.expected},
      detail: `Precondition: ${definition.given}\nSteps: ${definition.steps}\nExpected result: ${definition.expected}\n\nThis is a test case definition; no test has been run.`,
      relatedRequirementIds: [teamRequirement(definition.requirement)],
    })),
  ];
}

const provider = (id: SourcePluginId, kinds: readonly SourceAssetKind[], provide: SourcePluginProvider['provide']): SourcePluginProvider => Object.freeze({
  id, name: externalPlatforms.find(platform => platform.id === id)!.name, kinds: Object.freeze([...kinds]), provide,
});

/** Raw source providers. Talents knowledge is shown on the project knowledge page, not as a source. */
export const sourcePluginProviders: readonly SourcePluginProvider[] = Object.freeze([
  provider('repository', ['repository', 'code'], repositoryAssets),
  provider('requirements', ['requirement'], requirementAssets),
  provider('defects', ['defect'], defectAssets),
  provider('design-library', ['document'], designAssets),
  provider('test-assets', ['test-case'], testAssets),
]);

export function createSourcePluginCatalog(data: SourcePluginData): SourcePluginCatalog {
  const records = sourcePluginProviders.flatMap(plugin => [...plugin.provide(data)]);
  const byId = new Map<string, SourcePluginAsset>();
  for (const record of records) {
    if (byId.has(record.id)) throw new Error(`Duplicate source plugin record ID: ${record.id}`);
    byId.set(record.id, record);
  }
  for (const record of records) for (const requirementId of record.relatedRequirementIds) {
    const requirement = byId.get(requirementId);
    if (!requirement || requirement.pluginId !== 'requirements' || requirement.sourceProjectId !== record.sourceProjectId) throw new Error(`Invalid source plugin requirement link: ${record.id} → ${requirementId}`);
  }
  return Object.freeze({
    plugins: sourcePluginProviders,
    list: (filter: SourceAssetFilter = {}) => Object.freeze(records.filter(record => (!filter.pluginId || record.pluginId === filter.pluginId) && (!filter.sourceProjectId || record.sourceProjectId === filter.sourceProjectId))),
    get: (assetId: string) => byId.get(assetId),
    readReference(reference: SourceAssetReference) {
      if (reference.collection === 'sources') return data.sources.find(source => source.file === reference.path)?.content;
      if (reference.collection === 'teams-documents') return data.teamsProject.documents.find(document => document.path === reference.path)?.content;
      if (reference.collection === 'graph') return data.graph?.find(source => source.file === reference.path)?.excerpt;
      return undefined;
    },
  });
}

/** Explicit project/task mapping; source candidates never become tests for unrelated tasks. */
export function taskTestCases(data:SourcePluginData,task:{projectId:string;id:string;title:string;description?:string}):readonly SourcePluginAsset[]{
 const four=fourRequirementScenario(task.projectId,task);
 if(four)return four.cases.map(item=>asset(data,'test-assets','carddemo',{sourceRecordId:item.id,kind:'test-case',title:item.title,summary:item.given,version:four.casesVersion,testCase:{given:item.given,steps:item.steps,expected:item.expected},detail:`${four.businessId} ${item.sourceSection} original case definition (not executed)\nPrecondition: ${item.given}\nSteps: ${item.steps}\nOriginal expected result: ${item.expected}\nThis run also applies the separate test-profile-v${four.version}; conflicts in the original text are kept, checks follow the registered test profile, and contradictory examples in the original text are not used as pass evidence.`,relatedRequirementIds:[]}));
 if(matchesPlatinumCashbackPage(task.projectId,task)){
  const cases=[
   {id:'PLATINUM-PAGE-TC-01',title:'Entry isolation for platinum and non-platinum cards',given:'The PRD has confirmed a verifiable customer eligibility field; if the field is missing, record a blocker.',steps:'Open card details with a clearly platinum and a clearly non-platinum eligibility.',expected:'Only platinum cards show the spending cashback benefit entry; non-platinum cards do not.'},
   {id:'PLATINUM-PAGE-TC-02',title:'Benefit description and open-policy boundary',given:'Open the benefit page through the platinum card entry.',steps:'Check the eligible customers, the next 3 months, the extra 0.5% and the open items.',expected:'Confirmed and to-be-confirmed items are separate; no definite rules are invented for date start, spending scope, cap, rounding, crediting or refunds.'},
   {id:'PLATINUM-PAGE-TC-03',title:'Unknown eligibility and data errors',given:'Eligibility information is missing, unknown or the request fails.',steps:'Check the error feedback of the entry and the benefit page.',expected:'Unknown eligibility is not treated as platinum; the PRD-confirmed error message is used, without claiming eligibility.'},
   {id:'PLATINUM-PAGE-TC-04',title:'Read-only display triggers no funds operation',given:'The current requirement scope covers only the entry and the benefit page.',steps:'Check page actions and related calls, and verify the upstream code version.',expected:'No actual cashback calculation, booking, posting or funds write is added; related checks record the actual tools and results.'},
  ];
  return cases.map(item=>asset(data,'test-assets','carddemo',{sourceRecordId:item.id,kind:'test-case',title:item.title,summary:item.given,version:'platinum-page-cases-v1',testCase:{given:item.given,steps:item.steps,expected:item.expected},detail:`Case ID: ${item.id}\nPrecondition: ${item.given}\nSteps: ${item.steps}\nExpected result: ${item.expected}\n\nScenario case definition from the enterprise test asset plugin; no test has been run. Matched by project and exact requirement title; check against the current PRD before adopting.`,relatedRequirementIds:[]}));
 }
 const requirementId=sourceAssetId('requirements',task.projectId,task.projectId==='teams'&&/^T\d+$/.test(task.id)?'REQ-'+task.id:task.id);
 return testAssets(data).filter(item=>item.sourceProjectId===task.projectId&&item.relatedRequirementIds.includes(requirementId));
}

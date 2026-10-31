/** Explicit scenario selection, not keyword inference or an automatic adoption decision. */
export const platinumCashbackPage = {
  id: 'platinum-cashback-page-v1', projectId: 'carddemo', title: 'Platinum Card Spending Cashback Benefit Page',
  artifactId: 'a-platinum-cashback-page', version: 1,
  description: 'Add a "Spending cashback benefit" entry to the credit card details. Platinum card customers can view the campaign description; non-platinum cards do not show the entry. Only platinum card, next 3 months and an extra 0.5% are fixed; the page shows eligible customers/period/rate and separates confirmed from to-be-confirmed items. Start date, spending scope, cap, rounding, crediting time and refund treatment are still open. Build only the benefit entry and description page; do not change the actual cashback calculation/posting. Requirement clarification produces the PRD; the later design, code and test reports follow the existing four-node contract.',
  manifest: 'platinum-cashback-page/provenance.json',
  files: {
    rules: 'platinum-cashback-page/Benefit Display Rules.md', questions: 'platinum-cashback-page/Open Questions Checklist.md',
    implementation: 'platinum-cashback-page/Existing Modules and UI Reference.md', acceptance: 'platinum-cashback-page/Acceptance Cases.md',
  },
} as const;
export type ScenarioNode = 'prepare' | 'develop' | 'verify' | 'accept';
type KnowledgeSelection = { file: keyof typeof platinumCashbackPage.files; slot: string; reason: string };
export const platinumCashbackPageNodes: Record<ScenarioNode, { knowledge: KnowledgeSelection[]; skills: string[]; skillSlot: string }> = {
  prepare: { knowledge: [
    { file: 'rules', slot: 'business-documents', reason: 'Check the confirmed boundary and exclusions of the benefit page' },
    { file: 'questions', slot: 'business-documents', reason: 'Record open policies and eligibility field gaps in the PRD' },
    { file: 'implementation', slot: 'business-documents', reason: 'Use the actual card details structure to constrain solution feasibility' },
  ], skills: ['ba-requirement-analysis','ba-acceptance-criteria'], skillSlot: 'business-skills' },
  develop: { knowledge: [
    { file: 'rules', slot: 'development-knowledge', reason: 'Limit this change to the entry and description display' },
    { file: 'implementation', slot: 'development-knowledge', reason: 'Reuse the actual static web modules and existing APIs' },
    { file: 'questions', slot: 'development-knowledge', reason: 'Prevent the implementation from inventing unconfirmed policies or tier fields' },
  ], skills: ['arch-solution-design','dev-frontend-ui','dev-unit-test'], skillSlot: 'development-skills' },
  verify: { knowledge: [
    { file: 'acceptance', slot: 'verification-knowledge', reason: 'Build checks for eligibility, copy, error cases and no fund operations being triggered' },
    { file: 'rules', slot: 'verification-knowledge', reason: 'Check that the implementation matches the confirmed scope' },
    { file: 'questions', slot: 'verification-knowledge', reason: 'Set no invented test expectations for open policies' },
  ], skills: ['dev-code-reviewer','dev-unit-test','qa-integration-test','sec-scan-review'], skillSlot: 'quality-skills' },
  accept: { knowledge: [
    { file: 'acceptance', slot: 'acceptance-knowledge', reason: 'Owner confirms each item against the deliverables and check reports' },
    { file: 'rules', slot: 'acceptance-knowledge', reason: 'Check that the benefit description has not expanded into calculation or posting' },
    { file: 'questions', slot: 'acceptance-knowledge', reason: 'State remaining items, the basis for resolution, or the reason for return' },
  ], skills: ['qa-uat-support'], skillSlot: 'acceptance-skills' },
};
export function matchesPlatinumCashbackPage(projectId:string,task:{id:string;title:string}){
  return projectId===platinumCashbackPage.projectId && /^REQ-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(task.id) && task.title===platinumCashbackPage.title;
}

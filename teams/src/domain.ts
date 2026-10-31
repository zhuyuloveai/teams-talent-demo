import { projectMembers } from './teams-domain.js';
import { deliveryRequirement, mainRequirementId } from './delivery-requirements.js';
import { requireCurrentTaskMember, taskAssigneeName } from './task-assignment.js';
import { queueTaskCollection } from './task-automation.js';
import { campaign, calculateCashback, runCashbackChecks } from './cashback.js';
import { availableSkillIdsFor, selectedSkillBindings, type SkillBinding } from './resource-sharing.js';
import { translate, type MessageKey } from '../../shared/i18n/index.js';
import { initialWorkspace, type WorkspaceState, type Asset, type Material } from './workspace.js';
export type Role = 'owner' | 'member';
export type Stage = 'draft' | 'assigned' | 'developing' | 'failed' | 'fixed' | 'submitted' | 'returned' | 'accepted';
export type Evolution = 'none' | 'candidate' | 'evaluated' | 'published' | 'adopted';
export interface Audit { id: number; at: string; role: Role; system: 'Teams' | 'Talent'; action: string; detail: string; origin: 'simulated' }
export interface DemoState {
  assigneeId?: string | null;
  talentGeneration?: string;
  /** Version of the knowledge Talents published for this project, synced from the shared data directory. */
  knowledgeVersion?: string;
  campaignId?: string;
  schemaVersion: 2; workspace: WorkspaceState;
  revision: number; published: boolean; assigned: boolean; knowledge: boolean; stage: Stage;
  context: null | { id: string; skillVersion: string; agentVersion: string; knowledgeVersion: string; createdAt: string; selectedSkills: string[]; skillBindings?: SkillBinding[]; materials: Material[]; assets: Asset[] };
  checks: 'none' | 'failed' | 'passed'; security: 'unverified'; enrolled: boolean;
  transactions: { id: string; amount: number; reward: number }[]; balance: number;
  duplicateChecked: boolean; uat: boolean; returnReason: string;
  evolution: Evolution; adoptedSkill: string; adoptedAgent: string; audit: Audit[];
}
export type Action = 'assign' | 'knowledge' | 'prepare' | 'replay' | 'check-fail' | 'fix' | 'submit' | 'enroll' | 'purchase' | 'deduplicate' | 'uat' | 'accept' | 'return' | 'candidate' | 'evaluate' | 'release' | 'adopt';
export const stageKeys = { draft: 'stage.draft', assigned: 'stage.assigned', developing: 'stage.developing', failed: 'stage.failed', fixed: 'stage.fixed', submitted: 'stage.submitted', returned: 'stage.returned', accepted: 'stage.accepted' } as const satisfies Record<Stage, MessageKey>;
export function initialState(): DemoState {
  return { assigneeId: null, campaignId: campaign.id, schemaVersion:2, workspace:initialWorkspace(), revision: 0, published: false, assigned: false, knowledge: false, stage: 'draft', context: null, checks: 'none', security: 'unverified', enrolled: false, transactions: [], balance: 2550.75, duplicateChecked: false, uat: false, returnReason: '', evolution: 'none', adoptedSkill: '1.0.0', adoptedAgent: 'r1', audit: [] };
}
export class DomainError extends Error { constructor(message: string, public status = 409) { super(message); } }
function requireCondition(ok: unknown, message: string): asserts ok { if (!ok) throw new DomainError(message); }
const owners: Action[] = ['assign', 'knowledge', 'candidate', 'evaluate', 'enroll', 'purchase', 'deduplicate', 'uat', 'accept', 'return', 'release', 'adopt'];
const members: Action[] = ['prepare', 'replay', 'check-fail', 'fix', 'submit'];
/** Stable ids for action labels. On the English branch the audit trail is written in English, so labels mirror the en catalog. */
export const actionKeys = { assign: 'action.assign', knowledge: 'action.knowledge', prepare: 'action.prepare', replay: 'action.replay', 'check-fail': 'action.check-fail', fix: 'action.fix', submit: 'action.submit', enroll: 'action.enroll', purchase: 'action.purchase', deduplicate: 'action.deduplicate', uat: 'action.uat', accept: 'action.accept', return: 'action.return', candidate: 'action.candidate', evaluate: 'action.evaluate', release: 'action.release', adopt: 'action.adopt' } as const satisfies Record<Action, MessageKey>;
export const actionLabels: Record<Action, string> = Object.fromEntries(
  (Object.keys(actionKeys) as Action[]).map(action => [action, translate('en', actionKeys[action])]),
) as Record<Action, string>;
export function transition(previous: DemoState, action: Action, role: Role, payload: { reason?: string; knowledgeVersion?: string; assigneeId?: string } = {}): DemoState {
  requireCondition(Object.hasOwn(actionLabels, action), 'Unknown action');
  if (owners.includes(action) && role !== 'owner' || members.includes(action) && role !== 'member') throw new DomainError('The current role is not allowed to perform this action', 403);
  const unified=deliveryRequirement(previous,'carddemo',mainRequirementId);
  if(unified&&['prepare','replay','check-fail','fix','submit','enroll','purchase','deduplicate','uat','accept','return'].includes(action))throw new DomainError('Use the task node Teams CLI submission and Owner acceptance; the old walkthrough entry is disabled');
  requireCondition(previous.campaignId === campaign.id, 'The current workspace uses old campaign rules; ask the Owner to reset the workspace in personal settings before continuing');
  if (previous.assigned && members.includes(action)) requireCurrentTaskMember(previous);
  const s = structuredClone(previous);
  let detail = '';
  switch (action) {
    case 'assign': {
      const task=deliveryRequirement(s,'carddemo',mainRequirementId);
      requireCondition((task?.stage??s.stage) !== 'accepted', 'The assignee of an accepted requirement cannot be changed');
      const member = projectMembers(s, 'carddemo').find(member => member.id === payload.assigneeId && member.status === 'active');
      requireCondition(member, 'Select a valid project member as the assignee');
      requireCondition(task?task.assigneeId!==member.id:!s.assigned || s.assigneeId !== member.id, 'This member is already the current assignee');
      if(task){task.assigneeId=member.id;task.updatedAt=new Date().toISOString();}
      else {if (!s.assigned) s.stage = 'assigned'; s.assigned = true; s.assigneeId = member.id;}
      detail = 'DEMO-MKT-001 → ' + taskAssigneeName(s) + ' · Assignee'; break;
    }
    case 'knowledge': { const version = payload.knowledgeVersion ?? 'Talents project knowledge'; requireCondition(version !== s.knowledgeVersion, 'Talents has not published new project knowledge'); s.knowledge = true; s.knowledgeVersion = version; detail = 'Talents published project knowledge: ' + version; break; }
    case 'prepare': requireCondition(s.assigned && !s.context, 'Assign the requirement first; the context cannot be frozen twice'); requireCondition(s.workspace.selectedSkills.length > 0 && s.workspace.selectedSkills.every(id => availableSkillIdsFor(s,role).includes(id)), 'Select valid project or user Skills'); s.context = { id: 'CTX-MKT-001', skillVersion: s.adoptedSkill, agentVersion: s.adoptedAgent, knowledgeVersion: s.knowledgeVersion ?? 'knowledge-v1', createdAt: new Date().toISOString(),selectedSkills:[...s.workspace.selectedSkills],skillBindings:selectedSkillBindings(s,role),materials:structuredClone(s.workspace.materials),assets:structuredClone(s.workspace.project.assets) }; detail = 'Froze requirement, acceptance criteria, knowledge and capability versions'; break;
    case 'replay': requireCondition(s.context && s.stage === 'assigned', 'Freeze the context first'); s.stage = 'developing'; detail = 'Started development of this requirement; recording work progress'; break;
    case 'check-fail': requireCondition(s.stage === 'developing', 'Start development first'); s.checks = 'failed'; s.stage = 'failed'; detail = 'Check record E3 · 6/7 · standard card wrongly included in the cashback scope'; break;
    case 'fix': requireCondition(s.stage === 'failed' || s.stage === 'returned', 'Nothing to fix right now'); s.checks = 'passed'; s.stage = 'fixed'; s.uat = false; detail = 'Fix record E4 → retest E5 · 7/7 · security still unverified'; break;
    case 'submit': requireCondition(s.stage === 'fixed' && s.checks === 'passed', 'Checks did not pass; cannot submit'); s.stage = 'submitted'; detail = 'DELIVERY-MKT-001 · includes changes, failure and retest evidence'; break;
    case 'enroll': requireCondition(s.stage === 'submitted' && !s.enrolled, 'Eligibility already confirmed or not available right now'); s.enrolled = true; detail = 'Card ending 9900 · platinum card eligibility confirmed'; break;
    case 'purchase': { requireCondition(s.stage === 'submitted' && !s.transactions.length, 'Submit the delivery first; this transaction is booked only once'); const result = calculateCashback({ amountCents: 12000, cardTier: 'platinum', purchasedAt: campaign.purchaseAt }); s.transactions.push({ id: 'TX-PLATINUM-120', amount: 120, reward: result.rewardCents / 100 }); s.balance = (255075 + 12000 - result.rewardCents) / 100; detail = 'Purchase 120.00 → extra cashback 0.60 → balance owed 2670.15'; break; }
    case 'deduplicate': requireCondition(s.stage === 'submitted' && s.transactions.length === 1 && !s.duplicateChecked, 'Complete the transaction first'); s.duplicateChecked = true; detail = 'ALREADY_EVALUATED · reward count is still 1'; break;
    case 'uat': requireCondition(s.stage === 'submitted' && s.duplicateChecked, 'Verify the purchase and de-duplication first'); requireCondition(runCashbackChecks().every(check => check.passed), 'Boundary acceptance did not pass'); s.uat = true; detail = 'Checked 7 eligibility, period, amount and duplicate-posting rules; production security still unverified'; break;
    case 'accept': requireCondition(s.stage === 'submitted' && s.uat && s.checks === 'passed', 'Acceptance conditions not met'); s.stage = 'accepted'; queueTaskCollection(s); detail = 'Functional acceptance passed · production security release still unverified'; break;
    case 'return': requireCondition(s.stage === 'submitted' && payload.reason?.trim(), 'Enter a reason for sending back'); s.stage = 'returned'; s.returnReason = payload.reason!.trim().slice(0, 500); s.uat = false; detail = s.returnReason; break;
    case 'candidate': requireCondition(s.stage === 'accepted' && s.evolution === 'none', 'Complete acceptance first');requireCondition(s.workspace.analysis.status==='analyzed','Complete the Talents trajectory analysis first'); s.evolution = 'candidate'; detail = 'Talents recorded Skill 1.1.0 and Agent r2 improvement candidates based on E3/E4/E5'; break;
    case 'evaluate': requireCondition(s.evolution === 'candidate', 'Generate a candidate first'); s.evolution = 'evaluated'; detail = 'Independent comparison of Skill / Agent with fixed inputs'; break;
    case 'release': requireCondition(s.evolution === 'evaluated', 'The candidate has not been evaluated'); s.evolution = 'published'; detail = 'Talents published Skill 1.1.0 and Agent r2'; break;
    case 'adopt': requireCondition(s.evolution === 'published', 'Publish the candidate in Talents first'); s.evolution = 'adopted'; s.adoptedSkill = '1.1.0'; s.adoptedAgent = 'r2'; detail = 'For adoption in the next run; CTX-MKT-001 still uses Skill 1.0.0 / Agent r1'; break;
  }
  s.revision++;
  s.audit.push({ id: s.revision, at: new Date().toISOString(), role, system: ['candidate', 'evaluate', 'release'].includes(action) ? 'Talent' : 'Teams', action: actionLabels[action], detail, origin: 'simulated' });
  return s;
}

import { readTalentNodeInputs } from './talent-node-client.js';
import type {TalentNodeInputs} from '../src/talent-node-inputs.js';
import { importedNodeStages, importedTaskNodeView } from '../src/imported-delivery.js';
import { taskArtifactKinds, taskNodeContractVersion, taskNodeDefinitions, taskNodeView, nodeResultErrors, unitTestExecutionShapeErrors } from '../src/task-node-contract.js';
import { projectMembers } from '../src/teams-domain.js';
const projectMemberName=(state:DemoState,projectId:string,id:string)=>projectMembers(state,projectId).find(member=>member.id===id)?.name ?? id;
import { deliveryRequirement, requirementNode, canReopenRequirementNode, requireDeliveryMember, applyRequirementProgress, type RequirementNode } from '../src/delivery-requirements.js';
import type { TalentTaskInputs } from '../src/talent-contract.js';
import { mainTask, taskAutomation, taskNodeKnowledge, queueNextNodeKnowledge } from '../src/task-automation.js';
import { requireCurrentTaskMember, taskAssigneeId, taskAssigneeName } from '../src/task-assignment.js';
import { selectedSkillBindings } from '../src/resource-sharing.js';
import { currentProjectSkillPackage, loadNativeSkillPackage, loadSourceSkillPackage } from './skill-packages.js';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DomainError, type DemoState, type Role } from '../src/domain.js';
import type { Presentation } from '../src/api.js';
import type { CollaborationScope, CollaborationEvidence, CollaborationReceipt } from '../src/collaboration.js';
import { userSkillExamples } from '../src/project-skill-examples.js';
import { createSourcePluginCatalog } from '../src/source-plugins.js';
import { legacyAssetSourceIds } from '../src/project-asset-links.js';
import { root, talentOrigin } from './config.js';
import { sharedTaskInputs } from './talent-intake.js';
import { projectKnowledge } from './shared-data.js';
import type { Store } from './store.js';

export const collaborationSkillPath = join(root, 'skills/teams-demo-collaboration/SKILL.md');
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function need(value: unknown, message: string, status = 400): asserts value { if (!value) throw new DomainError(message, status); }
const string = (value: unknown, name: string, limit = 200) => { need(typeof value === 'string' && value.trim() && value.length <= limit && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value), `${name} is invalid`); return value.trim(); };
export function checkedCollaborationScope(value: unknown): CollaborationScope {
  need(value && typeof value === 'object' && !Array.isArray(value), 'scope is invalid');
  const v = value as Record<string, unknown>;
  const scope: CollaborationScope = { projectId: string(v.projectId, 'projectId') };
  for (const key of ['taskId', 'nodeId', 'tab'] as const) if (v[key] !== undefined) scope[key] = string(v[key], key);
  need(!scope.nodeId || scope.taskId, 'nodeId requires taskId'); return scope;
}
const cardNodes = Object.fromEntries(Object.entries(taskNodeDefinitions).map(([id,node])=>[id,{name:node.label,brief:node.inputRequirements.map(item=>item.label).join(', '),output:node.deliverableRequirements.map(item=>item.label).join(', ')}]));
/** Reads exact project/task/node basis. Does not freeze, adopt, launch or mutate state. */
export async function collaborationContext(state: DemoState, data: Presentation, input: unknown) {
  const scope = checkedCollaborationScope(input), card = scope.projectId === 'carddemo', teams = scope.projectId === 'teams';
  const created = state.workspace.projects?.find(p => p.id === scope.projectId);
  need(card || teams || created, 'Project does not exist', 404);
  const live = deliveryRequirement(state,scope.projectId,scope.taskId);
  const task = teams && scope.taskId ? data.teamsProject.tasks.find(t => t.id === scope.taskId) : undefined;
  if (scope.taskId) need(Boolean(live) || (card ? scope.taskId === 'DEMO-MKT-001' : Boolean(task)), 'The task does not belong to the selected project', 404);
  const node = scope.nodeId ? card || live ? cardNodes[scope.nodeId as keyof typeof cardNodes] : task?.nodes.find(n => n.id === scope.nodeId) : undefined;
  if (scope.nodeId) need(node, 'The node does not belong to the selected task', 404);
  const frozen = card && !!scope.taskId && (!live || live.legacyBasis?.contextId && !live.talentInputsSnapshot) ? state.context : null;
  const scopedNode = scope.nodeId && (live || task) ? (live ? scope.nodeId : importedNodeStages[scope.nodeId] ?? scope.nodeId) as RequirementNode : undefined;
  const selectedSkills = scopedNode ? [] : live ? [...live.skillIds,...(live.userSkillIds??[])] : card ? frozen?.selectedSkills ?? state.workspace.selectedSkills : [];
  const materials = card&&scope.taskId==='DEMO-MKT-001' ? frozen?.materials ?? state.workspace.materials : [];
  const assets = card ? frozen?.assets ?? state.workspace.project.assets : created?.assets ?? [];
  const catalog = createSourcePluginCatalog(data);
  const raw = teams ? catalog.list({ sourceProjectId: 'teams' }).filter(a => a.kind === 'repository' || a.kind === 'document') : assets.flatMap(asset => legacyAssetSourceIds(asset).flatMap(id => { const found = catalog.get(id); return found ? [found] : []; }));
  const nodeReferences=scopedNode?raw.filter(asset=>(scopedNode==='develop'||scopedNode==='verify')&&(asset.kind==='repository'||asset.kind==='code')):raw;
  const references = [...new Map(nodeReferences.map(a => [a.id, a])).values()].map(asset => ({ id: asset.id, title: asset.title, kind: asset.kind, version: asset.version ?? 'imported-snapshot', origin: asset.origin, references: asset.references.map(ref => ({ ...ref, content: catalog.readReference(ref) ?? null, loadedByAgent: false })) }));
  const bindings = live?.skillBindings??frozen?.skillBindings ?? (!frozen ? selectedSkillBindings(state, 'member') : []);
  let skills: {id:string;scope:string;version:string;path:string|null;content:string|null;availability:string;loadedByAgent:boolean;sha256?:string|null;contentSha256?:string|null;files?:{path:string;sha256:string;executable:boolean}[];error?:string}[] = await Promise.all(selectedSkills.map(async id => {
    const user = userSkillExamples.find(s => s.id === id), project = data.skills.find(s => s.name === id);
    if (user) return {id,scope:'user',version:id==='teams-collaboration'?'demo-cli-v1':'example-v1',path:id==='teams-collaboration'?collaborationSkillPath:null,content:id==='teams-collaboration'?await readFile(collaborationSkillPath,'utf8'):user.content,availability:id==='teams-collaboration'?'demo-local-cli':'example-only',loadedByAgent:false};
    // Before the context is frozen a project skill is used at its current version, including one Talents wrote; a frozen context keeps its version.
    const binding = bindings.find(item=>item.id===id), expectedVersion = binding?.version ?? (frozen ? (id==='dev-frontend-ui' ? frozen.skillVersion : project?.version) : undefined);
    try {
      const pkg=binding?.sha256 ? await loadNativeSkillPackage(id,binding.version,binding.sha256) : frozen ? await loadSourceSkillPackage(id) : await currentProjectSkillPackage(scope.projectId,id);
      if(expectedVersion && pkg.version!==expectedVersion) throw new Error('The frozen version does not match the actual file version');
      const primary=pkg.files.find(file=>file.path==='SKILL.md')!;
      if(binding?.contentSha256 && primary.sha256!==binding.contentSha256)throw new Error('The frozen body digest does not match the content package');
      return {id,scope:binding?.source??'project',version:pkg.version,sha256:pkg.sha256,contentSha256:primary.sha256,path:binding?.sha256?null:project?.path??null,content:primary.bytes.toString('utf8'),files:pkg.files.map(({path,sha256,executable})=>({path,sha256,executable})),availability:binding?.sha256?'fixed-subscription-package':'imported-local-file',loadedByAgent:false};
    } catch(error) {
      return {id,scope:binding?.source??'project',version:expectedVersion??'unknown',sha256:binding?.sha256??null,contentSha256:binding?.contentSha256??null,path:null,content:null,availability:frozen?'frozen-version-unavailable':'source-version-unavailable',error:(error as Error).message,loadedByAgent:false};
    }
  }));
  let talentInputs:TalentTaskInputs | null = live?.talentInputsSnapshot ?? null;
  let nodeInputs:TalentNodeInputs|null=null;
  let knowledge: { status: string; origin: string; selectedVersion: string | null; assets: unknown[]; error?: string };
  if(scopedNode&&scope.taskId){
    try{nodeInputs=await readTalentNodeInputs(state,data,{projectId:scope.projectId,taskId:scope.taskId,nodeId:scopedNode});talentInputs=nodeInputs;knowledge={status:nodeInputs.knowledge.assets.length?'available':'not-built',origin:talentOrigin,selectedVersion:nodeInputs.knowledge.version??null,assets:nodeInputs.knowledge.assets};skills=nodeInputs.skills.map(item=>({...item,scope:'talent',path:null,files:[],availability:nodeInputs!.selection.basis==='historical-subset'?'historical-node-subset':'talent-node-input',loadedByAgent:false}));}
    catch(error){knowledge={status:'unavailable',origin:talentOrigin,selectedVersion:null,assets:[],error:(error as Error).message};skills=[];}
  } else if (live && !frozen) {
    try {
      talentInputs ??= await sharedTaskInputs(state, scope.projectId, live.id);
      if(talentInputs.projectId!==scope.projectId||talentInputs.taskId!==live.id||!Array.isArray(talentInputs.skills)||!Array.isArray(talentInputs.knowledge.assets))throw new Error('Invalid Talents input scope or structure');
      knowledge={status:talentInputs.knowledge.assets.length?'available':'not-built',origin:talentOrigin,selectedVersion:talentInputs.knowledge.version??null,assets:talentInputs.knowledge.assets};
      skills=[...talentInputs.skills.map(item=>({id:item.id,scope:'talent',version:item.version,sha256:item.sha256,contentSha256:item.contentSha256,path:null,content:item.content,files:[],availability:'talent-registered-asset',loadedByAgent:false})),...skills.filter(item=>item.scope==='user')];
    }catch(error){knowledge={status:'unavailable',origin:talentOrigin,selectedVersion:null,assets:[],error:(error as Error).message};skills=[];}
  } else {
  try {
    // Published Talents artifacts for this project, read from the shared data directory.
    const published = await projectKnowledge(scope.projectId);
    const assets = frozen ? published.filter(artifact => `${artifact.name} v${artifact.version}` === frozen.knowledgeVersion) : published;
    knowledge = { status: assets.length ? 'available' : frozen ? 'frozen-version-unavailable' : 'not-built', origin: talentOrigin, selectedVersion: frozen?.knowledgeVersion ?? null, assets };
  } catch (error) { knowledge = { status: 'unavailable', origin: talentOrigin, selectedVersion: frozen?.knowledgeVersion ?? null, assets: [], error: (error as Error).message }; }
  }
  const confirmations=(live?.confirmations??[]).map(({id,item,basis,confirmedBy,confirmedAt})=>({id,item,basis,confirmedBy,confirmedAt}));
  const agreement = live ? {id:live.id,title:live.title,assignee:{id:live.assigneeId,name:projectMemberName(state,live.projectId,live.assigneeId)},background:live.description,criteria:confirmations.map(item=>item.item),confirmations,revision:'requirement-v1:'+live.createdAt+(confirmations.length?':'+hash(confirmations).slice(0,8):'')} : card && scope.taskId ? { id: scope.taskId, title: data.blueprint.scenario.slice, assignee: { id: taskAssigneeId(state), name: taskAssigneeName(state) }, background: data.blueprint.scenario.parent_requirement, criteria: data.blueprint.acceptance_criteria, confirmations: [], revision: 'demo-r1' } : task ? { id: task.id, title: task.title, background: task.goal, scope: task.scope, criteria: task.criteria, confirmations: [], revision: data.teamsProject.sourceCommit } : { id: scope.projectId, title: card ? state.workspace.project.name : teams ? data.teamsProject.project.name : created!.name, background: card ? state.workspace.project.description : teams ? data.teamsProject.project.description : created!.description, criteria: [], confirmations: [], revision: 'project-preparation' };
  const nodeContract=live&&scopedNode?taskNodeView(state,live,scopedNode,data,nodeInputs):task&&scopedNode?importedTaskNodeView(task,scopedNode,nodeInputs,data):null;
  const basis = { scope, mode: frozen || live?.preparedAt ? 'frozen' : 'preparation', contextId: live?.preparedAt ? 'CTX-'+live.id : frozen?.id ?? null, frozenAt: live?.preparedAt ?? frozen?.createdAt ?? null, agreement, node: node ?? null, assets, materials, references, skills,
    projectSkills: teams && !scopedNode ? data.teamsProject.project.skills : [],
    agent: { name: 'iCode', configuration: card ? { codeAgentVersion: frozen?.agentVersion ?? state.adoptedAgent, instructions: (frozen?.agentVersion ?? state.adoptedAgent) === 'r2' ? 'Read the project context → analyze and implement → check the actual test exit codes and reports → sync issues and evidence → submit results for confirmation. A missing report stays pending verification.' : 'Read the project context → analyze and implement → run the project checks → submit results and verification evidence.', origin: 'Teams Code Agent definition', model: 'Uses the native iCode configuration; this context does not read the model or credentials' } : { status: 'native-configuration-selected-at-launch' }, loadedByAgent: false }, knowledge };
  const {mode:_mode,contextId:_contextId,frozenAt:_frozenAt,...stableBasis}=basis;
  const basisDigest = hash({...stableBasis,nodeContract:nodeContract?{version:taskNodeContractVersion,definition:nodeContract.definition,inputs:nodeContract.inputs.map(({id,label,references})=>({id,label,references}))}:null});
  const acquisition = scope.taskId && scopedNode && scopedNode!=='accept' ? taskNodeKnowledge(taskAutomation(state,{projectId:scope.projectId,taskId:scope.taskId}),scopedNode) : undefined;
  const preparationReady = !live || !taskAutomation(state,{projectId:live.projectId,taskId:live.id})?.preparation || taskAutomation(state,{projectId:live.projectId,taskId:live.id})!.preparation!.status==='ready';
  return { contract: 'teams-demo-collaboration-v1', revision: state.revision, basisDigest, ...basis, currentNodeId:live?requirementNode(live):scope.nodeId??null,
    talentInputs, nodeInputs, nodeContract:nodeContract?{version:live?.nodeContractVersion??taskNodeContractVersion,...nodeContract}:null,
    automaticPreparation: scope.taskId && scope.nodeId!=='accept' ? taskNodeKnowledge(taskAutomation(state, {projectId:scope.projectId,taskId:scope.taskId}),scope.nodeId==='develop'||scope.nodeId==='verify'?scope.nodeId:'prepare') ?? null : null,
    inputSources: scopedNode ? {knowledge:nodeInputs?.selection.basis==='historical-subset'?'Historically adopted knowledge relevant to the current node':'Teams current node knowledge and Talents shared artifacts',skills:'Registered packages selected for the current Teams node',talentSkillLoading:nodeInputs?'shared-inputs':'unavailable'} : { knowledge: frozen?'Historically frozen Talent knowledge version':'Talent project knowledge', skills: live&&!frozen ? 'Talent registered assets (Teams source packages)' : 'Teams project and pinned subscription versions', talentSkillLoading: live&&!frozen ? 'connected' : 'not-connected' },
    stage: live ? live.stage : card ? state.stage : task?.status ?? 'no-task',
    adoptedBasis: (state.workspace.collaboration?.adoptions ?? []).filter(a => a.projectId === scope.projectId && a.taskId === scope.taskId && a.nodeId === scope.nodeId),
    events: (state.workspace.collaboration?.events ?? []).filter(e => e.projectId === scope.projectId && (!scope.taskId || e.taskId === scope.taskId) && (!scope.nodeId || e.nodeId === scope.nodeId)),
    availableActions: live && !['awaiting-acceptance','accepted'].includes(live.stage) && scope.nodeId && scope.nodeId !== 'accept' && preparationReady && (!acquisition || acquisition.status==='ready' || live.nodeInputSnapshots?.[scope.nodeId as RequirementNode]) ? ['inputs.adopt', 'progress.add', 'result.submit'] : ['context.get'],
    rework: live&&scopedNode?{allowed:canReopenRequirementNode(live,scopedNode),requiresExplicitStart:true,acceptance:'manual-owner-only'}:null,
    safety: { security: 'unverified', contextReadIsAdoption: false, resultIsAcceptance: false }, skillPath: collaborationSkillPath };
}
export function collaborationOperation(state: DemoState, operationId: string) {
  const receipt = state.workspace.collaboration?.operations.find(r => r.operationId === operationId);
  need(receipt, 'Operation receipt not found; keep the original operation ID and payload for checking', 404); return { ok: true, receipt };
}
export async function collaborationWrite(store: Store, data: Presentation, body: Record<string, any>, options: { now?: () => number } = {}) {
  const receivedAt = (options.now ?? Date.now)();
  need(Number.isFinite(receivedAt), 'Invalid server receive time', 500);
  if (body.kind === 'session.report') throw new DomainError('Sessions are linked through development or verification progress and collected automatically after acceptance; no separate report is needed', 409);
  need(['inputs.adopt', 'progress.add', 'result.submit'].includes(body.kind), 'Unsupported collaboration write operation');
  need(body.role === 'member'||body.role==='owner', 'Select a role', 403);
  const operationId = string(body.operationId, 'operationId', 100), p = body.input;
  need(p && typeof p === 'object' && !Array.isArray(p), 'input must be an object');
  const scope = checkedCollaborationScope(p), runId = string(p.runId, 'runId');
  const sessionId = p.sessionId == null ? null : string(p.sessionId, 'sessionId');
  need(scope.taskId && scope.nodeId, 'Writes must specify projectId, taskId and nodeId');
  need(Number.isSafeInteger(p.expectedRevision), 'expectedRevision must be the revision that was read');
  const requestDigest = hash({ role: body.role, kind: body.kind, input: p, operationId });
  const existing = store.state.workspace.collaboration?.operations.find(r => r.operationId === operationId);
  if (existing) { need(existing.requestDigest === requestDigest, 'The payload differs for the same operationId', 409); return { ok: true, replayed: true, receipt: existing }; }
  if(p.reopen!==undefined)need(p.reopen===true&&body.kind==='progress.add'&&p.phase==='started'&&['prepare','develop','verify'].includes(scope.nodeId!),'reopen=true is only for progress add / started on explicit rework, not for acceptance');
  const context = await collaborationContext(store.state, data, scope);
  need(scope.nodeId !== 'accept', 'The acceptance node cannot be submitted or confirmed through the CLI', 403);
  const live=deliveryRequirement(store.state,scope.projectId,scope.taskId);
  if(live){requireDeliveryMember(store.state,live,body.role);const preparation=taskAutomation(store.state,scope as {projectId:string;taskId:string})?.preparation;if(preparation&&preparation.status!=='ready')throw new DomainError('Knowledge and session preparation for this requirement are not finished yet',409);const acquisition=taskNodeKnowledge(taskAutomation(store.state,scope as {projectId:string;taskId:string}),scope.nodeId as 'prepare'|'develop'|'verify');if(acquisition&&acquisition.status!=='ready'&&!live.nodeInputSnapshots?.[scope.nodeId as RequirementNode])throw new DomainError('Knowledge for this node has not been fetched yet; wait or retry, then read the context again',409);need(scope.nodeId==='prepare'||live.preparedAt,'Adopt the inputs in the prepare node first',409);need(!['awaiting-acceptance','accepted'].includes(live.stage),'The requirement is in Owner acceptance; the CLI cannot change it. Rework requires the Owner to send it back on the page',409);need(sessionId,'Reports of actual work must carry the native session ID');}
  else throw new DomainError('The selected task is not part of local delivery; the imported snapshot stays read-only',403);
  const at = new Date(receivedAt).toISOString(); let replayed = false;
  const state = await store.transact(current => {
    const prior = current.workspace.collaboration?.operations.find(r => r.operationId === operationId);
    if (prior) { need(prior.requestDigest === requestDigest, 'The payload differs for the same operationId', 409); replayed = true; return current; }
    need(current.revision === p.expectedRevision && current.revision === context.revision, 'The revision has changed; read the context again and check the original operation', 409);
    need(current.workspace.foundation.progressEnabled, 'Team collaboration progress sync is not enabled', 409);
    const next = structuredClone(current), ledger = next.workspace.collaboration ??= { adoptions: [], events: [], operations: [] };
    const revision = next.revision + 1;
    const writable=deliveryRequirement(next,scope.projectId,scope.taskId)!;
    if(scope.nodeId==='develop'&&writable.nodeContractVersion)need(writable.nodes.prepare.status==='complete','Submit the requirement clarification PRD and completion criteria first',409);
    if(scope.nodeId==='verify')need(writable.nodes.develop.status==='complete','Submit the development results first',409);
    let adoptionId: string, eventId: string | undefined;
    if (body.kind === 'inputs.adopt') {
      need(p.basisDigest === context.basisDigest, 'The adoption basis has changed; read the current context', 409);
      const allowed = [...context.references.map(r => r.id), ...context.materials.map(m => m.id), ...context.skills.map(s => s.id), ...context.knowledge.assets.map((a: any) => a.id),...(context.nodeContract?.inputs.flatMap(item=>item.references.map(reference=>reference.id))??[])];
      need(Array.isArray(p.readReferences) && p.readReferences.every((id: unknown) => typeof id === 'string' && allowed.includes(id)), 'readReferences may only list references in the current context that were actually read');
      const selected=deliveryRequirement(next,scope.projectId,scope.taskId);
      if(selected&&scope.nodeId==='prepare'&&!selected.preparedAt){need(context.talentInputs && context.skills.length>0,'Skills are not ready yet',409);selected.talentInputsSnapshot=context.talentInputs;selected.preparedAt=at;selected.inputDigest=context.basisDigest;selected.nodes.prepare={status:'running',updatedAt:at,summary:'iCode explicitly adopted the requirement, knowledge and Skill inputs; waiting for the PRD and clarification completion criteria'};selected.updatedAt=at;}
      if(selected){need(context.nodeInputs&&context.nodeInputs.selection.status==='configured','No inputs are configured for this node yet',409);selected.nodeInputSnapshots??={};selected.nodeInputSnapshots[scope.nodeId as RequirementNode]??=structuredClone(context.nodeInputs);selected.nodeContractVersion??=taskNodeContractVersion;}
      adoptionId = randomUUID();
      ledger.adoptions.push({ ...scope, id: adoptionId, role: body.role, runId, sessionId, basisDigest: context.basisDigest, readReferences: [...new Set(p.readReferences as string[])], at, revision });
    } else {
      adoptionId = string(p.adoptionId, 'adoptionId');
      const adoption = ledger.adoptions.find(a => a.id === adoptionId);
      need(adoption && adoption.projectId === scope.projectId && adoption.taskId === scope.taskId && adoption.nodeId === scope.nodeId && adoption.role === body.role && adoption.runId === runId && adoption.sessionId === sessionId, 'The adoption record does not match the project, task, node or session scope', 409);
      need(adoption.basisDigest === context.basisDigest, 'The adoption basis has changed; check it and explicitly adopt the new basis first', 409);
      const phase = body.kind === 'result.submit' ? 'result' : p.phase;
      need(['started', 'progress', 'blocked', 'result'].includes(phase) && (body.kind === 'result.submit' || phase !== 'result'), 'phase is invalid');
      const summary = string(p.summary, 'summary', 2000), blocker = phase === 'blocked' ? string(p.blocker, 'blocker', 2000) : null;
      need(Array.isArray(p.evidence) && p.evidence.length <= 30, 'evidence must be an array of references');
      const evidence: CollaborationEvidence[] = p.evidence.map((e: any, evidenceIndex: number) => { need(e && ['reference', 'local-file'].includes(e.kind), 'Invalid evidence kind');const result:CollaborationEvidence={kind:e.kind,value:string(e.value,'Evidence reference',2000),description:string(e.description,'Evidence description',1000)};if(e.artifact!==undefined){need(taskArtifactKinds.includes(e.artifact)&&!['owner-decision','delivery-manifest'].includes(e.artifact),'Invalid artifact kind, or it belongs to the Owner');need(['actual','preset'].includes(e.source),'Artifacts must state an actual/preset source');need(e.source!=='preset'||['functional-test-report','code-review-report','static-analysis-report','agent-review-report','security-report','issues-retest'].includes(e.artifact),'Only check reports can be declared as preset');result.artifact=e.artifact;result.version=string(e.version,'Artifact version',200);result.source=e.source;if(e.codeVersion!==undefined)result.codeVersion=string(e.codeVersion,'Code version',200);}
        if(e.execution!==undefined){need(e.artifact==='unit-test-result','Execution declarations only belong to unit test results');const errors=unitTestExecutionShapeErrors(e.execution);need(!errors.length,errors.join('; '));
          // New actual declarations cannot describe work performed after this request arrived.
          // Historical records and exact operation replays retain their original facts.
          if(e.source==='actual')for(const [runIndex,run] of e.execution.runs.entries())if(run.executedAt!==undefined)need(Date.parse(run.executedAt)<=receivedAt,`evidence[${evidenceIndex}].execution.runs[${runIndex}].executedAt cannot be later than the server receive time ${at}`);
          result.execution=structuredClone(e.execution);}return result; });
      const completedCriteria=p.completedCriteria??[];need(Array.isArray(completedCriteria)&&new Set(completedCriteria).size===completedCriteria.length&&completedCriteria.every((id:unknown)=>typeof id==='string'&&taskNodeDefinitions[scope.nodeId as RequirementNode].completionCriteria.some(item=>item.id===id)),'Completion criteria may only reference IDs defined for this node');
      if (phase === 'result') need(evidence.length > 0, 'A result report needs at least one verifiable reference; local files count only as local references');
      eventId = randomUUID();
      const selected=deliveryRequirement(next,scope.projectId,scope.taskId);
      if(selected?.nodeContractVersion&&phase==='result'){const errors=nodeResultErrors(next,selected,scope.nodeId as RequirementNode,evidence,completedCriteria,p.checks);need(!errors.length,errors.join('; '),409);}
      if(selected)applyRequirementProgress(selected,{nodeId:scope.nodeId as RequirementNode,phase,summary,sessionId,checks:p.checks,evidence,...(p.reopen!==undefined?{reopen:p.reopen}:{})},at);
      if(p.reopen===true&&scope.nodeId==='prepare'){const automation=taskAutomation(next,scope as {projectId:string;taskId:string});if(automation?.nodeKnowledge)delete automation.nodeKnowledge.develop;}
      ledger.events.push({ ...scope, id: eventId, operationId, role: body.role, runId, sessionId, adoptionId, phase, summary, blocker, evidence, completedCriteria, at, revision,...(p.reopen===true?{reopen:true as const}:{}) });
      if(phase==='result'&&selected)queueNextNodeKnowledge(next,{projectId:scope.projectId,taskId:scope.taskId!},scope.nodeId!,at);
    }
    const receipt: CollaborationReceipt = { ...scope, operationId, requestDigest, revision, kind: body.kind, adoptionId, ...(eventId ? { eventId } : {}), at, status: 'saved' };
    ledger.operations.push(receipt); next.revision = revision;
    next.audit.push({ id: revision, at, role: body.role as Role, system: 'Teams', action: 'Teams CLI · ' + body.kind, detail: `${scope.projectId}/${scope.taskId}/${scope.nodeId} · ${operationId}`, origin: 'simulated' });
    return next;
  });
  return { ok: true, replayed, receipt: state.workspace.collaboration!.operations.find(r => r.operationId === operationId)! };
}

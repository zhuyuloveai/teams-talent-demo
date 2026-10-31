import type {TalentNodeInputs} from './talent-node-inputs.js';
import type { DemoState } from './domain.js';
import type { Presentation } from './api.js';
import type { CollaborationEvidence } from './collaboration.js';
import type { DeliveryRequirement, RequirementNode } from './delivery-requirements.js';
import { taskAutomation,taskNodeKnowledge } from './task-automation.js';
import { createSourcePluginCatalog, taskTestCases } from './source-plugins.js';
import { legacyAssetSourceIds } from './project-asset-links.js';

export const taskNodeContractVersion = 'delivery-node-v2' as const;
export const taskArtifactKinds = ['prd','software-design','code-change','unit-test-result','functional-test-report','code-review-report','static-analysis-report','agent-review-report','security-report','issues-retest','owner-decision','delivery-manifest'] as const;
export type TaskArtifactKind = typeof taskArtifactKinds[number];
export interface UnitTestExecution {
 kind:'unit-tests';codeVersion:string;requiredScopes:string[];notRunScopes:string[];
 runs:Array<{scope:string;command:string;status:'passed'|'failed'|'not-run';exitCode:number|null;passed:number;failed:number;skipped:number;executedAt?:string;excludedSkips?:{count:number;reason:string}}>;
}
/** Shape checks allow incomplete executions to be recorded as blocked/progress. */
export function unitTestExecutionShapeErrors(value:unknown):string[]{
 const e=value as UnitTestExecution,errors:string[]=[];
 const text=(v:unknown,max=4000)=>typeof v==='string'&&!!v.trim()&&v.length<=max;
 const count=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=1_000_000_000;
 const scopes=(v:unknown)=>Array.isArray(v)&&v.length<=50&&v.every(item=>text(item,500))&&new Set(v).size===v.length;
 if(!e||typeof e!=='object'||e.kind!=='unit-tests'||!text(e.codeVersion,200)||!scopes(e.requiredScopes)||!e.requiredScopes.length||!scopes(e.notRunScopes)||!Array.isArray(e.runs)||e.runs.length>60)return ['Invalid unit test execution declaration: requiredScopes, codeVersion, runs and notRunScopes are required'];
 for(const run of e.runs){if(!run||!text(run.scope,500)||!text(run.command)||!['passed','failed','not-run'].includes(run.status)||(run.exitCode!==null&&!Number.isSafeInteger(run.exitCode))||!count(run.passed)||!count(run.failed)||!count(run.skipped)||run.executedAt!==undefined&&(!text(run.executedAt,100)||!Number.isFinite(Date.parse(run.executedAt)))||run.excludedSkips!==undefined&&(!run.excludedSkips||typeof run.excludedSkips!=='object'||!count(run.excludedSkips.count)||run.excludedSkips.count>run.skipped||!text(run.excludedSkips.reason,2000)))errors.push('Each unit test run needs an explicit command, scope, real exit code, test counts and execution time; excluded skips must be explained');}
 return errors;
}
/** Only reject obvious contradictions. Custom test commands are not guessed from a whitelist. */
export function nonTestCommand(command:string):boolean{
 const text=command.trim().toLowerCase();
 if(/(?:^|\s)-d(?:skiptests|maven\.test\.skip)(?:=(?:true|1)|(?=\s|$))/.test(text)||/(?:^|\s)--(?:skip-tests|skip-test)(?:[=\s]|$)/.test(text))return true;
 if(/(?:^|[\s/\\])node(?:\.exe)?\s+--check(?:\s|$)/.test(text))return true;
 const hasTestGoal=/(?:^|\s)(?:test|verify|surefire:test|failsafe:integration-test|--test)(?:\s|$)/.test(text);
 if(!hasTestGoal&&(/(?:^|[\s/\\])(?:mvn|mvnw|mvn\.cmd|mvnw\.cmd)(?:\s|$)/.test(text)&&/(?:^|\s)(?:compile|test-compile)(?:\s|$)/.test(text)||/(?:^|[\s/\\])(?:tsc|javac)(?:\.exe)?(?:\s|$)/.test(text)))return true;
 return false;
}
/** Declared execution facts, not a server-run command or independent report verification. */
export function unitTestResultErrors(evidence:CollaborationEvidence[],codeVersion?:string):string[]{
 const reports=evidence.filter(item=>item.artifact==='unit-test-result'),errors:string[]=[];
 if(!reports.length)return ['Completing feature development requires a unit test report and a structured execution declaration'];
 for(const report of reports){
  const execution=report.execution;
  if(report.source!=='actual')errors.push('Development unit tests must actually run; preset results are not accepted');
  if(!execution){errors.push('The unit test has only a report reference and its execution is unverified; send back execution');continue;}
  const invalid=unitTestExecutionShapeErrors(execution);if(invalid.length){errors.push(...invalid);continue;}
  if(!codeVersion||report.codeVersion!==codeVersion||execution.codeVersion!==codeVersion)errors.push('Unit tests must target the same code version as this submission');
  if(execution.notRunScopes.length)errors.push('Required test scopes not executed: '+execution.notRunScopes.join(', '));
  for(const scope of execution.requiredScopes)if(!execution.runs.some(run=>run.scope===scope))errors.push('Required unit test scope has no execution result: '+scope);
  for(const run of execution.runs){
   if(run.status!=='passed'||run.exitCode!==0||run.passed<=0||run.failed!==0||run.skipped-(run.excludedSkips?.count??0)!==0||!run.executedAt)errors.push('Unit tests have not fully run and passed: '+run.scope);
   if(nonTestCommand(run.command))errors.push('A command that compiles or skips tests cannot be evidence of passing unit tests: '+run.scope);
  }
 }
 return errors;
}
export interface TaskNodeDefinition {
 id:RequirementNode; label:string; inputRequirements:{id:string;label:string}[];
 deliverableRequirements:{id:string;label:string;artifact:TaskArtifactKind;optional?:boolean}[];
 completionCriteria:{id:string;label:string}[];
}
export const taskNodeDefinitions:Record<RequirementNode,TaskNodeDefinition>={
 prepare:{id:'prepare',label:'Requirement clarification',inputRequirements:[{id:'requirement',label:'Original requirement'},{id:'confirmations',label:'Confirmed items and basis'},{id:'business-documents',label:'Business documents and rules'},{id:'business-skills',label:'Related business Skills'}],deliverableRequirements:[{id:'prd',artifact:'prd',label:'PRD: goals, scope, rules, acceptance criteria, open items'}],completionCriteria:[{id:'prepare.boundaries',label:'The requirement boundary is clear and the PRD covers goals, scope, rules, acceptance criteria and open items'},{id:'prepare.confirmed',label:'The PRD separates confirmed and open items: every item that affects development cites its basis (confirmer, time or source), and open items name an owner and are not treated as confirmed'}]},
 develop:{id:'develop',label:'Feature development',inputRequirements:[{id:'prd',label:'Confirmed PRD'},{id:'code',label:'Existing code and code graph'},{id:'development-knowledge',label:'Pattern development scenario knowledge'},{id:'project-standards',label:'Project development standards'}],deliverableRequirements:[{id:'software-design',artifact:'software-design',label:'Software design document'},{id:'code-change',artifact:'code-change',label:'GitHub code PR or commit'},{id:'unit-test-result',artifact:'unit-test-result',label:'Unit tests and results'}],completionCriteria:[{id:'develop.prd',label:'The implementation matches the confirmed PRD'},{id:'develop.traceable',label:'The design, the code PR/commit and the unit-test results trace to the same code version'},{id:'develop.tests',label:'Unit tests for the required scope of this change actually ran and passed, with no required test left unexecuted; compiling is not a substitute'},{id:'develop.verifiable',label:'Verification can start once the required unit tests pass, and any other explicitly optional limitation is stated'}]},
 verify:{id:'verify',label:'Test verification',inputRequirements:[{id:'prd',label:'PRD acceptance criteria'},{id:'software-design',label:'Software design document'},{id:'code-change',label:'Code version to check'},{id:'test-cases',label:'Enterprise test asset plugin · test cases for this requirement'},{id:'project-standards',label:'Project standards'},{id:'quality-skills',label:'Review / test / security Skills'}],deliverableRequirements:[{id:'functional-test-report',artifact:'functional-test-report',label:'Functional test report'},{id:'static-analysis-report',artifact:'static-analysis-report',label:'Static analysis tool report'},{id:'agent-review-report',artifact:'agent-review-report',label:'Agent Review report'},{id:'code-review-report',artifact:'code-review-report',label:'Historical combined code review report',optional:true},{id:'security-report',artifact:'security-report',label:'Security report'},{id:'issues-retest',artifact:'issues-retest',label:'Issues found and retest results (record it even when there are none)'}],completionCriteria:[{id:'verify.complete',label:'Functional, static analysis, Agent Review and security checks are all covered, with actual runs and preset sources distinguished'},{id:'verify.blockers',label:'Issues blocking delivery are resolved, with the issue and retest evidence kept'},{id:'verify.current',label:'Every check in this round passed and points to the same code version awaiting acceptance'}]},
 accept:{id:'accept',label:'Requirement acceptance',inputRequirements:[{id:'prd',label:'PRD acceptance criteria'},{id:'functional-test-report',label:'Functional test results'},{id:'static-analysis-report',label:'Static analysis results'},{id:'agent-review-report',label:'Agent Review results'},{id:'code-review-report',label:'Historical combined review results'},{id:'security-report',label:'Security results'},{id:'code-change',label:'Delivered PR / commit'}],deliverableRequirements:[{id:'owner-decision',artifact:'owner-decision',label:'Owner acceptance decision or reason for sending back'},{id:'delivery-manifest',artifact:'delivery-manifest',label:'Delivery manifest: the artifact versions registered for this requirement'}],completionCriteria:[{id:'accept.decision',label:'The Owner explicitly accepts or sends back against the acceptance basis; a CLI cannot substitute for that decision'}]},
};
/** Existing adopted v1 tasks keep their declared report contract; no historical result is invented. */
export function taskNodeDefinitionFor(task:DeliveryRequirement,node:RequirementNode):TaskNodeDefinition{
 const definition=taskNodeDefinitions[node];
 if(task.nodeContractVersion!=='delivery-node-v1')return definition;
 if(node==='verify')return {...definition,deliverableRequirements:definition.deliverableRequirements.filter(item=>!['static-analysis-report','agent-review-report'].includes(item.artifact)).map(item=>item.artifact==='code-review-report'?{...item,optional:false,label:'Code review report (adopted v1 contract)'}:item)};
 return definition;
}
export interface TaskNodeReference {
 id:string;title:string;artifact?:TaskArtifactKind;kind:'reference'|'local-file'|'record';value?:string;description:string;version:string|null;codeVersion?:string;
 source:'actual'|'preset'|'owner'|'legacy';sourceNode?:RequirementNode;sourceLabel:string;execution?:UnitTestExecution;testCase?:{id:string;expected:string;pluginId:'test-assets'};
}
export interface TaskNodeItem {id:string;label:string;status:'ready'|'missing'|'unregistered';references:TaskNodeReference[]}
export interface TaskNodeView {definition:TaskNodeDefinition;inputs:TaskNodeItem[];deliverables:TaskNodeItem[];criteria:{id:string;label:string;status:'reported'|'pending'|'unregistered';evidenceIds:string[]}[];artifacts:TaskNodeReference[]}
export function taskArtifacts(state:DemoState,task:DeliveryRequirement):TaskNodeReference[]{
 const events=(state.workspace.collaboration?.events??[]).filter(event=>event.projectId===task.projectId&&event.taskId===task.id&&event.phase==='result');
 return events.flatMap(event=>event.evidence.map((evidence,index)=>({id:'artifact:'+event.id+':'+index,title:evidence.description,artifact:evidence.artifact,kind:evidence.kind,value:evidence.value,description:evidence.description,version:evidence.version??null,...(evidence.codeVersion?{codeVersion:evidence.codeVersion}:{}),...(evidence.execution?{execution:structuredClone(evidence.execution)}:{}),source:evidence.source??'legacy',sourceNode:event.nodeId as RequirementNode,sourceLabel:evidence.artifact==='unit-test-result'?(evidence.execution?'Unit test execution declaration · not independently verified':'Unit test report · execution unverified'):evidence.source==='preset'?'CLI preset check record':evidence.source==='actual'?'CLI actual result submission':'Historical unclassified result reference'})));
}
export function latestTaskArtifacts(state:DemoState,task:DeliveryRequirement):TaskNodeReference[]{
 const latest=new Map<string,TaskNodeReference>();for(const item of taskArtifacts(state,task))if(item.artifact)latest.set(item.artifact,item);return [...latest.values()];
}
export function taskNodeView(state:DemoState,task:DeliveryRequirement,node:RequirementNode,data?:Presentation,nodeInputs?:TalentNodeInputs|null):TaskNodeView{
 const definition=taskNodeDefinitionFor(task,node),artifacts=taskArtifacts(state,task),latest=latestTaskArtifacts(state,task),auto=taskAutomation(state,{projectId:task.projectId,taskId:task.id})?.knowledge?.inputs;
 const ref=(id:string,title:string,description:string,version:string|null,sourceLabel:string):TaskNodeReference=>({id,title,kind:'record',description,version,source:'actual',sourceLabel});
 const requirement=ref('requirement:'+task.projectId+':'+task.id,task.title,task.description,task.createdAt,'Task original requirement');
 const confirmations=(task.confirmations??[]).map(item=>({...ref('confirmation:'+task.projectId+':'+task.id+':'+item.id,item.item,'Basis: '+item.basis+'\nConfirmed by: '+item.confirmedBy+'\nRecorded at: '+item.confirmedAt,null,'Confirmation basis recorded by the Owner'),source:'owner' as const}));
 const projectAssets=task.projectId==='carddemo'?state.workspace.project.assets:state.workspace.projects?.find(item=>item.id===task.projectId)?.assets??[];
 const catalog=data?createSourcePluginCatalog(data):null;
 const sourceRefs=projectAssets.flatMap(asset=>legacyAssetSourceIds(asset).flatMap(id=>{const item=catalog?.get(id);return item?[{...ref(item.id,item.title,item.summary,item.version??null,'Project-linked source · '+item.pluginId),sourceKind:item.kind}]:[]}));
 const acquisition=node==='accept'?undefined:taskNodeKnowledge(taskAutomation(state,{projectId:task.projectId,taskId:task.id}),node);
 const upstream=(kind:string)=>(acquisition?.status==='ready'&&acquisition.upstream?acquisition.upstream:latest).filter(item=>item.artifact===kind);
 const mapping:Record<string,TaskNodeReference[]>={requirement:[requirement],confirmations,
  prd:upstream('prd'),code:[...sourceRefs.filter(item=>item.sourceKind==='repository'||item.sourceKind==='code'),...(sourceRefs.some(item=>item.id==='repository:carddemo:carddemo-java-1025')?data?.graph??[]:[]).map(item=>ref('graph:'+item.id,item.name,item.description,null,'Existing code graph / source excerpt'))],
  'software-design':upstream('software-design'),'code-change':upstream('code-change'),'test-cases':acquisition?.status==='ready'&&acquisition.externalInputs?acquisition.externalInputs:data?enterpriseTestCaseReferences(data,task):[],'functional-test-report':upstream('functional-test-report'),'code-review-report':upstream('code-review-report'),'static-analysis-report':upstream('static-analysis-report'),'agent-review-report':upstream('agent-review-report'),'security-report':upstream('security-report')};
 const toItem=(item:{id:string;label:string},references:TaskNodeReference[]):TaskNodeItem=>({...item,status:references.length?'ready':task.nodes[node].status==='complete'?'unregistered':'missing',references});
 const inputs=definition.inputRequirements.map(item=>toItem(item,mapping[item.id]??[]));
 applyTalentNodeInputs(inputs,nodeInputs);
 if(acquisition&&acquisition.status!=='ready'&&!task.nodeInputSnapshots?.[node])inputs.splice(0,inputs.length,{id:'requirement',label:'Original requirement',status:'ready',references:[requirement]},...definition.inputRequirements.filter(item=>item.id==='confirmations').map(item=>toItem(item,mapping[item.id]??[])));
 // Earlier verification reports stay in history, but cannot satisfy a new round.
 const superseded=new Set((taskAutomation(state,{projectId:task.projectId,taskId:task.id})?.nodeKnowledgeHistory??[]).filter(round=>round.nodeId===node).flatMap(round=>round.resultEventIds));
 const events=state.workspace.collaboration?.events??[];
 const reopenedAt=events.reduce((last,event,index)=>event.projectId===task.projectId&&event.taskId===task.id&&event.nodeId===node&&event.reopen===true?index:last,-1);
 const currentResults=events.filter((event,index)=>index>reopenedAt&&event.projectId===task.projectId&&event.taskId===task.id&&event.nodeId===node&&event.phase==='result'&&!superseded.has(event.id));
 const currentReferenceIds=new Set(currentResults.flatMap(event=>event.evidence.map((_,index)=>'artifact:'+event.id+':'+index)));
 const own=latest.filter(item=>item.sourceNode===node&&currentReferenceIds.has(item.id));
 if(node==='accept'&&(task.stage==='accepted'||task.stage==='returned'))own.push({...ref('owner-decision:'+task.projectId+':'+task.id+':'+(task.acceptedAt??task.nodes.accept.updatedAt),task.stage==='accepted'?'Owner accepted':'Owner sent back',task.nodes.accept.summary,task.acceptedAt??task.nodes.accept.updatedAt,'Owner task confirmation record'),artifact:'owner-decision',source:'owner',sourceNode:'accept'});
 if(node==='accept'&&task.stage==='accepted'&&latest.length)own.push({...ref('delivery-manifest:'+task.projectId+':'+task.id+':'+task.acceptedAt,'Registered delivery manifest',latest.map(item=>item.id).join('\n'),task.acceptedAt??null,'Artifact reference list for the same task'),artifact:'delivery-manifest',source:'owner',sourceNode:'accept'});
 const event=currentResults.at(-1);
 return {definition,inputs,deliverables:definition.deliverableRequirements.filter(item=>!item.optional||own.some(value=>value.artifact===item.artifact)).map(item=>toItem(item,own.filter(value=>value.artifact===item.artifact))),criteria:definition.completionCriteria.map(item=>({...item,status:node==='accept'&&(task.stage==='accepted'||task.stage==='returned')||event?.completedCriteria?.includes(item.id)?'reported':task.nodes[node].status==='complete'?'unregistered':'pending',evidenceIds:own.map(item=>item.id)})),artifacts};
}

/** Validate declared evidence, not the content of a remote report or Git provider. */
export function nodeResultErrors(state:DemoState,task:DeliveryRequirement,node:RequirementNode,evidence:CollaborationEvidence[],completedCriteria:readonly string[],checks:unknown):string[]{
 const definition=taskNodeDefinitions[node],errors:string[]=[];
 const declared=new Set<string>();
 for(const item of evidence){if(!item.artifact)continue;if(declared.has(item.artifact))errors.push('An artifact type cannot repeat within one result submission: '+item.artifact+'; for multi-file artifacts submit one manifest reference, and do not mark input evidence as a deliverable');declared.add(item.artifact);}
 const failed=node==='verify'&&Array.isArray(checks)&&checks.some(check=>check?.status==='failed');
 if(failed&&completedCriteria.includes('verify.current'))errors.push('There are failed checks; you cannot declare that every check in this round passed');
 const legacyReview = task.nodeContractVersion==='delivery-node-v1';
 const requiredDeliverables=definition.deliverableRequirements.filter(item=>node!=='verify'?!item.optional:legacyReview?!['static-analysis-report','agent-review-report'].includes(item.artifact):!item.optional);
 for(const required of failed?[]:requiredDeliverables)if(!evidence.some(item=>item.artifact===required.artifact))errors.push('Missing deliverable: '+required.label);
 for(const required of failed?[]:definition.completionCriteria)if(!completedCriteria.includes(required.id))errors.push('Completion criterion not yet declared: '+required.label);
 if(node==='develop')errors.push(...unitTestResultErrors(evidence,evidence.find(item=>item.artifact==='code-change')?.codeVersion));
 const latest=latestTaskArtifacts(state,task);
 const requiredUpstream=node==='develop'?['prd']:node==='verify'?['prd','software-design','code-change']:[];
 for(const id of requiredUpstream)if(!latest.some(item=>item.artifact===id))errors.push('Missing upstream artifact: '+id);
 const code=node==='develop'?evidence.find(item=>item.artifact==='code-change'):latest.find(item=>item.artifact==='code-change');
 if(node==='develop'||node==='verify'){
  if(!code?.codeVersion)errors.push('The codeVersion of the code PR/commit must be specified');
  for(const item of evidence.filter(item=>item.artifact&&item.artifact!=='prd'))if(item.codeVersion!==code?.codeVersion)errors.push('Artifact code version mismatch: '+item.description);
 }
 if(node==='verify'&&!failed)for(const artifact of legacyReview?['functional-test-report','code-review-report','security-report']:['functional-test-report','static-analysis-report','agent-review-report','security-report']){
  const report=evidence.find(item=>item.artifact===artifact),matches=Array.isArray(checks)?checks.filter(item=>item?.artifact===artifact):[];
  if(!matches.length)errors.push('Missing check conclusion for report: '+artifact);
  if(report&&matches.some(item=>item.source!==report.source))errors.push('Report and check sources differ: '+artifact);
 }
 return errors;
}

/** Both UI and CLI place the exact Talent response in its declared node slots. */
export function applyTalentNodeInputs(inputs:TaskNodeItem[],value?:TalentNodeInputs|null){
 if(!value)return;
 const add=(slot:string,label:string,reference:TaskNodeReference)=>{let item=inputs.find(item=>item.id===slot);if(!item){item={id:slot,label,status:'missing',references:[]};inputs.push(item);}item.references.push(reference);item.status='ready';};
 for(const selected of value.selection.knowledge){const asset=value.knowledge.assets.find(item=>item.id===selected.id);if(!asset)continue;add(selected.slot,selected.slot==='verification-knowledge'?'Verification knowledge for this requirement':selected.slot==='acceptance-knowledge'?'Acceptance criteria and checklist':'Node knowledge',{id:asset.id,title:asset.title,description:asset.detail+'\nReason for link: '+selected.reason,kind:'record',version:asset.version??null,source:value.selection.basis==='historical-subset'?'legacy':'preset',sourceLabel:value.selection.basis==='historical-subset'?'Historically adopted knowledge · the part relevant to this node':value.selection.source==='teams-node-selection'?(asset.origin==='talents-shared'?'Talents published knowledge · filtered by the Teams node':'Teams node knowledge configuration'):'Talent node knowledge',value:JSON.stringify({scope:{projectId:value.projectId,taskId:value.taskId,nodeId:value.nodeId},selection:value.selection.source,version:value.selection.version,origin:asset.origin,reason:selected.reason})});}
 for(const selected of value.selection.skills){const skill=value.skills.find(item=>item.id===selected.id);if(!skill)continue;add(selected.slot,selected.slot==='development-skills'?'Design and development Skill':selected.slot==='acceptance-skills'?'Acceptance Skill':'Node Skill',{id:skill.id,title:skill.name,description:selected.reason,kind:'record',version:skill.version,source:value.selection.basis==='historical-subset'?'legacy':'actual',sourceLabel:value.selection.basis==='historical-subset'?'Historically adopted Skill · the part relevant to this node':'Talent node Skill',value:JSON.stringify({source:skill.source,sha256:skill.sha256,contentSha256:skill.contentSha256,nodeId:value.nodeId,reason:selected.reason})});}
}

/** Enterprise test definitions are independent of Talent knowledge and are never execution results. */
export function enterpriseTestCaseReferences(data:Presentation,task:{projectId:string;id:string;title:string;description?:string}):TaskNodeReference[]{
 return taskTestCases(data,task).map(item=>({id:item.id,title:item.sourceRecordId+' · '+item.title,kind:'record',description:item.detail,version:item.version??null,source:'preset',sourceLabel:'Enterprise test asset plugin · case definition (not executed)',testCase:{id:item.sourceRecordId,expected:item.testCase!.expected,pluginId:'test-assets'},value:JSON.stringify({pluginId:item.pluginId,caseId:item.sourceRecordId,version:item.version,expected:item.testCase!.expected,sourceProjectId:item.sourceProjectId,taskId:task.id})}));
}

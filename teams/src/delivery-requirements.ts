import type { CollaborationEvidence } from './collaboration.js';
import { creationText, optionalAssignee, optionalDue, requireProjectCreator } from './task-creation.js';
import { nodeResultErrors, unitTestResultErrors } from './task-node-contract.js';
import type { TalentNodeInputs } from './talent-node-inputs.js';
import type { TalentTaskInputs } from './talent-contract.js';
import type { SkillBinding } from './resource-sharing.js';
import { DomainError, type DemoState, type Role } from './domain.js';
import { translate, type MessageKey } from '../../shared/i18n/index.js';
import { projectMembers } from './teams-domain.js';
export type RequirementNode = 'prepare' | 'develop' | 'verify' | 'accept';
export type RequirementStage = 'preparing' | 'developing' | 'verifying' | 'awaiting-acceptance' | 'accepted' | 'returned';
export interface RequirementNodeState { status:'pending'|'running'|'blocked'|'complete'|'waiting-owner'; updatedAt:string|null; summary:string }
export interface RequirementCheck { id:string; nodeId:RequirementNode; status:'passed'|'failed'; source:'actual'|'preset'; artifact?:string; summary:string; at:string; sessionId:string|null }
/** Owner-registered confirmation of a requirement fact, with the basis it rests on. */
export interface RequirementConfirmation { id:string; item:string; basis:string; confirmedBy:string; confirmedAt:string }
export interface DeliveryRequirement {
 id:string;projectId:string;title:string;description:string;assigneeId:string;skillIds:string[];workDirectory?:string;due?:string;creationRequest?:string;
 talentInputsSnapshot?:TalentTaskInputs;
 nodeInputSnapshots?:Partial<Record<RequirementNode,TalentNodeInputs>>;
 nodeContractVersion?:'delivery-node-v1'|'delivery-node-v2';
 skillBindings?:SkillBinding[];userSkillIds?:string[];
 stage:RequirementStage;createdAt:string;updatedAt:string;acceptedAt?:string;preparedAt?:string;inputDigest?:string;
 nodes:Record<RequirementNode,RequirementNodeState>;checks:RequirementCheck[];confirmations?:RequirementConfirmation[];
 /** IDs from the current verification submission; empty means fresh checks are required. */
 verificationCheckIds?:string[];
 /** Preserved pre-unification facts; these are not iCode execution receipts. */
 legacyBasis?:{stage:DemoState['stage'];checks:DemoState['checks'];contextId:string|null;origin:'legacy-snapshot'};
}
export const mainRequirementId='DEMO-MKT-001';
export const requirementStageKeys = { preparing: 'reqStage.preparing', developing: 'reqStage.developing', verifying: 'reqStage.verifying', 'awaiting-acceptance': 'reqStage.awaiting-acceptance', accepted: 'reqStage.accepted', returned: 'reqStage.returned' } as const satisfies Record<RequirementStage, MessageKey>;
/** Server-side messages quote the stage in English on this branch; the UI translates requirementStageKeys itself. */
export const requirementStageLabels: Record<RequirementStage, string> = Object.fromEntries(
  (Object.keys(requirementStageKeys) as RequirementStage[]).map(stage => [stage, translate('en', requirementStageKeys[stage])]),
) as Record<RequirementStage, string>;
export const deliveryRequirement=(state:DemoState,projectId:string,taskId?:string)=>(state.workspace.deliveryRequirements??[]).find(task=>task.projectId===projectId&&task.id===taskId);
export const requirementNode=(task:DeliveryRequirement):RequirementNode=>task.stage==='preparing'?'prepare':task.stage==='developing'||task.stage==='returned'?'develop':task.stage==='verifying'?'verify':'accept';
export function requireDeliveryMember(state:DemoState,task:DeliveryRequirement,role:Role){if(!['owner','member'].includes(role)||task.assigneeId!==role||!projectMembers(state,task.projectId).some(member=>member.id===role&&member.status==='active'))throw new DomainError('Only the current assignee of this requirement can report work status',403);}
export function createDeliveryRequirement(state:DemoState,role:Role,input:Record<string,unknown>,at:string){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new DomainError('Invalid requirement content',400);
 const projectId=creationText(input.projectId,'Project',100);requireProjectCreator(state,role,projectId);
 const id=creationText(input.id,'Requirement ID',100);
 if(!/^MKT-[A-Z0-9][A-Z0-9-]{2,60}$/.test(id)&&!/^REQ-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||id==='MKT-001')throw new DomainError('Invalid requirement ID', 400);
 const skillIds=input.skillIds===undefined?[]:input.skillIds;
 if(!Array.isArray(skillIds)||skillIds.length>20||skillIds.some(id=>typeof id!=='string'||!/^[a-z0-9-]+$/.test(id)))throw new DomainError('Invalid format for selected Skills', 400);
 const due=optionalDue(input.due),workDirectory=input.workDirectory===undefined?undefined:creationText(input.workDirectory,'Working directory',2000);
 const fields={id,projectId,title:creationText(input.title,'Requirement title',160),description:creationText(input.description,'Requirement description',4000,true),assigneeId:optionalAssignee(state,projectId,input.assigneeId),skillIds:[...new Set(skillIds as string[])].sort(),...(due?{due}:{}),...(workDirectory?{workDirectory}:{})};
 if(state.workspace.taskDeletions?.some(item=>item.projectId===projectId&&item.taskId===id))throw new DomainError('This requirement ID was deleted and cannot be reused; use a new requirement ID',409);
 const creationRequest=JSON.stringify(fields),existing=deliveryRequirement(state,projectId,id);
 if(existing){if(existing.creationRequest!==creationRequest)throw new DomainError('The same requirement ID cannot be used for different creation content',409);return existing;}
 const nodes=Object.fromEntries(['prepare','develop','verify','accept'].map(id=>[id,{status:'pending',updatedAt:null,summary:''}])) as DeliveryRequirement['nodes'];
 const task:DeliveryRequirement={...fields,creationRequest,stage:'preparing',createdAt:at,updatedAt:at,nodes,checks:[],verificationCheckIds:[]};
 state.workspace.deliveryRequirements=[...(state.workspace.deliveryRequirements??[]),task];return task;
}
export function assignDeliveryRequirement(state:DemoState,role:Role,input:Record<string,unknown>,at:string){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new DomainError('Invalid assignment content', 400);
 const projectId=creationText(input.projectId,'Project',100);requireProjectCreator(state,role,projectId);
 const task=deliveryRequirement(state,projectId,creationText(input.taskId,'Requirement ID',100));if(!task)throw new DomainError('Delivery requirement not found',404);
 if(task.stage!=='preparing'||task.preparedAt||Object.values(task.nodes).some(node=>node.status!=='pending'))throw new DomainError('The requirement has started; the assignee cannot be changed',409);
 const preparation=state.workspace.taskAutomation?.find(record=>record.projectId===projectId&&record.taskId===task.id)?.preparation;
 if(preparation&&['preparing-session','ready'].includes(preparation.status)&&input.assigneeId!==task.assigneeId)throw new DomainError('A native session is being prepared or is ready; handle the current session before reassigning',409);
 if(typeof input.assigneeId!=='string')throw new DomainError('Specify an assignee or the unassigned state',400);
 task.assigneeId=optionalAssignee(state,projectId,input.assigneeId);task.updatedAt=at;return task;
}
/** Only the Owner records confirmations; the delivered member cannot confirm its own open questions. */
export function updateRequirementConfirmations(state:DemoState,role:Role,projectId:string,taskId:string,value:unknown,at:string){
 if(role!=='owner')throw new DomainError('Only the project Owner can record confirmation basis',403);
 const task=deliveryRequirement(state,projectId,taskId);if(!task)throw new DomainError('Delivery requirement not found',404);
 if(task.stage==='awaiting-acceptance'||task.stage==='accepted')throw new DomainError('The requirement is submitted for acceptance; the confirmation basis cannot be changed',409);
 if(!Array.isArray(value)||value.length>20)throw new DomainError('Invalid confirmation basis format or more than 20 entries',400);
 const prior=new Map((task.confirmations??[]).map(item=>[item.id,item])),ids=new Set<string>();
 const text=(entry:Record<string,unknown>,field:string,label:string,limit:number)=>{const raw=entry[field];if(typeof raw!=='string'||!raw.trim()||raw.length>limit||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(raw))throw new DomainError(label+' is invalid',400);return raw.trim();};
 task.confirmations=value.map(raw=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new DomainError('Invalid confirmation basis entry',400);
  const entry=raw as Record<string,unknown>,id=entry.id===undefined?crypto.randomUUID():text(entry,'id','Confirmation basis ID',100);
  if(ids.has(id))throw new DomainError('Duplicate confirmation basis ID',400);ids.add(id);
  const item=text(entry,'item','Confirmed item',300),basis=text(entry,'basis','Confirmation basis',2000),confirmedBy=text(entry,'confirmedBy','Confirmed by',80);
  const previous=prior.get(id),unchanged=previous&&previous.item===item&&previous.basis===basis&&previous.confirmedBy===confirmedBy;
  return {id,item,basis,confirmedBy,confirmedAt:unchanged?previous.confirmedAt:at};
 });
 task.updatedAt=at;return task;
}
export function verificationChecks(task:DeliveryRequirement):RequirementCheck[]{
 if(task.verificationCheckIds!==undefined)return task.checks.filter(check=>task.verificationCheckIds!.includes(check.id));
 // Existing records predate batch IDs. A single CLI submission stamped every check
 // with the same time/session; read its final contiguous batch without rewriting history.
 const last=task.checks.at(-1);if(!last)return [];
 let start=task.checks.length-1;while(start>0&&task.checks[start-1].at===last.at&&task.checks[start-1].sessionId===last.sessionId)start--;
 return task.checks.slice(start);
}
export function acceptDeliveryRequirement(state:DemoState,role:Role,task:DeliveryRequirement,at:string){
 if(role!=='owner')throw new DomainError('Only the Owner can accept a requirement',403);
 const checks=verificationChecks(task);
 if(task.stage!=='awaiting-acceptance'||task.nodes.develop.status!=='complete'||task.nodes.verify.status!=='complete'||!checks.length||checks.some(check=>check.status!=='passed'))throw new DomainError('Development and verification are not complete; the requirement cannot be accepted');
 if(task.nodeContractVersion){const result=[...(state.workspace.collaboration?.events??[])].reverse().find(event=>event.projectId===task.projectId&&event.taskId===task.id&&event.nodeId==='verify'&&event.phase==='result');const errors=nodeResultErrors(state,task,'verify',result?.evidence??[],result?.completedCriteria??[],checks);if(errors.length)throw new DomainError('Acceptance basis incomplete: '+errors.join('; '));}
 task.stage='accepted';task.acceptedAt=at;task.updatedAt=at;task.nodes.accept={status:'complete',updatedAt:at,summary:'Owner accepted'};
}
export function returnDeliveryRequirement(role:Role,task:DeliveryRequirement,reason:unknown,at:string){
 if(role!=='owner'||task.stage!=='awaiting-acceptance')throw new DomainError('The current state or role cannot send back',403);
 if(typeof reason!=='string'||!reason.trim())throw new DomainError('Sending back requires a reason');
 task.stage='returned';task.updatedAt=at;task.verificationCheckIds=[];
 task.nodes.accept={status:'pending',updatedAt:at,summary:reason};task.nodes.develop={status:'running',updatedAt:at,summary:reason};task.nodes.verify={status:'pending',updatedAt:at,summary:'Awaiting re-verification'};
}
/** Rework is explicit and stops at the manual Owner acceptance boundary. */
export function canReopenRequirementNode(task:DeliveryRequirement,nodeId:RequirementNode){
 if(nodeId==='prepare')return task.nodes.prepare.status==='complete'&&task.stage==='developing'&&task.nodes.develop.status==='pending'&&!task.nodeInputSnapshots?.develop;
 if(nodeId==='develop')return task.nodes.develop.status==='complete'&&task.stage==='verifying'&&['pending','blocked'].includes(task.nodes.verify.status);
 if(nodeId==='verify')return task.stage==='verifying'&&task.nodes.develop.status==='complete'&&task.nodes.verify.status==='blocked';
 return false;
}
export function applyRequirementProgress(task:DeliveryRequirement,input:{nodeId:RequirementNode;phase:'started'|'progress'|'blocked'|'result';summary:string;sessionId:string|null;checks?:unknown;evidence?:CollaborationEvidence[];reopen?:boolean},at:string){
 const {nodeId,phase,summary}=input;if(nodeId==='accept')throw new DomainError('The CLI cannot substitute for Owner acceptance',403);
 if(task.stage==='accepted'||task.stage==='awaiting-acceptance')throw new DomainError('The requirement is submitted for acceptance and the CLI cannot change it; rework requires the Owner to send it back manually on the page',409);
 const reopening=input.reopen===true&&phase==='started'&&canReopenRequirementNode(task,nodeId);
 if(input.reopen!==undefined&&(input.reopen!==true||!reopening))throw new DomainError('reopen=true is only for explicit rework: requirement clarification only before feature development has adopted inputs, development only while verification is not started or blocked, verification only while this round is blocked; acceptance can only be handled by the Owner on the page',409);
 if((task.nodes[nodeId].status==='complete'||nodeId==='prepare'&&task.stage!=='preparing')&&!reopening)throw new DomainError(`${nodeId==='prepare'?'Requirement clarification':nodeId==='develop'?'Feature development':'Test verification'} is complete; you cannot report current work with the old nodeId=${nodeId}. The current stage is ${requirementStageLabels[task.stage]}. Run context get and inputs adopt again with nodeId=${requirementNode(task)}, then report progress; for explicit rework use started with reopen=true`,409);
 if(nodeId!=='prepare'&&!task.preparedAt)throw new DomainError('Explicitly adopt the inputs for this run in the requirement clarification node first');
 if(nodeId==='develop'&&task.nodeContractVersion&&task.nodes.prepare.status!=='complete')throw new DomainError('Submit the requirement clarification PRD and completion criteria first');
 if(nodeId==='verify'&&task.nodes.develop.status!=='complete')throw new DomainError('Submit the development result first');
 if(nodeId==='develop'&&phase==='result'){const evidence=input.evidence??[],errors=unitTestResultErrors(evidence,evidence.find(item=>item.artifact==='code-change')?.codeVersion);if(errors.length)throw new DomainError(errors.join('；'),409);}
 let submitted:RequirementCheck[]|undefined;
 if(input.checks!==undefined){if(nodeId!=='verify'||!Array.isArray(input.checks)||input.checks.length===0||input.checks.length>30)throw new DomainError('Check results must belong to the verification node');submitted=input.checks.map(raw=>{const check=raw as Record<string,unknown>;if(!check||!['passed','failed'].includes(String(check.status))||!['actual','preset'].includes(String(check.source))||typeof check.summary!=='string'||!check.summary.trim()||check.summary.length>2000)throw new DomainError('Check results need an explicit conclusion, source and summary');return{id:crypto.randomUUID(),nodeId,status:check.status as 'passed'|'failed',source:check.source as 'actual'|'preset',summary:check.summary,at,sessionId:input.sessionId,...(typeof check.artifact==='string'?{artifact:check.artifact}:{})};});}
 if(nodeId==='develop'||nodeId==='verify'&&phase==='started')task.verificationCheckIds=[];
 if(submitted){task.checks.push(...submitted);task.verificationCheckIds=submitted.map(check=>check.id);}
 const checks=verificationChecks(task);
 if(nodeId==='verify'&&phase==='result'&&!checks.length)throw new DomainError('A verification result needs new check results and sources for this round');
 const failed=nodeId==='verify'&&checks.some(check=>check.status==='failed');
 if(reopening&&nodeId==='prepare')task.stage='preparing';
 task.nodes[nodeId]={status:phase==='blocked'||failed?'blocked':phase==='result'?'complete':'running',updatedAt:at,summary};task.updatedAt=at;
 if(nodeId==='prepare'&&phase==='result')task.stage='developing';
 if(nodeId==='develop')task.stage=phase==='result'?'verifying':'developing';
 if(nodeId==='verify'){task.stage=phase==='result'&&!failed?'awaiting-acceptance':'verifying';if(task.stage==='awaiting-acceptance')task.nodes.accept={status:'waiting-owner',updatedAt:at,summary:'Development and verification results submitted; awaiting Owner acceptance'};}
}
export function validateDeliveryRequirements(state:DemoState){
 if(state.workspace.deliveryRequirements===undefined)return;
 if(!Array.isArray(state.workspace.deliveryRequirements))throw new Error('Invalid delivery requirement records');const ids=new Set<string>();
 for(const task of state.workspace.deliveryRequirements){if(!task||typeof task.id!=='string'||ids.has(task.projectId+'/'+task.id)||!Object.hasOwn(requirementStageLabels,task.stage)||!(task.assigneeId===''&&task.stage==='preparing'&&!task.preparedAt||projectMembers(state,task.projectId).some(member=>member.id===task.assigneeId&&member.status==='active'))||!Array.isArray(task.skillIds)||!Array.isArray(task.checks)||!['prepare','develop','verify','accept'].every(id=>task.nodes?.[id as RequirementNode]&&['pending','running','blocked','complete','waiting-owner'].includes(task.nodes[id as RequirementNode].status)))throw new Error('Delivery requirement records are corrupted; not overwritten automatically');
  if(!['carddemo','teams'].includes(task.projectId)&&!state.workspace.projects?.some(project=>project.id===task.projectId))throw new Error('The project of the delivery requirement does not exist');
  if(task.due!==undefined)optionalDue(task.due);
  if(task.creationRequest!==undefined&&(typeof task.creationRequest!=='string'||task.creationRequest.length>12000))throw new Error('Invalid requirement creation basis');
  if(task.confirmations!==undefined&&(!Array.isArray(task.confirmations)||task.confirmations.length>20||new Set(task.confirmations.map(item=>item?.id)).size!==task.confirmations.length||task.confirmations.some(item=>!item||typeof item.id!=='string'||!item.id||typeof item.item!=='string'||!item.item.trim()||item.item.length>300||typeof item.basis!=='string'||!item.basis.trim()||item.basis.length>2000||typeof item.confirmedBy!=='string'||!item.confirmedBy.trim()||item.confirmedBy.length>80||typeof item.confirmedAt!=='string'||!Number.isFinite(Date.parse(item.confirmedAt)))))throw new Error('Invalid requirement confirmation basis; not overwritten automatically');
  if(task.verificationCheckIds!==undefined&&(!Array.isArray(task.verificationCheckIds)||new Set(task.verificationCheckIds).size!==task.verificationCheckIds.length||task.verificationCheckIds.some((id,index)=>typeof id!=='string'||task.checks[task.checks.length-task.verificationCheckIds!.length+index]?.id!==id)))throw new Error('Invalid current check batch for the requirement; not overwritten automatically');
  if(task.nodeInputSnapshots!==undefined){for(const [node,input]of Object.entries(task.nodeInputSnapshots)){if(!['prepare','develop','verify','accept'].includes(node)||!input||input.projectId!==task.projectId||input.taskId!==task.id||input.nodeId!==node||!Array.isArray(input.skills)||!Array.isArray(input.knowledge?.assets))throw new Error('Invalid scope of node adopted inputs');}}
  if(task.nodeContractVersion!==undefined&&!['delivery-node-v1','delivery-node-v2'].includes(task.nodeContractVersion))throw new Error('Invalid task node contract version');
  ids.add(task.projectId+'/'+task.id);}
}

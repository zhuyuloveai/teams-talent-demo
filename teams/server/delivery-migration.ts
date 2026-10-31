import { createHash } from 'node:crypto';
import { selectedSkillBindings } from '../src/resource-sharing.js';
import { userSkillExamples } from '../src/project-skill-examples.js';
import type { DemoState } from '../src/domain.js';
import { deliveryRequirement, mainRequirementId, type DeliveryRequirement, type RequirementNode, type RequirementStage } from '../src/delivery-requirements.js';

/** Explicit v1 main-task conversion. Call once under Store initialization; no event is invented. */
export function migrateMainDelivery(state:DemoState):boolean {
 if(deliveryRequirement(state,'carddemo',mainRequirementId))return false;
 const at=state.audit.at(-1)?.at??new Date().toISOString();
 const stages:Record<DemoState['stage'],RequirementStage>={draft:'preparing',assigned:'preparing',developing:'developing',failed:'verifying',fixed:'verifying',submitted:'awaiting-acceptance',returned:'returned',accepted:'accepted'};
 const node=(status:DeliveryRequirement['nodes'][RequirementNode]['status'],summary:string)=>({status,updatedAt:status==='pending'?null:at,summary});
 const developed=['failed','fixed','submitted','accepted'].includes(state.stage),verified=['submitted','accepted'].includes(state.stage)&&state.checks==='passed';
 const task:DeliveryRequirement={id:mainRequirementId,projectId:'carddemo',title:'Credit Card Spending Cashback',description:'Platinum card customers get an extra 0.5% cashback on their spending over the next 3 months. The official campaign dates, eligible spending, limits and refund rules are pending business confirmation.',assigneeId:state.assigned?(state.assigneeId??'member'):'',skillIds:[...(state.context?.selectedSkills??state.workspace.selectedSkills)],stage:stages[state.stage],createdAt:state.audit[0]?.at??at,updatedAt:at,checks:[],verificationCheckIds:[],legacyBasis:{stage:state.stage,checks:state.checks,contextId:state.context?.id??null,origin:'legacy-snapshot'},nodes:{
  prepare:node(state.context?'complete':'pending',state.context?'Historical context is frozen; the original basis is kept and no iCode adoption event was added':''),
  develop:node(developed?'complete':['developing','returned'].includes(state.stage)?'running':'pending',state.stage==='draft'||state.stage==='assigned'?'':'Migrated historical development status; not recorded as an iCode run'),
  verify:node(verified?'complete':state.checks==='failed'?'blocked':'pending',state.checks==='none'?'':'Migrated historical check result; later rechecks are reported back by iCode'),
  accept:node(state.stage==='accepted'?'complete':state.stage==='submitted'?'waiting-owner':'pending',state.stage==='accepted'?'The original Owner acceptance decision is kept':'')
 }};
 if(state.context){task.preparedAt=state.context.createdAt;task.inputDigest=createHash('sha256').update(JSON.stringify(state.context)).digest('hex');}
 task.userSkillIds=task.skillIds.filter(id=>userSkillExamples.some(skill=>skill.id===id));task.skillIds=task.skillIds.filter(id=>!task.userSkillIds!.includes(id));if(state.context?.skillBindings)task.skillBindings=structuredClone(state.context.skillBindings);else if(!state.context)task.skillBindings=selectedSkillBindings(state,'member');
 if(state.stage==='accepted')task.acceptedAt=[...state.audit].reverse().find(item=>['通过功能验收','Functional acceptance passed'].includes(item.action))?.at??at;
 if(state.checks!=='none'){
  const id='legacy-main-verification';task.checks.push({id,nodeId:'verify',status:state.checks,source:'preset',summary:'Historical preset check record · '+(state.checks==='passed'?'Retest passed':'Issues were found'),at,sessionId:null});
  if(state.stage!=='returned')task.verificationCheckIds=[id];
 }
 state.workspace.deliveryRequirements=[task,...(state.workspace.deliveryRequirements??[])];
 return true;
}

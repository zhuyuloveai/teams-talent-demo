import type {Presentation} from '../src/api.js';
import {DomainError} from '../src/domain.js';
import {deliveryRequirement,type RequirementNode} from '../src/delivery-requirements.js';
import type {TalentTaskInputs} from '../src/talent-contract.js';
import type {TalentNodeInputs} from '../src/talent-node-inputs.js';
import {nodePreset,nodePresetVersion,registeredTaskNodePreset} from './talent-node-presets.js';
import {taskAutomation} from '../src/task-automation.js';
import type {DemoState} from '../src/domain.js';
import type {PublishedArtifact} from '../../shared/contracts.js';
import {matchesPlatinumCashbackPage,platinumCashbackPage,platinumCashbackPageNodes} from '../../shared/platinum-cashback-page.js';
import {platinumPageKnowledge,type PublishedInputReader} from './platinum-cashback-page.js';
export interface NodeInputContext {state:DemoState;project:{id:string;name:string;generation:string}}
import {fourRequirementScenario,fourRequirementNodes} from '../../shared/four-requirement-scenarios.js';
import {fourRequirementKnowledge} from './four-requirement-inputs.js';
import type {SkillBinding} from '../src/resource-sharing.js';

export function checkedNode(value:string):RequirementNode{if(!['prepare','develop','verify','accept'].includes(value))throw new DomainError('Task input node does not exist',404);return value as RequirementNode;}
/** Exact scope selection; no model call, no project knowledge build, no state writes. */
export async function talentNodeInputs(ctx:NodeInputContext,data:Pick<Presentation,'teamsProject'>,taskId:string,nodeId:RequirementNode,origin:string,loadSkill:(id:string,binding?:SkillBinding)=>Promise<TalentTaskInputs['skills'][number]>, published:PublishedArtifact[]=[],readPublishedFile?:PublishedInputReader):Promise<TalentNodeInputs>{
 const projectId=ctx.project.id,task=deliveryRequirement(ctx.state,projectId,taskId),source=projectId==='teams'?data.teamsProject.tasks.find(item=>item.id===taskId):undefined;
 if(!task&&!source)throw new DomainError('Task does not exist or does not belong to the selected project',404);
 const frozen=task?.nodeInputSnapshots?.[nodeId];
 if(frozen){if(frozen.projectId!==projectId||frozen.taskId!==taskId||frozen.nodeId!==nodeId)throw new DomainError('Adopted node input scope does not match',409);return {...structuredClone(frozen),origin,selection:{...structuredClone(frozen.selection),basis:'adopted-node'}};}
 const four=task?fourRequirementScenario(projectId,task):undefined;
 if(task&&!four&&task.description.split('\n').some(line=>line.startsWith('Test profile version: ')||line.startsWith('Test profile SHA256: ')))throw new DomainError('The requirement test profile markers do not match the pinned version; no other inputs were selected',409);
 const scenario=task&&matchesPlatinumCashbackPage(projectId,task)?platinumCashbackPageNodes[nodeId]:undefined;
 const knownPreset=nodePreset(projectId,taskId,nodeId),preset=four?{knowledge:[],skills:fourRequirementNodes[nodeId].skills,skillSlot:fourRequirementNodes[nodeId].skillSlot}:scenario?{knowledge:[],skills:scenario.skills,skillSlot:scenario.skillSlot}:knownPreset??(task&&taskAutomation(ctx.state,{projectId,taskId})?.preparation?registeredTaskNodePreset(task,nodeId):undefined),requirement={id:taskId,title:task?.title??source!.title,description:task?.description??[source!.goal,'Scope: '+source!.scope].join('\n')};
 const base:TalentNodeInputs={projectId,taskId,nodeId,generation:ctx.project.generation,origin,requirement,knowledge:{status:'not-built',assets:[]},skills:[],selection:{version:nodePresetVersion,source:'teams-node-selection',status:preset?'configured':'not-configured',basis:'recommendation',note:preset?'Teams selects published knowledge and registered Skills per node configuration; this does not claim Talents ran the recommendation or that it was adopted this time.':'No inputs are configured for this task and node yet.',missingSkillIds:[],knowledge:[],skills:[]}};
 if(!preset)return base;
 // Older task-wide snapshots are immutable. Select only matching recorded packages;
 // never silently substitute today's recommendation for what the agent adopted then.
 const historical=task?.talentInputsSnapshot&&!('nodeId' in task.talentInputsSnapshot)?task.talentInputsSnapshot:undefined;
 if(historical){
  base.knowledge={...structuredClone(historical.knowledge),assets:structuredClone(historical.knowledge.assets.filter(asset=>asset.sourceRecordId===taskId))};
  base.knowledge.status=base.knowledge.assets.length?'ready':'not-built';
  base.skills=structuredClone(historical.skills.filter(skill=>preset.skills.includes(skill.id)));
  base.selection.basis='historical-subset';base.selection.note='Only historically adopted content relevant to the current node is shown; new recommendations are not backfilled as adopted at that time.';base.selection.missingSkillIds=preset.skills.filter(id=>!base.skills.some(skill=>skill.id===id));
  base.selection.knowledge=base.knowledge.assets.map(asset=>({id:asset.id,slot:preset.knowledge[0]?.slot??'business-documents',nodeId,reason:'Review the knowledge records historically adopted for this requirement'}));
 }else if(four){
  const selected=fourRequirementNodes[nodeId],source=await fourRequirementKnowledge(four,published,nodeId,readPublishedFile);
  base.selection.scenario={id:four.id,artifactId:four.artifactId,artifactVersion:four.version,matchedBy:'project-and-exact-title',origin:'scenario-fixture'};
  if(!source){base.selection.status='not-configured';base.selection.note='The pinned-version materials for this business requirement are not published yet; register them and retry the import.';return base;}
  base.selection.note='Node materials are selected by business requirement ID, exact title and source digest. The summary is for navigation; read the full requirement and test profile from the referenced paths and verify their SHA256. This does not claim adoption, execution or acceptance.';
  base.knowledge={status:'ready',version:String(source.artifact.version),assets:source.documents.map(item=>({id:`talents-shared:${source.artifact.id}:v${source.artifact.version}:${item.file}`,title:item.title,version:String(source.artifact.version),detail:`${four.businessId} · ${four.title}\n${item.reason}.\nThis is a materials index; the full text is in the referenced file. After reading, verify the version and SHA256. The full original requirement v1.0 is kept; the Chapter 5 rules and the separate test-profile-v${four.version} are used for this verification, and the formal §12.3 items to be confirmed remain open.`,origin:'talents-shared',sourceRecordId:taskId,sourceProjectId:projectId,sourceProjectName:ctx.project.name,artifactId:source.artifact.id,contentSha256:item.sha256,references:[{collection:'talents-shared',path:item.path,label:item.title,...(item.absolutePath?{absolutePath:item.absolutePath}:{}),sha256:item.sha256,version:String(source.artifact.version)}]}))};
  base.selection.knowledge=base.knowledge.assets.map((asset,index)=>({id:asset.id,slot:source.documents[index].slot,nodeId,reason:source.documents[index].reason}));
  base.skills=await Promise.all(selected.skills.map(async id=>{const skill=await loadSkill(id,task?.skillBindings?.find(item=>item.id===id));source.assertSkill(skill);return skill;}));
 }else if(scenario){
  const source=await platinumPageKnowledge(published,nodeId,readPublishedFile);
  base.selection.scenario={id:platinumCashbackPage.id,artifactId:platinumCashbackPage.artifactId,artifactVersion:platinumCashbackPage.version,matchedBy:'project-and-exact-title',origin:'scenario-fixture'};
  base.selection.note='Reads the benefit page materials published by Talents by project and exact title; the actual requirement description is kept separately, differences in the materials must be clarified, and this does not claim adoption or execution.';
  if(!source){base.selection.status='not-configured';base.selection.note='The matching benefit page knowledge artifact is not published to the current shared directory yet; register the materials first and retry the import.';return base;}
  base.knowledge={status:'ready',version:String(source.artifact.version),assets:source.documents.map(item=>({id:`talents-shared:${source.artifact.id}:v${source.artifact.version}:${item.file}`,title:item.title,version:String(source.artifact.version),detail:item.content,origin:'talents-shared',sourceRecordId:taskId,sourceProjectId:projectId,sourceProjectName:ctx.project.name,artifactId:source.artifact.id,contentSha256:item.sha256,references:[{collection:'talents-shared',path:item.path,label:item.title}]}))};
  base.selection.knowledge=base.knowledge.assets.map((asset,index)=>({id:asset.id,slot:source.documents[index].slot,nodeId,reason:source.documents[index].reason}));
  base.skills=await Promise.all(scenario.skills.map(id=>loadSkill(id,task?.skillBindings?.find(item=>item.id===id))));
 }else{
  base.knowledge={status:preset.knowledge.length?'ready':'not-built',version:nodePresetVersion,assets:preset.knowledge.map(item=>({id:`talent-node:${projectId}:${taskId}:${nodeId}:${item.id}`,pluginId:'business-knowledge',sourceRecordId:taskId,kind:'knowledge',title:item.title,summary:item.reason,detail:item.content,sourceProjectId:projectId,sourceProjectName:ctx.project.name,origin:'teams-node-preset',version:nodePresetVersion,references:[],relatedRequirementIds:[`requirements:${projectId}:${taskId}`]}))};
  base.selection.knowledge=base.knowledge.assets.map((asset,index)=>({id:asset.id,slot:preset.knowledge[index].slot,nodeId,reason:preset.knowledge[index].reason}));
  base.skills=await Promise.all(preset.skills.map(async id=>{
   return loadSkill(id,task?.skillBindings?.find(item=>item.id===id));
  }));
  // Code graphs are named for the repository Talents built them from: the development node takes the project's code graphs.
  const selectedPublished:Record<RequirementNode,string[]>={prepare:['a-biz'],develop:['a-std','a-miner'],verify:['a-std'],accept:['a-biz']};
  const selectedCapabilities:Partial<Record<RequirementNode,string[]>>={develop:['codegraph']};
  for(const artifact of published.filter(item=>!!knownPreset&&item.projectId===projectId&&(selectedPublished[nodeId].includes(item.id)||!!selectedCapabilities[nodeId]?.includes(item.capability)))){
   const slot=artifact.id==='a-std'?'project-standards':nodeId==='prepare'?'business-documents':nodeId==='accept'?'acceptance-knowledge':'development-knowledge';
   const id=`talents-shared:${artifact.id}:v${artifact.version}`;
   base.knowledge.assets.push({id,title:artifact.name,version:String(artifact.version),detail:artifact.description,origin:'talents-shared',sourceProjectId:projectId,sourceRecordId:taskId,references:artifact.files.map(file=>({collection:'talents-shared',path:file.path,label:file.title}))});
   base.selection.knowledge.push({id,slot,nodeId,reason:'Summary of a Talents published artifact selected by project and current node; read the full text through the project knowledge entry'});
  }
 }
 base.selection.skills=base.skills.map(skill=>({id:skill.id,slot:preset.skillSlot,nodeId,reason:'Used for '+({prepare:'requirement analysis and acceptance criteria',develop:'design and implementation',verify:'quality checks',accept:'business acceptance'}[nodeId])+'; does not claim the tools were run'}));
 return base;
}

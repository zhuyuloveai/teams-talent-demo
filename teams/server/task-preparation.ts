import { enterpriseTestCaseReferences } from '../src/task-node-contract.js';
import { DomainError, type DemoState, type Role } from '../src/domain.js';
import { deliveryRequirement } from '../src/delivery-requirements.js';
import { projectMembers } from '../src/teams-domain.js';
import { taskAutomation, queueTaskPreparation, taskPreparationBasis, type TaskScope, type TaskPreparation, type ImportedTaskInputs, taskNodeKnowledge, nodeKnowledgeBasis, type KnowledgeNode } from '../src/task-automation.js';
import type { TalentNodeInputs } from '../src/talent-node-inputs.js';
import type { NativePreparationResult } from '../src/native-preparation.js';
import type { Presentation } from '../src/api.js';
import type { Store } from './store.js';
import { readTalentNodeInputs } from './talent-node-client.js';

interface PreparationDependencies {
  prepareSession(assigneeId:string,scope:TaskScope,preparationId:string):Promise<NativePreparationResult>;
  loadInputs?(state:DemoState,scope:TaskScope&{nodeId?:KnowledgeNode}):Promise<TalentNodeInputs>;
  delay?(milliseconds:number):Promise<void>;
  delayMs?:number;
}
class SupersededPreparation extends Error {}
const wait = (milliseconds:number) => new Promise<void>(resolve => { const timer=setTimeout(resolve,milliseconds);timer.unref(); });

/** A persisted preparation job, independent of adoption, development and acceptance. */
export class TaskPreparationService {
  private active=new Map<string,Promise<DemoState>>();
  constructor(private store:Store,private data:Presentation,private dependencies:PreparationDependencies,private changed:()=>Promise<unknown>=async()=>{}){}
  private current(scope:TaskScope,id:string,state=this.store.state){
    const task=deliveryRequirement(state,scope.projectId,scope.taskId),preparation=taskAutomation(state,scope)?.preparation;
    if(!task||!preparation||preparation.id!==id||preparation.basisKey!==taskPreparationBasis(state,scope)||task.assigneeId!==preparation.assigneeId||task.stage!=='preparing'||task.preparedAt)throw new SupersededPreparation('The task or its preparation basis has changed');
    return {task,preparation};
  }
  private async update(scope:TaskScope,id:string,action:string,operation:(state:DemoState,preparation:TaskPreparation)=>void){
    const saved=await this.store.transact(current=>{this.current(scope,id,current);const next=structuredClone(current),preparation=taskAutomation(next,scope)!.preparation!;operation(next,preparation);preparation.updatedAt=new Date().toISOString();next.revision++;next.audit.push({id:next.revision,at:preparation.updatedAt,role:'owner',system:'Teams',action,detail:scope.projectId+'/'+scope.taskId,origin:'simulated'});return next;});
    await this.changed();return saved;
  }
  resumeQueued(){
    for(const record of this.store.state.workspace.taskAutomation??[])for(const node of ['develop','verify'] as const)if(['queued','running'].includes(record.nodeKnowledge?.[node]?.status??''))void this.scheduleNode(record,node).catch(error=>console.error('Node knowledge retrieval did not finish: '+(error as Error).message));
    for(const record of this.store.state.workspace.taskAutomation??[])if(record.preparation&&['queued','importing','preparing-session'].includes(record.preparation.status)&&record.preparation.assigneeId)void this.schedule(record).catch(error=>console.error('Automatic preparation did not finish: '+(error as Error).message));
  }
  async retry(role:Role,scope:TaskScope){
    const task=deliveryRequirement(this.store.state,scope.projectId,scope.taskId);
    if(!task||!projectMembers(this.store.state,scope.projectId).some(member=>member.id===role&&member.status==='active')||role!=='owner'&&task.assigneeId!==role)throw new DomainError('Only the assignee or the project Owner can retry preparation',403);
    if(!task.assigneeId)throw new DomainError('Assign an assignee first',409);
    // Only an explicit preparation request may initialize an untouched historical task.
    // Page reads/startup never manufacture a new job or replace an adopted/ready cache.
    if(!taskAutomation(this.store.state,scope)?.preparation){
      await this.store.transact(current=>{
        const selected=deliveryRequirement(current,scope.projectId,scope.taskId),record=taskAutomation(current,scope);
        if(!selected||selected.assigneeId!==role||!projectMembers(current,scope.projectId).some(member=>member.id===role&&member.status==='active'))throw new DomainError('Only the current assignee can start session preparation',403);
        if(record?.preparation)return current;
        if(selected.stage!=='preparing'||selected.preparedAt||Object.keys(selected.nodeInputSnapshots??{}).length||Object.values(selected.nodes).some(node=>node.status!=='pending')||['running','ready'].includes(record?.knowledge?.status??''))throw new DomainError('The current task already has run or input records. Continue from the existing work entry; preparation was not recreated.',409);
        const next=structuredClone(current),at=new Date().toISOString();queueTaskPreparation(next,scope,at);
        next.revision++;next.audit.push({id:next.revision,at,role,system:'Teams',action:'Confirm iCode session preparation',detail:scope.projectId+'/'+scope.taskId,origin:'simulated'});return next;
      });await this.changed();
    }
    const preparation=taskAutomation(this.store.state,scope)!.preparation!;
    if(preparation.status==='ready')return this.store.state;
    if(['failed','waiting-directory'].includes(preparation.status)&&!preparation.retryable)throw new DomainError('The current preparation needs its native records checked and cannot be started again',409);
    void this.schedule(scope,true).catch(error=>console.error('Retrying automatic preparation did not finish: '+(error as Error).message));return this.store.state;
  }
  schedule(scope:TaskScope,retry=false):Promise<DemoState>{
    const preparation=taskAutomation(this.store.state,scope)?.preparation;
    if(!preparation||!preparation.assigneeId||preparation.status==='ready'||!retry&&['failed','waiting-directory'].includes(preparation.status))return Promise.resolve(this.store.state);
    const running=this.active.get(preparation.id);if(running)return running;
    const pending=this.execute({...scope},preparation.id).finally(()=>this.active.delete(preparation.id));this.active.set(preparation.id,pending);return pending;
  }
  async retryNode(role:Role,scope:TaskScope,node:KnowledgeNode){
    if(node==='prepare')return this.retry(role,scope);
    const task=deliveryRequirement(this.store.state,scope.projectId,scope.taskId);
    if(!task||!projectMembers(this.store.state,scope.projectId).some(member=>member.id===role&&member.status==='active')||role!=='owner'&&task.assigneeId!==role)throw new DomainError('Only the assignee or the project Owner can retry knowledge retrieval',403);
    const job=taskNodeKnowledge(taskAutomation(this.store.state,scope),node);if(!job||job.status==='waiting-upstream')throw new DomainError('The current node is waiting for upstream deliverables; knowledge cannot be retrieved early',409);
    void this.scheduleNode(scope,node,true).catch(error=>console.error('Retrying node knowledge did not finish: '+(error as Error).message));return this.store.state;
  }
  scheduleNode(scope:TaskScope,node:'develop'|'verify',retry=false):Promise<DemoState>{
    const job=taskNodeKnowledge(taskAutomation(this.store.state,scope),node);
    if(!job||['waiting-upstream','ready'].includes(job.status)||job.status==='failed'&&!retry)return Promise.resolve(this.store.state);
    const running=this.active.get(job.id);if(running)return running;
    const pending=this.executeNode({...scope},node,job.id).finally(()=>this.active.delete(job.id));this.active.set(job.id,pending);return pending;
  }
  private async executeNode(scope:TaskScope,node:'develop'|'verify',id:string){
    const current=(state=this.store.state)=>{const task=deliveryRequirement(state,scope.projectId,scope.taskId),job=taskNodeKnowledge(taskAutomation(state,scope),node);if(!task||!job||job.id!==id||task.nodeInputSnapshots?.[node])throw new SupersededPreparation('Node knowledge retrieval was replaced or the node already has frozen inputs');return{task,job};};
    const save=async(action:string,operation:(job:NonNullable<ReturnType<typeof taskNodeKnowledge>>)=>void)=>{const saved=await this.store.transact(state=>{current(state);const next=structuredClone(state),job=current(next).job;operation(job);next.revision++;next.audit.push({id:next.revision,at:new Date().toISOString(),role:'owner',system:'Teams',action,detail:scope.projectId+'/'+scope.taskId+'/'+node,origin:'simulated'});return next;});await this.changed();return saved;};
    try{
      const before=current();if(!projectMembers(this.store.state,scope.projectId).some(member=>member.id===before.task.assigneeId&&member.status==='active'))throw new Error('The assignee is not an active member of the current project');
      if(before.job.basisKey!==nodeKnowledgeBasis(this.store.state,scope,node))throw new Error('The upstream artifact version changed. Check the input basis of the current node first; the original retrieval record was not replaced.');
      if(before.job.status!=='running')await save('Automatic node knowledge retrieval · started',job=>{job.status='running';job.attempts++;job.startedAt=new Date().toISOString();job.finishedAt=null;delete job.error;});
      const job=current().job,remaining=Math.max(0,(this.dependencies.delayMs??job.delayMs??20000)-(Date.now()-Date.parse(job.startedAt)));
      if(remaining)await(this.dependencies.delay??wait)(remaining);
      current();
      const inputs=await(this.dependencies.loadInputs?.(this.store.state,{...scope,nodeId:node})??readTalentNodeInputs(this.store.state,this.data,{...scope,nodeId:node},{forImport:true}));
      const latest=current();if(latest.job.basisKey!==nodeKnowledgeBasis(this.store.state,scope,node))throw new Error('The upstream artifact version changed during retrieval; inconsistent node inputs were not written');
      if(inputs.projectId!==scope.projectId||inputs.taskId!==scope.taskId||inputs.nodeId!==node||inputs.selection.status!=='configured'||!inputs.knowledge.assets.length||!inputs.skills.length||inputs.skills.some(skill=>!skill.content||!skill.sha256))throw new Error('Knowledge and Skills for the current node are not fully configured yet');
      return await save('Automatic node knowledge retrieval · completed',record=>{record.status='ready';record.finishedAt=new Date().toISOString();record.nodeInputs=structuredClone(inputs);record.externalInputs=node==='verify'?enterpriseTestCaseReferences(this.data,latest.task):[];record.inputs={mode:'preparation',contextId:null,requirement:inputs.requirement.title,knowledgeStatus:'available',knowledge:inputs.knowledge.assets.map(item=>({id:item.id,title:item.title,version:item.version})),skills:inputs.skills.map(item=>({id:item.id,version:item.version,available:true})),references:(record.upstream??[]).map(item=>({id:item.id,title:item.title,version:item.version??'Not registered'})),materials:[],notes:['Only this node\'s inputs were retrieved; this does not replace adoption or execution by iCode.']};});
    }catch(error){if(error instanceof SupersededPreparation)return this.store.state;try{return await save('Automatic node knowledge retrieval · not finished',job=>{job.status='failed';job.finishedAt=new Date().toISOString();job.error=(error as Error).message;});}catch(stale){if(stale instanceof SupersededPreparation)return this.store.state;throw stale;}}
  }
  private async execute(scope:TaskScope,id:string){
    try{
      const first=this.current(scope,id),knowledge=taskAutomation(this.store.state,scope)!.knowledge;
      if(!projectMembers(this.store.state,scope.projectId).some(member=>member.id===first.task.assigneeId&&member.status==='active'))throw new Error('The assignee is not an active member of the current project');
      if(knowledge?.status!=='ready'){
        if(first.preparation.status!=='importing')await this.update(scope,id,'Automatic preparation · knowledge import started',(state,preparation)=>{
          const at=new Date().toISOString();preparation.status='importing';preparation.startedAt=at;preparation.finishedAt=null;preparation.error=undefined;preparation.retryable=false;preparation.attempts++;
          preparation.progress.push({at,phase:'knowledge',status:'started',summary:'Importing knowledge and Skills for the current requirement',source:'teams-import'});
          const record=taskAutomation(state,scope)!;record.knowledge={...record.knowledge,id:record.knowledge?.id??crypto.randomUUID(),attempts:(record.knowledge?.attempts??0)+1,status:'running',startedAt:at,finishedAt:null};
        });
        const startedAt=this.current(scope,id).preparation.startedAt!;
        const remaining=Math.max(0,(this.dependencies.delayMs??taskAutomation(this.store.state,scope)?.knowledge?.delayMs??10000)-(Date.now()-Date.parse(startedAt)));
        if(remaining)await(this.dependencies.delay??wait)(remaining);
        this.current(scope,id);
        const inputs=await(this.dependencies.loadInputs?.(this.store.state,scope)??readTalentNodeInputs(this.store.state,this.data,{...scope,nodeId:'prepare'},{forImport:true}));
        this.current(scope,id);
        if(inputs.projectId!==scope.projectId||inputs.taskId!==scope.taskId||inputs.nodeId!=='prepare'||inputs.selection.status!=='configured'||!inputs.knowledge.assets.length||!inputs.skills.length||inputs.skills.some(skill=>!skill.content||!skill.sha256))throw new Error('Knowledge or Skills for the current requirement are not ready; the native session was not prepared');
        await this.update(scope,id,'Automatic preparation · knowledge import completed',(state,preparation)=>{
          const at=new Date().toISOString(),record=taskAutomation(state,scope)!;
          const summary:ImportedTaskInputs={mode:'preparation',contextId:null,requirement:inputs.requirement.title,knowledgeStatus:'available',knowledge:inputs.knowledge.assets.map(item=>({id:item.id,title:item.title,version:item.version})),skills:inputs.skills.map(item=>({id:item.id,version:item.version,available:true})),references:[],materials:[],notes:['Node knowledge and registered Skills for the current requirement were imported; adoption or execution is not confirmed yet.']};
          record.knowledge={...record.knowledge!,status:'ready',finishedAt:at,inputs:summary,nodeInputs:structuredClone(inputs)};
          preparation.status='preparing-session';preparation.progress.push({at,phase:'knowledge',status:'completed',summary:'Knowledge and Skills for the current requirement imported',source:'teams-import'});
        });
      }
      await this.update(scope,id,'Automatic preparation · creating native session',(state,preparation)=>{
        preparation.status='preparing-session';preparation.error=undefined;preparation.finishedAt=null;preparation.retryable=false;
        preparation.progress.push({at:new Date().toISOString(),phase:'session',status:'started',summary:'Calling native iCode to create a session and read the task and node context',source:'native-cli'});
      });
      const {task}=this.current(scope,id);
      const result=await this.dependencies.prepareSession(task.assigneeId,scope,id);
      this.current(scope,id);
      if(result.status==='waiting-directory')return await this.update(scope,id,'Automatic preparation · waiting for work directory',(_state,preparation)=>{preparation.status='waiting-directory';preparation.retryable=true;preparation.error=result.reason;preparation.finishedAt=new Date().toISOString();preparation.progress.push({at:preparation.finishedAt,phase:'session',status:'waiting',summary:result.reason,source:'native-cli'});});
      if(result.runId!==id||!/^[a-f0-9-]{36}$/i.test(result.sessionId)||!/^[a-f0-9]{64}$/.test(result.contextSha256)||!/^[a-f0-9]{64}$/.test(result.sessionSha256)||!result.readEvidence.length)throw new Error('The native preparation receipt lacks verifiable session or context-read evidence');
      return await this.update(scope,id,'Automatic preparation · session ready',(_state,preparation)=>{preparation.status='ready';preparation.session=result;preparation.retryable=false;preparation.finishedAt=new Date().toISOString();preparation.progress.push({at:preparation.finishedAt,phase:'session',status:'completed',summary:result.summary,source:'native-cli'});});
    }catch(error){
      if(error instanceof SupersededPreparation)return this.store.state;
      try{return await this.update(scope,id,'Automatic preparation · not finished',(state,preparation)=>{const knowledge=taskAutomation(state,scope)!.knowledge;const phase=knowledge?.status==='ready'?'session':'knowledge';if(knowledge&&phase==='knowledge'){knowledge.status='failed';knowledge.error=(error as Error).message;knowledge.finishedAt=new Date().toISOString();}preparation.status='failed';preparation.retryable=true;preparation.error=(error as Error).message;preparation.finishedAt=new Date().toISOString();preparation.progress.push({at:preparation.finishedAt,phase,status:'failed',summary:(error as Error).message,source:phase==='knowledge'?'teams-import':'native-cli'});});}
      catch(stale){if(stale instanceof SupersededPreparation)return this.store.state;throw stale;}
    }
  }
}

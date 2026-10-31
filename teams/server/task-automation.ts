import { exportTaskSessions } from './talent-intake.js';
import { nativeTaskSessionDocuments } from './task-session-documents.js';
import { createHash } from 'node:crypto';
import { runtimeDir,root } from './config.js';
import {resolve} from 'node:path';
import {taskWorktreeBinding} from './task-work-directory.js';
import {configuredProjectWorkspace} from './project-workspaces.js';
import type {DeliveryRequirement} from '../src/delivery-requirements.js';
import { deliveryRequirement,requireDeliveryMember } from '../src/delivery-requirements.js';
import type { TalentTaskSessionReceipt } from '../src/talent-contract.js';
import { requireCurrentTaskMember } from '../src/task-assignment.js';
import type { Presentation } from '../src/api.js';
import { DomainError, type DemoState, type Role } from '../src/domain.js';
import { finishTaskCollection, collectTaskSessions, mainTask, mutableTaskAutomation, requireWritableTask, taskAutomation, type TaskScope, type ImportedTaskInputs, type CollectedSession } from '../src/task-automation.js';
import { collaborationContext } from './collaboration-service.js';
import type { Store } from './store.js';

/** Current worktree bindings add a native source without rewriting a task's historical workDirectory. */
export async function taskReportSessionDocuments(runtime:string,scope:TaskScope,task:DeliveryRequirement|undefined,sessions:CollectedSession[],capture:{id:string;acceptedAt:string},workspaceRepo=resolve(root,'..'),preparedDirectory?:string){
 if(!task)return undefined;
 const binding=await taskWorktreeBinding(runtime,task,workspaceRepo);
 if(task.workDirectory||task.id==='DEMO-MKT-001'||binding||preparedDirectory)return nativeTaskSessionDocuments(runtime,scope,sessions,capture);
 if(await configuredProjectWorkspace(runtime,task.projectId))throw new Error('This task has no verified workspace or native preparation directory; the session body was not reported');
 return undefined;
}

type Dependencies = { inputs(state: DemoState, scope: TaskScope): Promise<ImportedTaskInputs>; collect(state: DemoState, scope: TaskScope): Promise<CollectedSession[]>; report?(state:DemoState,scope:TaskScope):Promise<TalentTaskSessionReceipt> };
export class TaskAutomationService {
  private active = new Map<string, Promise<DemoState>>();
  constructor(private store: Store, data: Presentation, private dependencies: Dependencies = {
    async inputs(state, scope) {
      const context = await collaborationContext(state, data, { ...scope, nodeId: 'prepare' });
      if (context.knowledge.status === 'unavailable') throw new Error(context.knowledge.error ?? 'Project knowledge cannot be read right now');
      return { mode: context.mode as ImportedTaskInputs['mode'], contextId: context.contextId, requirement: context.agreement.title,
        knowledgeStatus: context.knowledge.status,
        knowledge: context.knowledge.assets.map((item: any) => ({ id: item.id, title: item.title ?? item.name, version: String(item.version ?? 'unspecified') })),
        skills: context.skills.map(item => ({ id: item.id, version: item.version, available: !!item.content && !item.availability.includes('unavailable') && item.availability !== 'example-only' })),
        references: context.references.map(item => ({ id: item.id, title: item.title, version: item.version })), materials: context.materials.map(item => ({ id: item.id, title: item.title })),
        notes: ['This only reads existing knowledge, requirements and Skills; nothing has been adopted or frozen as context on the member\'s behalf.', ...context.skills.filter(item => !item.content).map(item => item.id + ' body unavailable')],
      };
    },
    async collect(state, scope) { return collectTaskSessions(state, scope); },
    async report(state,scope){
      const task=deliveryRequirement(state,scope.projectId,scope.taskId),record=taskAutomation(state,scope)!.collection!;
      const acceptedAt=task?.acceptedAt??[...state.audit].reverse().find(item=>['通过功能验收','Functional acceptance passed'].includes(item.action))?.at;
      if(!acceptedAt)throw new Error('No acceptance time; the session was not sent');
      const inputDigest=task?.inputDigest??createHash('sha256').update(JSON.stringify(state.context)).digest('hex');
      const sessionDocuments=await taskReportSessionDocuments(runtimeDir,scope,task,record.sessions,{id:record.id,acceptedAt},resolve(root,'..'),taskAutomation(state,scope)?.preparation?.session?.directory);
      return exportTaskSessions(state,{...scope,deliveryId:record.id,idempotencyKey:record.id,acceptedAt,inputDigest,sessions:record.sessions,...(sessionDocuments?{sessionDocuments}:{})});
    },
  }, private changed: () => Promise<unknown> = async () => {}) {}
  private run(key: string, operation: () => Promise<DemoState>) {
    const existing = this.active.get(key); if (existing) return existing;
    const pending = operation().finally(() => this.active.delete(key)); this.active.set(key, pending); return pending;
  }
  private async save(scope: TaskScope, work: (state: DemoState) => void, action: string, role: Role) {
    const saved = await this.store.transact(current => { const next = structuredClone(current); work(next); next.revision++; next.audit.push({ id: next.revision, at: new Date().toISOString(), role, system: 'Teams', action, detail: scope.projectId + '/' + scope.taskId, origin: 'simulated' }); return next; });
    await this.changed();
    return saved;
  }
  prepare(role: Role, scope: TaskScope, retry = false) {
    requireWritableTask(scope,this.store.state);

    const task=deliveryRequirement(this.store.state,scope.projectId,scope.taskId);
    if (!task && !this.store.state.assigned) throw new DomainError('The requirement is not assigned yet; knowledge import waits for the task to start');
    if(task)requireDeliveryMember(this.store.state,task,role);else {if(role!=='member')throw new DomainError('Only the current assignee can read task inputs',403);requireCurrentTaskMember(this.store.state);}
    const key = 'knowledge:' + scope.projectId + '/' + scope.taskId;
    return this.run(key, async () => {
      const existing = taskAutomation(this.store.state, scope)?.knowledge;
      if (existing && (!retry || existing.status === 'ready')) return this.store.state;
      const id = existing?.id ?? crypto.randomUUID();
      await this.save(scope, state => { mutableTaskAutomation(state, scope).knowledge = { id, attempts: (existing?.attempts ?? 0) + 1, status: 'running', startedAt: new Date().toISOString(), finishedAt: null }; }, 'Automatic task knowledge import · started', role);
      try {
        const inputs = await this.dependencies.inputs(this.store.state, scope);
        return await this.save(scope, state => {
          const record = taskAutomation(state, scope)?.knowledge; if (record?.id !== id) throw new DomainError('The workspace changed; this knowledge import result was not saved');
          record.status = inputs.skills.some(skill => skill.available) ? 'ready' : 'waiting'; record.inputs = inputs; record.finishedAt = new Date().toISOString();
        }, 'Automatic task knowledge import · inputs checked', role);
      } catch (error) {
        if (taskAutomation(this.store.state, scope)?.knowledge?.id !== id) throw error;
        return this.save(scope, state => { const record = taskAutomation(state, scope)!.knowledge!; record.status = 'failed'; record.error = (error as Error).message; record.finishedAt = new Date().toISOString(); }, 'Automatic task knowledge import · not completed', role);
      }
    });
  }
  collect(scope: TaskScope = mainTask, retry = false) {
    requireWritableTask(scope,this.store.state);
    if ((deliveryRequirement(this.store.state,scope.projectId,scope.taskId)?.stage??this.store.state.stage) !== 'accepted') throw new DomainError('Acceptance has not passed yet, so session data cannot be collected');
    const key = 'collection:' + scope.projectId + '/' + scope.taskId;
    return this.run(key, async () => {
      const existing = taskAutomation(this.store.state, scope)?.collection;
      if (!existing) throw new DomainError('This acceptance has no automatic collection job; existing history is unchanged');
      if(existing.status==='collected'){if(existing.reporting?.status==='reported'||!retry)return this.store.state;return this.upload(scope);}
      if (existing.status !== 'queued' && !retry || existing.status==='empty') return this.store.state;
      const id = existing.id;
      await this.save(scope, state => { const record = taskAutomation(state, scope)!.collection!; record.status = 'running'; record.attempts++; record.error = undefined; record.startedAt = new Date().toISOString(); record.finishedAt = null; }, 'Post-acceptance data collection · started', 'owner');
      try {
        const sessions = await this.dependencies.collect(this.store.state, scope);
        await this.save(scope, state => {
          const record = taskAutomation(state, scope)?.collection; if (record?.id !== id || (deliveryRequirement(state,scope.projectId,scope.taskId)?.stage??state.stage) !== 'accepted') throw new DomainError('The acceptance scope changed; this collection result was not saved');
          finishTaskCollection(state,scope,sessions,new Date().toISOString());
        }, 'Post-acceptance data collection · completed', 'owner');
        return sessions.length?this.upload(scope):this.store.state;
      } catch (error) {
        if (taskAutomation(this.store.state, scope)?.collection?.id !== id) throw error;
        return this.save(scope, state => { const record = taskAutomation(state, scope)!.collection!; record.status = 'failed'; record.error = (error as Error).message; record.finishedAt = new Date().toISOString(); }, 'Post-acceptance data collection · not completed', 'owner');
      }
    });
  }
  private async upload(scope:TaskScope){
    if(!this.dependencies.report)return this.store.state;
    await this.save(scope,state=>{taskAutomation(state,scope)!.collection!.reporting={status:'uploading',reason:'Sharing this task\'s sessions with Talents'};},'Post-acceptance session sharing · started','owner');
    try{const receipt=await this.dependencies.report(this.store.state,scope);return this.save(scope,state=>{taskAutomation(state,scope)!.collection!.reporting={status:'reported',reason:'Sessions were written to the shared directory and Talents can read them',receipt};},'Post-acceptance session sharing · written','owner');}
    catch(error){return this.save(scope,state=>{taskAutomation(state,scope)!.collection!.reporting={status:'failed',reason:(error as Error).message};},'Post-acceptance session sharing · not completed','owner');}
  }

}

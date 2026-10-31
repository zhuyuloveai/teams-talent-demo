import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { DomainError, type DemoState, type Role } from '../src/domain.js';
import { deliveryRequirement, requirementNode, requireDeliveryMember } from '../src/delivery-requirements.js';
import type { Presentation } from '../src/api.js';
import type { ProjectWorkAction, ProjectWorkPlan, ProjectWorkReceipt, ProjectWorkSelection, ProjectWorkMode, ProjectWorkStart, ProjectWorkStatus } from '../src/project-work.js';
import { nativeWorkDefaults, startNativeWork, startNativeCliWork } from './native.js';
import { root, runtimeDir, sessionId, origin } from './config.js';
import { formatShellCommand } from './terminal-launcher.js';
import { collaborationContext, collaborationSkillPath } from './collaboration-service.js';
import { projectModelContext } from './model-context.js';
import {configuredProjectWorkspace, verifyProjectWorkspace} from './project-workspaces.js';
import { taskWorkDirectory, taskWorktreeBinding, ensureTaskWorkspace } from './task-work-directory.js';
import { atomicJson, atomicText } from './store.js';
import { prepareNativeSession, type PreparationInput } from './native-session-preparation.js';
import type { NativePreparationResult } from '../src/native-preparation.js';
import { taskAutomation, taskNodeKnowledge, type KnowledgeNode, type TaskScope } from '../src/task-automation.js';
import { projectMembers } from '../src/teams-domain.js';
import { binary, selectICode } from './config.js';
import { withoutNativeTrace } from '../scripts/native/native-environment.mjs';
import { readNativeTuiEnvelope } from './task-session-documents.js';
import { nativeProcessActive, inspectNativeProcess } from '../scripts/native/session-liveness.mjs';
import { focusWorkTerminal } from './terminal-focus.js';
import { nativeWorkExecution } from './native-work-status.js';
import { readTrajectoryHealth } from './trajectory-health.js';
import { readTaskWorkspace, prepareTaskWorkspace } from './task-workspace.js';

const execute = promisify(execFile);
const nodeNames: Record<string, string> = { prepare: 'Requirement clarification', develop: 'Development', verify: 'Verification', accept: 'Acceptance' };
const stageNames: Record<string, string> = { content: 'Project content', management: 'Task management', delivery: 'Task delivery', release: 'Release tracking', settings: 'Project settings' };
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function resolveProjectWork(state: DemoState, data: Presentation, input: ProjectWorkSelection) {
  if (!input || typeof input.projectId !== 'string' || !Object.hasOwn(stageNames, input.tab)) throw new DomainError('Invalid project work location', 400);
  const target: ProjectWorkSelection = { projectId: input.projectId, tab: input.tab };
  const requirement = deliveryRequirement(state, input.projectId, input.taskId ?? input.requirementId ?? (input.projectId==='carddemo'&&input.tab==='delivery'?'DEMO-MKT-001':undefined));
  if (requirement) {
    if (input.taskId && input.requirementId && input.taskId !== input.requirementId) throw new DomainError('Task and requirement IDs do not match', 400);
    const nodeId = input.nodeId ?? requirementNode(requirement);
    if (!Object.hasOwn(nodeNames, nodeId)) throw new DomainError('Delivery node does not exist', 400);
    Object.assign(target, { taskId: requirement.id, requirementId: requirement.id, nodeId });
    const project = input.projectId === 'carddemo' ? state.workspace.project : input.projectId === 'teams' ? {...data.teamsProject.project,assets:[]} : state.workspace.projects?.find(item => item.id === input.projectId);
    if (!project) throw new DomainError('Project does not exist', 404);
    return { target, projectName: project.name, title: requirement.title, location: nodeNames[nodeId], source: 'Standalone delivery requirement and the registered task work directory', repository: requirement.workDirectory ?? '', assets: project.assets ?? [], skills: requirement.skillIds };
  }
  if (input.projectId === 'carddemo') {
    if (input.taskId && input.taskId !== 'DEMO-MKT-001' || input.requirementId && input.requirementId !== 'DEMO-MKT-001') throw new DomainError('The requirement does not belong to the current project', 400);
    target.requirementId = 'DEMO-MKT-001';
    if (input.tab === 'delivery') {
      const node = input.nodeId ?? (['submitted', 'accepted'].includes(state.stage) ? 'accept' : ['failed', 'fixed'].includes(state.stage) ? 'verify' : ['developing', 'returned'].includes(state.stage) ? 'develop' : 'prepare');
      if (!Object.hasOwn(nodeNames, node)) throw new DomainError('Delivery node does not exist', 400);
      target.taskId = 'DEMO-MKT-001'; target.nodeId = node;
    }
    return { target, projectName: state.workspace.project.name, title: 'Credit card spending cashback', location: target.nodeId ? nodeNames[target.nodeId] : stageNames[input.tab], source: 'Current CardDemo source code and project delivery materials', repository: '', assets: state.workspace.project.assets, skills: state.context?.selectedSkills ?? state.workspace.selectedSkills };
  }
  if (input.projectId === 'teams') {
    const snapshot = data.teamsProject;
    let title = snapshot.project.name, location = stageNames[input.tab];
    if (input.tab === 'delivery' || input.taskId) {
      const task = snapshot.tasks.find(task => task.id === (input.taskId ?? snapshot.selection.taskId));
      if (!task) throw new DomainError('iCode Teams task does not exist', 400);
      const node = task.nodes.find(node => node.id === (input.nodeId ?? (task.id === snapshot.selection.taskId ? snapshot.selection.nodeId : task.nodes[0].id)));
      if (!node) throw new DomainError('Task node does not exist', 400);
      Object.assign(target, { taskId: task.id, requirementId: 'REQ-' + task.id, nodeId: node.id }); title = task.title; location = node.name;
    }
    if (input.discussionId) { const discussion = snapshot.discussions.find(item => item.id === input.discussionId); if (!discussion) throw new DomainError('Task discussion does not exist', 400); target.discussionId = discussion.id; title = discussion.title; }
    if (input.releaseId) { if (!snapshot.releases.some(item => item.name === input.releaseId)) throw new DomainError('Release version does not exist', 400); target.releaseId = input.releaseId; }
    return { target, projectName: snapshot.project.name, title, location, source: 'Teams project snapshot; no local session record to resume yet', repository: 'github.com/SEAL-iCode/iCode-teams', assets: snapshot.documents.map(item => ({ title: item.path, location: item.path })), skills: snapshot.project.skills.map(skill => typeof skill === 'string' ? skill : String((skill as any).name ?? (skill as any).id)) };
  }
  const project = state.workspace.projects?.find(project => project.id === input.projectId);
  if (!project) throw new DomainError('Project does not exist', 404);
  if (input.taskId || input.nodeId || input.requirementId) throw new DomainError('This project has no registered task node that can be started', 400);
  return { target, projectName: project.name, title: project.name, location: stageNames[input.tab], source: 'New project; this is project-stage work and does not create tasks or advance delivery', repository: project.remoteUrl, assets: project.assets ?? [], skills: [] as string[] };
}

/** Same repository-root/origin rules as Teams project-management/client/repository.ts. */
export function repositoryIdentity(value: string): string {
  const scp = /^(?:git@)?([A-Za-z0-9.-]+):([^/].*)$/.exec(value);
  const url = new URL(scp && !value.includes('://') ? `ssh://git@${scp[1]}/${scp[2]}` : value);
  if (!['https:', 'ssh:'].includes(url.protocol) || url.password || url.search || url.hash || url.protocol === 'https:' && url.username) throw new DomainError('The repository URL must be an HTTPS/SSH URL without credentials', 400);
  return url.hostname.toLowerCase() + (url.port && !(url.protocol === 'ssh:' && url.port === '22') ? ':' + url.port : '') + url.pathname.replace(/\/+$/, '').replace(/\.git$/, '');
}
async function inspectDirectory(directory: string, repository: string, sourceRoot: string) {
  if (typeof directory !== 'string' || !isAbsolute(directory) || directory.includes('\0')) throw new DomainError('Enter the absolute path of the local repository', 400);
  if (!(await stat(directory)).isDirectory()) throw new DomainError('The selected location is not a directory');
  const canonical = await realpath(directory);
  let reference: string | undefined;
  try { reference = await realpath(sourceRoot); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (reference && (canonical === reference || canonical.startsWith(reference + '/'))) throw new DomainError('This directory is the read-only Teams reference repository; bind your own working checkout instead');
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))), LC_ALL: 'C', LANG: 'C' };
  const git = async (args: string[]) => (await execute('git', ['-C', canonical, ...args], { env, timeout: 5000, maxBuffer: 65536, windowsHide: true })).stdout.trim();
  if (await realpath(await git(['rev-parse', '--show-toplevel'])) !== canonical) throw new DomainError('Select the root directory of a Git checkout or worktree');
  if (isAbsolute(repository)) {
    if (await realpath(repository) !== canonical) throw new DomainError('This directory does not match the local repository registered for the project');
  } else {
    const expected = repository.includes('://') || repository.startsWith('git@') ? repositoryIdentity(repository) : repository;
    if (repositoryIdentity(await git(['config', '--get', 'remote.origin.url'])) !== expected) throw new DomainError('The directory origin does not match the project repository');
  }
  return canonical;
}
type NativeDefaults = Awaited<ReturnType<typeof nativeWorkDefaults>>;
export interface WorkTransport {
  defaults(): Promise<NativeDefaults>;
  history(): Promise<{ available: boolean; directory: string; title: string; diagnostic?: string; configuration?: NonNullable<ProjectWorkPlan['history']>['configuration']; active: NonNullable<ProjectWorkPlan['history']>['active'] }>;
  start(input: Parameters<typeof startNativeWork>[0]): Promise<unknown>;
  startCli?(input: Parameters<typeof startNativeCliWork>[0]): Promise<unknown>;
  focus(history: NonNullable<ProjectWorkPlan['history']>): Promise<{ status: string; note: string }>;
}
const nativeTransport: WorkTransport = {
  defaults: nativeWorkDefaults,
  async history() { return { available: false, directory: '', title: '', active: null }; },
  start: startNativeWork,
  startCli: startNativeCliWork,
  focus: focusWorkTerminal,
};
interface SavedRequest { identity: string; receipt: ProjectWorkReceipt }
export class ProjectWorkService {
  private queue: Promise<unknown> = Promise.resolve();
  private preparations = new Map<string, Promise<NativePreparationResult>>();
  constructor(private current: () => DemoState, private data: Presentation, private directory = runtimeDir, private transport: WorkTransport = nativeTransport, private prepareTransport = prepareNativeSession, private workspaceRepo = resolve(root,'..')) {}
  prepare(assigneeId: string, scope: TaskScope, preparationId: string): Promise<NativePreparationResult> {
    const key = JSON.stringify({assigneeId, scope, preparationId});
    const existing = this.preparations.get(key); if (existing) return existing;
    const pending = this.prepareSession(assigneeId, scope, preparationId).finally(() => this.preparations.delete(key));
    this.preparations.set(key, pending); return pending;
  }
  private async prepareSession(assigneeId: string, scope: TaskScope, preparationId: string): Promise<NativePreparationResult> {
    const verify = () => {
      const state = this.current(), task = deliveryRequirement(state, scope.projectId, scope.taskId), scheduled = taskAutomation(state, scope)?.preparation;
      if (!task || task.assigneeId !== assigneeId || !projectMembers(state, scope.projectId).some(member => member.id === assigneeId && member.status === 'active') || scheduled?.id !== preparationId || scheduled.assigneeId !== assigneeId || task.stage !== 'preparing' || task.preparedAt || Object.values(task.nodes).some(node => node.status !== 'pending')) throw new DomainError('The session preparation scope or assignee has changed; the native session was not started',409);
      return task;
    };
    const task = verify(), target: ProjectWorkSelection = { ...scope, tab: 'delivery', nodeId: 'prepare' };
    try { await ensureTaskWorkspace(this.directory,scope,preparationId,this.workspaceRepo); } catch(error) { return {status:'waiting-directory',reason:(error as Error).message}; }
    verify();
    const plan = await this.plan('owner', target, assigneeId);
    if (!plan.directory.valid || !plan.directory.root) return { status: 'waiting-directory', reason: plan.directory.diagnostic };
    if (!plan.instance.installed || !plan.instance.agent || !plan.instance.model) throw new Error('iCode or the current Agent / model configuration is unavailable');
    const contextPath = join(this.directory,'work-contexts',preparationId+'.preparation.json'), taskFile = join(this.directory,'work-contexts',preparationId+'.preparation.md');
    let reads: PreparationInput['reads'];
    try { reads = JSON.parse(await readFile(join(this.directory,'work-contexts',preparationId+'.native','preparation-request.json'),'utf8')).reads; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const context = projectModelContext(await collaborationContext(this.current(),this.data,target));
      await atomicJson(contextPath,context);
      const prompt = `# Teams session initialization: ${task.title}\nProject ${scope.projectId}; task ${scope.taskId}; node prepare (Requirement clarification); initialization ${preparationId}.\n\nThis turn only prepares the session for the developer. First use read_file to read every line of the following files; do not pass offset/limit. If the result shows [Long lines truncated ...], reread that line as instructed with offset=<line number>, limit=1 and a large enough max_tokens. The [Truncated ...] / [Showing lines ...] notice lines are not file content:\n1. ${collaborationSkillPath}\n2. ${contextPath}\n\nThe limits of this turn take precedence over the execution steps in any Skill you read: you may only use the read_file tool to read materials. Do not run shell commands, write files, modify code, create a PRD, call Teams CLI write operations, inputs adopt, progress add, result submit, accept, or switch nodes. Do not create todos or delegate to an Agent. Do not mark the requirement, adoption basis, PRD or checks as confirmed. The requirement, knowledge and Skills follow the current node version in the structured context; contentRef points to the body in the same document, and references.absolutePath points to the full published original with its SHA256/version. If the context only provides an index, do not claim to have read the original; use read_file to read the referenced files this turn needs, and list anything missing or pending truthfully.\n\nAfter reading, give the developer one short visible reply: summarize the requirement, knowledge and Skills you read with their source versions, list the questions the developer needs to confirm, and state clearly "Ready. Waiting for the developer to continue requirement clarification through TUI interaction or an explicit CLI work instruction." Then end this turn and wait; do not run any further business steps. In later TUI interactions or explicit CLI work turns, work under the current node's Teams collaboration Skill only on the developer's explicit instruction.\n`;
      await atomicText(taskFile,prompt);
      reads = await Promise.all([contextPath,collaborationSkillPath].map(async path=>({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')})));
    }
    verify(); // Reassignment or a replaced queue must not start an obsolete model turn.
    const selected = await selectICode();
    return this.prepareTransport({runId:preparationId,scope:{...scope,nodeId:'prepare'},assigneeId,directory:plan.directory.root,executable:selected.status==='ready'?selected.path!:binary,runner:join(root,'scripts/native/run-project-task.mjs'),runtime:this.directory,taskFile,contextPath,skillPath:collaborationSkillPath,reads,agent:plan.instance.agent,agentLabel:plan.instance.agentLabel??plan.instance.agent,model:plan.instance.model,modelLabel:plan.instance.modelLabel??plan.instance.model,env:withoutNativeTrace(process.env)});
  }
  private async bindings(): Promise<Record<string, string>> {
    try { const value = JSON.parse(await readFile(join(this.directory, 'project-work-bindings.json'), 'utf8')); if (!value || Array.isArray(value) || Object.values(value).some(path => typeof path !== 'string' || !isAbsolute(path))) throw new Error('The local directory binding record is corrupted'); return value; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw error; }
  }
  private async previous(target: ProjectWorkSelection) {
    let files: string[];
    try { files = await readdir(join(this.directory, 'project-work')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
    const requests = await Promise.all(files.filter(file => /^[0-9a-f-]+\.json$/.test(file)).map(async file => JSON.parse(await readFile(join(this.directory, 'project-work', file), 'utf8')) as SavedRequest));
    return requests.filter(item => JSON.stringify(item.receipt.target) === JSON.stringify(target)).sort((a, b) => b.receipt.at.localeCompare(a.receipt.at))[0]?.receipt;
  }
  private async preparedHistory(scope: TaskScope): Promise<ProjectWorkPlan['history']> {
    const preparation=taskAutomation(this.current(),scope)?.preparation, ready=preparation?.session;
    if(preparation?.status!=='ready'||!ready)return undefined;
    const base=join(this.directory,'work-contexts'), candidates=[{runId:ready.runId,at:ready.preparedAt}];
    let pendingEntry = false;
    for(const name of await readdir(base)){
      if(!/^[0-9a-f-]{36}\.native$/i.test(name)||name===ready.runId+'.native')continue;
      let manifest:any;try{manifest=JSON.parse(await readFile(join(base,name,'manifest.json'),'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error;}
      if(manifest.preparedSession?.preparationRunId===ready.runId&&manifest.preparedSession.sessionId===ready.sessionId&&manifest.scope?.projectId===scope.projectId&&manifest.scope?.taskId===scope.taskId){
        try{const owner=JSON.parse(await readFile(join(base,name,'native-session.json'),'utf8'));candidates.push({runId:manifest.runId,at:owner.startedAt});}catch(error){
          if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
          const optional=async(file:string)=>{try{return JSON.parse(await readFile(join(base,name,file),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}};
          const failed=await optional('launch-error.json'),launched=await optional('cli-launch.json');
          const same=(value:any)=>value?.runId===manifest.runId&&value.projectId===scope.projectId&&value.taskId===scope.taskId&&value.nodeId===manifest.scope.nodeId;
          // Only a verified pre-spawn failure with an exited observer is retryable.
          // Missing/active/unknown launch receipts stay pending to prevent duplication.
          let safeFailure=false;
          if(manifest.executionMode==='task-file'&&failed?.nativeLaunchState==='not-spawned'&&same(failed)&&same(launched)){
            const process=await inspectNativeProcess(launched.pid);
            safeFailure=!process||process.state.startsWith('Z')||Date.parse(process.startedAt)>Date.parse(launched.startedAt)+1000;
          }
          if(!safeFailure)pendingEntry=true;
        }
      }
    }
    const source=candidates.sort((a,b)=>b.at.localeCompare(a.at))[0], runRoot=join(base,source.runId+'.native');
    const owner=JSON.parse(await readFile(join(runRoot,'native-session.json'),'utf8'));
    if(owner.runId!==source.runId||owner.sessionId!==ready.sessionId||owner.projectId!==scope.projectId||owner.taskId!==scope.taskId||owner.sessionRoot!==join(runRoot,'session-root'))throw new Error('The run scope of the prepared session does not match');
    const optional = async (name: string) => { try { return JSON.parse(await readFile(join(runRoot,name),'utf8')); } catch(error) { if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error; } };
    const result=await optional('result.json'), processRecord=await optional('process.json');
    let active:NonNullable<ProjectWorkPlan['history']>['active']=null,staleIdentity=false;
    if(['interactive','task-file'].includes(owner.executionMode)) {
      if(result&&(result.executionMode!==owner.executionMode||result.runId!==source.runId||result.sessionId!==ready.sessionId||!['completed','failed'].includes(result.status)))throw new Error('The session exit receipt identity does not match');
      let running=false;
      try{running=await nativeProcessActive(owner,processRecord);}catch{staleIdentity=true;}
      const lock=await optional('session-root/sessions/.locks/'+ready.sessionId.replaceAll('-','').slice(0,12)+'.active.json');
      if(lock&&(lock.session_id!==ready.sessionId||lock.pid!==owner.pid||lock.started_at!==owner.startedAt))throw new Error('The activity identity of the prepared session cannot be verified');
      // A stale process.json must not turn the plan into a 500. The lock is the
      // writer-owner evidence: if its PID is dead or reused, the saved session is resumable.
      if(!running&&lock){
        try{const info=await inspectNativeProcess(lock.pid);running=!!info&&!info.state.startsWith('Z')&&Date.parse(info.startedAt)<=Date.parse(lock.started_at)+1000;}catch{running=false;}
      }
      if(running) {
        if(result||!lock)throw new Error('The session process does not match the exit/activity records; check the original terminal. Not started again');
        const terminal=await optional('terminal-receipt.json');
        if(terminal&&(terminal.runId!==source.runId||terminal.projectId!==scope.projectId||terminal.taskId!==scope.taskId||terminal.directory!==ready.directory))throw new Error('The session terminal receipt scope does not match');
        const canFocus=owner.executionMode==='interactive'&&process.platform==='darwin'&&terminal?.terminalId&&['ghostty','terminal'].includes(terminal.terminalKind);
        active={pid:owner.pid,application:canFocus?terminal.terminal:null,tty:terminal?.terminalKind==='terminal'?terminal.terminalId:'',...(canFocus?{terminal:{id:terminal.terminalId,kind:terminal.terminalKind,title:terminal.terminal,directory:ready.directory}}:{}),diagnostic:canFocus?'The session is still running; switching to the original terminal of this task. It will not be started again.':owner.executionMode==='task-file'?'The CLI session of this task is still running; check the job status. Not started again.':'The session of this task is still running, but its terminal cannot be located and verified; continue in the original terminal. Not started again.'};
      }
    } else if(!result||result.runId!==source.runId||result.sessionId!==ready.sessionId||result.status!=='completed')throw new Error('The initialization session has no valid completion receipt yet; resume was not attempted');
    // A fresh-session fallback is not visible through preparedSession. Before
    // offering another launch, notice any other live interactive run for this task.
    if(!active){
      for(const name of await readdir(base)){
        if(name===source.runId+'.native'||!/\.native$/i.test(name))continue;
        const otherRoot=join(base,name);let manifest:any,owner:any,processRecord:any,terminal:any;
        try{manifest=JSON.parse(await readFile(join(otherRoot,'manifest.json'),'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error;}
        if(manifest.executionMode!=='interactive'||manifest.scope?.projectId!==scope.projectId||manifest.scope?.taskId!==scope.taskId)continue;
        try{owner=JSON.parse(await readFile(join(otherRoot,'native-session.json'),'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error;}
        if(owner.projectId!==scope.projectId||owner.taskId!==scope.taskId||owner.sessionRoot!==join(otherRoot,'session-root'))continue;
        try{processRecord=JSON.parse(await readFile(join(otherRoot,'process.json'),'utf8'));}catch{processRecord=null;}
        let running=false;try{running=await nativeProcessActive(owner,processRecord);}catch{pendingEntry=true;break;}
        if(!running)continue;
        try{terminal=JSON.parse(await readFile(join(otherRoot,'terminal-receipt.json'),'utf8'));}catch{terminal=null;}
        const canFocus=owner.executionMode==='interactive'&&process.platform==='darwin'&&terminal?.terminalId&&['ghostty','terminal'].includes(terminal.terminalKind);
        active={pid:owner.pid,application:canFocus?terminal.terminal:null,tty:terminal?.terminalKind==='terminal'?terminal.terminalId:'',...(canFocus?{terminal:{id:terminal.terminalId,kind:terminal.terminalKind,title:terminal.terminal,directory:manifest.directory}}:{}),diagnostic:'Another native session is already running for this task; continue in that terminal first. Not started again.'};
        break;
      }
    }
    const envelope=await readNativeTuiEnvelope(runRoot,ready.sessionId);
    const trajectory=await readTrajectoryHealth(join(runRoot,'session-root','sessions',ready.sessionId.replaceAll('-','').slice(0,12)),ready.sessionId);
    const degraded=trajectory.state==='degraded'?' The detailed native trajectory is degraded; the task can continue. Retry the original session or use a new one.':'';
    return {sessionId:ready.sessionId,directory:ready.directory,title:'Prepared requirement clarification session',trajectory,available:(!active||!!active.terminal)&&!pendingEntry,active,diagnostic:(active?.diagnostic??(staleIdentity?'The previous session process identity has changed; the session files are kept and the same session will be resumed.':pendingEntry?'The earlier entry request has no native session receipt yet; check the terminal that was opened. Not started again.':result?.status==='failed'?'The terminal exited abnormally last time; the latest conversation is saved and the same session will be resumed.':'The most recently saved native session of this task will be resumed, keeping the conversation.'))+degraded,configuration:{agent:ready.agent,agentLabel:ready.agentLabel,model:ready.model,modelLabel:ready.modelLabel},prepared:{preparationRunId:ready.runId,sourceRunId:source.runId,sessionSha256:createHash('sha256').update(envelope.content).digest('hex')}};
  }

  async plan(role: Role, input: ProjectWorkSelection, directoryActorId: string = role, mode:ProjectWorkMode='tui'): Promise<ProjectWorkPlan> {
    if(!['tui','cli'].includes(mode))throw new DomainError('Invalid job mode',400);
    const state = this.current(), work = resolveProjectWork(state, this.data, input);
    const requirement = deliveryRequirement(state, work.target.projectId, work.target.taskId);
    let directory: ProjectWorkPlan['directory'], taskWorkspace: Awaited<ReturnType<typeof readTaskWorkspace>> = null;
    const preparedDirectory=requirement?taskAutomation(state,{projectId:requirement.projectId,taskId:requirement.id})?.preparation?.session?.directory:undefined;
    if(requirement){taskWorkspace=await readTaskWorkspace(this.directory,{projectId:requirement.projectId,taskId:requirement.id});if(requirement.workDirectory)taskWorkspace=null;}
    if (requirement) {
      directory={root:preparedDirectory??requirement.workDirectory??null,valid:false,kind:'git-binding',diagnostic:'No project workspace is configured yet. Set a standalone repository path in the project overview.'};
      try {
        if(preparedDirectory){
          directory.root=await realpath(preparedDirectory);
          if(!(await stat(directory.root)).isDirectory())throw new Error('The original directory of the prepared session is no longer available');
          // A prepared native session retains its original cwd. Never silently migrate its history.
          const binding=await taskWorktreeBinding(this.directory,requirement,this.workspaceRepo);
          if(binding&&binding.directory!==directory.root)throw new Error('The task workspace differs from the prepared session directory; check the original session. It is not migrated automatically');
          directory.valid=true;directory.diagnostic='Keeping the original work directory of the prepared session.';
          if(taskWorkspace&&taskWorkspace.directory!==directory.root)taskWorkspace=null;
        } else {
          if(taskWorkspace&&!requirement.workDirectory){
            const root=await realpath(taskWorkspace.directory);
            if(!(await stat(root)).isDirectory())throw new Error('The registered task work directory is no longer available');
            taskWorkspace={...taskWorkspace,directory:root};
            directory={root,valid:true,kind:'task-workspace',diagnostic:taskWorkspace.note};
          } else {
            const selected=await taskWorkDirectory(this.directory,requirement,this.workspaceRepo);
            const worktree=await taskWorktreeBinding(this.directory,requirement,this.workspaceRepo);
            if(worktree){directory.root=worktree.directory;directory.valid=true;directory.diagnostic=`Verified task workspace ${worktree.branch}, PR target ${worktree.baseBranch}; working in the standalone task work directory.`;}
            else if(selected){const configured=await configuredProjectWorkspace(this.directory,work.target.projectId);if(configured&&!requirement.workDirectory)await verifyProjectWorkspace(configured);directory.root=await inspectDirectory(selected,selected,this.data.baseline.sourceRoot);directory.valid=true;directory.diagnostic='The work directory and Git root of this requirement are verified.';}
            else {
              const bindings=await this.bindings(),binding=bindings[directoryActorId+':'+work.target.projectId]??bindings['owner:'+work.target.projectId];
              if(binding){const repository=work.target.projectId==='teams'?'github.com/SEAL-iCode/iCode-teams':work.target.projectId==='carddemo'?binding:state.workspace.projects?.find(project=>project.id===work.target.projectId)?.remoteUrl??'';directory.root=await inspectDirectory(binding,repository,this.data.baseline.sourceRoot);directory.valid=true;directory.diagnostic='Using the verified local directory of the current project.';}
            }
          }
        }
      } catch(error){directory.valid=false;directory.diagnostic=(error as Error).message;}
    } else if (await configuredProjectWorkspace(this.directory,work.target.projectId)) {
      const configured=await configuredProjectWorkspace(this.directory,work.target.projectId);
      directory={root:configured!.directory,valid:false,kind:'git-binding',diagnostic:'Project workspace not yet verified'};
      try {await verifyProjectWorkspace(configured!);directory.valid=true;directory.diagnostic='Using the standalone project repository configured in the project overview.';}
      catch(error){directory.diagnostic=(error as Error).message;}
    } else {
      const binding = (await this.bindings())[role + ':' + work.target.projectId];
      directory = { root: binding ?? null, valid: false, kind: 'git-binding', diagnostic: 'No project workspace is configured yet. Set a standalone repository path in the project overview.' };
      if (binding) try { directory.root = await inspectDirectory(binding, work.target.projectId==='carddemo'?binding:work.repository, this.data.baseline.sourceRoot); directory.valid = true; directory.diagnostic = 'The local repository root and project origin are verified.'; } catch (error) { directory.diagnostic = (error as Error).message; }
    }
    const defaults = await this.transport.defaults();
    const frozen = requirement ? !!requirement.preparedAt : work.target.projectId === 'carddemo' && !!work.target.taskId && !!state.context;
    const context = { frozen, summary: requirement ? frozen ? 'The preparation basis of this requirement is confirmed; keep checking the current node and the task adoption records.' : 'The preparation basis of this requirement is not confirmed yet; iCode reads the context first and adopts it explicitly.' : frozen ? `Frozen ${state.context!.id}; keeping this requirement, its materials and the adopted versions.` : 'Not frozen yet: this only provides a snapshot of the current project and work location. It does not mean knowledge was adopted or all materials were read.', versions: requirement ? requirement.inputDigest ?? 'No adoption digest recorded for this requirement yet' : frozen ? `Knowledge ${state.context!.knowledgeVersion} · Skill ${state.context!.skillVersion} · Agent ${state.context!.agentVersion}` : 'Current materials and selections; adopted versions not frozen yet', selectedSkills: requirement ? [] : work.skills, assets: (requirement ? [] : work.assets).map(asset => ({ title: asset.title, location: asset.location })) };
    let taskStartReason: string | undefined=work.target.taskId&&!requirement?'This source task is not linked to your delivery identity; view only':undefined;
    if (requirement) {
      try { requireDeliveryMember(state, requirement, role); } catch (error) { taskStartReason = (error as Error).message; }
      if (['awaiting-acceptance', 'accepted'].includes(requirement.stage) || work.target.nodeId === 'accept') taskStartReason = 'This requirement is in Owner acceptance; development work is no longer started';
    }
    const preparation=requirement?taskAutomation(state,{projectId:requirement.projectId,taskId:requirement.id})?.preparation:undefined;
    const nodeKnowledge = requirement && ['prepare','develop','verify'].includes(work.target.nodeId ?? '') ? taskNodeKnowledge(taskAutomation(state,{projectId:requirement.projectId,taskId:requirement.id}),work.target.nodeId as KnowledgeNode) : undefined;
    const knowledgeReason = nodeKnowledge && nodeKnowledge.status !== 'ready' ? (nodeKnowledge.status === 'waiting-upstream' ? 'This node is waiting for upstream deliverables to be confirmed; knowledge and Skills are not prepared yet' : nodeKnowledge.error ?? 'Knowledge and Skills for this node are not ready yet; enter again later') : undefined;
    const history=preparation?.status==='ready'?await this.preparedHistory({projectId:requirement!.projectId,taskId:requirement!.id}):undefined;
    const preparationReason=preparation ? history ? history.available?undefined:history.diagnostic : preparation.error??(preparation.status==='waiting-directory'?'Configure the work directory of this task first, then continue preparing the session':preparation.status==='failed'?'Session preparation did not finish; retry preparation first':'Knowledge and the session are being prepared; enter again later') : undefined;
    const launchReason = !defaults ? 'The bundled iCode is not installed' : (mode==='tui'?defaults.terminal.error:undefined) ?? (!directory.valid ? directory.diagnostic : undefined);
    const cliReason=mode==='cli'?(!requirement||!['prepare','develop','verify'].includes(work.target.nodeId??'')?'CLI work needs an explicit current delivery task and node':history?.active?'The session of this task is still running; the CLI will not resume it again. Wait for the original job to finish':!history?.prepared?'Finish preparing knowledge and the real session for this task before starting CLI work':undefined):undefined;
    const workspaceReason=requirement&&!preparedDirectory&&!taskWorkspace&&!requirement.workDirectory&&await configuredProjectWorkspace(this.directory,work.target.projectId)&&!await taskWorktreeBinding(this.directory,requirement,this.workspaceRepo)?'Prepare the requirement session first; the preparation flow creates the standalone task workspace':undefined;
    const reason = taskStartReason ?? workspaceReason ?? cliReason ?? preparationReason ?? (history?.active ? undefined : launchReason ?? knowledgeReason);
    const actions: ProjectWorkPlan['actions'] = [{ id: history?.active ? 'focus' : history ? 'resume' : 'new', label: history?.active ? 'Enter the running session' : history ? 'Enter the prepared session' : requirement ? 'Open an interactive iCode session for this node' : 'New iCode session for this work', enabled: !reason, ...(reason ? { reason } : {}) }];
    // A fresh session is a deliberate fallback: never while another task session is live.
    if(history && !history.active && history.available)actions.push({id:'new',label:'New session (current conversation not kept)',enabled:!reason,...(reason?{reason}:{})});
    const plan: ProjectWorkPlan = { executionMode: mode==='cli'?'task-file':'interactive', target: work.target, projectName: work.projectName, title: work.title, location: work.location, source: work.source, planToken: '', instance: { installed: !!defaults, name: 'Local iCode', binary: (await selectICode()).path??binary, ...defaults }, directory, ...(taskWorkspace ? { workspace: taskWorkspace } : {}), context, actions, defaultAction: 'new' };
    if(history){
      plan.history=history;
      const unfixable=history.trajectory?.state==='degraded'&&['corrupt_tail','schema_too_new','permission','unreadable','too_large'].includes(history.trajectory.reason??'');
      plan.defaultAction=history.active?'focus':unfixable&&actions.some(action=>action.id==='new'&&action.enabled)?'new':'resume';
    }
    // The token pins the decision, not volatile trajectory counters/check time.
    const tokenPlan = { ...plan, history: plan.history ? { ...plan.history, trajectory: plan.history.trajectory ? { state: plan.history.trajectory.state, reason: plan.history.trajectory.reason ?? null } : undefined } : undefined };
    plan.planToken = hash({ role, plan: tokenPlan, revision: state.revision });
    plan.previous = await this.previous(work.target); return plan;
  }
  bind(role: Role, input: ProjectWorkSelection, directory: string, mode: 'auto' | 'directory' = 'auto') {
    const next = this.queue.then(() => this.bindDirectory(role, input, directory, mode)); this.queue = next.catch(() => undefined); return next;
  }
  private async bindDirectory(role: Role, input: ProjectWorkSelection, directory: string, mode: 'auto' | 'directory' = 'auto') {
    const work = resolveProjectWork(this.current(), this.data, input);
    const task=deliveryRequirement(this.current(),input.projectId,input.taskId);
    if(task){
      if(role!=='owner'&&task.assigneeId!==role)throw new DomainError('Only the current assignee or the Owner can configure the task work directory',403);
      if(task.workDirectory)throw new DomainError('The task already has a registered work directory, which cannot be changed; keep the original directory',409);
      if(task.preparedAt||taskAutomation(this.current(),{projectId:task.projectId,taskId:task.id})?.preparation?.session)throw new DomainError('The task already has a prepared session, so the work directory cannot be changed; keep the original session',409);
      if(await taskWorktreeBinding(this.directory,task,this.workspaceRepo))throw new DomainError('The task already has a standalone Git workspace and cannot switch to a local directory',409);
      const project=input.projectId==='carddemo'?this.current().workspace.project:input.projectId==='teams'?this.data.teamsProject.project:this.current().workspace.projects?.find(project=>project.id===input.projectId);
      if(!project)throw new DomainError('Project does not exist',404);
      const remoteUrl=project && 'remoteUrl' in project && typeof project.remoteUrl==='string' ? project.remoteUrl : undefined;
      await prepareTaskWorkspace(this.directory,{projectId:task.projectId,taskId:task.id,directory,projectRemoteUrl:remoteUrl,sourceRoot:this.data.baseline.sourceRoot,mode});
      return this.plan(role,input);
    }
    const repository = work.repository;
    const canonical = await inspectDirectory(directory, repository, this.data.baseline.sourceRoot);
    const bindings = await this.bindings(); bindings[role + ':' + input.projectId] = canonical;
    await atomicJson(join(this.directory, 'project-work-bindings.json'), bindings);
    return this.plan(role, input);
  }
  start(role: Role, body: ProjectWorkStart) {
    const next = this.queue.then(() => this.run(role, body)); this.queue = next.catch(() => undefined); return next;
  }
  async status(role:Role,input:ProjectWorkSelection,requestId:string):Promise<ProjectWorkStatus>{
    if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(requestId))throw new DomainError('Invalid job request ID',400);
    const work=resolveProjectWork(this.current(),this.data,input),task=deliveryRequirement(this.current(),work.target.projectId,work.target.taskId);
    if(!task)throw new DomainError('Delivery requirement does not exist',404);requireDeliveryMember(this.current(),task,role);
    let saved:SavedRequest;try{saved=JSON.parse(await readFile(join(this.directory,'project-work',requestId+'.json'),'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')throw new DomainError('This request has no start record yet',404);throw error;}
    if(JSON.stringify(saved.receipt.target)!==JSON.stringify(work.target))throw new DomainError('The job does not belong to the current task or node',403);
    return {receipt:saved.receipt,execution:await nativeWorkExecution(this.directory,saved.receipt)};
  }
  private async run(role: Role, body: ProjectWorkStart) {
    const mode=body.mode??'tui';if(!['tui','cli'].includes(mode))throw new DomainError('Invalid job mode',400);
    if(mode==='cli'&&(typeof body.instruction!=='string'||!body.instruction.trim()||body.instruction.length>20000||body.instruction.includes('\0')))throw new DomainError('CLI work needs an explicit work instruction (at most 20000 characters)',400);
    if(mode==='tui'&&body.instruction!==undefined)throw new DomainError('TUI work instructions must be entered by the developer inside the session',400);
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(body.requestId) || !['new', 'resume', 'focus'].includes(body.action)) throw new DomainError('Invalid job request format', 400);
    const authorized=resolveProjectWork(this.current(),this.data,body.target),assigned=deliveryRequirement(this.current(),authorized.target.projectId,authorized.target.taskId);
    if(assigned)requireDeliveryMember(this.current(),assigned,role);
    const identity = hash({ role, ...body }), path = join(this.directory, 'project-work', body.requestId + '.json');
    try { const saved = JSON.parse(await readFile(path, 'utf8')) as SavedRequest; if (saved.identity !== identity) throw new DomainError('This request ID is already used for other work'); return saved.receipt; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const plan = await this.plan(role, body.target,role,mode);
    if (plan.planToken !== body.planToken) throw new DomainError('The launch basis has changed; reload and confirm again');
    const action = plan.actions.find(action => action.id === body.action);
    if (!action?.enabled) throw new DomainError(action?.reason ?? 'This session action is unavailable');
    const requirement = deliveryRequirement(this.current(), plan.target.projectId, plan.target.taskId);
    if (requirement) {
      requireDeliveryMember(this.current(), requirement, role);
      if (['awaiting-acceptance', 'accepted'].includes(requirement.stage) || plan.target.nodeId === 'accept') throw new DomainError('This requirement is in Owner acceptance; development work is no longer started');
    }
    const directory = body.action === 'new' ? plan.directory.root! : plan.history!.directory;
    const contextPath = join(this.directory, 'work-contexts', body.requestId + '.md');
    const context = projectModelContext(await collaborationContext(this.current(), this.data, plan.target));
    const contextJsonPath = join(this.directory, 'work-contexts', body.requestId + '.json');
    await atomicJson(contextJsonPath, context);
    const scopePath = join(this.directory, 'work-contexts', body.requestId + '.scope.json');
    await atomicJson(scopePath, plan.target);
    const command = formatShellCommand([process.execPath, join(root, 'scripts/teams-demo.mjs'), '--endpoint', origin, '--role', role, 'context', 'get', '--input-file', scopePath, '--output', contextJsonPath]);
    const instruction = `Read the Teams collaboration Skill the first time you start business work: ${collaborationSkillPath}. Current role: ${role}; keep --role ${role} on CLI calls. Get the current basis with: ${command}. That command only prints a saved receipt; read the body from ${contextJsonPath}. Materials already read at the same version need not be reread every turn; when switching nodes, get the new node's basis as the Skill describes.`;
    const nativeSessionPath = join(this.directory, 'work-contexts', body.requestId + '.native', 'native-session.json');
    const binding = requirement ? await taskWorktreeBinding(this.directory,requirement,this.workspaceRepo) : null;
    const gitBoundary=binding&&binding.directory===directory ? `Verified worktree branch ${binding.branch}, remote ${binding.remote}, PR base ${binding.baseBranch}; only changes for this task inside ${binding.directory} may be committed. Recheck that the branch has not changed before committing.` : plan.workspace?.mode==='git' ? `Registered local Git workspace for this task: ${plan.workspace.directory}; baseline ${plan.workspace.baseBranch??'not registered'}${plan.workspace.baseCommit?'@'+plan.workspace.baseCommit.slice(0,12):''}; ${plan.workspace.localOnly?'no verifiable remote is configured: local commits only, do not push or create a remote PR':'origin is verified: you may commit on the task branch and create a PR'}. Only changes for this task inside this directory may be committed.` : plan.workspace?.mode==='directory' ? `Registered plain directory for this task: ${plan.workspace.directory}; this task does not use Git. Do not claim a commit, codeVersion or remote PR.` : 'This session has no verified standalone task branch binding, so committing or pushing is not authorized. If Git deliverables are needed, report blocked and let the developer configure the task workspace.';
    const deliveryBoundary=plan.workspace?.mode==='directory' ? 'This task uses a plain directory: do not claim a commit/codeVersion/remote PR. If a node gate requires codeVersion, report blocked and explain the local directory mode; never fabricate one.' : plan.workspace?.localOnly ? 'This task uses a local Git workspace: local commits are allowed and you report the real commit hash, but do not push, create a PR or claim that remote delivery succeeded.' : '';
    const taskInstructions = requirement ? `\n## Scope of this interactive work\nThe requirement body is in the structured context at agreement.background; confirmed items and their basis are in agreement.confirmations (the prepare node also lists them as nodeContract inputs). Anything not registered stays an open question; do not confirm it yourself. The node selected on this entry is ${plan.target.nodeId}; it is not fixed for the whole session lifetime. ${mode==='cli'?'The CLI work instruction below is a work turn the developer explicitly authorized after the read-only initialization turn. It ends the initialization wait, but it does not replace prepare.confirmed or any business gate. Work only within the selected node, then end this turn; do not switch to or chain other nodes automatically.':'Wait for a work instruction from the developer first, work only within the authorized scope of the current node, and do not chain nodes automatically.'} Node inputs, artifacts and criteria follow context.nodeContract; CLI collaboration steps and parameters follow the Skill above, with no separate contract.\n\n${gitBoundary}\nChange code only inside this work directory: ${directory}. Do not modify the Teams/Talents application projects, original reference materials, global iCode settings, past sessions or other tasks. Only after the developer has explicitly started develop, the current requirement is implemented, and unit tests for the required scope actually pass, commit this task's changes, push the task branch and create or update the PR as the collaboration Skill describes. The PR base must be ${binding?.baseBranch??'not configured (committing not allowed)'}; reuse this task's existing branch/PR. Stage only the paths or hunks this task allows; do not use git add .; do not include other tasks' changes or unrelated changes already staged. Report the real PR link and the exact commit/codeVersion. Do not push directly to main/master or the delivery baseline ${binding?.baseBranch??'not configured'}, merge the PR, deploy, or delegate to another agent. If the Git repository, remote, permissions or mixed-change boundary cannot be verified, report blocked and do not fake a PR. Initialization, prepare, or merely opening the TUI does not authorize committing.\n\nRead the native session identity from ${nativeSessionPath} and check it against this task and runId=${body.requestId}. If it has not appeared, wait up to 15 seconds; if it is still missing, report it and stop. Do not invent or borrow a past ID. When the developer explicitly switches nodes, keep project/task/role/run/session/tab, use the new nodeId to get ready inputs and adopt them separately; do not reuse the old adoptionId. Finish at awaiting Owner acceptance. Do not edit state files directly, bypass the CLI write API, or accept on behalf of the Owner.${deliveryBoundary ? '\n\n' + deliveryBoundary : ''}\n` : '';
    const content = `# ${plan.projectName} · ${plan.title}\n\nWork location: ${plan.location}\nSource: ${plan.source}\n\n${plan.context.summary}\nAdopted versions: ${plan.context.versions}\n\n## Work identifiers\n${JSON.stringify({ ...plan.target, role, runId: body.requestId, sessionId: body.action === 'new' ? null : plan.history!.sessionId }, null, 2)}\n\n## Project materials and selections\n${JSON.stringify({...plan.context,selectedSkills:context.skills.map(skill=>skill.id)}, null, 2)}\n\n## Read when starting work\n${instruction}\n\nStructured context read during preparation: ${contextJsonPath}\n${taskInstructions}${mode==='cli'?`\n## Developer work instruction for this run\n${body.instruction!.trim()}\n`:''}\nThis file was exported by Teams. Providing an entry point does not mean iCode has read, adopted or completed the work.\n`;
    await atomicText(contextPath, content);
    const receipt: ProjectWorkReceipt = { executionMode: plan.executionMode, requestId: body.requestId, target: plan.target, action: body.action, status: 'prepared', at: new Date().toISOString(), directory, sessionId: body.action === 'new' ? null : plan.history!.sessionId, contextPath, instruction, note: 'Launch request prepared; no native session observed yet.' };
    await atomicJson(path, { identity, receipt });
    try {
      if (body.action === 'focus') { const focused = await this.transport.focus(plan.history!); receipt.status = 'terminal-focused'; receipt.note = focused.note; }
      else { const start=mode==='cli'?this.transport.startCli:this.transport.start;if(!start)throw new Error('This instance has no CLI launch adapter configured');const started = await start({ directory, terminal: plan.instance.terminal?.id??'', agent: body.action === 'resume' ? plan.history!.configuration!.agent : plan.instance.agent!, model: body.action === 'resume' ? plan.history!.configuration!.model : plan.instance.model!, ...(receipt.sessionId ? { sessionId: receipt.sessionId } : {}), ...(requirement ? { task: { runId: body.requestId, path: contextPath, scope: { projectId: plan.target.projectId, taskId: requirement.id, nodeId: plan.target.nodeId! },...(plan.history?.prepared&&body.action!=='new'?{preparedSession:{...plan.history.prepared,sessionId:plan.history.sessionId}}:{}) } } : {}), instruction }); receipt.status = mode==='cli'?'cli-requested':'terminal-requested'; if (started && typeof started === 'object' && 'terminal' in started && typeof started.terminal === 'string') receipt.terminal = started.terminal; receipt.note = mode==='cli'?'CLI work request submitted. Check the job status for the real session, exit result and logs; task progress is what the same session reports through the CLI.':'Requested ' + (receipt.terminal ?? 'the system terminal') + (requirement ? ' to open interactive iCode; when the developer submits a work instruction, the current node context entry is attached. The terminal accepting the request does not mean the TUI is up, materials were read or the task is done.' : ' to open iCode in the matching work directory. The terminal accepting the request does not mean the model ran, the context was read or the task is done.'); }
      await atomicJson(path, { identity, receipt }); return receipt;
    } catch (error) {
      receipt.status = 'uncertain'; receipt.note = 'Native request result needs checking: ' + (error as Error).message + '. The original request is kept; it will not be resent or opened in another session automatically.'; await atomicJson(path, { identity, receipt }); throw new DomainError(receipt.note);
    }
  }
}

import {readFile} from 'node:fs/promises';
import {isAbsolute,join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readLegacyTaskBinding,type LegacyTaskWorktree} from '../../scripts/lib/legacy-task-workspace.mjs';
import {configuredProjectWorkspace, readProjectTaskBinding, ensureProjectTaskWorkspace} from './project-workspaces.js';
import {readTaskWorkspace} from './task-workspace.js';
import type {ProjectTaskWorktree} from '../src/project-workspace.js';
const platformRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),exec=promisify(execFile);
type TaskDirectory={projectId:string;id:string;workDirectory?:string};
export const taskWorktreeBinding=async(runtime:string,task:TaskDirectory,repo=platformRoot):Promise<LegacyTaskWorktree|ProjectTaskWorktree|null>=>await readProjectTaskBinding(runtime,task)??await readLegacyTaskBinding(repo,runtime,task);
export async function ensureTaskWorkspace(runtime:string,scope:{projectId:string;taskId:string},preparationId:string,repo=platformRoot) {
  // A task-local workspace is an explicit fallback for projects without a verified worktree.
  const taskWorkspace=await readTaskWorkspace(runtime,scope);if(taskWorkspace)return taskWorkspace;
  if(!await configuredProjectWorkspace(runtime,scope.projectId))return null;
  const state=JSON.parse(await readFile(join(runtime,'state.json'),'utf8'));
  const task=state.workspace?.deliveryRequirements?.find((item:TaskDirectory)=>item.id===scope.taskId&&item.projectId===scope.projectId);
  if(!task)throw new Error('Task does not exist');
  const existing=await taskWorktreeBinding(runtime,task,repo);if(existing)return existing;
  if(task.workDirectory)return null;
  return ensureProjectTaskWorkspace(runtime,task,preparationId);
}
/** Explicit task binding. Current worktree identity is checked without rewriting historical task/session evidence. */
export async function taskWorkDirectory(runtime:string,task:TaskDirectory,repo=platformRoot,_requireWorkspace=true) {
  const taskWorkspace=await readTaskWorkspace(runtime,{projectId:task.projectId,taskId:task.id});if(taskWorkspace&&!task.workDirectory)return taskWorkspace.directory;
  const worktree=await taskWorktreeBinding(runtime,task,repo);if(worktree)return worktree.directory;
  const configured=await configuredProjectWorkspace(runtime,task.projectId);
  if(configured&&!task.workDirectory){
    let saved:any;try{saved=JSON.parse(await readFile(join(runtime,'state.json'),'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    const prepared=saved?.workspace?.taskAutomation?.find((item:any)=>item.projectId===task.projectId&&item.taskId===task.id)?.preparation?.session?.directory;
    if(prepared)return prepared as string;
    const recorded=saved?.workspace?.deliveryRequirements?.find((item:any)=>item.projectId===task.projectId&&item.id===task.id);
    if(recorded?.preparedAt||recorded&&Object.values(recorded.nodes??{}).some((node:any)=>node.status!=='pending'))throw new Error('This task has run but has no standalone repository binding; keep the original task directory. It cannot be migrated to the new configuration');
    return configured.directory;
  }
  const path=join(runtime,'project-task-directory-bindings.json');let value:any;
  try{value=JSON.parse(await readFile(path,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'){return task.workDirectory;}throw error;}
  if(value?.version!==1||!Array.isArray(value.bindings))throw new Error('Invalid local task directory binding record');
  const identities=new Set<string>();
  for(const item of value.bindings){
    if(!item||typeof item.projectId!=='string'||typeof item.taskId!=='string')throw new Error('Invalid local task directory binding identity');
    const key=JSON.stringify([item.projectId,item.taskId]);if(identities.has(key))throw new Error('Duplicate local task directory binding');identities.add(key);
    if(item.kind==='carddemo-worktree')continue;
    if(item.kind!==undefined||!isAbsolute(item.recordedDirectory??'')||!isAbsolute(item.directory??'')||typeof item.gitConfigSha256!=='string'||!/^[a-f0-9]{64}$/.test(item.gitConfigSha256))throw new Error('Invalid local task directory binding fields');
  }
  const binding=value.bindings.find((item:any)=>item.projectId===task.projectId&&item.taskId===task.id);
  if(!binding){return task.workDirectory;}
  if(binding.recordedDirectory!==task.workDirectory)throw new Error('The local task directory binding does not match the requirement registration source');
  // Git resolves either a normal .git directory or a linked-worktree .git file.
  const {stdout}=await exec('git',['-C',binding.directory,'rev-parse','--git-path','config'],{encoding:'utf8',windowsHide:true});
  const config=await readFile(resolve(binding.directory,stdout.trim()));
  if(createHash('sha256').update(config).digest('hex')!==binding.gitConfigSha256)throw new Error('The migrated local Git directory configuration changed; verify the binding again');
  return binding.directory as string;
}

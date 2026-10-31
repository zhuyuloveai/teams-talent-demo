import {open,lstat,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {isAbsolute,resolve,relative,dirname,extname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {DomainError,type DemoState,type Role} from '../src/domain.js';
import {deliveryRequirement,type DeliveryRequirement,type RequirementNode} from '../src/delivery-requirements.js';
import {projectMembers} from '../src/teams-domain.js';
import type {TaskArtifactQuery,TaskArtifactContent} from '../src/task-artifact-content.js';
import {taskWorkDirectory} from './task-work-directory.js';
import {canonicalDirectory,contained,readTaskArtifactRoots} from '../scripts/lib/task-artifact-roots.mjs';
const exec=promisify(execFile),MAX_BYTES=1024*1024;
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
function fail(message:string,status=409):never {throw new DomainError(message,status);}
interface Options {runtime:string;teamsRoot:string;directory?:(task:DeliveryRequirement)=>Promise<string|undefined>}
async function checkedFile(path:string,root:string){
 await canonicalDirectory(root);
 if(!contained(root,path)||resolve(path)!==path)fail('The material path is not inside the verified directory of this task',403);
 let at=path;while(at!==root){const stat=await lstat(at);if(stat.isSymbolicLink())fail('Symbolic links are not allowed in the material path',403);at=dirname(at);}
 if(await realpath(path)!==path)fail('The real path of the material does not match the registered path',403);
}
/** Resolve only a saved result identity. The browser never supplies a filesystem path. */
export async function readTaskArtifactContent(state:DemoState,role:Role,query:TaskArtifactQuery,options:Options):Promise<TaskArtifactContent>{
 if(role!=='owner'&&role!=='member')fail('Select a role',400);
 if(!query||Object.keys(query).some(key=>!['projectId','taskId','nodeId','artifactId','version'].includes(key))||!['prepare','develop','verify','accept'].includes(query.nodeId)||typeof query.version!=='string')fail('Invalid artifact query scope',400);
 const task=deliveryRequirement(state,query.projectId,query.taskId);if(!task)fail('Task not found',404);
 if(!projectMembers(state,query.projectId).some(member=>member.id===role&&member.status==='active'))fail('No permission to read materials of this project',403);
 const match=/^artifact:([^:]+):(\d+)$/.exec(query.artifactId);if(!match)fail('This item is not a registered task artifact',404);
 const event=state.workspace.collaboration?.events.find(item=>item.id===match![1]&&item.projectId===query.projectId&&item.taskId===query.taskId&&item.nodeId===query.nodeId&&item.phase==='result');
 const evidence=event?.evidence[Number(match![2])];if(!evidence||query.artifactId!==`artifact:${event!.id}:${Number(match![2])}`)fail('The current task node has not registered this artifact',404);
 if((evidence.version??'')!==query.version)fail('The requested version does not match the registered artifact');
 const base={artifactId:query.artifactId,projectId:query.projectId,taskId:query.taskId,nodeId:query.nodeId,title:evidence.description,version:evidence.version??null,...(evidence.codeVersion?{codeVersion:evidence.codeVersion}:{})};
 if(evidence.kind==='reference'){
  let url:URL;try{url=new URL(evidence.value);}catch{return fail('This reference has no registered web address that can be opened',422);}
  if(url.protocol!=='https:'||url.hostname!=='github.com'||url.username||url.password||url.port||!/^\/[^/]+\/[^/]+\/(pull\/\d+|commit\/[a-f\d]{40})\/?$/i.test(url.pathname)||url.search||url.hash)fail('This reference is not a supported GitHub PR/commit URL',422);
  return {...base,kind:'link',url:url.href,integrity:'saved-link',note:'The link comes from the saved artifact record of this task.'};
 }
 if(evidence.kind!=='local-file'||!isAbsolute(evidence.value))fail('The artifact has no valid local file reference',422);
 const path=evidence.value;
 if(!['.md','.markdown','.txt','.json','.log','.csv','.xml','.yaml','.yml','.html'].includes(extname(path).toLowerCase()))fail('Content preview is not supported for this file format yet',415);
 const directory=await(options.directory?options.directory(task):taskWorkDirectory(options.runtime,task,resolve(options.teamsRoot,'..')));
 const bound=directory?await canonicalDirectory(directory):undefined;
 const registered=await readTaskArtifactRoots({...options,projectId:task.projectId,taskId:task.id});
 const root=[...(bound?[bound]:[]),...registered.map(row=>row.directory)].find(root=>contained(root,path));if(!root)fail('This material is not in the task work directory or a registered task report directory. Verify the registration first.',403);
 await checkedFile(path,root);
 const entry=await lstat(path);if(!entry.isFile()||entry.size>MAX_BYTES)fail('Content must be a regular file of at most 1 MiB',413);
 const file=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));let bytes:Buffer;
 try{const before=await file.stat();if(!before.isFile()||before.size>MAX_BYTES)fail('Content must be a regular file of at most 1 MiB',413);const buffer=Buffer.alloc(MAX_BYTES+1);let length=0;while(length<buffer.length){const read=await file.read(buffer,length,buffer.length-length,length);if(!read.bytesRead)break;length+=read.bytesRead;}bytes=buffer.subarray(0,length);const after=await file.stat();const current=await lstat(path);if(bytes.length>MAX_BYTES||before.size!==after.size||before.mtimeMs!==after.mtimeMs||after.ino!==current.ino||after.dev!==current.dev)fail('The file changed while being read. Try again.');await checkedFile(path,root);}finally{await file.close();}
 let integrity:TaskArtifactContent['integrity']='current-file',note='No content SHA was registered at submission; showing the current file content.';
 // A codeVersion may identify a historical design file: read that exact reachable commit, never relabel HEAD bytes.
 if(bound&&bound===root&&evidence.codeVersion){
  if(!/^[a-f\d]{40}$/i.test(evidence.codeVersion))fail('The artifact code version is not a full commit SHA');
  await exec('git',['-C',bound,'merge-base','--is-ancestor',evidence.codeVersion,'HEAD'],{windowsHide:true}).catch(()=>fail('The artifact code version is not in the history of this task\'s worktree'));
  const {stdout:top}=await exec('git',['-C',bound,'rev-parse','--show-toplevel'],{windowsHide:true});const repo=await realpath(top.trim());
  if(repo!==bound&&!contained(repo,bound))fail('The bound business directory is not inside the verified worktree',403);
  const gitPath=relative(repo,path).split('\\').join('/');
  const result=await exec('git',['-C',bound,'show',`${evidence.codeVersion}:${gitPath}`],{encoding:'buffer',maxBuffer:MAX_BYTES,windowsHide:true}).catch(()=>fail('Cannot read the registered document version in this commit'));
  bytes=result.stdout;integrity='git-commit';note='Content read from the registered code commit in this task\'s worktree history.';
 }
 const actual=hash(bytes),record=evidence as typeof evidence&{sha256?:string;contentSha256?:string};
 for(const expected of [record.sha256,record.contentSha256].filter(value=>value!==undefined)){
  if(typeof expected!=='string'||!/^[a-f\d]{64}$/i.test(expected)||expected.toLowerCase()!==actual)fail('Content does not match the registered content SHA256');integrity='registered-sha256';note='Content matches the content SHA256 registered at submission.';
 }
 let content:string;try{content=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{return fail('Content is not valid UTF-8 text',415);}
 if(content.includes('\u0000'))fail('Content contains binary data and cannot be previewed as text',415);
 return {...base,kind:'document',content,sha256:actual,bytes:bytes.length,integrity,note};
}

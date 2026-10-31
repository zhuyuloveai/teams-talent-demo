// Read-only access to task worktrees created before independent business repositories.
// No initializer, branch writer or inferred business subdirectory is provided.
import {readFile,realpath} from 'node:fs/promises';
import {isAbsolute,join,resolve,relative,sep} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const git=async(repo,args)=>(await exec('git',['-C',repo,...args],{encoding:'utf8',timeout:15000,windowsHide:true})).stdout.trim();
export async function readLegacyTaskBinding(platformRoot,runtime,task){
 let registry;try{registry=JSON.parse(await readFile(join(runtime,'project-task-directory-bindings.json'),'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}
 if(registry?.version!==1||!Array.isArray(registry.bindings))throw Error('Invalid legacy task directory binding');
 const matches=registry.bindings.filter(row=>row?.projectId===task.projectId&&row?.taskId===task.id);
 if(matches.length>1)throw Error('Duplicate legacy task directory binding');const b=matches[0];if(!b||b.kind!=='carddemo-worktree')return null;
 if(b.platformRoot!==resolve(platformRoot)||(task.workDirectory??null)!==b.recordedDirectory||!isAbsolute(b.directory??'')||!isAbsolute(b.worktreeRoot??'')||!isAbsolute(b.commonDirectory??'')||typeof b.remoteUrl!=='string'||b.remote!=='origin'||typeof b.branch!=='string'||typeof b.baseBranch!=='string'||!/^[a-f0-9]{40}$/.test(b.baseCommit??''))throw Error('Invalid legacy task workspace identity');
 const part=relative(b.worktreeRoot,b.directory);if(!part||part==='..'||part.startsWith('..'+sep)||isAbsolute(part))throw Error('The legacy business directory is not inside the registered worktree');
 if(await realpath(b.directory)!==b.directory||await realpath(await git(b.directory,['rev-parse','--show-toplevel']))!==b.worktreeRoot||await realpath(resolve(b.directory,await git(b.directory,['rev-parse','--git-common-dir'])))!==b.commonDirectory)throw Error('The legacy workspace Git identity has changed');
 if(await git(b.directory,['remote','get-url','origin'])!==b.remoteUrl||await git(b.directory,['symbolic-ref','--short','HEAD'])!==b.branch)throw Error('The legacy workspace origin or branch has changed');
 await git(b.directory,['merge-base','--is-ancestor',b.baseCommit,'HEAD']);return b;
}

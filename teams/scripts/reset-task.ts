import {readFile,open,mkdir} from 'node:fs/promises';
import {join,isAbsolute,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import type {ResetPlan} from '../server/task-reset.js';
// The reset modules pull in the state store and therefore read the local configuration at module load.
// They are imported inside main() so that --help never depends on a valid configuration.
let atomicText: typeof import('../server/task-reset.js')['atomicResetText'];
const help=`Reset exactly one trial requirement. Preview only by default; business source code is not changed.\n\n  npm run reset:task -- --project carddemo --task REQ-... [--apply] [--remove]\n  npm run reset:task -- --restore /absolute/backup [--apply]\n\n--remove only deletes a newly added REQ record; by default the original text, assignee and schedule are kept and the task returns to Not started.\n--receipt-root /absolute/path can be repeated, for known old CLI receipt directories.\n--apply first verifies active sessions and service ownership, backs up, then clears only the target; it stops and restarts this repo's Teams if needed, without building.\nEnd the target requirement's iCode session first. Global native sessions, source code, tracked/shared materials, Talents and raw trace archives are kept.\n--restore restores this backup only if the cleaned files have not changed since.`;
const args=process.argv.slice(2);
if(!args.length||args.length===1&&args[0]==='--help'){console.log(help);}else await main().catch(error=>{console.error(JSON.stringify({ok:false,error:error instanceof Error?error.message:String(error)}));process.exitCode=1;});
async function main(){
 const {planTaskReset,applyTaskReset,restoreTaskReset,verifyTaskResetPlan,atomicResetText}=await import('../server/task-reset.js');
 const {acquireTaskMaintenance}=await import('../server/task-maintenance.js');
 atomicText=atomicResetText;
 const values:Record<string,string>={},receiptRoots:string[]=[];let apply=false,remove=false;
 for(let i=0;i<args.length;i++){const name=args[i];if(name==='--apply'){if(apply)throw Error('Duplicate apply');apply=true;}else if(name==='--remove'){if(remove)throw Error('Duplicate remove');remove=true;}else if(['--project','--task','--restore','--receipt-root'].includes(name)){const value=args[++i];if(!value||value.startsWith('--'))throw Error(name+' is missing a value');if(name==='--receipt-root')receiptRoots.push(value);else{if(values[name])throw Error('Duplicate argument '+name);values[name]=value;}}else throw Error('Unknown argument '+name);}
 if(values['--restore']?(values['--project']||values['--task']||remove||receiptRoots.length):(!values['--project']||!values['--task']))throw Error('project and task must be given together; restore is used on its own');
 const config=await import('../server/service-config.js');const options={root:config.root,runtime:config.runtimeDir,shared:config.sharedDir,scope:{projectId:values['--project'],taskId:values['--task']},remove,receiptRoots};
 const restoring=values['--restore'];let plan:ResetPlan|undefined;
 if(restoring){if(!isAbsolute(restoring))throw Error('restore requires an absolute path');const manifest=JSON.parse(await readFile(join(restoring,'manifest.json'),'utf8'));plan=manifest.plan;if(plan?.roots.root!==config.root||plan?.roots.runtime!==config.runtimeDir||plan?.roots.shared!==config.sharedDir)throw Error('The backup does not belong to the configured repo/state/shared directories');const result=await restoreTaskReset(restoring);if(!apply){console.log(JSON.stringify({ok:true,preview:true,...result},null,2));return;}}
 else{plan=await planTaskReset(options);if(!apply){console.log(JSON.stringify(publicPlan(plan),null,2));if(plan.blockers.length)process.exitCode=1;return;}await verifyTaskResetPlan(plan);}
 let output:unknown;let stopped=false,release:(()=>Promise<void>)|undefined,consistent=true;const health=await ownedHealth(config);if(!health){try{const pid=Number((await readFile(join(config.runtimeDir,'server.pid'),'utf8')).trim());if(!Number.isSafeInteger(pid)||pid<2)throw Error('server.pid is malformed');try{process.kill(pid,0);throw Error('The service process recorded in the state directory still exists, but its ownership cannot be verified on the current port; nothing was written');}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw error;}}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}if(health){
  const pidFile=join(config.runtimeDir,'server.pid');try{const pid=Number((await readFile(pidFile,'utf8')).trim());if(pid!==health.pid)throw Error('server.pid does not match the health check; not stopped');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  process.kill(health.pid,'SIGTERM');stopped=true;await waitStopped(config,health.pid);
 }
 try{
  release=await acquireTaskMaintenance(config.runtimeDir,'reset');if(await ownedHealth(config))throw Error('The service was started concurrently; nothing was written');
  if(!restoring){const current=await planTaskReset(options);await verifyTaskResetPlan(current);if(JSON.stringify(current.files.map(({path,sha256})=>({path,sha256})))!==JSON.stringify(plan!.files.map(({path,sha256})=>({path,sha256}))))throw Error('Data changed while the service was stopping; preview again');await verifyTaskResetPlan(plan!);}
  const result=restoring?await restoreTaskReset(restoring,true):await applyTaskReset(plan!);output={ok:true,applied:true,...(restoring?result:{backup:result.backup,scope:plan!.scope,counts:plan!.counts})};
 }catch(error){if(/回退未完成|rollback incomplete/i.test(String(error)))consistent=false;throw error;}
 finally{await release?.();if(stopped&&consistent)await startOwned(config);else if(stopped)console.error('The service stays stopped; resolve the backup rollback error first.');}
 console.log(JSON.stringify(output,null,2));
}
function publicPlan(plan:ResetPlan){return{ok:plan.blockers.length===0,preview:true,scope:plan.scope,mode:plan.mode,counts:plan.counts,files:plan.files.map(({path,kind,sha256,bytes,after})=>({path,kind,sha256,bytes,action:after===undefined?'archive':'replace'})),preserved:plan.preserved,blockers:plan.blockers,backupRoot:join(plan.roots.runtime,'task-reset-backups'),digest:plan.digest};}
type Config=typeof import('../server/service-config.js');
async function ownedHealth(config:Config):Promise<{pid:number}|null>{
 try{const response=await fetch(config.origin+'/api/health',{signal:AbortSignal.timeout(1500)});if(!response.ok)throw Error('Service health check failed '+response.status);const h=await response.json();if(h.app!=='teams-talent-carddemo'||h.service!=='teams'||h.workspaceRoot!==config.root||h.stateRoot!==config.runtimeDir||h.origin!==config.origin||!Number.isSafeInteger(h.pid)||h.pid<2)throw Error('The service on this port does not belong to this repo/state directory; not stopped');return h;}
 catch(error){if((error as {cause?:{code?:string}}).cause?.code==='ECONNREFUSED')return null;throw error;}
}
function pause(){return new Promise(resolve=>setTimeout(resolve,100));}
async function waitStopped(config:Config,pid:number){for(let i=0;i<300;i++){let alive=true;try{process.kill(pid,0);}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH')alive=false;else throw error;}if(!alive&&!(await ownedHealth(config)))return;await pause();}throw Error('The owned service did not exit within 30 seconds; nothing was written and the process was not killed');}
async function startOwned(config:Config){
 await mkdir(config.runtimeDir,{recursive:true});const log=await open(join(config.runtimeDir,'server.log'),'a',0o600);const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:config.root,env:process.env,detached:true,stdio:['ignore',log.fd,log.fd],windowsHide:true});await log.close();let failure:Error|undefined;child.on('error',error=>{failure=error;});child.unref();
 if(child.pid)await atomicText(join(config.runtimeDir,'server.pid'),String(child.pid)+'\n');for(let i=0;i<150;i++){if(failure)throw failure;if(child.exitCode!==null)throw Error('Teams failed to restart; see server.log');const h=await ownedHealth(config);if(h){if(h.pid!==child.pid)throw Error('Another service took the port during restart; not taken over');console.error('Teams restarted, PID '+h.pid);return;}await pause();}throw Error('Teams restart timed out; see server.log. The process was not killed');
}

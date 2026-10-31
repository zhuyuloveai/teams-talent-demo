#!/usr/bin/env node
import {readFile,mkdir,open,rename} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {runtimeDir,origin as configuredOrigin} from '../server/config.ts';
const help=`Teams iCode work CLI
plan | start | status
--endpoint http://127.0.0.1:46970 --role owner|member
--project ID --task ID --node prepare|develop|verify [--mode cli]
start: --mode cli --instruction-file FILE (or --instruction TEXT) --request-id UUID
status: --request-id <original request UUID>
--receipt-dir DIR local request/receipt directory (retries of the same logical start must keep the original ID and instruction)
plan/status are read-only. start only resumes this task's prepared, inactive real session; it does not create or adopt inputs and does not advance the node.
The UI still defaults to the TUI; an explicit CLI work instruction authorizes only this node. If not ready, finish preparation in Teams first.
stdout carries the plan / start receipt / real work status; log paths are for local checking, and the native transcript is not repeated on stdout.
Exit codes: 0 request succeeded (not the same as business completion); 1 request/argument failure; 2 status observed failed or unknown.`;
let requestPath;
async function atomic(path,value){await mkdir(dirname(path),{recursive:true});const temp=path+'.'+randomUUID()+'.tmp';const f=await open(temp,'wx',0o600);try{await f.writeFile(JSON.stringify(value,null,2)+'\n');await f.sync();}finally{await f.close();}await rename(temp,path);}
try{
 const args=process.argv.slice(2),o={},pos=[];const names=new Set(['endpoint','role','project','task','node','mode','instruction','instruction-file','request-id','receipt-dir']);
 for(let i=0;i<args.length;i++){if(['--help','-h'].includes(args[i])){console.log(help);process.exit(0);}if(!args[i].startsWith('--')){pos.push(args[i]);continue;}const key=args[i].slice(2);if(!names.has(key)||Object.hasOwn(o,key)||!args[i+1]||args[i+1].startsWith('--'))throw new Error('Unknown, duplicate or missing-value argument: '+args[i]);o[key]=args[++i];}
 const command=pos.join(' ');if(!['plan','start','status'].includes(command))throw new Error(help);
 if(!['owner','member'].includes(o.role)||!o.project||!o.task||!['prepare','develop','verify'].includes(o.node))throw new Error('role/project/task/node must be specified');
 if(o.mode&&o.mode!=='cli'||command==='start'&&o.mode!=='cli')throw new Error('A CLI start requires an explicit --mode cli');
 if(command!=='start'&&(o.instruction||o['instruction-file']))throw new Error('Work instructions are only for start');
 const endpoint=new URL(o.endpoint??process.env.DEMO_ORIGIN??configuredOrigin);if(endpoint.protocol!=='http:'||endpoint.hostname!=='127.0.0.1'||endpoint.pathname!=='/'||endpoint.search||endpoint.hash||endpoint.username||endpoint.password)throw new Error('Only an explicit local HTTP origin is allowed');
 const base=endpoint.origin,target={projectId:o.project,tab:'delivery',taskId:o.task,nodeId:o.node};
 const getQuery=new URLSearchParams({role:o.role,...target});
 async function request(path,body,token){const response=await fetch(base+path,{redirect:'error',signal:AbortSignal.timeout(20000),...(body?{method:'POST',headers:{'content-type':'application/json',origin:base,'x-demo-token':token},body:JSON.stringify(body)}:{})});const value=await response.json();if(!response.ok)throw new Error(`HTTP ${response.status}: ${value.error??'request failed'}`);return value;}
 const health=await request('/api/health');if(health.app!=='teams-talent-carddemo'||health.service!=='teams')throw new Error('Target is not the Teams service');
 let result;
 if(command==='plan')result=await request('/api/project-work?'+getQuery+'&mode=cli');
 else{
  const id=o['request-id'];if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id??''))throw new Error('A stable --request-id UUID is required');
  if(command==='status'){result=await request('/api/native/work-status?'+getQuery+'&requestId='+encodeURIComponent(id));if(['failed','unknown'].includes(result.execution?.status))process.exitCode=2;}
  else{
   if(Boolean(o.instruction)===Boolean(o['instruction-file']))throw new Error('Provide exactly one of instruction or instruction-file');
   const instruction=(o.instruction??await readFile(resolve(o['instruction-file']),'utf8')).trim();if(!instruction||instruction.length>20000||instruction.includes('\0'))throw new Error('The work instruction must be 1–20000 characters');
   const identity={endpoint:base,role:o.role,target,mode:'cli',instruction,requestId:id};
   const key=createHash('sha256').update(base+':'+id).digest('hex');requestPath=join(resolve(o['receipt-dir']??join(runtimeDir,'work-cli-receipts')),key+'.request.json');
   let envelope;
   try{envelope=JSON.parse(await readFile(requestPath,'utf8'));if(JSON.stringify(envelope.identity)!==JSON.stringify(identity))throw new Error('This request ID is already used for a different scope or instruction; refusing to overwrite');}
   catch(error){if(error.code!=='ENOENT')throw error;const plan=await request('/api/project-work?'+getQuery+'&mode=cli');const action=plan.actions.find(item=>item.id===plan.defaultAction);if(plan.defaultAction!=='resume'||!action?.enabled)throw new Error(action?.reason??'No prepared session is available to resume');envelope={identity,payload:{role:o.role,requestId:id,target:plan.target,action:'resume',planToken:plan.planToken,mode:'cli',instruction}};await mkdir(dirname(requestPath),{recursive:true});try{const f=await open(requestPath,'wx',0o600);try{await f.writeFile(JSON.stringify(envelope,null,2)+'\n');await f.sync();}finally{await f.close();}}catch(error){if(error.code!=='EEXIST')throw error;const existing=JSON.parse(await readFile(requestPath,'utf8'));if(JSON.stringify(existing.identity)!==JSON.stringify(identity))throw new Error('Concurrent request ID conflict');envelope=existing;}}
   const session=await request('/api/session');const receipt=await request('/api/native/work-start',envelope.payload,session.token);const receiptPath=requestPath.replace('.request.json','.receipt.json');await atomic(receiptPath,receipt);result={receipt,requestPath,receiptPath};if(['uncertain','prepared'].includes(receipt.status))process.exitCode=2;
  }
 }
 console.log(JSON.stringify(result,null,2));
}catch(error){console.error(JSON.stringify({ok:false,error:error.message,...(requestPath?{requestPath,note:'The request may already have been accepted; query status with the original request-id first and do not start again with a new ID.'}:{})},null,2));process.exitCode=1;}

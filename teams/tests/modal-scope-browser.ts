import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash,randomUUID } from 'node:crypto';
import { mkdtemp,mkdir,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,basename } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { initialState } from '../src/domain.js';
import { createDeliveryRequirement } from '../src/delivery-requirements.js';

const root=await mkdtemp(join(tmpdir(),'modal-scope-')),origin='http://127.0.0.1:46221';
const seed=initialState(),at='2026-10-27T00:00:00Z',projectIds=[randomUUID(),randomUUID()];
seed.workspace.projects=projectIds.map((id,index)=>({id,teamId:'carddemo',owner:'owner',name:'Scope project '+index,description:'Isolated UI scope check',remoteUrl:'https://example.test/'+id+'.git',repositoryIdentity:'example.test/'+id,createdAt:at,updatedAt:at}));
for(const id of ['MKT-MODAL-A','MKT-MODAL-B']){const task=createDeliveryRequirement(seed,'owner',{projectId:'carddemo',id,title:'Scope requirement '+id,description:'Only for modal scope checks; not an actual run.',assigneeId:'member',skillIds:['dev-code-reviewer']},at);task.stage='awaiting-acceptance';task.nodes.develop.status='complete';task.nodes.verify.status='complete';task.nodes.accept.status='waiting-owner';}
await writeFile(join(root,'state.json'),JSON.stringify(seed));
// Compile current candidate to memory: never replace the running service's dist.
const bundle=await build({entryPoints:['src/main.tsx'],bundle:true,outdir:join(root,'bundle'),format:'esm',minify:true,target:['chrome120'],define:{'process.env.NODE_ENV':'"production"'},write:false});
const server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,DEMO_PORT:'46221',DEMO_TALENT_PORT:'46222',DEMO_STATE_DIR:root,DEMO_SHARED_DIR:join(root,'shared'),DEMO_SHARED_SEED_DIR:join(root,'no-seed'),DEMO_NATIVE_DISABLED:'1'},stdio:['ignore','pipe','pipe']});let logs='';server.stdout.on('data',data=>logs+=data);server.stderr.on('data',data=>logs+=data);let browser;
try{
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(origin+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,logs);
 const before=await readFile(join(root,'state.json'));browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(5000);const posts:string[]=[],errors:string[]=[];
 page.on('request',request=>{if(request.method()==='POST')posts.push(request.url());});page.on('pageerror',error=>errors.push(error.message));for(const file of bundle.outputFiles!)await page.route(origin+'/'+basename(file.path),route=>route.fulfill({body:Buffer.from(file.contents),contentType:file.path.endsWith('.css')?'text/css':'text/javascript'}));
 const management=(id:string)=>'#/projects?project='+id+'&tab=management&category=general';const delivery=(id:string)=>'#/projects?project=carddemo&tab=delivery&task='+id+'&node=accept';
 await page.goto(origin+'/teams?demo-role=owner'+management(projectIds[0]));await page.getByRole('button',{name:'New general task',exact:true}).click();await page.getByRole('textbox',{name:'General task name',exact:true}).fill('Must not carry over to another project');
 await page.evaluate(hash=>{location.hash=hash;},management(projectIds[1]));await page.locator('[data-task-project="'+projectIds[1]+'"]').waitFor();await page.getByRole('dialog',{name:'New general task',exact:true}).waitFor({state:'hidden'});assert.equal(posts.length,0);
 await page.getByRole('button',{name:'New general task',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'General task name',exact:true}).inputValue(),'');await page.getByRole('dialog').getByRole('button',{name:/Cancel/}).click();
 await page.evaluate(hash=>{location.hash=hash;},delivery('MKT-MODAL-A'));await page.getByRole('button',{name:'Accept requirement',exact:true}).click();await page.getByRole('button',{name:'Confirm acceptance of this requirement',exact:true}).waitFor();
 await page.evaluate(hash=>{location.hash=hash;},delivery('MKT-MODAL-B'));await page.locator('[data-flow-task="MKT-MODAL-B"]').waitFor();await page.getByRole('dialog',{name:'Confirm requirement acceptance',exact:true}).waitFor({state:'hidden'});assert.equal(posts.length,0);
 await page.getByRole('button',{name:'Return for more work',exact:true}).click();await page.getByPlaceholder('Describe what needs to be added').fill('Must not carry over to another requirement');await page.evaluate(hash=>{location.hash=hash;},delivery('MKT-MODAL-A'));await page.locator('[data-flow-task="MKT-MODAL-A"]').waitFor();await page.getByRole('dialog',{name:'Return for more work',exact:true}).waitFor({state:'hidden'});await page.getByRole('button',{name:'Return for more work',exact:true}).click();assert.equal(await page.getByPlaceholder('Describe what needs to be added').inputValue(),'');await page.getByRole('dialog').getByRole('button',{name:/Cancel/}).click();
 assert.equal(posts.length,0);assert.deepEqual(errors,[]);assert.deepEqual(await readFile(join(root,'state.json')),before);
 const inputs=await Promise.all(['src/components/project-task-management.tsx','src/pages/project.tsx','tests/modal-scope-browser.ts'].map(async path=>({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')})));
 await mkdir('test-results/modal-scope',{recursive:true});await page.screenshot({path:'test-results/modal-scope/closed-modal.png',fullPage:true});await writeFile('test-results/modal-scope/result.json',JSON.stringify({passed:true,checks:['project switch discards create dialog and fields','task switch discards acceptance dialog','task switch discards return dialog and reason'],posts,errors,stateBytesUnchanged:true,inputs},null,2));console.log('PASS modal scope changes close old forms; new forms empty; 0 POST; state bytes unchanged');
}finally{await browser?.close();if(server.exitCode===null)await new Promise<void>(resolve=>{server.once('exit',()=>resolve());server.kill('SIGTERM');});await rm(root,{recursive:true,force:true});}

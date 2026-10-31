/** Add one reviewed scenario artifact through the running Talents API. Dry run unless --apply. */
import { appendPlatinumCashbackPage } from '../server/platinum-cashback-page.ts';
import { platinumCashbackPage } from '../../shared/platinum-cashback-page.ts';
const args=process.argv.slice(2),apply=args.includes('--apply');
if(args.some((arg,index)=>arg!=='--apply'&&arg!=='--endpoint'&&args[index-1]!=='--endpoint'))throw new Error('Usage: node --import tsx tools/register-platinum-cashback-page.ts --endpoint http://127.0.0.1:46980 [--apply]');
const endpoint=args[args.indexOf('--endpoint')+1];
if(!args.includes('--endpoint')||!endpoint)throw new Error('An explicit --endpoint is required; the production service is never chosen implicitly');
const url=new URL(endpoint);
if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw new Error('Only an explicit local Talents origin is supported');
const get=async(path:string)=>{const response=await fetch(url.origin+path);if(!response.ok)throw new Error(`Read failed HTTP ${response.status}: ${await response.text()}`);return response.json();};
const health=await get('/api/health');if(health.app!=='talents-carddemo'||health.service!=='talents')throw new Error('The selected port is not the Talents service; nothing was written');
const before=await get('/api/bootstrap'),result=appendPlatinumCashbackPage(before.state);
if(apply&&result.added){
 const response=await fetch(url.origin+'/api/state',{method:'PUT',headers:{Origin:url.origin,'Content-Type':'application/json'},body:JSON.stringify({revision:before.revision,state:result.state})});
 if(!response.ok)throw new Error(`Append failed HTTP ${response.status}: ${await response.text()}`);
 await response.json();
 const after=await get('/api/bootstrap'),desired=after.state.artifacts.find((item:any)=>item.id===platinumCashbackPage.artifactId);
 if(!desired)throw new Error('The new artifact was not found after saving. Check the service log; do not reset');
 const oldArtifacts=after.state.artifacts.filter((item:any)=>item.id!==platinumCashbackPage.artifactId);
 if(JSON.stringify(oldArtifacts)!==JSON.stringify(before.state.artifacts))throw new Error('Other artifacts were updated concurrently. Please check; no rollback or overwrite was performed');
}
console.log(JSON.stringify({mode:apply?'apply':'dry-run',added:apply&&result.added,wouldAdd:result.added,artifactId:platinumCashbackPage.artifactId,version:platinumCashbackPage.version,beforeRevision:before.revision,workspaceRoot:health.workspaceRoot,stateRoot:health.stateRoot,note:result.added?'Only the dedicated published artifact is appended; no requirement is created, no state is reset, no model is run.':'The same artifact already exists; nothing was written.'},null,2));

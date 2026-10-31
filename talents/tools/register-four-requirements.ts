/** Explicit local API registration. Default dry run; no service launch, reset or task creation. */
import { appendFourRequirements } from '../server/four-requirements.ts';
import { buildExport } from '../server/export.ts';
import { fourRequirementScenarios, fourRequirementScenariosV2 } from '../../shared/four-requirement-scenarios.ts';
const args=process.argv.slice(2),apply=args.includes('--apply');
if(args.some((a,i)=>a!=='--apply'&&a!=='--endpoint'&&a!=='--version'&&args[i-1]!=='--endpoint'&&args[i-1]!=='--version')||args.filter(a=>a==='--endpoint').length!==1||args.filter(a=>a==='--version').length>1)throw new Error('Usage: node --import tsx tools/register-four-requirements.ts --endpoint http://127.0.0.1:46980 [--version 1|2] [--apply]');
const versionArg=args.includes('--version')?args[args.indexOf('--version')+1]:'1';if(versionArg!=='1'&&versionArg!=='2')throw new Error('Only version 1 or 2 is supported');const version=Number(versionArg) as 1|2,scenarios=version===2?fourRequirementScenariosV2:fourRequirementScenarios;
const endpoint=args[args.indexOf('--endpoint')+1];if(!endpoint)throw new Error('An explicit local endpoint is required');
const url=new URL(endpoint);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw new Error('Only an explicit local Talents origin is supported');
const get=async(path:string)=>{const r=await fetch(url.origin+path);if(!r.ok)throw new Error(`HTTP ${r.status}: ${await r.text()}`);return r.json();};
const health=await get('/api/health');if(health.app!=='talents-carddemo'||health.service!=='talents')throw new Error('The port is not a Talents service; nothing was written');
const before=await get('/api/bootstrap'),result=appendFourRequirements(before.state,version),output=buildExport(result.state);
for(const s of scenarios){const files=output.files.get(s.artifactId+'/v'+s.version);if(files?.length!==Object.keys(s.files).length+1)throw new Error('Published materials are incomplete: '+s.businessId);}
if(apply&&result.added.length){
 const response=await fetch(url.origin+'/api/state',{method:'PUT',headers:{Origin:url.origin,'Content-Type':'application/json'},body:JSON.stringify({revision:before.revision,state:result.state})});
 if(!response.ok)throw new Error(`Append failed HTTP ${response.status}: ${await response.text()}`);
 await response.json();const after=await get('/api/bootstrap');
 if(JSON.stringify(after.state.artifacts.filter((a:any)=>!result.added.includes(a.id)))!==JSON.stringify(before.state.artifacts))throw new Error('Other artifacts changed concurrently; please check. Nothing was rolled back or overwritten');
 for(const id of result.added)if(!after.state.artifacts.some((a:any)=>a.id===id))throw new Error('Artifact missing after save: '+id);
}
console.log(JSON.stringify({mode:apply?'apply':'dry-run',version,wouldAdd:result.added,added:apply?result.added:[],beforeRevision:before.revision,workspaceRoot:health.workspaceRoot,scenarios:scenarios.map(s=>({businessId:s.businessId,title:s.title,artifactId:s.artifactId,version:s.version,sourceSha256:s.sourceSha256,creationDescription:s.creationDescription})),note:'Only input materials were appended; no task was created or advanced, and no model or business checks were run.'},null,2));

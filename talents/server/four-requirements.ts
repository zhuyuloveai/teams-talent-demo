import { isDeepStrictEqual } from 'node:util';
import type { Artifact } from './model.ts';
import { fourRequirementScenarios, fourRequirementScenariosV2 } from '../../shared/four-requirement-scenarios.ts';

/** Explicit, additive source registration; no task, adoption, test or mining result is created. */
export function fourRequirementArtifacts(version:1|2=1): Artifact[] {
 return (version===2?fourRequirementScenariosV2:fourRequirementScenarios).map(s=>({id:s.artifactId,projectId:s.projectId,cap:'doc-extract',name:s.businessId+' · '+s.title+' node materials',desc:'Full original requirement, rules, differences list, baseline facts and pending test definitions.',sources:['docset:carddemo','repository:carddemo:carddemo-java-1025'],kind:'files',folder:'four-requirements/'+s.businessId,files:[...Object.values(s.files),s.manifest],usage:'Selected per node after the exact business requirement and source digest match. Provides inputs only; it does not mean adopted, tools executed or accepted.',scenario:{id:s.id,projectId:s.projectId,businessId:s.businessId,exactTitle:s.title,sourceSha256:s.sourceSha256,origin:'scenario-fixture',provenance:s.manifest},published:{version:s.version,at:version===2?'2026-10-28 02:14':'2026-10-28 01:33',note:'Registers the requirement and test materials provided by the user; the simulated attributes and open questions of the source are kept.',delivery:'local',files:[...Object.values(s.files),s.manifest],basis:{version:s.id}},draft:null}));
}
export function appendFourRequirements<T extends {artifacts:Artifact[];capabilities:Array<{id:string}>}>(state:T,version:1|2=1):{state:T;added:string[]} {
 if(!state.capabilities.some(c=>c.id==='doc-extract'))throw new Error('The registered doc-extract capability is missing; nothing was written');
 const additions:Artifact[]=[];
 for(const desired of fourRequirementArtifacts(version)){
  const existing=state.artifacts.filter(a=>a.id===desired.id);
  if(existing.length>1||existing.length===1&&!isDeepStrictEqual(existing[0],desired))throw new Error('A scenario artifact with the same ID has different content; check the version: '+desired.id);
  if(!existing.length)additions.push(desired);
 }
 return {state:additions.length?{...state,artifacts:[...state.artifacts,...additions]}:state,added:additions.map(a=>a.id)};
}

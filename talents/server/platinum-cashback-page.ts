import { isDeepStrictEqual } from 'node:util';
import type { Artifact } from './model.ts';
import { platinumCashbackPage } from '../../shared/platinum-cashback-page.ts';
/** Additive scenario material only; no run, mining result or seed-version migration is fabricated. */
export function platinumCashbackPageArtifact(): Artifact {
 const files=[...Object.values(platinumCashbackPage.files),platinumCashbackPage.manifest];
 return {id:platinumCashbackPage.artifactId,projectId:platinumCashbackPage.projectId,cap:'doc-extract',name:'Platinum Card Spending Cashback Benefit Page Knowledge',desc:'Benefit display boundary, open questions checklist, verified static web modules and pending acceptance cases.',sources:['docset:carddemo','repository:carddemo:carddemo-java-1025'],kind:'files',folder:'platinum-cashback-page',files,usage:'Used for clarification, development, verification and acceptance of the benefit page requirement with the same name; the task description and adoption records are stored separately.',
  scenario:{id:platinumCashbackPage.id,projectId:platinumCashbackPage.projectId,exactTitle:platinumCashbackPage.title,origin:'scenario-fixture',provenance:platinumCashbackPage.manifest},
  published:{version:1,at:'2026-10-27 21:00',note:'Registers the benefit materials and the source-code verification basis; does not mean the requirement has been adopted, developed or accepted.',delivery:'local',files,basis:{version:platinumCashbackPage.id}},draft:null};
}
/** Existing data is never replaced. Same artifact is idempotent; ID collisions require explicit review. */
export function appendPlatinumCashbackPage<T extends {artifacts:Artifact[];capabilities:Array<{id:string}>}>(state:T):{state:T;added:boolean}{
 const desired=platinumCashbackPageArtifact(),existing=state.artifacts.find(item=>item.id===desired.id);
 if(existing){if(!isDeepStrictEqual(existing,desired))throw new Error('A benefit artifact with the same ID already exists with different content; not overwritten. Check the versions manually.');return{state,added:false};}
 if(!state.capabilities.some(item=>item.id==='doc-extract'))throw new Error('The registered doc-extract capability is missing; no substitute capability was created.');
 return{state:{...state,artifacts:[...state.artifacts,desired]},added:true};
}

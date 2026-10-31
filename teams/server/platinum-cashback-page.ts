import { createHash } from 'node:crypto';
import { DomainError } from '../src/domain.js';
import type { RequirementNode } from '../src/delivery-requirements.js';
import type { PublishedArtifact } from '../../shared/contracts.js';
import { platinumCashbackPage, platinumCashbackPageNodes } from '../../shared/platinum-cashback-page.js';
export type PublishedInputReader=(artifactId:string,version:number,path:string)=>Promise<{content:string;absolutePath?:string}>;
/** Full texts come only from the exact published artifact/version; no embedded document fallback. */
export async function platinumPageKnowledge(published:PublishedArtifact[],node:RequirementNode,read?:PublishedInputReader){
 const artifact=published.find(item=>item.id===platinumCashbackPage.artifactId&&item.projectId===platinumCashbackPage.projectId);
 if(!artifact)return undefined;
 if(artifact.version!==platinumCashbackPage.version)throw new DomainError('The published version of the benefit page material does not match the scenario configuration; check it before importing',409);
 if(!read)throw new DomainError('Reading the original benefit page material is not wired up yet',502);
 if(!artifact.files.some(file=>file.path===platinumCashbackPage.manifest))throw new DomainError('The benefit page artifact has no source manifest',502);
 let manifest:any;
 try{manifest=JSON.parse((await read(artifact.id,artifact.version,platinumCashbackPage.manifest)).content);}catch(error){if(error instanceof DomainError)throw error;throw new DomainError('Invalid source manifest for the benefit page artifact',502);}
 if(manifest.schemaVersion!==1||manifest.scenarioId!==platinumCashbackPage.id||manifest.artifactId!==artifact.id||manifest.version!==artifact.version||manifest.projectId!==artifact.projectId||manifest.exactTitle!==platinumCashbackPage.title||!Array.isArray(manifest.knowledgeFiles))throw new DomainError('The benefit page artifact source scope does not match',502);
 const selected=platinumCashbackPageNodes[node];
 const documents=await Promise.all(selected.knowledge.map(async item=>{
  const path=platinumCashbackPage.files[item.file],file=artifact.files.find(file=>file.path===path),proofs=manifest.knowledgeFiles.filter((entry:any)=>entry.path===path);
  if(!file||proofs.length!==1||!/^[a-f0-9]{64}$/.test(proofs[0].sha256))throw new DomainError('The benefit page artifact is missing a required source file or a unique version basis: '+path,502);
  const content=(await read(artifact.id,artifact.version,path)).content,sha256=createHash('sha256').update(content).digest('hex');
  if(sha256!==proofs[0].sha256)throw new DomainError('The benefit page artifact source does not match its publication basis: '+path,502);
  return {...item,path,title:file.title,content,sha256};
 }));
 return {artifact,documents};
}

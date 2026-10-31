import { lstat, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import inventory from '../fixtures/skill-inventory.json';
import sourceFiles from '../fixtures/skill-source-files.json';
import { projectSkillVersions } from './shared-data.js';
import { projectSkillIds, resourcePublicationHistory, resourceSubscriptions, type SkillCatalogEntry } from '../src/resource-sharing.js';
import type { DemoState, Role } from '../src/domain.js';
import { DomainError } from '../src/domain.js';
import { workspace, runtimeDir } from './config.js';
import { atomicJson } from './store.js';
import { sha256, skillPackageDigest, validateSkillPackage, portableSkillPath, type NativeSkillPackage, type SkillPackageFile } from './skill-installation.js';

export interface SkillSourceFiles {
  version: number;
  sourceRoot: string;
  packages: Record<string, { files: Array<{ path: string; executable: boolean; sha256: string }> }>;
}
const sourceMaintenance = '. If this update is intentional, bump the Skill version and add the source files to the Git index, then run node teams/scripts/generate-skill-source-manifest.mjs from the repository root, review the result and explicitly publish a new version (historical provenance is not modified)';
function declaredFiles(id: string, declaration: SkillSourceFiles) {
  const entries = declaration.packages?.[id]?.files;
  if (declaration.version !== 1 || declaration.sourceRoot !== 'workspace/.agents/skills' || !Array.isArray(entries) || !entries.length || entries.length > 1024) throw new Error('Skill source package file declaration is missing or invalid: ' + id + sourceMaintenance);
  const names = new Set<string>();
  for (const entry of entries) {
    if (!entry || typeof entry.path !== 'string' || !portableSkillPath(entry.path) || names.has(entry.path.toLowerCase()) || typeof entry.executable !== 'boolean' || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Invalid Skill source package file declaration: ' + id);
    names.add(entry.path.toLowerCase());
  }
  return new Map(entries.map(entry => [entry.path, entry]));
}

function item(id: string) {
  const found=inventory.find(skill=>skill.name===id);
  if(!found) throw new DomainError('Skill is not in the registered resource directory: '+id,404);
  return found;
}
async function files(root:string,declared:ReturnType<typeof declaredFiles>,prefix=''):Promise<SkillPackageFile[]> {
  const result:SkillPackageFile[]=[];
  for(const name of (await readdir(join(root,prefix))).sort()) {
    // Python bytecode is generated locally and is not part of a published Skill source package.
    if(name==='__pycache__'||/\.py[co]$/.test(name))continue;
    const path=prefix?prefix+'/'+name:name,absolute=join(root,path),stat=await lstat(absolute);
    if(stat.isSymbolicLink())throw new Error('Skill source package contains a symbolic link: '+path);
    if(stat.isDirectory())result.push(...await files(root,declared,path));
    else if(stat.isFile()){
      const entry=declared.get(path);if(!entry)throw new Error('Skill source contains an undeclared file: '+path+sourceMaintenance);
      const bytes=await readFile(absolute),digest=sha256(bytes);
      if(digest!==entry.sha256)throw new Error('Skill source file content does not match the declared digest: '+path+sourceMaintenance);
      result.push({path,sha256:digest,executable:entry.executable,bytes});
    }
    else throw new Error('Skill source contains a non-regular file: '+path);
  }
  return result.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
export async function loadSourceSkillPackage(id:string,sourceDirectory=join(workspace,'.agents','skills'),declaration:SkillSourceFiles=sourceFiles):Promise<NativeSkillPackage> {
  const metadata=item(id),path=join(sourceDirectory,id),stat=await lstat(path);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Skill source must be a real directory: '+id);
  // Source-package identity uses committed Git modes, never host chmod or ZIP modes.
  // Explicit test/source directories must satisfy the same declared file/byte set.
  const declared=declaredFiles(id,declaration),entries=await files(path,declared);
  if(entries.length!==declared.size)throw new Error('Skill source is missing a declared file: '+id+sourceMaintenance);
  const body=entries.find(file=>file.path==='SKILL.md')?.bytes.toString('utf8');
  if(!body)throw new Error('Skill body missing: '+id);
  const declaredVersion=body.match(/^\|\s*version\s*\|\s*([^|\s]+)\s*\|/m)?.[1]??body.match(/^version:\s*["']?([^\s"']+)/m)?.[1];
  if(declaredVersion!==metadata.version)throw new Error(`Skill metadata and body versions differ: ${id} (${metadata.version} / ${declaredVersion??'undeclared'})`);
  const pkg={id,name:id,version:metadata.version,sha256:skillPackageDigest(entries),files:entries};validateSkillPackage(pkg);return pkg;
}
/** A project skill as the project uses it now: the source package with the files of the latest version Talents wrote for the project. */
export async function currentProjectSkillPackage(projectId:string,id:string):Promise<NativeSkillPackage> {
  const pkg=await loadSourceSkillPackage(id),written=(await projectSkillVersions(projectId)).find(version=>version.skillId===id);
  if(!written)return pkg;
  const files=new Map(pkg.files.map(file=>[file.path,file]));
  for(const file of written.files)if(file.content!==null){const bytes=Buffer.from(file.content);files.set(file.path,{path:file.path,sha256:sha256(bytes),executable:files.get(file.path)?.executable??false,bytes});}
  const list=[...files.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  const result={...pkg,version:written.version,sha256:skillPackageDigest(list),files:list};validateSkillPackage(result);return result;
}
function entry(pkg:NativeSkillPackage):SkillCatalogEntry {
  const metadata=item(pkg.id),owner=projectSkillIds.includes(pkg.id);
  return {id:pkg.id,name:pkg.name,description:metadata.description,version:pkg.version,sha256:pkg.sha256,contentSha256:pkg.files.find(file=>file.path==='SKILL.md')!.sha256,category:'skill',publisher:owner?'owner':'library',publisherName:owner?'Lin Yue':'Engineering Productivity Team',source:'workspace/.agents/skills/'+pkg.id};
}
export async function readSkillCatalog() {
  const packages=await Promise.all(inventory.map(skill=>loadSourceSkillPackage(skill.name)));
  return {skillCatalog:packages.map(entry),skillContents:Object.fromEntries(packages.map(pkg=>[pkg.id,pkg.files.find(file=>file.path==='SKILL.md')!.bytes.toString('utf8')]))};
}
interface StoredPackage extends Omit<NativeSkillPackage,'files'> { files:Array<Omit<SkillPackageFile,'bytes'>&{base64:string}> }
async function readPackage(path:string):Promise<NativeSkillPackage> {
  const stored=JSON.parse(await readFile(path,'utf8')) as StoredPackage;
  if(!Array.isArray(stored.files))throw new Error('The pinned Skill content package manifest is corrupt');
  const pkg={...stored,files:stored.files.map(({base64,...file})=>({...file,bytes:Buffer.from(base64,'base64')}))};validateSkillPackage(pkg);return pkg;
}
/** Called only by explicit publication, never by bootstrap or service startup. */
export async function publicationCatalog():Promise<SkillCatalogEntry[]> {
  const result:SkillCatalogEntry[]=[];
  for(const metadata of inventory){
    const pkg=await loadSourceSkillPackage(metadata.name),path=join(runtimeDir,'skill-packages',pkg.sha256+'.json');
    try {const prior=await readPackage(path);if(prior.id!==pkg.id||prior.version!==pkg.version||prior.sha256!==pkg.sha256)throw new Error('Pinned Skill content package identity conflict');}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;await atomicJson(path,{...pkg,files:pkg.files.map(({bytes,...file})=>({...file,base64:bytes.toString('base64')}))});}
    result.push(entry(pkg));
  }
  return result;
}
export async function loadNativeSkillPackage(id:string,version:string,digest:string):Promise<NativeSkillPackage> {
  item(id);if(!/^[a-f0-9]{64}$/.test(digest))throw new DomainError('Invalid Skill package digest');
  let pkg:NativeSkillPackage;
  try{pkg=await readPackage(join(runtimeDir,'skill-packages',digest+'.json'));}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')throw new DomainError('The pinned version content package does not exist; publish the verified resource version again',404);throw error;}
  if(pkg.id!==id||pkg.version!==version||pkg.sha256!==digest)throw new DomainError('The requested version does not match the pinned Skill content package');return pkg;
}
export async function getPublishedSkillPackage(state:DemoState,role:Role,id:string,version:string,digest:string) {
  const subscription=resourceSubscriptions(state,role).find(record=>record.id===id);
  if(!subscription||!subscription.sha256||subscription.version!==version||subscription.sha256!==digest)throw new DomainError('The current user has not subscribed to a pinned version of this Skill',403);
  if(!resourcePublicationHistory(state).some(record=>record.id===id&&record.version===version&&record.sha256===digest))throw new DomainError('The published version for this subscription does not exist',409);
  return loadNativeSkillPackage(id,version,digest);
}

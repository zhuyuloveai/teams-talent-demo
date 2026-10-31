import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installSkillPackage, inspectSkillTarget, readUnchangedSkillPackage, sha256, skillPackageDigest, type NativeSkillPackage } from '../server/skill-installation.js';
import { SkillApplicationService } from '../server/skill-application.js';
function packageFixture(): NativeSkillPackage {
  const files=[['SKILL.md','---\nname: delivery-guide\ndescription: Delivery reference\n---\nRead references/rules.md; do not execute scripts.\n',false],['references/rules.md','Rule one: preserve the subscription version.\n',false],['scripts/check.sh','#!/bin/sh\nexit 0\n',true],['templates/payload.bin','\u0000\u0001\u0002',false]] as const;
  const entries=files.map(([path,content,executable])=>({path,bytes:Buffer.from(content),executable,sha256:sha256(content)}));
  return {id:'delivery-guide',name:'delivery-guide',version:'1.0.0',sha256:skillPackageDigest(entries),files:entries};
}
test('subscription package preserves exact attachments and permissions; duplicate apply is idempotent',async()=>{
  const root=await mkdtemp(join(tmpdir(),'skill-package-')),pkg=packageFixture();
  try {
    const installed=await installSkillPackage(root,pkg);assert.equal(installed.status,'applied');
    for(const file of pkg.files){assert.deepEqual(await readFile(join(installed.skillDirectory,file.path)),file.bytes);if(process.platform!=='win32')assert.equal(!!((await lstat(join(installed.skillDirectory,file.path))).mode&0o111),file.executable);}
    const before=(await lstat(join(installed.skillDirectory,'SKILL.md'))).mtimeMs;assert.equal((await installSkillPackage(root,pkg)).status,'already-applied');assert.equal((await lstat(join(installed.skillDirectory,'SKILL.md'))).mtimeMs,before);
    await writeFile(join(installed.skillDirectory,'references/rules.md'),'user modification');await assert.rejects(installSkillPackage(root,pkg),/not overwritten/);assert.equal(await readFile(join(installed.skillDirectory,'references/rules.md'),'utf8'),'user modification');
  }finally{await rm(root,{recursive:true,force:true});}
});
test('untrusted package paths, tampered bytes, duplicate names and symbolic target paths are rejected',async()=>{
  const root=await mkdtemp(join(tmpdir(),'skill-paths-')),outside=await mkdtemp(join(tmpdir(),'skill-outside-')),pkg=packageFixture();
  try{
    for(const path of ['../escape','/absolute','scripts/../../escape','scripts\\escape','CON','a/./b'])await assert.rejects(installSkillPackage(root,{...pkg,files:[...pkg.files,{path,bytes:Buffer.from('x'),executable:false,sha256:sha256('x')}]}),/path or content/);
    await assert.rejects(installSkillPackage(root,{...pkg,sha256:'f'.repeat(64)}),/package digest check failed/);
    await assert.rejects(installSkillPackage(root,{...pkg,files:pkg.files.map((file,index)=>index?file:{...file,bytes:Buffer.from('tampered')})}),/check failed/);
    await assert.rejects(installSkillPackage(root,{...pkg,files:[...pkg.files,{...pkg.files[0],path:'skill.md'}]}),/check failed/);
    await symlink(outside,join(root,pkg.name),process.platform==='win32'?'junction':'dir');await assert.rejects(installSkillPackage(root,pkg),/symbolic link/);assert.deepEqual(await import('node:fs/promises').then(fs=>fs.readdir(outside)),[]);
  }finally{await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});
test('application pins subscription and project, never writes without confirmation, and retains original request identity',async()=>{
  const root=await mkdtemp(join(tmpdir(),'skill-service-')),project=join(root,'project'),pkg=packageFixture();await mkdir(project);
  let subscribed=true,changed=false,reads=0;
  const service=new SkillApplicationService({package:async(role,scope)=>{if(role!=='member'||!subscribed)throw new Error('actor has no subscription');if(scope.version!==pkg.version||scope.sha256!==pkg.sha256)throw new Error('subscription version mismatch');return pkg;},directory:async(_role,id)=>{if(id!=='project')throw new Error('unknown project');return {name:'Scoped project',root:changed?root:project,valid:true,diagnostic:''};},discover:async(directory)=>{reads++;assert.equal(directory,await import('node:fs/promises').then(fs=>fs.realpath(project)));return {status:'discovered-and-read',note:'Test transport; no actual native execution asserted'};}},join(root,'receipts'));
  const scope={projectId:'project',resourceId:pkg.id,version:pkg.version,sha256:pkg.sha256};
  try{
    const plan=await service.plan('member',scope);assert.equal(plan.canApply,true);assert.equal((await inspectSkillTarget(project,pkg)).existing,'none');await assert.rejects(service.plan('owner',scope),/no subscription/);
    changed=true;await assert.rejects(service.apply('member',{...scope,requestId:randomUUID(),planToken:plan.planToken}),/changed; confirm again/);changed=false;
    const body={...scope,requestId:randomUUID(),planToken:plan.planToken},one=await service.apply('member',body),again=await service.apply('member',body);assert.deepEqual(again,one);assert.equal(reads,1);
    assert.equal((await service.apply('member',{...body,requestId:randomUUID()})).status,'already-applied');assert.equal(reads,2);subscribed=false;await assert.rejects(service.apply('member',body),/no subscription/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('native read cannot report success when an installed attachment changes during reading',async()=>{
  const root=await mkdtemp(join(tmpdir(),'skill-read-integrity-')),pkg=packageFixture();
  try{
    const installed=await installSkillPackage(root,pkg);
    assert.equal(await readUnchangedSkillPackage(root,pkg,async()=>'verified'),'verified');
    await assert.rejects(readUnchangedSkillPackage(root,pkg,async()=>{await writeFile(join(installed.skillDirectory,'references/rules.md'),'changed during native read');return 'must not succeed';}),/different content already exists/);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('failed native discovery retries the same request without rewriting installed files',async()=>{
  const root=await mkdtemp(join(tmpdir(),'skill-read-retry-')),target=join(root,'skills'),pkg=packageFixture();let reads=0;
  const service=new SkillApplicationService({package:async()=>pkg,directory:async()=>({name:'Source project',root:target,valid:true,diagnostic:''}),discover:async()=>{if(++reads===1)throw new Error('native provider unavailable');return {status:'discovered-and-read',note:'recovered native provider'};}},join(root,'receipts'));
  const scope={projectId:'project',resourceId:pkg.id,version:pkg.version,sha256:pkg.sha256};
  try{
    const plan=await service.plan('member',scope),body={...scope,planToken:plan.planToken,requestId:randomUUID()};
    const failed=await service.apply('member',body);assert.equal(failed.discovery.status,'failed');const before=(await lstat(join(target,pkg.name,'SKILL.md'))).mtimeMs;
    const retried=await service.apply('member',body);assert.equal(retried.discovery.status,'discovered-and-read');assert.equal(retried.appliedAt,failed.appliedAt);assert.equal(retried.status,'applied');assert.equal(reads,2);assert.equal((await lstat(join(target,pkg.name,'SKILL.md'))).mtimeMs,before);
    assert.deepEqual(await service.apply('member',body),retried);assert.equal(reads,2);
  }finally{await rm(root,{recursive:true,force:true});}
});

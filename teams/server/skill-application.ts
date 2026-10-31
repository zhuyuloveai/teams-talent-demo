import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DomainError, type Role } from '../src/domain.js';
import type { SkillApplicationPlan, SkillApplicationReceipt, SkillApplicationScope } from '../src/skill-application.js';
import { atomicJson } from './store.js';
import { installSkillPackage, inspectSkillTarget, sha256, type NativeSkillPackage } from './skill-installation.js';

export interface SkillApplicationDependencies {
  package(role: Role, scope: SkillApplicationScope): Promise<NativeSkillPackage>;
  directory(role: Role, projectId: string): Promise<{ name: string; root: string | null; valid: boolean; diagnostic: string }>;
  discover(directory: string, pkg: NativeSkillPackage): Promise<SkillApplicationReceipt['discovery']>;
}
export class SkillApplicationService {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private dependencies: SkillApplicationDependencies, private receiptsDirectory: string) {}
  private scope(role: Role, input: SkillApplicationScope) {
    if (!['owner','member'].includes(role) || !input || typeof input.projectId !== 'string' || !input.projectId || typeof input.resourceId !== 'string' || typeof input.version !== 'string' || !/^[a-f0-9]{64}$/.test(input.sha256)) throw new DomainError('Invalid Skill application scope or version',400);
    return {projectId:input.projectId,resourceId:input.resourceId,version:input.version,sha256:input.sha256};
  }
  private async prepare(role: Role, input: SkillApplicationScope) {
    const scope=this.scope(role,input),pkg=await this.dependencies.package(role,scope);
    if(pkg.id!==scope.resourceId||pkg.version!==scope.version||pkg.sha256!==scope.sha256)throw new DomainError('The subscribed pinned version does not match the actual Skill package');
    const directory=await this.dependencies.directory(role,scope.projectId);
    let skillDirectory:string|null=null,reason=directory.valid?undefined:directory.diagnostic;
    if(directory.valid&&directory.root) {
      skillDirectory=join(directory.root,pkg.name);
      try {await inspectSkillTarget(directory.root,pkg);}catch(error){reason=(error as Error).message;}
    }
    const basis={...scope,role,targetDirectory:directory.root,skillDirectory,files:pkg.files.map(({path,sha256})=>({path,sha256}))};
    const plan:SkillApplicationPlan={scope:'native-user',...scope,projectName:directory.name,targetDirectory:directory.root,skillDirectory,files:basis.files,planToken:sha256(JSON.stringify(basis)),canApply:!reason&&!!directory.root,...(reason?{reason}:{})};
    return {pkg,plan};
  }
  async plan(role:Role,scope:SkillApplicationScope){return (await this.prepare(role,scope)).plan;}
  apply(role:Role,body:SkillApplicationScope&{requestId:string;planToken:string}):Promise<SkillApplicationReceipt>{
    const next=this.queue.then(()=>this.commit(role,body));this.queue=next.catch(()=>undefined);return next;
  }
  private async commit(role:Role,body:SkillApplicationScope&{requestId:string;planToken:string}):Promise<SkillApplicationReceipt>{
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId??''))throw new DomainError('Invalid application request ID',400);
    const {plan,pkg}=await this.prepare(role,body),identity=sha256(JSON.stringify({role,...this.scope(role,body),planToken:body.planToken})),path=join(this.receiptsDirectory,body.requestId+'.json');
    if(plan.planToken!==body.planToken)throw new DomainError('The project directory or subscribed version changed; confirm again');
    if(!plan.canApply||!plan.targetDirectory)throw new DomainError(plan.reason??'The project directory has not been verified');
    try {
      const saved=JSON.parse(await readFile(path,'utf8')) as {identity:string;receipt:SkillApplicationReceipt};
      if(saved.identity!==identity)throw new DomainError('The original application request ID was already used for another scope');
      const existing=await inspectSkillTarget(plan.targetDirectory,pkg);if(existing.existing!=='same')throw new DomainError('The original application target changed; review it again. Nothing was installed again');if(saved.receipt.discovery.status !== 'discovered-and-read') {
        try { saved.receipt.discovery=await this.dependencies.discover(existing.targetDirectory,pkg); } catch(error) { saved.receipt.discovery={status:'failed',note:'Files installed, but the native read check failed: '+(error as Error).message}; }
        await atomicJson(path,saved);
      }
      return saved.receipt;
    }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    const installed=await installSkillPackage(plan.targetDirectory,pkg);
    let discovery:SkillApplicationReceipt['discovery'];
    try {discovery=await this.dependencies.discover(installed.targetDirectory,pkg);}catch(error){discovery={status:'failed',note:'Files installed, but the native read check failed: '+(error as Error).message};}
    const receipt:SkillApplicationReceipt={scope:'native-user',...this.scope(role,body),requestId:body.requestId,status:installed.status,targetDirectory:installed.targetDirectory,skillDirectory:installed.skillDirectory,appliedAt:new Date().toISOString(),discovery,note:'Installs only the pinned version the current user explicitly subscribed to, into the local user iCode Skill directory, where it is visible across projects. Switching roles does not switch the OS user; existing roles, models and the current task\'s frozen adoption records were not changed.'};
    await atomicJson(path,{identity,receipt});return receipt;
  }
}

import type {TaskDeletionReceipt} from './task-deletion.js';
import { createProjectIssue, type ProjectIssue } from './project-issues.js';
import { deliveryRequirement, type DeliveryRequirement } from './delivery-requirements.js';
import { userSkillExamples } from './project-skill-examples.js';
import { selectedSkillBindings } from './resource-sharing.js';
import { updateTeam, requireTeamOwner, defaultTeamId, type TeamRecord, type TeamMember } from './teams-domain.js';
import { requireCurrentTaskMember } from './task-assignment.js';
import { linkTaskSession, type TaskAutomation } from './task-automation.js';
import { updateGenericTask, type GenericTask } from './generic-tasks.js';
import { campaign } from './cashback.js';
import { availableSkillIdsFor, projectSkillIds, resourcePublications, resourcePublicationHistory, resourceSubscriptions, resourceVersion, shareableResourceIds, type ResourcePublication, type ResourceSubscription, type SkillCatalogEntry } from './resource-sharing.js';
import { externalPlatformDefault } from './external-platforms.js';
import { DomainError, type DemoState, type Role } from './domain.js';
import { createdProjectFields, createdProjectId, type CreatedProject } from './created-projects.js';
import type { SourcePluginAsset } from './source-plugins.js';
import { legacyAssetSourceIds } from './project-asset-links.js';
import type { CollaborationState } from './collaboration.js';

export interface Asset { id: string; title: string; kind: string; location: string; sourceAssetId?: string }
export interface Material { id: string; title: string; body: string }
export interface WorkspaceState {
  taskDeletions?:TaskDeletionReceipt[];
  projectIssues?: ProjectIssue[];
  deliveryRequirements?: DeliveryRequirement[];
  teams?: TeamRecord[];
  projectTeamId?: string;
  genericTasks?: GenericTask[];
  taskAutomation?: TaskAutomation[];
  collaboration?: CollaborationState;
  acquiredResources: string[];
  resourcePublications?: ResourcePublication[];
  resourceSubscriptions?: ResourceSubscription[];
  projects?: CreatedProject[];
  project: { name: string; description: string; repository: string; assets: Asset[] };
  materials: Material[]; selectedSkills: string[];
  progress: { id: string; text: string; at: string; node: string }[];
  sessionReported: boolean; reportAt: string | null;
  analysis: { scope: 'single' | 'project'; status: 'idle' | 'analyzed' };
  team: { name: string; members: TeamMember[] };
  connections: { id: string; name: string; kind: string; enabled: boolean; description: string }[];
  foundation: { progressEnabled: boolean; uploadEnabled: boolean };
}
export const defaultSkills = projectSkillIds;
export function initialWorkspace(): WorkspaceState {
  return {
    acquiredResources:[],project: { name: 'Credit Card', description: 'Platinum card customers get an extra 0.5% cashback on their spending over the next 3 months.', repository: 'carddemo-java-1025', assets: [
      { id:'code',title:'CardDemo business code repository',kind:'repository',location:'https://github.com/JeffyLiu003/carddemo-java-1025.git',sourceAssetId:'repository:carddemo:carddemo-java-1025' },
      { id:'design',title:'Spending cashback rules',kind:'document',location:'teams/docs/cashback-contract.md',sourceAssetId:'design-library:carddemo:marketing-capability' },

      { id:'history',title:'Platinum card spending cashback requirement',kind:'requirement',location:'requirements:carddemo:DEMO-MKT-001' },
      { id:'adr',title:'Transaction processing boundary',kind:'document',location:'teams/fixtures/project-documents/carddemo/docs/design/adr/ADR-009-marketing-integration.md',sourceAssetId:'design-library:carddemo:ADR-009' },
      { id:'security',title:'Permissions and security scope',kind:'document',location:'teams/fixtures/project-documents/carddemo/docs/design/adr/ADR-007-authentication-scope.md',sourceAssetId:'design-library:carddemo:ADR-007' },
    ] }, materials: [], selectedSkills: [...defaultSkills], progress: [], sessionReported:false, reportAt:null,
    analysis:{scope:'single',status:'idle'}, foundation:{progressEnabled:true,uploadEnabled:true},
    team:{ name:'Credit Card R&D Team',members:[['owner','Lin Yue'],['member','Chen Chen'],['su','Su Qing'],['yang','Yang Fan'],['zhao','Zhao Ning'],['wang','Wang Xiao']].map(([id,name])=>({id,name,role:id==='owner'?'owner':'member',status:'active'})) },
    connections: [
      ['repository','Repositories and project assets','asset','Link the current cashback rules and project code.'],['requirements','Requirements and documents','asset','Link project requirements and design materials.'],
      ['review','Code Review','quality','Check business state, change impact and transaction boundaries, keeping issues and fix evidence.'],['test','Testing and retest','quality','Keep real exit codes, test scope and structured reports.'],
      ['security','Security scan','quality','No security scan report yet; verify once a report is connected.'],['model','Organization model service','model','Shows the team model usage requirements; real credentials are managed by the native tool.'],
      ['mcp','Tools and MCP','tool','Capabilities and permissions are declared per tool; members call them through iCode.'],
    ].map(([id,name,kind,description])=>({id,name,kind,description,enabled:true})),
  };
}
export const workspaceActions = ['issue.create','session.link','task.create','task.assign','task.start','task.complete','project.create','project.metadata.update','project.update','asset.link','asset.add','material.add','skills.select','resource.publish','resource.publish-all','resource.acquire','team.create','team.project.assign','team.update','member.invite','member.approve','member.role','member.remove','progress.sync','session.report','analysis.run','connection.update','foundation.update'] as const;
export type WorkspaceAction = typeof workspaceActions[number];
const ownerActions: WorkspaceAction[] = ['issue.create','task.create','task.assign','project.create','project.metadata.update','resource.publish','resource.publish-all','project.update','asset.link','asset.add','team.create','team.project.assign','team.update','member.invite','member.approve','member.role','member.remove','analysis.run','connection.update'];
const memberActions: WorkspaceAction[] = ['material.add','skills.select','progress.sync','session.report'];
function need(ok:unknown,message:string):asserts ok { if(!ok)throw new DomainError(message); }
function text(p:Record<string,unknown>,key:string,max=1000){ const value=p[key];need(typeof value==='string'&&value.trim().length>0&&value.length<=max,`${key} must not be empty or exceed the length limit`);return value.trim(); }
export function updateWorkspace(previous:DemoState,kind:WorkspaceAction,role:Role,p:Record<string,unknown>,sourceAssets:readonly SourcePluginAsset[]=[],catalog:readonly SkillCatalogEntry[]=[]):DemoState {
  need(workspaceActions.includes(kind),'Unknown workspace action');
  need(previous.campaignId === campaign.id, 'The current workspace uses old campaign rules; ask the Owner to reset the workspace in personal settings before continuing');
  if(ownerActions.includes(kind)&&role!=='owner'||memberActions.includes(kind)&&role!=='member')throw new DomainError('The current role is not allowed to perform this action',403);
  if (previous.assigned && role === 'member' && ['progress.sync','skills.select','material.add'].includes(kind)) requireCurrentTaskMember(previous);
  const s=structuredClone(previous),w=s.workspace,at=new Date().toISOString(),id='demo-'+(s.revision+1);
  const writableAssets = () => {
    const projectId = p.projectId ?? 'carddemo';
    need(projectId !== 'teams', 'Imported project snapshots are read-only');
    if (projectId === 'carddemo') return w.project.assets;
    const project = w.projects?.find(item => item.id === projectId); need(project, 'Project not found');
    return project.assets ??= [];
  };
  let label='';
  switch(kind){
    case 'issue.create': {const before=w.projectIssues?.length??0;createProjectIssue(s,role,p,at);if(w.projectIssues!.length===before)return previous;label='Create issue';break;}
    case 'session.link': linkTaskSession(s,role,p,at);label='Link task work session';break;
    case 'task.create': case 'task.assign': case 'task.start': case 'task.complete': label=updateGenericTask(s,role,kind,p,at);break;
    case 'project.create': {const projectId=createdProjectId(p.id),fields=createdProjectFields(p);need(!w.projects?.some(project=>project.id===projectId),'Project ID already exists');w.projects=[...(w.projects??[]),{id:projectId,...fields,teamId:requireTeamOwner(s,role,p.teamId===undefined?defaultTeamId:text(p,'teamId',100)).id,owner:'owner',createdAt:at,updatedAt:at}];label='Add project';break;}
    case 'project.metadata.update': {const projectId=createdProjectId(p.id),fields=createdProjectFields(p),project=w.projects?.find(item=>item.id===projectId);need(project,'Created project not found');Object.assign(project,fields,{updatedAt:at});label='Update created project info';break;}
    case 'project.update': w.project.name=text(p,'name',80);w.project.description=text(p,'description',1500);w.project.repository=text(p,'repository',200);label='Update project info';break;
    case 'asset.link': {
      const assets=writableAssets(),source=sourceAssets.find(asset=>asset.id===p.sourceAssetId);
      need(source,'Source asset not found'); need((p.projectId??'carddemo')!=='carddemo'||source.sourceProjectId==='carddemo','Select a source asset of this project');
      need(!w.connections.some(connection=>connection.id===source.pluginId&&!connection.enabled),'Enable this source plugin first');
      need(assets.length<50,'Project asset limit reached'); need(!assets.some(asset=>legacyAssetSourceIds(asset).includes(source.id)),'This source asset is already linked');
      assets.push({id,title:source.title,kind:source.kind,location:source.references.map(reference=>reference.path).join(' · ')||source.sourceRecordId,sourceAssetId:source.id});label='Link plugin source asset';break;
    }
    case 'asset.add': {const assets=writableAssets();need(assets.length<50,'Project asset limit reached');assets.push({id,title:text(p,'title',120),kind:text(p,'kind',40),location:text(p,'location',500)});label='Link project asset';break;}
    case 'material.add': need(!s.context,'The context is frozen; adopt new materials in the next task');need(w.materials.length<20,'Material limit reached');w.materials.push({id,title:text(p,'title',120),body:text(p,'body',5000)});label='Add requirement material';break;
    case 'skills.select': {const allowed=availableSkillIdsFor(s,role),task=deliveryRequirement(s,'carddemo','DEMO-MKT-001');need(task?!task.preparedAt:!s.context,'The context for this run is frozen');need(Array.isArray(p.skills)&&p.skills.length>0&&p.skills.length<=allowed.length&&p.skills.every(x=>typeof x==='string'&&allowed.includes(x)),'Select valid project or user Skills; external Skills must be subscribed by the current user');w.selectedSkills=[...new Set(p.skills as string[])];if(task){task.userSkillIds=w.selectedSkills.filter(id=>userSkillExamples.some(skill=>skill.id===id));task.skillIds=w.selectedSkills.filter(id=>!task.userSkillIds!.includes(id));task.skillBindings=selectedSkillBindings(s,role);const preparation=w.taskAutomation?.find(item=>item.projectId==='carddemo'&&item.taskId===task.id)?.knowledge;if(preparation){preparation.status='waiting';preparation.error='The selected Skills changed; recheck the task inputs';}}label='Select requirement business Skills';break;}
    case 'resource.publish':
    case 'resource.publish-all': {
      const ids=kind==='resource.publish-all'?catalog.map(item=>item.id):[text(p,'id',120)];
      need(kind!=='resource.publish-all'||ids.length===shareableResourceIds.length-1&&new Set(ids).size===ids.length,'The full Skill publish catalog is not ready');
      let added=0;
      for(const resourceId of ids){
        need(shareableResourceIds.includes(resourceId),'This resource is not shareable');
        const entry=catalog.find(item=>item.id===resourceId);
        need(resourceId==='code-agent'||entry&&/^[a-f0-9]{64}$/.test(entry.sha256)&&/^[a-f0-9]{64}$/.test(entry.contentSha256),'The resource content package is not ready');
        const version=entry?.version??resourceVersion(s,resourceId);
        need(p.version===undefined||p.version===version,'The requested resource version has no content package');
        const existing=resourcePublicationHistory(s).filter(item=>item.id===resourceId&&item.version===version);
        need(!existing.some(item=>item.sha256&&item.sha256!==entry?.sha256),'Content changed under the same version; use a new real version');
        if(existing.some(item=>resourceId==='code-agent'||item.sha256===entry?.sha256)){need(kind==='resource.publish-all','This resource version is already published');continue;}
        const publication:ResourcePublication={id:resourceId,version,publishedAt:at,scope:'team',publisher:entry?.publisher??'owner',publisherName:entry?.publisherName??'Lin Yue',source:entry?.source??'project-agent-configuration',...(entry?{sha256:entry.sha256,contentSha256:entry.contentSha256}:{})};
        w.resourcePublications=[...(w.resourcePublications??[]),publication];added++;
      }
      if(!added)return previous;
      label=kind==='resource.publish-all'?'Publish all Skills':'Publish shared resource';break;
    }
    case 'resource.acquire': {
      const name=text(p,'name',120),existing=resourceSubscriptions(s,role).find(item=>item.id===name);
      const publication=p.version===undefined?resourcePublications(s).find(item=>item.id===name):[...resourcePublicationHistory(s)].reverse().find(item=>item.id===name&&item.version===p.version);
      need(publication,'Get a published shared resource');need(name==='code-agent'||publication.sha256&&publication.contentSha256,'The content package of this earlier subscription is unverified; publish the matching real version first');
      need(p.sha256===undefined||p.sha256===(publication.sha256??''),'The requested resource content hash does not match');
      if(existing?.source==='subscription'){need(existing.version===publication.version&&existing.sha256===(publication.sha256??''),'The current subscription is pinned to an older version; publishing a new version does not replace it automatically');return previous;}
      w.resourceSubscriptions=[...(w.resourceSubscriptions??[]),{id:name,version:publication.version,sha256:publication.sha256??'',contentSha256:publication.contentSha256,actor:role,subscribedAt:at,source:'subscription'}];label='Subscribe to shared resource';break;
    }
    case 'team.create': case 'team.project.assign': case 'team.update': case 'member.invite': case 'member.approve': case 'member.role': case 'member.remove': label=updateTeam(s,role,kind,p,at);break;
    case 'progress.sync': need(!deliveryRequirement(s,'carddemo','DEMO-MKT-001'),'Report development and verification progress through the current task Teams CLI');need(w.foundation.progressEnabled,'Enable team collaboration progress sync first');need(s.context&&['developing','failed','fixed','returned'].includes(s.stage),'Start iCode development work first');w.progress.push({id,text:text(p,'text',2000),at,node:'develop'});label='iCode progress sync';break;
    case 'session.report': throw new DomainError('Sessions are linked during development or verification and collected automatically after acceptance; members do not need to report them again');
    case 'analysis.run': need(w.sessionReported,'Report and link the delivery session first');need(p.scope==='single'||p.scope==='project','Invalid analysis scope');need(s.evolution==='none','An improvement candidate already exists; keep this analysis basis');w.analysis={scope:p.scope,status:'analyzed'};label=p.scope==='project'?'Project multi-requirement analysis':'Single-requirement trajectory analysis';break;
    case 'connection.update': {let c=w.connections.find(c=>c.id===p.id);if(!c&&typeof p.id==='string'){const seeded=externalPlatformDefault(p.id);if(seeded){c=w.connections.find(connection=>connection.id===seeded.id);if(!c){c=seeded;w.connections.push(c);}}}need(c,'Connection not found');need(typeof p.enabled==='boolean','Invalid enabled state');c.enabled=p.enabled;c.description=text(p,'description',1500);label=externalPlatformDefault(c.id)?'Update enterprise connection configuration':'Update capability configuration';break;}
    case 'foundation.update': need(typeof p.progressEnabled==='boolean'&&typeof p.uploadEnabled==='boolean','Invalid foundation capability configuration');w.foundation={progressEnabled:p.progressEnabled,uploadEnabled:p.uploadEnabled};label='Update foundation collaboration configuration';break;
  }
  s.revision++;s.audit.push({id:s.revision,at,role,system:kind==='analysis.run'?'Talent':'Teams',action:label,detail:kind==='progress.sync'?String(p.text):kind==='resource.publish'?String(p.id)+' · '+resourceVersion(s,String(p.id)):kind==='resource.acquire'?String(p.name):label,origin:'simulated'});return s;
}

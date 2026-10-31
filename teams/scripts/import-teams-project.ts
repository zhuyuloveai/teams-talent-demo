import { readFile } from 'node:fs/promises';
import { resolve, isAbsolute } from 'node:path';
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { atomicJson } from '../server/store.js';

const source = process.argv[2];
if (!source || !isAbsolute(source)) throw new Error('Provide the absolute path of the original Teams repository');
const files = {
  project: 'business/domain/project-management/src/client/ui/demo-data.ts',
  tasks: 'business/domain/team-collaboration/src/client/ui/project-demo-data.ts',
  state: 'business/domain/team-collaboration/src/client/ui/project-demo-state.ts',
  intake: 'business/domain/requirement-intake/src/client/ui/project-demo-data.ts',
  releases: 'business/domain/team-collaboration/src/client/ui/project-release-data.ts',
  sessions: 'business/domain/project-management/src/client/ui/project-icode-seeds.ts',
};
// Bundle the source data with this demo's dependencies; the source checkout is read-only.
const bundled = await build({stdin:{contents:Object.entries(files).map(([name,path])=>`export * as ${name} from ${JSON.stringify(resolve(source,path))};`).join('\n'),resolveDir:source},bundle:true,write:false,platform:'node',format:'esm',nodePaths:[resolve('node_modules')],logLevel:'silent'});
const {project:projectModule,state:stateModule,intake:intakeModule,releases:releaseModule,sessions:sessionModule} = await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const project = projectModule.projects.teams;
const state = stateModule.initialDemoState('teams');
const documentPaths: string[] = ['AGENTS.md', ...project.docs.map((doc: { path: string }) => doc.path), ...project.skills.map((skill: { name: string }) => '.agents/skills/' + skill.name + '/SKILL.md')];
const documents = await Promise.all(documentPaths.map(async path => ({path, content: await readFile(resolve(source,path),'utf8')})));
const sourceFiles = await Promise.all([...Object.values(files), ...documentPaths].map(async path => ({path, sha256:createHash('sha256').update(await readFile(resolve(source,path))).digest('hex')})));
const snapshot = {
  id: 'teams', origin: 'teams-demo-snapshot',
  importedAt: new Date().toISOString(), sourceRoot: source,
  sourceCommit: execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim(), sourceFiles,
  project,
  members: [{id:'A',name:'Member A',role:'Project Owner'},{id:'B',name:'Member B',role:'Development and feature delivery'},{id:'C',name:'Member C',role:'Review and verification'}],
  tasks: state.tasks.map((task: {id:string})=>({...task,nodes:stateModule.taskNodes(task).map((id:string)=>({id,name:stateModule.nodeNames[id],...stateModule.nodeStage(task,id,state)}))})),
  inputs: intakeModule.initialInputs, discussions:intakeModule.initialDiscussions,
  releases:releaseModule.releaseVersions,sessions:sessionModule.sessionSeeds('teams'),documents,
  selection:{taskId:state.taskId,nodeId:state.nodeId,version:state.selectedVersion},
};
await atomicJson(resolve('fixtures/teams-project.json'),snapshot);
console.log(JSON.stringify({project:snapshot.project.name,tasks:snapshot.tasks.length,inputs:snapshot.inputs.length,discussions:snapshot.discussions.length,releases:snapshot.releases.length,sessions:snapshot.sessions.length,documents:snapshot.documents.length,sourceCommit:snapshot.sourceCommit}));

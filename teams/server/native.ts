import {configuredProjectWorkspace, verifyProjectWorkspace} from './project-workspaces.js';
import { terminalPreferences } from './terminal-preferences.js';
import { createTerminalLauncher, findExecutable, formatShellCommand, posixQuote } from './terminal-launcher.js';
import { userSkillExamples } from '../src/project-skill-examples.js';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { access, readFile, mkdir, writeFile, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { binary, workspace, runtimeDir, root, origin, icodeBinarySource, icodeBinaryNotes, selectICode } from './config.js';
import { atomicJson, atomicText } from './store.js';
import { nativeSkillEnvironment } from './native-skill-reader.js';
import { ensureNativeTuiHooks } from './native-tui-hooks.js';
import { withoutNativeTrace } from '../scripts/native/native-environment.mjs';
import type { ProjectWorkPlan } from '../src/project-work.js';
import type { DemoState } from '../src/domain.js';
const execute = promisify(execFile);
let launchBusy = false;
const launched = new Map<string, { identity: string; result: Promise<unknown> }>();
const terminalLauncher = createTerminalLauncher();
export const shellQuote = posixQuote;
export async function installed(path: string) { try { await access(path, constants.X_OK); return true; } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false; throw e; } }
async function openCodePath() {
  return findExecutable(process.env.DEMO_OPENCODE_BINARY ?? 'opencode');
}
export async function nativeWorkspace() {
  const configured=await configuredProjectWorkspace(runtimeDir);
  if(configured) {await verifyProjectWorkspace(configured);return configured.directory;}
  throw new Error('No project workspace is configured. Set a separate repository path in the workspace settings of the project overview.');
}
export async function toolsStatus() {
  const configured=await configuredProjectWorkspace(runtimeDir);
  let launchWorkspace:string|null=null,workspaceError:string|undefined;
  if(configured)try{await verifyProjectWorkspace(configured);launchWorkspace=configured.directory;}catch(error){workspaceError=(error as Error).message;}
  else workspaceError='No project workspace is configured. Set a separate repository path in the project overview.';
  const selection = await selectICode().catch(error => ({ path: undefined, version: undefined, source: icodeBinarySource, status: 'none' as const, notes: [...icodeBinaryNotes, 'iCode detection failed: ' + (error as Error).message] }));
  const installedICode = selection.status === 'ready';
  const version: string | null = selection.version ?? null;
  let opencode: string | null = null, openError: string | undefined;
  try { opencode = await openCodePath(); }
  catch (error) { openError = 'OpenCode detection failed: ' + (error as Error).message; }
  const unsupportedReason = openError ?? (process.platform === 'win32' && opencode && !/\.exe$/i.test(opencode) ? 'Detected an OpenCode .cmd/.bat. To launch automatically, set DEMO_OPENCODE_BINARY to the absolute path of opencode.exe.' : undefined);
  let openVersion: string | null = null;
  if (opencode && !unsupportedReason) {
    try { openVersion = (await execute(opencode, ['--version'], { timeout: 15000, windowsHide: true })).stdout.trim(); }
    catch (error) { openError = 'OpenCode version detection failed: ' + (error as Error).message; }
  }
  return {
    ...await terminalPreferences.context(),
    ...(workspaceError?{workspaceError}:{}),
    icode: { installed: installedICode, path: selection.path ?? binary, version, workspace: launchWorkspace, sessionId: '', sessionAvailable: false, active: null, source: selection.source, notes: selection.notes },
    opencode: { installed: !!opencode && !unsupportedReason, path: opencode, version: openVersion, unsupportedReason, notes: openError ? [openError] : [] },
    verification: null,
  };
}
export async function foundationSkill() {
  const path = join(root, 'skills/teams-demo-collaboration/SKILL.md');
  const content = await readFile(path, 'utf8');
  const cli = formatShellCommand([process.execPath, join(root, 'scripts/teams-demo.mjs'), '--endpoint', origin]);
  return { path, content, cli, origin: 'demo-local-cli' };
}
export async function writeContext(state: DemoState) {
  if (!state.context) throw new Error('Freeze the project context first');
  const projectWorkspace=await configuredProjectWorkspace(runtimeDir,'carddemo');
  if(!projectWorkspace)throw new Error('Configure a separate repository path in the Credit Card project overview first');
  await verifyProjectWorkspace(projectWorkspace);
  const projectDirectory=projectWorkspace.directory;
  const chosen=state.context.selectedSkills;
  const foundation=await foundationSkill();
  const path = join(runtimeDir, 'contexts', state.context.id + '-' + createHash('sha256').update(state.context.createdAt).digest('hex').slice(0, 12) + '-v4-'+createHash('sha256').update(projectDirectory).digest('hex').slice(0,12)+'.md');
  const content = [
    '# Credit Card Spending Cashback · DEMO-MKT-001', '',
    'This is context material for the former main requirement. The local project workspace is the source of truth for the business code directory. Start the current task from its delivery node and read that node\'s latest inputs and workspace binding. teams/src/cashback.ts is only a historical rule reference and does not represent the current implementation in the business repository.', '',
    '## Requirement description', 'Platinum card customers get an extra 0.5% cashback on their spending over the next 3 months.', '',
    '## Confirmed scope and open items', 'Confirmed: platinum card customers, 3 months, extra 0.5% cashback. Other rules are still open: exact dates, period start, spending scope, enrollment requirements, thresholds, caps and settlement. The current local parameters do not replace the official business policy.', '',
    '## Adoption basis', JSON.stringify(state.context, null, 2), '',
    '## Local materials', 'Project: ' + projectDirectory, 'Historical rule reference: ' + join(root, 'src/cashback.ts'), 'Requirement design: ' + join(root, 'docs/cashback-contract.md'), 'Skill: ' + join(workspace, '.agents', 'skills'), '',
    chosen.some(name=>userSkillExamples.some(skill=>skill.id===name)) ? '## Skills selected for this run (project and user)' : '## Project Skills selected for this run', ...chosen.map(name => { const example=userSkillExamples.find(skill=>skill.id===name);return example ? '- '+example.name+' ('+name+' · user Skill, local installation not verified): '+example.content : '- ' + name + ': ' + join(workspace, '.agents', 'skills', name, 'SKILL.md'); }), '',
    '## Supplementary requirement materials', ...state.context.materials.flatMap(m=>['### '+m.title,m.body,'']),
    '## Agent base collaboration', 'Teams progress sync Skill: '+foundation.path,'Report progress back through the Teams CLI. Business Skills and this base capability are managed separately.','',
    '## Verification scope', 'Card eligibility, period and amount rules can be verified locally; real services and production security are not verified. Functional acceptance does not mean production release.', '',
    'Context exported by Teams. Providing a file does not mean iCode has read or adopted it.'
  ].join('\n');
  await mkdir(join(runtimeDir, 'contexts'), { recursive: true });
  let previous: string | undefined;
  try { previous = await readFile(path, 'utf8'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  if (previous !== undefined && previous !== content) throw new Error('The frozen context file differs. Reset the workspace and prepare again.');
  if (previous === undefined) await atomicText(path, content);
  return { path, sha256: createHash('sha256').update(content).digest('hex'), content, prompt: 'Read and check this project context. Do not change any code yet: ' + path };
}
export function launch(tool: 'icode' | 'opencode', restore: boolean, requestId: string, expectedTerminal?: string) {
  const identity = JSON.stringify({ tool, restore, expectedTerminal }), previous = launched.get(requestId);
  if (previous) { if (previous.identity !== identity) return Promise.reject(new Error('The original launch request ID was already used for another action')); return previous.result; }
  if (launchBusy) return Promise.reject(new Error('A launch request is already running'));
  launchBusy = true;
  const result = (async () => {
    const selection = await selectICode();
    const entry = tool === 'icode' ? (selection.status === 'ready' ? selection.path : undefined) : await openCodePath();
    if (!entry || !await installed(entry)) throw new Error(tool + ' is not installed');
    if (restore) throw new Error('The history restore entry was removed. Create a new session for the current work.');
    const directory=await nativeWorkspace();
    const args = tool === 'icode' ? ['-C', directory] : [directory];
    const terminal = await terminalPreferences.selected(expectedTerminal);
    const launchedTerminal = await terminalLauncher.launch({ executable: tool === 'icode' ? process.execPath : entry, directory, args: tool === 'icode' ? [join(root, 'scripts/native/run-icode.mjs'), entry, ...args] : args, terminal: terminal.id });
    const receipt = { requestId, tool, restore, at: new Date().toISOString(), ...launchedTerminal, sessionId: null };
    await atomicJson(join(runtimeDir, 'last-launch.json'), receipt); return receipt;
  })().finally(() => { launchBusy = false; });
  // Retain failures too: an uncertain original request must never silently launch again.
  launched.set(requestId, { identity, result }); return result;
}

/** Native work entry: caller has validated and pinned the project directory/configuration. */
export async function nativeWorkDefaults(): Promise<(Omit<ProjectWorkPlan['instance'], 'installed' | 'name'> & {agent:string;agentLabel:string;model:string;modelLabel:string;terminal:{id:string;name:string;error?:string}}) | null> {
  const selection = await selectICode();
  if (selection.status !== 'ready' || !selection.path) return null;
  const entry = selection.path;
  const [agentReply, modelReply] = await Promise.all([
    execute(entry, ['agent', '--json'], { timeout: 10000, maxBuffer: 262144, windowsHide: true }),
    execute(entry, ['model', '--json'], { timeout: 10000, maxBuffer: 262144, windowsHide: true }),
  ]);
  const agents = JSON.parse(agentReply.stdout), models = JSON.parse(modelReply.stdout);
  if (!Array.isArray(agents.agents) || !Array.isArray(models.models)) throw new Error('Invalid iCode default configuration response');
  const role = agents.agents.find((agent: any) => agent.name === agents.default && agent.default === true);
  if (!role || role.launchableAsMain !== true || role.subAgentOnly) throw new Error('The iCode default role cannot be launched as a main session');
  const selector = role.model === 'active' ? models.active : role.model;
  const matches = models.models.filter((model: any) => model.id === selector || model.name === selector);
  if (matches.length !== 1) throw new Error('Invalid model configuration for the iCode default role');
  const preference = await terminalPreferences.context();
  return { agent: role.id, agentLabel: role.displayName, model: matches[0].id, modelLabel: matches[0].name, terminal: { id: preference.selectedTerminal, name: preference.terminalName, error: preference.terminalError } };
}
export async function startNativeWork(input: { directory: string; agent: string; model: string; sessionId?: string; instruction: string; terminal: string; task?: { runId: string; path: string; scope: { projectId: string; taskId: string; nodeId: string }; preparedSession?: { preparationRunId: string; sourceRunId: string; sessionSha256: string; sessionId: string } } }) {
  if (process.env.DEMO_NATIVE_DISABLED === '1') throw new Error('Real native launch is not enabled on this verification instance');
  const selection = await selectICode();
  if (selection.status !== 'ready' || !selection.path) throw new Error('iCode is not installed');
  const entry = selection.path;
  if (input.task) {
    if (!/^[0-9a-f-]{36}$/i.test(input.task.runId) || input.sessionId && input.task.preparedSession?.sessionId !== input.sessionId) throw new Error('The current task only allows a new session or a verified preparation session of the same task');
    const output = join(runtimeDir, 'work-contexts', input.task.runId + '.native');
    await mkdir(output, { recursive: true });
    const manifest = join(output, 'manifest.json');
    await atomicJson(manifest, { version: 1, executionMode: 'interactive', runId: input.task.runId, scope: input.task.scope, executable: entry, directory: input.directory, agent: input.agent, model: input.model, ...(input.task.preparedSession?{preparedSession:input.task.preparedSession}:{}), taskFile: input.task.path, taskSha256: createHash('sha256').update(await readFile(input.task.path)).digest('hex') });
    const nativeEnvironment = await nativeSkillEnvironment();
    await ensureNativeTuiHooks(join(root, 'scripts/native/tui-work-hook.mjs'), join(runtimeDir, 'native-hook-backups'), nativeEnvironment.configDirectory, join(root, '..', 'demo', 'scripts/native/tui-work-hook.mjs'));
    const terminal = await terminalPreferences.selected(input.terminal);
    const receipt = await terminalLauncher.launch({ executable: process.execPath, directory: input.directory, args: [join(root, 'scripts/native/run-project-tui.mjs'), manifest], instruction: input.sessionId ? 'Resuming the prepared iCode session for the current task. Reading context and open questions are kept; waiting for you to continue.' : 'Entering the iCode interactive interface. After you enter a work instruction, the current task node context is attached through the native hook.', terminal: terminal.id });
    await atomicJson(join(output, 'terminal-receipt.json'), { runId: input.task.runId, ...input.task.scope, directory: input.directory, terminalKind: terminal.id, at: new Date().toISOString(), ...receipt });
    return receipt;
  }
  const args = ['-C', input.directory, '--agent', input.agent, '--model', input.model, ...(input.sessionId ? ['--session', input.sessionId] : [])];
  const terminal = await terminalPreferences.selected(input.terminal);
  return terminalLauncher.launch({ executable: process.execPath, directory: input.directory, args: [join(root, 'scripts/native/run-icode.mjs'), entry, ...args], instruction: input.instruction, terminal: terminal.id });
}

/** Explicit non-interactive work: no terminal and no implicit task advancement. */
export async function startNativeCliWork(input: Omit<Parameters<typeof startNativeWork>[0], 'terminal'>) {
  if(process.env.DEMO_NATIVE_DISABLED==='1')throw new Error('Real native launch is not enabled on this verification instance');
  const selection=(await selectICode());
  if(selection.status!=='ready'||!selection.path)throw new Error('iCode is not installed');
  const entry=selection.path;
  if(!input.task||!/^[0-9a-f-]{36}$/i.test(input.task.runId)||!input.task.preparedSession||input.sessionId!==input.task.preparedSession.sessionId)throw new Error('CLI work must resume the verified preparation session of the current task');
  const output=join(runtimeDir,'work-contexts',input.task.runId+'.native');
  await mkdir(output,{recursive:true});
  const manifest=join(output,'manifest.json');
  await atomicJson(manifest,{version:1,executionMode:'task-file',runId:input.task.runId,scope:input.task.scope,executable:entry,directory:input.directory,agent:input.agent,model:input.model,preparedSession:input.task.preparedSession,taskFile:input.task.path,taskSha256:createHash('sha256').update(await readFile(input.task.path)).digest('hex')});
  const out=await open(join(output,'observer-output.log'),'wx',0o600);let err:Awaited<ReturnType<typeof open>>|undefined;
  try {
    err=await open(join(output,'observer-error.log'),'wx',0o600);
    const child=spawn(process.execPath,[join(root,'scripts/native/run-project-task.mjs'),manifest],{cwd:input.directory,env:withoutNativeTrace(process.env),detached:true,windowsHide:true,stdio:['ignore',out.fd,err.fd]});
    await new Promise<void>((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
    await atomicJson(join(output,'cli-launch.json'),{runId:input.task.runId,...input.task.scope,pid:child.pid,startedAt:new Date().toISOString()});child.unref();
    return {status:'cli-requested',pid:child.pid};
  } finally {await out.close();await err?.close();}
}

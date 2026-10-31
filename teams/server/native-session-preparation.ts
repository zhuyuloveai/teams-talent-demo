import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { NativePreparationReceipt } from '../src/native-preparation.js';
import { atomicJson } from './store.js';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
interface Reading { path: string; sha256: string }
export interface PreparationInput {
  runId: string; scope: { projectId: string; taskId: string; nodeId: 'prepare' }; assigneeId: string;
  directory: string; executable: string; runner: string; runtime: string; taskFile: string;
  contextPath: string; skillPath: string; reads: Reading[];
  agent: string; agentLabel: string; model: string; modelLabel: string;
  env: NodeJS.ProcessEnv;
}
async function optional(path: string) { try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; } }
const readNotices = /^\[(?:Truncated |Long lines truncated|Showing lines )/;
const partialLine = '... [truncated]';
/** iCode caps very long lines in multi-line reads and documents the single-line recovery. */
function readRows(result: string, path: string) {
  const rows: Array<{ line: number; text: string; partial: boolean }> = [];
  for (const row of result.replace(/\r\n?/g, '\n').split('\n').slice(1)) {
    if (!row || readNotices.test(row)) continue;
    const match = /^(\d+)\|(.*)$/.exec(row);
    if (!match) throw new Error('Invalid material read format: ' + path);
    const partial = match[2].endsWith(partialLine);
    rows.push({ line: Number(match[1]), text: partial ? match[2].slice(0, -partialLine.length) : match[2], partial });
  }
  return rows;
}
/** Validate native-visible tool calls and matching successful tool results. Never read reasoning text. */
export function preparationReadingEvidence(envelope: any, reads: Array<Reading & { content?: string }>) {
  const contents = (envelope.state?.messages ?? []).flatMap((message: any) => message.contents ?? []);
  const calls = contents.filter((part: any) => part.type === 'function_call');
  if (calls.some((call: any) => call.name !== 'read_file')) throw new Error('Initialization used tools other than read-only material reads; the session was not marked as prepared');
  const results = new Map<string, any>(contents.filter((part: any) => part.type === 'function_result').map((part: any) => [part.call_id, part]));
  return reads.map(read => {
    const matches = calls.filter((call: any) => {
      const arguments_ = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      return arguments_?.path && resolve(arguments_.path) === resolve(read.path);
    });
    if (!matches.length) throw new Error('No real read receipt for the complete material: ' + read.path);
    const readable = matches.filter((call: any) => {
      const result = results.get(call.call_id);
      return result && !result.is_error && !result.error && typeof result.result === 'string' && result.result.startsWith('File: ');
    });
    if (!readable.length) throw new Error('No real read receipt for the complete material: ' + read.path);
    if(read.content!==undefined){
      // A multi-line read truncates long lines; the tool documents reading each of them
      // with offset/limit. Verify the union: every line must be present exactly once.
      const collected = new Map<number, { text: string; partial: boolean }>();
      for (const call of readable) {
        for (const row of readRows(results.get(call.call_id).result, read.path)) {
          const prior = collected.get(row.line);
          if (!prior || prior.partial && !row.partial) { collected.set(row.line, { text: row.text, partial: row.partial }); continue; }
          if (!row.partial && prior.text !== row.text) throw new Error('Material read result does not match the actual version: ' + read.path);
        }
      }
      const expected=read.content.replace(/\r\n?/g,'\n').replace(/\n$/,'').split('\n');
      for(const [index,line] of expected.entries()){const row=collected.get(index+1);if(!row||row.partial)throw new Error('Material read was truncated or is missing lines: '+read.path);if(row.text!==line)throw new Error('Material read result does not match the actual version: '+read.path);}
      if([...collected.keys()].some(line=>line<1||line>expected.length))throw new Error('Material read result does not match the actual version: '+read.path);
    }
    return { path:read.path,sha256:read.sha256,callId: String(readable[0].call_id) };
  });
}
export async function verifiedPreparation(input: PreparationInput): Promise<NativePreparationReceipt | null> {
  const directory = join(input.runtime, 'work-contexts', input.runId + '.native');
  const result = await optional(join(directory, 'result.json'));
  if (!result) return null;
  if (result.status !== 'completed') throw new Error('iCode initialization did not complete: ' + (result.error ?? result.status));
  const owner = await optional(join(directory, 'native-session.json'));
  if (!owner || owner.runId !== input.runId || owner.projectId !== input.scope.projectId || owner.taskId !== input.scope.taskId || owner.nodeId !== 'prepare' || !uuid.test(owner.sessionId) || result.sessionId !== owner.sessionId || owner.sessionRoot !== join(directory, 'session-root')) throw new Error('Initialization native session identity does not match');
  const bytes = await readFile(join(owner.sessionRoot, 'sessions', owner.sessionId.replaceAll('-', '').slice(0, 12), 'session.json'));
  const envelope = JSON.parse(bytes.toString('utf8'));
  if (envelope.meta?.session_id !== owner.sessionId) throw new Error('Initialization native session body identity does not match');
  const readContents=await Promise.all(input.reads.map(async read=>{const bytes=await readFile(read.path);if(hash(bytes)!==read.sha256)throw new Error('A material version changed during initialization; not marked as prepared');return{...read,content:bytes.toString('utf8')};}));
  const readEvidence = preparationReadingEvidence(envelope, readContents);
  const replies = (envelope.state?.messages ?? []).filter((message: any) => message.role === 'assistant').flatMap((message: any) => (message.contents ?? []).filter((part: any) => part.type === 'text').map((part: any) => part.text)).filter((text: unknown): text is string => typeof text === 'string' && !!text.trim());
  if (!replies.length) throw new Error('The initialization session has no model-visible reply yet; not marked as prepared');
  return { status: 'ready', runId: input.runId, sessionId: owner.sessionId, directory: input.directory, preparedAt: result.finishedAt, contextPath: input.contextPath, contextSha256: input.reads.find(read => read.path === input.contextPath)!.sha256, skillPath: input.skillPath, sessionSha256: hash(bytes), agent: input.agent, agentLabel: input.agentLabel, model: input.model, modelLabel: input.modelLabel, readEvidence, summary: replies.at(-1)!.slice(0, 6000) };
}
/** One real CLI turn. A persisted start identity is never silently retried after process loss. */
export async function prepareNativeSession(input: PreparationInput): Promise<NativePreparationReceipt> {
  if (process.env.DEMO_NATIVE_DISABLED === '1') throw new Error('This verification instance does not allow real native session preparation');
  if (!uuid.test(input.runId)) throw new Error('Invalid initialization request ID');
  const output = join(input.runtime, 'work-contexts', input.runId + '.native');
  await mkdir(output, { recursive: true });
  const taskSha256 = hash(await readFile(input.taskFile));
  const request = { version: 1, runId: input.runId, scope: input.scope, assigneeId: input.assigneeId, directory: await realpath(input.directory), taskSha256, reads: input.reads, agent: input.agent, model: input.model };
  const requestPath = join(output, 'preparation-request.json');
  let start = false;
  try { const file = await open(requestPath, 'wx', 0o600); try { await file.writeFile(JSON.stringify(request)); await file.sync(); } finally { await file.close(); } start = true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; if (JSON.stringify(await optional(requestPath)) !== JSON.stringify(request)) throw new Error('The same initialization request cannot change the task, assignee or materials'); }
  if (start) {
    const manifest = join(output, 'manifest.json');
    await atomicJson(manifest, { ...request, executionMode: 'preparation', executable: input.executable, taskFile: input.taskFile });
    const out = await open(join(output, 'observer-output.log'), 'wx', 0o600), err = await open(join(output, 'observer-error.log'), 'wx', 0o600);
    try {
      const child = spawn(process.execPath, [input.runner, manifest], { cwd: input.directory, env: input.env, detached: true, windowsHide: true, stdio: ['ignore', out.fd, err.fd] });
      await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      await atomicJson(join(output, 'preparation-launch.json'), { runId: input.runId, pid: child.pid, at: new Date().toISOString() });
      child.unref();
    } catch (error) { await atomicJson(join(output, 'preparation-launch-error.json'), { error: (error as Error).message }); throw error; }
    finally { await out.close(); await err.close(); }
  }
  for (let attempt = 0; attempt < 600; attempt++) {
    const failed = await optional(join(output, 'preparation-launch-error.json'));
    if (failed) throw new Error('Initialization failed to start: ' + failed.error);
    const receipt = await verifiedPreparation(input);
    if (receipt) { await atomicJson(join(output, 'preparation-receipt.json'), receipt); return receipt; }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('The initialization session has no verifiable result yet. The original request is kept and will not be launched again; check the current process and query again');
}

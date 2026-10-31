import { createHash, randomUUID } from 'node:crypto';
import { readFile, realpath, open, mkdir, link, unlink } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { CollectedSession, TaskScope } from '../src/task-automation.js';
import type { TalentTaskSessionPayload } from '../src/talent-contract.js';
import { nativeSessionRootMatches } from './native-session-location.js';
import { MAX_NATIVE_SESSION_BYTES, sessionDocumentBytes, assertSessionDocumentTotal, validateSessionDocumentCapacity } from './session-capacity.js';

type Documents = NonNullable<TalentTaskSessionPayload['sessionDocuments']>;
interface Capture { id: string; acceptedAt: string }
interface NativeRun {
  runId: string; runRoot: string; owner: Record<string, any>; result: Record<string, any> | null;
  manifest: Record<string, any> | null; kind: string; ownerSha256: string; resultSha256?: string; manifestSha256?: string;
  sessionSha256?: string;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const digest = (content: string) => createHash('sha256').update(content).digest('hex');
async function optionalJson(path: string) { try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; } }
async function optionalRecord(path: string) {
  try { const bytes=await readFile(path,'utf8'); return {value:JSON.parse(bytes),sha256:digest(bytes)}; }
  catch(error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
/** A failed attempt is history, never completion. It is eligible only inside one
 * explicitly linked native continuation ending in a completed run. The earliest
 * collected run may refer to an uncollected prepare ancestor. No directory search. */
function completedContinuation(runs: NativeRun[], scope: TaskScope, sessionId: string, capture?: Capture): string {
  const invalid = () => new Error('The failed native attempt has no complete, finished continuation chain in the same scope and session; the session body was not reported');
  if (!capture || runs.length > 100 || new Set(runs.map(run => run.runId)).size !== runs.length) throw invalid();
  const byId = new Map(runs.map(run => [run.runId, run])), children = new Map<string, string>();
  for (const run of runs) {
    const {owner, result, manifest} = run;
    if (!result || !manifest || manifest.runId !== run.runId || manifest.executionMode !== owner.executionMode ||
        result.executionMode !== owner.executionMode || !['task-file','interactive'].includes(owner.executionMode) ||
        !Number.isSafeInteger(owner.pid) || owner.pid < 2 || result.pid !== owner.pid ||
        ['projectId','taskId','nodeId'].some(key => manifest.scope?.[key] !== owner[key] || result[key] !== owner[key]) ||
        owner.projectId !== scope.projectId || owner.taskId !== scope.taskId || result.sessionId !== sessionId ||
        !['completed','failed'].includes(result.status) || !Number.isInteger(result.nativeExitCode) ||
        (result.status === 'completed' ? result.nativeExitCode !== 0 : result.nativeExitCode === 0) ||
        !Number.isFinite(Date.parse(result.startedAt)) || !Number.isFinite(Date.parse(result.finishedAt)) ||
        Date.parse(result.finishedAt) < Date.parse(result.startedAt) || Date.parse(result.finishedAt) > Date.parse(capture.acceptedAt)) throw invalid();
    const parent = byId.get(manifest.preparedSession?.sourceRunId);
    if (parent) {
      if (children.has(parent.runId) || parent.runId === run.runId || manifest.preparedSession.sessionId !== sessionId ||
          !/^[a-f0-9]{64}$/.test(manifest.preparedSession.sessionSha256) ||
          Date.parse(result.startedAt) < Date.parse(parent.result?.finishedAt)) throw invalid();
      children.set(parent.runId, run.runId);
    }
  }
  const roots = runs.filter(run => !byId.has(run.manifest?.preparedSession?.sourceRunId));
  if (roots.length !== 1) throw invalid();
  const visited = new Set<string>(); let current = roots[0];
  while (!visited.has(current.runId)) {
    visited.add(current.runId);
    const child = children.get(current.runId);
    if (!child) break;
    current = byId.get(child)!;
  }
  if (visited.size !== runs.length || children.has(current.runId) || current.result?.status !== 'completed') throw invalid();
  return current.runId;
}
function verifyDocuments(documents: Documents) {
  if (!Array.isArray(documents)) throw new Error('Invalid acceptance session snapshot format');
  validateSessionDocumentCapacity(documents);
  for (const document of documents) if (digest(document.content) !== document.sha256 || JSON.parse(document.content)?.meta?.session_id !== document.sessionId) throw new Error('Invalid acceptance session snapshot identity or digest');
}
/** iCode 0.31 stores in-flight checkpoints in session.recovery.json and settled turns in session.json.
 * Match the native effective-envelope timestamp rule without healing, deleting, or hiding errors. */
export async function readNativeTuiEnvelope(runRoot: string, sessionId: string) {
  runRoot = await realpath(runRoot);
  const candidates: Array<{content:string;mtime:number;sourceFile:string;updatedAt:number}> = [];
  for (const sourceFile of ['session.json', 'session.recovery.json']) {
    const file = join(runRoot, 'session-root', 'sessions', sessionId.replaceAll('-', '').slice(0, 12), sourceFile);
    let path: string;
    try { path = await realpath(file); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    if (!path.startsWith(join(runRoot, 'session-root') + sep)) throw new Error('The session file is outside the current run directory');
    const value = await readStableEnvelope(path, sessionId);
    const updatedAt = Date.parse(JSON.parse(value.content).meta.updated_at);
    if (!Number.isFinite(updatedAt)) throw new Error('Invalid TUI session persistence time; the main file or recovery record was not guessed');
    candidates.push({...value, sourceFile, updatedAt});
  }
  if (!candidates.length) throw new Error('The TUI has not saved a session body or in-progress checkpoint yet; retry the report later');
  return candidates.sort((a,b)=>b.updatedAt-a.updatedAt)[0];
}
async function readStableEnvelope(path: string, sessionId: string) {
  const handle = await open(path, 'r'); let content: string, mtime: number;
  try {
    const info = await handle.stat(); if (!info.isFile() || info.size > MAX_NATIVE_SESSION_BYTES) throw new Error('The native session file is invalid or larger than 32 MiB');
    // Bound allocation even if an in-place writer grows the file after stat.
    const buffer = Buffer.alloc(info.size); let read = 0;
    while (read < buffer.length) { const value = await handle.read(buffer, read, buffer.length - read, read); if (!value.bytesRead) break; read += value.bytesRead; }
    const after = await handle.stat();
    if (read !== info.size || after.size !== info.size || after.mtimeMs !== info.mtimeMs) throw new Error('The session body is being updated, so no snapshot was taken; retry the report');
    content = buffer.toString('utf8');
    mtime = info.mtimeMs;
  } finally { await handle.close(); }
  if (JSON.parse(content)?.meta?.session_id !== sessionId) throw new Error('The native session body identity does not match');
  return {content,mtime};
}
/** Freeze the persisted session bytes at the first accepted collection attempt. TUI lifetime is independent of task acceptance. */
export async function nativeTaskSessionDocuments(runtime: string, scope: TaskScope, sessions: CollectedSession[], capture?: Capture): Promise<Documents> {
  const runtimeRoot = await realpath(runtime), identity = digest(JSON.stringify({ scope, sessions, acceptedAt: capture?.acceptedAt }));
  if (capture && (!uuid.test(capture.id) || !Number.isFinite(Date.parse(capture.acceptedAt)))) throw new Error('Invalid acceptance snapshot ID or time');
  const snapshotPath = capture ? join(runtimeRoot, 'task-session-snapshots', capture.id + '.json') : undefined;
  const saved = snapshotPath ? await optionalJson(snapshotPath) : null;
  if (saved) { if (saved.identity !== identity) throw new Error('The same acceptance snapshot cannot be used for a different task, session or acceptance time'); verifyDocuments(saved.documents); return saved.documents; }
  const documents = new Map<string, { sessionId: string; sha256: string; content: string; mtime: number; kind: string; sourceFile:string; runId:string; runs?:unknown[] }>();
  let documentBytes = 0;
  for (const session of sessions) {
    if (session.tool !== 'icode' || !session.runIds.length || !uuid.test(session.sessionId)) throw new Error('No verifiable native iCode session identity; the session body was not reported');
    const runs: NativeRun[] = [];
    for (const runId of session.runIds) {
      if (!uuid.test(runId)) throw new Error('Invalid native run ID');
      const runRoot = await realpath(join(runtime, 'work-contexts', runId + '.native'));
      if (runRoot !== resolve(runtimeRoot, 'work-contexts', runId + '.native')) throw new Error('The native run directory must not be replaced by a symbolic link');
      const ownerBytes = await readFile(join(runRoot, 'native-session.json'), 'utf8');
      const owner = JSON.parse(ownerBytes), resultRecord = await optionalRecord(join(runRoot, 'result.json')), manifestRecord = await optionalRecord(join(runRoot, 'manifest.json'));
      const result = resultRecord?.value ?? null, manifest = manifestRecord?.value ?? null;
      if (owner.source !== 'icode-active-session-owner' || owner.projectId !== scope.projectId || owner.taskId !== scope.taskId || owner.runId !== runId || owner.sessionId !== session.sessionId || !await nativeSessionRootMatches(runtimeRoot, runRoot, owner, runtime)) throw new Error('The native session scope does not match; the session body was not reported');
      let kind = 'completed-session';
      if (owner.executionMode === 'interactive') {
        if (!capture || !manifest || manifest.executionMode !== 'interactive' || manifest.runId !== runId || manifest.scope?.projectId !== scope.projectId || manifest.scope?.taskId !== scope.taskId || manifest.scope?.nodeId !== owner.nodeId) throw new Error('A TUI session needs an explicit acceptance scope and a fixed snapshot ID');
        if (!result) {
          const active = await optionalJson(join(runRoot, 'session-root', 'sessions', '.locks', session.sessionId.replaceAll('-', '').slice(0, 12) + '.active.json'));
          if (!active || active.session_id !== session.sessionId || active.pid !== owner.pid || active.started_at !== owner.startedAt || !Number.isSafeInteger(owner.pid) || owner.pid < 2) throw new Error('The owner of the current TUI session cannot be verified; the snapshot was not read');
          process.kill(owner.pid, 0); kind = 'live-tui-persisted-snapshot';
        } else if (result.executionMode !== 'interactive' || result.runId !== runId || result.sessionId !== session.sessionId || !['completed', 'failed'].includes(result.status)) throw new Error('The TUI exit receipt identity does not match');
        else kind = 'closed-tui-persisted-snapshot';
      } else if (!result || result.runId !== runId || result.sessionId !== session.sessionId || !['completed','failed'].includes(result.status)) throw new Error('The native session scope or completion receipt does not match; the session body was not reported');
      runs.push({runId,runRoot,owner,result,manifest,kind,ownerSha256:digest(ownerBytes),
        ...(resultRecord ? {resultSha256:resultRecord.sha256} : {}), ...(manifestRecord ? {manifestSha256:manifestRecord.sha256} : {})});
    }
    const finalRunId = runs.some(run => run.owner.executionMode !== 'interactive' && run.result?.status === 'failed')
      ? completedContinuation(runs,scope,session.sessionId,capture) : undefined;
    for (const run of runs) {
      const {runId,runRoot,owner,kind}=run;
      let content:string,mtime:number,sourceFile='session.json';
      if (owner.executionMode === 'interactive') ({content,mtime,sourceFile}=await readNativeTuiEnvelope(runRoot,session.sessionId));
      else {
        const path = await realpath(join(runRoot, 'session-root', 'sessions', session.sessionId.replaceAll('-', '').slice(0, 12), sourceFile));
        if (!path.startsWith(join(runRoot, 'session-root') + sep)) throw new Error('The session file is outside the current run directory');
        ({content,mtime}=await readStableEnvelope(path,session.sessionId));
      }
      run.sessionSha256 = digest(content);
      const current = documents.get(session.sessionId);
      if (finalRunId ? runId === finalRunId : !current || mtime > current.mtime) {
        documentBytes += sessionDocumentBytes(content) - (current ? sessionDocumentBytes(current.content) : 0);
        assertSessionDocumentTotal(documentBytes);
        documents.set(session.sessionId, { sessionId: session.sessionId, sha256: run.sessionSha256, content, mtime, kind, sourceFile, runId });
      }
    }
    if (finalRunId) {
      const byId = new Map(runs.map(run => [run.runId,run]));
      for (const run of runs) {
        const parent=byId.get(run.manifest!.preparedSession?.sourceRunId);
        if (parent && run.manifest!.preparedSession.sessionSha256 !== parent.sessionSha256) throw new Error('The digest of the earlier session body referenced by the native continuation does not match; the session body was not reported');
      }
      // Retain terminal identities in the immutable collection evidence. No failed
      // receipt is rewritten, dropped, or represented as a successful completion.
      documents.get(session.sessionId)!.runs=runs.map(run=>({runId:run.runId,nodeId:run.owner.nodeId,status:run.result!.status,nativeExitCode:run.result!.nativeExitCode,
        sourceRunId:run.manifest!.preparedSession?.sourceRunId,sessionSha256:run.sessionSha256,ownerSha256:run.ownerSha256,resultSha256:run.resultSha256,manifestSha256:run.manifestSha256}));
    }
  }
  const result = [...documents.values()].map(({ mtime, kind, sourceFile, runId, runs, ...document }) => document);
  if (snapshotPath) {
    await mkdir(join(runtimeRoot, 'task-session-snapshots'), { recursive: true });
    const temp = snapshotPath + '.' + randomUUID() + '.tmp', handle = await open(temp, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify({ identity, ...scope, captureId: capture!.id, acceptedAt: capture!.acceptedAt, capturedAt: new Date().toISOString(), sources: [...documents.values()].map(({ content, mtime, ...source }) => source), documents: result }, null, 2)); await handle.sync(); } finally { await handle.close(); }
    // Publish without replacement: concurrent retry must reuse the first fixed bytes.
    try { await link(temp, snapshotPath); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; } finally { await unlink(temp); }
    const pinned = await optionalJson(snapshotPath); if (pinned.identity !== identity) throw new Error('Acceptance session snapshot scope conflict'); verifyDocuments(pinned.documents); return pinned.documents;
  }
  return result;
}

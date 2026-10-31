#!/usr/bin/env node
// Interactive launch: the child inherits the terminal, while observation only writes runtime receipts.
import { spawn } from 'node:child_process';
import { readFile, realpath, open, mkdir, readdir, rename, writeFile, cp } from 'node:fs/promises';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { interactiveEnvironment } from './interactive-environment.mjs';
import { loopbackProxyEnvironment, withoutNativeTrace } from './native-environment.mjs';
import { nativeProcessActive } from './session-liveness.mjs';
async function atomic(path, value) { const temp = path + '.' + randomUUID() + '.tmp'; await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); await rename(temp, path); }
export async function copyPreparedSession(manifest, output) {
  const prepared = manifest.preparedSession, uuid = /^[0-9a-f-]{36}$/i;
  if (!prepared || ![prepared.sessionId, prepared.sourceRunId, prepared.preparationRunId].every(value => uuid.test(value)) || prepared.sourceRunId === manifest.runId) throw new Error('Invalid identifiers for the prepared session to resume');
  const source = join(dirname(output), prepared.sourceRunId + '.native');
  if (await realpath(source) !== source) throw new Error('The prepared session run directory must not be replaced by a symlink');
  const owner = JSON.parse(await readFile(join(source, 'native-session.json'), 'utf8'));
  const optional = async name => { try { return JSON.parse(await readFile(join(source,name),'utf8')); } catch(error) { if(error.code==='ENOENT')return null;throw error; } };
  const result = await optional('result.json'), processRecord = await optional('process.json');
  if (owner.runId !== prepared.sourceRunId || owner.sessionId !== prepared.sessionId || owner.projectId !== manifest.scope.projectId || owner.taskId !== manifest.scope.taskId || owner.sessionRoot !== join(source, 'session-root')) throw new Error('Prepared session scope or exit receipt does not match');
  if (['interactive','task-file'].includes(owner.executionMode)) {
    if (result && (result.executionMode !== owner.executionMode || result.runId !== prepared.sourceRunId || result.sessionId !== prepared.sessionId || !['completed','failed'].includes(result.status))) throw new Error('Session exit receipt identity does not match');
    if (await nativeProcessActive(owner, processRecord)) throw new Error('The original session is still running; return to its terminal. No second session was started');
  } else if (!result || result.runId !== prepared.sourceRunId || result.status !== 'completed' || result.sessionId !== prepared.sessionId) throw new Error('Prepared session scope or exit receipt does not match');
  const shortId = prepared.sessionId.replaceAll('-', '').slice(0, 12), sourceDirectory = join(source, 'session-root', 'sessions', shortId);
  let active;
  try { active = JSON.parse(await readFile(join(source, 'session-root', 'sessions', '.locks', shortId + '.active.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (active) {
    if (active.session_id !== prepared.sessionId || active.pid !== owner.pid || active.started_at !== owner.startedAt) throw new Error('Original session activity lock identity does not match');
    if (await nativeProcessActive(owner, processRecord)) throw new Error('The original session is still running; return to its terminal. No second session was started');
  }
  let latest;
  for (const file of ['session.json', 'session.recovery.json']) {
    let bytes;
    try { bytes = await readFile(join(sourceDirectory, file)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const value = JSON.parse(bytes.toString('utf8')), updatedAt = Date.parse(value.meta?.updated_at);
    if (value.meta?.session_id !== prepared.sessionId || !Number.isFinite(updatedAt)) throw new Error('Invalid prepared session transcript identity or save time');
    if (!latest || updatedAt > latest.updatedAt) latest = { bytes, updatedAt };
  }
  if (!latest || createHash('sha256').update(latest.bytes).digest('hex') !== prepared.sessionSha256) throw new Error('The prepared session transcript changed after confirmation; read the plan again');
  const verifyTree = async directory => { for (const entry of await readdir(directory, { withFileTypes: true })) { if (entry.isSymbolicLink()) throw new Error('Prepared session materials contain a symlink; nothing was copied'); if (entry.isDirectory()) await verifyTree(join(directory, entry.name)); } };
  await verifyTree(sourceDirectory);
  await mkdir(join(output, 'session-root', 'sessions'), { recursive: true });
  await cp(sourceDirectory, join(output, 'session-root', 'sessions', shortId), { recursive: true, errorOnExist: true, force: false });
  // Original preparation evidence stays immutable; the native UUID is preserved
  // in this run's independent writable storage for normal TUI continuation.
  await atomic(join(output, 'prepared-session-copy.json'), { ...prepared, copiedAt: new Date().toISOString() });
}
export async function runProjectTui(manifestPath) {
  if (![process.stdin, process.stdout, process.stderr].every(stream => stream.isTTY)) throw new Error('Interactive iCode must run in a real terminal (stdin/stdout/stderr must all be TTYs)');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')), output = await realpath(dirname(manifestPath)), directory = await realpath(manifest.directory);
  if (manifest.version !== 1 || manifest.executionMode !== 'interactive' || !/^[0-9a-f-]{36}$/i.test(manifest.runId) || !isAbsolute(manifest.executable) || manifest.directory !== directory || createHash('sha256').update(await readFile(manifest.taskFile)).digest('hex') !== manifest.taskSha256) throw new Error('TUI launch materials are invalid or have changed');
  const startedAt = new Date().toISOString(), sentinel = await open(join(output, 'started.json'), 'wx', 0o600);
  try { await sentinel.writeFile(JSON.stringify({ runId: manifest.runId, startedAt, executionMode: 'interactive' })); } finally { await sentinel.close(); }
  const sessionRoot = join(output, 'session-root');
  if(manifest.preparedSession)await copyPreparedSession(manifest,output);else await mkdir(sessionRoot);
  const args = ['-C', directory, '--agent', manifest.agent, '--model', manifest.model, ...(manifest.preparedSession ? ['--session', manifest.preparedSession.sessionId] : [])];
  const child = spawn(manifest.executable, args, { cwd: directory, env: { ...loopbackProxyEnvironment(interactiveEnvironment(withoutNativeTrace(process.env))), CHRYS_SESSION_ROOT_DIR: sessionRoot, TEAMS_TUI_MANIFEST: manifestPath }, stdio: 'inherit' });
  const result = new Promise(resolve => { child.once('error', error => resolve({ code: null, error: error.message })); child.once('close', (code, signal) => resolve({ code, signal })); });
  await atomic(join(output, 'process.json'), { runId: manifest.runId, executable: manifest.executable, args, directory, pid: child.pid ?? null, startedAt, sessionRoot, executionMode: 'interactive', tty: { stdin: true, stdout: true, stderr: true } });
  let done = false, session, observerError;
  const observe = (async () => {
    while (!done && !session) {
      let names = [];
      try { names = await readdir(join(sessionRoot, 'sessions', '.locks')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const owners = await Promise.all(names.filter(name => name.endsWith('.active.json')).map(async name => JSON.parse(await readFile(join(sessionRoot, 'sessions', '.locks', name), 'utf8'))));
      if (owners.length > 1) throw new Error('Multiple native sessions appeared for this work; no association was guessed');
      if (owners.length === 1) {
        const owner = owners[0];
        if (!/^[0-9a-f-]{36}$/i.test(owner.session_id) || manifest.preparedSession && owner.session_id !== manifest.preparedSession.sessionId || !Number.isSafeInteger(owner.pid) || owner.pid < 2 || Date.parse(owner.started_at) < Date.parse(startedAt) - 1000) throw new Error('Invalid native TUI session identity');
        process.kill(owner.pid, 0);
        session = { runId: manifest.runId, ...manifest.scope, sessionId: owner.session_id, pid: owner.pid, startedAt: owner.started_at, source: 'icode-active-session-owner', sessionRoot, executionMode: 'interactive' };
        await atomic(join(output, 'native-session.json'), session);
      } else await new Promise(resolve => setTimeout(resolve, 100));
    }
  })().catch(error => { observerError = error.message; });
  // Raw-mode TUI handles keyboard input itself. Terminal-close signals are forwarded only to this child.
  const forward = signal => { if (!done) child.kill(signal); };
  const onTerm = () => forward('SIGTERM'), onHup = () => forward('SIGHUP');
  process.on('SIGTERM', onTerm); process.on('SIGHUP', onHup);
  const ended = await result; done = true; await observe;
  process.off('SIGTERM', onTerm); process.off('SIGHUP', onHup);
  const receipt = { runId: manifest.runId, ...manifest.scope, startedAt, finishedAt: new Date().toISOString(), nativeExitCode: ended.code, signal: ended.signal ?? null, sessionId: session?.sessionId ?? null, pid: session?.pid ?? child.pid ?? null, status: ended.code === 0 && session && !observerError ? 'completed' : 'failed', error: ended.error ?? observerError ?? (!session ? 'The TUI exited before a verifiable session was established' : ended.code ? 'The TUI process exited abnormally' : null), executionMode: 'interactive', note: 'This record only means the interactive session exited; it does not mean the task node is complete or accepted.' };
  await atomic(join(output, 'result.json'), receipt); return receipt;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { const result = await runProjectTui(process.argv[2]); console.log(result.status === 'completed' ? 'The iCode interactive session has ended; Teams reports the task status.' : 'The iCode interactive session did not end normally: ' + result.error); process.exitCode = result.status === 'completed' ? 0 : result.nativeExitCode || 1; }
  catch (error) { console.error('Could not start interactive iCode: ' + error.message); process.exitCode = 1; }
}

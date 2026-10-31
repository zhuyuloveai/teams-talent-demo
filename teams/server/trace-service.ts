// Trace service: starts the Python trace_server bundled with the demo (file mode).
// It is both the query side (/api/v1, read-only JSONL) and the collector (/v1/traces -> the same JSONL directory).
// iCode reports OTLP straight to this service via start-icode-trace2.bat; the container-based trace2 is no longer needed.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { root, runtimeDir, traceDataDir, traceOrigin, tracePort, traceServerRoot } from './config.js';

import { checkNativeTraceReceiver } from '../scripts/native/tui-trace.mjs';

let child: ChildProcess | null = null;
let starting: Promise<void> | null = null;

async function healthy() {
  try {
    await checkNativeTraceReceiver(traceOrigin + '/v1/traces', {app:'teams-trace-server',workspaceRoot: root, stateRoot: traceDataDir});
    return true;
  } catch (error) {
    if ((error as {cause?: {code?:string}}).cause?.code === 'ECONNREFUSED') return false;
    throw error;
  }
}

/** Start trace_server (or reuse one already running); on failure throw an error that includes the log path. */
export async function startTraceService() {
  if (await healthy()) return;
  if (starting) return starting;
  starting = (async () => {
    const entry = join(traceServerRoot, 'backend', 'scripts', 'run_api.py');
    if (!existsSync(entry)) throw new Error('trace-server backend entry point missing: ' + entry);
    await mkdir(runtimeDir, { recursive: true });
    const logPath = join(runtimeDir, 'trace-server.log');
    const log = await open(logPath, 'a', 0o600);
    const localPython = join(traceServerRoot, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    const python = process.env.DEMO_TRACE_PYTHON || (existsSync(localPython) ? localPython : process.platform === 'win32' ? 'python' : 'python3');
    const current = spawn(python, [entry], {
      cwd: traceServerRoot,
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        TEAMS_TRACE_WORKSPACE_ROOT: root,
        PORT: String(tracePort),
        STORAGE_BACKEND: 'file',
        DATA_FILE: traceDataDir,
        // Receive iCode OTLP/HTTP locally and write it to the same directory, so the query side can read it immediately
        OTLP_ENABLED: '1',
        OTLP_SINK: 'file',
        OTLP_FILE_DIR: traceDataDir,
        OTLP_DEFAULT_PROJECT_ID: 'icode',
        PYTHONUNBUFFERED: '1',
      },
      stdio: ['ignore', log.fd, log.fd],
      windowsHide: true,
    });
    child = current;
    await log.close();
    // When Python is missing, spawn only emits an error event; without a listener the whole Teams process would crash
    let spawnError: Error | null = null;
    current.on('error', error => { spawnError = error; if (child === current) child = null; });
    current.on('exit', () => { if (child === current) child = null; });
    for (let i = 0; i < 40; i++) {
      if (await healthy()) return;
      if (spawnError) throw new Error(`Cannot start trace-server (${python}): ${(spawnError as Error).message}. You can set DEMO_TRACE_PYTHON`);
      if (current.exitCode !== null) throw new Error(`trace-server exited (code=${current.exitCode}), log: ${logPath}`);
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    current.kill();
    throw new Error(`trace-server start timed out, log: ${logPath}`);
  })();
  try { await starting; } finally { starting = null; }
}

/** Stop the trace_server started by this process (does nothing when an external instance was reused). */
export async function stopTraceService() {
  const current=child;
  if (!current || current.exitCode !== null) return;
  await new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('The trace child process has not exited; shutdown is not confirmed')),5000);
    current.once('exit',()=>{clearTimeout(timer);if(child===current)child=null;resolve();});
    current.once('error',error=>{clearTimeout(timer);reject(error);});
    current.kill('SIGTERM');
  });
}

/** Forward /trace-api/* to trace_server /api/v1/* (same origin, so the iframe avoids cross-origin issues). */
export async function proxyTrace(path: string, search: string, response: ServerResponse) {
  const target = traceOrigin + '/api/v1' + path.slice('/trace-api'.length) + search;
  try {
    const upstream = await fetch(target, { method: 'GET', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
    const body = Buffer.from(await upstream.arrayBuffer());
    response.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ detail: 'The trace query service is unavailable; check that Teams started correctly' }));
  }
}

/** Whether a request path belongs to the trace proxy (used by server routing). */
export const isTraceApi = (path: string) => path === '/trace-api' || path.startsWith('/trace-api/');

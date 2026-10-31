/** One explicit schedule patch. Stop the owning Teams service before applying. */
import { createHash, randomUUID } from 'node:crypto';
import { open, readFile, realpath, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { approvedRequirementSchedule, planRequirementSchedule } from '../src/requirement-schedule.js';
import type { DemoState } from '../src/domain.js';

const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index], value = process.argv[index + 1];
  if (!['--state', '--apply', '--expect-revision', '--expect-sha256', '--service-stopped'].includes(key) || !value || args.has(key)) throw new Error('Usage: --state ABS [--apply yes --expect-revision N --expect-sha256 SHA256 --service-stopped yes]; dry run by default');
  args.set(key, value);
}
const requested = args.get('--state');
if (!requested || !isAbsolute(requested) || (args.has('--apply') && args.get('--apply') !== 'yes')) throw new Error('Give the absolute path of the state file; --apply can only be yes');
const path = await realpath(requested);
if (path !== resolve(requested)) throw new Error('The state file path must not go through a symlink');
const original = await readFile(path), sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const state = JSON.parse(original.toString('utf8')) as DemoState;
if (state.schemaVersion !== 2 || !Number.isSafeInteger(state.revision) || !Array.isArray(state.workspace?.deliveryRequirements)) throw new Error('Invalid state file format');
const plan = planRequirementSchedule(state), apply = args.get('--apply') === 'yes';
let backup: string | undefined;
if (apply) {
  if (args.get('--service-stopped') !== 'yes' || args.get('--expect-revision') !== String(state.revision) || args.get('--expect-sha256') !== sha(original)) throw new Error('Applying requires confirming the service is stopped and matching the revision and SHA256 from the latest dry run');
  let pid: number | undefined;
  try { const text = (await readFile(join(dirname(path), 'server.pid'), 'utf8')).trim(); if (!/^\d+$/.test(text) || Number(text) < 2) throw new Error('Invalid service PID file'); pid = Number(text); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (pid !== undefined) {
    let running = true;
    try { process.kill(pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; running = false; }
    if (running) throw new Error('The Teams process is still running; state was not changed');
  }
  if (plan.changes.length) {
    backup = path + '.pre-schedule-' + randomUUID() + '.json';
    const saved = await open(backup, 'wx', 0o600);
    try { await saved.writeFile(original); await saved.sync(); } finally { await saved.close(); }
    const temporary = path + '.' + randomUUID() + '.tmp';
    try {
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify(plan.state, null, 2) + '\n'); await file.sync(); } finally { await file.close(); }
      if (sha(await readFile(path)) !== sha(original)) throw new Error('State changed after the dry run; not overwritten');
      await rename(temporary, path);
    } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
}
console.log(JSON.stringify({ applied: apply, file: path, revision: state.revision, sha256: sha(original), changes: plan.changes, preserved: plan.preserved, sourceSchedules: Object.entries(approvedRequirementSchedule).filter(([, value]) => value.storage === 'requirements-plugin').map(([id, value]) => ({ id, plannedEnd: value.due })), backup, revisionUnchanged: true }, null, 2));

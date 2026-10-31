import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { root, selectedServices, serviceHealth } from './services.mjs';
// Never kill a listener merely because it occupies a configured port.
const launching = selectedServices();
for (const service of launching) {
  if (await serviceHealth(service)) throw new Error(service.id + ' is already running from this directory; stop the verified service with stop first, or use another port');
}
const children = launching.map(service => spawn(process.execPath, ['--import', 'tsx', join(root, service.entry)], { cwd: root, stdio: 'inherit' }));
let stopping = false;
function stop() { if (stopping) return; stopping = true; for (const child of children) if (child.exitCode === null) child.kill('SIGTERM'); }
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, stop);
for (const child of children) { child.on('error', error => { console.error(error.message); process.exitCode = 1; stop(); }); child.on('exit', code => { if (!stopping) { process.exitCode = code ?? 1; stop(); } }); }

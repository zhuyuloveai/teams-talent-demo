import { spawn, spawnSync } from 'node:child_process';
import { mkdir, open, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { root, selectedServices, serviceHealth } from './services.mjs';
process.chdir(root);
const runNpm = args => process.env.npm_execpath ? spawnSync(process.execPath, [process.env.npm_execpath, ...args], { stdio: 'inherit' }) : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { stdio: 'inherit', shell: process.platform === 'win32' });
const selected = selectedServices(), missing = [];
for (const service of selected) if (!await serviceHealth(service)) missing.push(service);
if (missing.length) {
  if (!existsSync(join(root, 'node_modules'))) { const install = runNpm(['ci', '--no-audit', '--no-fund']); if (install.status !== 0) process.exit(install.status ?? 1); }
  const build = runNpm(['run', 'build']); if (build.status !== 0) process.exit(build.status ?? 1);
  for (const service of missing) {
    await mkdir(service.runtimeDir, { recursive: true });
    const log = await open(join(service.runtimeDir, 'server.log'), 'a', 0o600);
    const child = spawn(process.execPath, ['--import', 'tsx', join(root, service.entry)], { cwd: root, detached: true, windowsHide: true, stdio: ['ignore', log.fd, log.fd] });
    child.unref(); await log.close();
    await writeFile(join(service.runtimeDir, 'server.pid'), String(child.pid), { mode: 0o600 });
    let ready = false;
    for (let n = 0; n < 60; n++) { await new Promise(resolve => setTimeout(resolve, 250)); if (await serviceHealth(service)) { ready = true; break; } }
    if (!ready) throw new Error(service.id + ' did not finish starting; see ' + join(service.runtimeDir, 'server.log'));
  }
}
for (const service of selected) console.log(service.id + ': ' + service.origin + '/' + service.id);
if (process.platform === 'darwin' && !process.argv.includes('--no-open')) spawn('open', [selected[0].origin + '/' + selected[0].id], { stdio: 'ignore' }).unref();

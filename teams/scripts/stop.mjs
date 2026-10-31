import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { selectedServices, serviceHealth } from './services.mjs';
for (const service of selectedServices()) {
  const path = join(service.runtimeDir, 'server.pid');
  let pid;
  try { pid = Number(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') { console.log(service.id + ' has no process recorded by the launch script.'); continue; } throw error; }
  if (!Number.isSafeInteger(pid) || pid < 2) throw new Error(service.id + ' PID is invalid');
  const health = await serviceHealth(service);
  if (!health || health.pid !== pid) throw new Error(service.id + ' service is unreachable or its PID does not match, so ownership of this directory cannot be verified; no stop signal was sent and the PID file is kept for inspection');
  process.kill(pid, 'SIGTERM');
  let stopped = false;
  for (let n = 0; n < 60; n++) { try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') { stopped = true; break; } throw error; } await new Promise(resolve => setTimeout(resolve, 100)); }
  if (!stopped) throw new Error(service.id + ' has not exited yet; the PID file is kept for inspection');
  await rm(path); console.log(service.id + ' stopped.');
}

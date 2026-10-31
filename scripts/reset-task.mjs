// Cross-platform entry point; all planning, backup and mutation rules live in Teams.
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const teams = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'teams');
const args = process.argv.slice(2);
const result = spawnSync(process.execPath, ['--import', 'tsx', join(teams, 'scripts', 'reset-task.ts'), ...(args.length ? args : ['--help'])], {
  cwd: teams,
  stdio: 'inherit',
});
if (result.error) console.error('Could not run the task reset: ' + result.error.message);
else if (result.signal) console.error('Task reset was interrupted: ' + result.signal);
process.exitCode = result.status ?? 1;

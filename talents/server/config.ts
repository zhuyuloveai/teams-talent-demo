import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalConfiguration } from './local-config.ts';
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const localConfiguration = loadLocalConfiguration(root);
export const repositoryRoot = resolve(root, '..');
export const port = Number(process.env.DEMO_TALENT_PORT ?? 46980);
export const origin = 'http://127.0.0.1:' + port;
/** Teams runs separately; Talents only links back to it. */
export const teamsPort = Number(process.env.DEMO_PORT ?? 46970);
export const teamsOrigin = 'http://127.0.0.1:' + teamsPort;
export const runtimeDir = resolve(process.env.DEMO_TALENT_STATE_DIR ?? join(root, '.runtime'));
/** Exchange directory shared with Teams: Teams writes teams/, Talents writes talents/. */
export const sharedDir = resolve(process.env.DEMO_SHARED_DIR ?? join(repositoryRoot, 'shared', 'data'));
/** Committed copies of the shared files, read when the writer has not run yet. */
export const seedDir = join(repositoryRoot, 'shared', 'seed');
export const contentDir = join(root, 'content');
/** The built page (npm run build). */
export const publicDir = join(root, 'dist');
if (!Number.isSafeInteger(port) || !Number.isSafeInteger(teamsPort) || port < 1024 || port > 65535 || teamsPort < 1024 || teamsPort > 65535 || port === teamsPort) throw new Error('Teams and Talents need valid, distinct local ports');

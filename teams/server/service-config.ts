import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalConfiguration } from './local-config.ts';
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const localConfiguration = loadLocalConfiguration(root);
export const materialRoot = resolve(process.env.DEMO_MATERIAL_ROOT ?? join(root, '..'));
export const workspace = join(materialRoot, 'workspace');
export const runtimeDir = resolve(process.env.DEMO_STATE_DIR ?? join(root, '.runtime'));
export const sessionId = '6b82c08d-eb3b-4bdc-b373-54fed16a7fcd';
export const port = Number(process.env.DEMO_PORT ?? 46970);
export const origin = 'http://127.0.0.1:' + port;
export const talentPort = Number(process.env.DEMO_TALENT_PORT ?? 46980);
export const talentOrigin = 'http://127.0.0.1:' + talentPort;
/** Exchange directory shared with Talents: Teams writes teams/, Talents writes talents/. */
export const sharedDir = resolve(process.env.DEMO_SHARED_DIR ?? join(root, '..', 'shared', 'data'));
/** Committed copies of the shared files, read when the other project has not written its own yet. */
export const sharedSeedDir = resolve(process.env.DEMO_SHARED_SEED_DIR ?? join(root, '..', 'shared', 'seed'));
// Development session trajectories: the trace_server bundled with the demo (Python/uvicorn, file storage)
export const traceServerRoot = join(root, 'trace-server');
export const tracePort = Number(process.env.DEMO_TRACE_PORT ?? 8013);
export const traceOrigin = 'http://127.0.0.1:' + tracePort;
// Defaults to trace-server/trace_data: the query side and the OTLP receiver read and write the same directory
export const traceDataDir = resolve(process.env.DEMO_TRACE_DATA_DIR ?? join(traceServerRoot, 'trace_data'));
if (!Number.isSafeInteger(port) || !Number.isSafeInteger(talentPort) || port < 1024 || port > 65535 || talentPort < 1024 || talentPort > 65535) throw new Error('Teams / Talents need valid local ports');
if (port === talentPort) throw new Error('Teams / Talents must use different ports');

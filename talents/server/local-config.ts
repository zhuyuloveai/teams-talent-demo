import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

// Same file format as teams/.local/config.json, so one file can serve both services.
// Keys only Teams uses are accepted and ignored here.
const pathKeys = new Set(['DEMO_TALENT_STATE_DIR', 'DEMO_SHARED_DIR', 'DEMO_MATERIAL_ROOT', 'DEMO_STATE_DIR', 'DEMO_ICODE_BINARY', 'DEMO_ICODE_PYTHON', 'DEMO_OPENCODE_BINARY', 'DEMO_TRACE_PYTHON', 'DEMO_TRACE_DATA_DIR']);
const portKeys = new Set(['DEMO_PORT', 'DEMO_TALENT_PORT', 'DEMO_TRACE_PORT']);
/** Local machine configuration is optional. Invalid present files always fail explicitly. */
export function loadLocalConfiguration(root: string, environment: NodeJS.ProcessEnv = process.env) {
  const file = environment.DEMO_LOCAL_CONFIG ?? join(root, '.local', 'config.json');
  if (!isAbsolute(file)) throw new Error('DEMO_LOCAL_CONFIG must be an absolute path');
  let text: string;
  try { text = readFileSync(file, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT' && environment.DEMO_LOCAL_CONFIG === undefined) return { file, loaded: false }; throw error; }
  let values: unknown;
  try { values = JSON.parse(text); } catch { throw new Error('Invalid local configuration JSON: ' + file); }
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Local configuration must be a key-value object: ' + file);
  for (const [key, value] of Object.entries(values)) {
    if (pathKeys.has(key)) {
      if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0')) throw new Error('Local configuration ' + key + ' must be an absolute path');
    } else if (portKeys.has(key)) {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1024 || value > 65535) throw new Error('Local configuration ' + key + ' must be an integer from 1024 to 65535');
    } else if (key === 'DEMO_TRACE_ENDPOINT') {
      if (typeof value !== 'string') throw new Error('DEMO_TRACE_ENDPOINT must be a local trace receiver address');
      let url: URL; try { url = new URL(value); } catch { throw new Error('DEMO_TRACE_ENDPOINT is not a valid address'); }
      if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.pathname !== '/v1/traces' || url.username || url.password || url.search || url.hash) throw new Error('DEMO_TRACE_ENDPOINT must be a local HTTP /v1/traces address');
    } else throw new Error('Unknown local configuration key: ' + key);
  }
  for (const [key, value] of Object.entries(values)) if (environment[key] === undefined) environment[key] = String(value);
  return { file, loaded: true };
}

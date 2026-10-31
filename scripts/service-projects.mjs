import { join, resolve } from 'node:path';
import { loadLocalConfiguration as loadTeams } from '../teams/server/local-config.ts';
import { loadLocalConfiguration as loadTalents } from '../talents/server/local-config.ts';

// Each service loads its own config; the retired Talent state path in Teams must
// never become the new Talents service's state directory by environment leakage.
export function configuredProjects(root, environment = process.env) {
  const definitions = [
    { id: 'teams', app: 'teams-talent-carddemo', portKey: 'DEMO_PORT', defaultPort: 46970, stateKey: 'DEMO_STATE_DIR', load: loadTeams },
    { id: 'talents', app: 'talents-carddemo', portKey: 'DEMO_TALENT_PORT', defaultPort: 46980, stateKey: 'DEMO_TALENT_STATE_DIR', load: loadTalents },
  ];
  const projects = definitions.map(({ load, portKey, defaultPort, stateKey, ...definition }) => {
    const dir = join(root, definition.id), env = { ...environment };
    load(dir, env);
    const port = Number(env[portKey] ?? defaultPort);
    if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error(`${definition.id} port is invalid`);
    return { ...definition, dir, env, port, page: '/' + definition.id, stateRoot: resolve(env[stateKey] ?? join(dir, '.runtime')) };
  });
  if (projects[0].port === projects[1].port) throw new Error('Teams and Talents must use different ports');
  return projects;
}

export async function projectHealth(project, request = fetch) {
  try {
    const response = await request(`http://127.0.0.1:${project.port}/api/health`, { signal: AbortSignal.timeout(1000) });
    if (!response.ok) throw new Error(`The service on port ${project.port} reported an unexpected status`);
    const data = await response.json();
    if (data.app !== project.app || data.workspaceRoot !== project.dir || data.stateRoot !== project.stateRoot || !Number.isSafeInteger(data.pid) || data.pid < 2) {
      throw new Error(`Port ${project.port} is used by another directory or service; not taken over`);
    }
    return data;
  } catch (error) { if (error.cause?.code === 'ECONNREFUSED') return null; throw error; }
}

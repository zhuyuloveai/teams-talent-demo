import { origin, runtimeDir, root } from '../server/service-config.ts';
export { root };

export const services = [
  { id: 'teams', origin, runtimeDir, entry: 'server/index.ts', app: 'teams-talent-carddemo' },
];
export function selectedServices() { return services; }
export async function serviceHealth(service) {
  try {
    const response = await fetch(service.origin + '/api/health', { signal: AbortSignal.timeout(1000) });
    if (!response.ok) throw new Error(service.origin + ' is already used by another service');
    const data = await response.json();
    if (data.app !== service.app) throw new Error(service.origin + ' is already used by another service');
    if (data.workspaceRoot !== root || data.stateRoot !== service.runtimeDir) throw new Error(service.origin + ' is served from another directory or by an older service and was not taken over; choose another DEMO_PORT');
    return data;
  } catch (error) { if (error.cause?.code === 'ECONNREFUSED') return null; throw error; }
}

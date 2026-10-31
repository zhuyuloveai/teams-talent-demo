import { DomainError } from './domain.js';
import type { Asset } from './workspace.js';
import { validateProjectAssets } from './project-asset-links.js';

export interface CreatedProjectFields {
  name: string;
  description: string;
  remoteUrl: string;
  repositoryIdentity: string;
}
export interface CreatedProject extends CreatedProjectFields {
  id: string;
  teamId: string;
  owner: 'owner';
  createdAt: string;
  updatedAt: string;
  assets?: Asset[];
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function required(value: unknown, label: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\r\n\u0000]/.test(value)) throw new DomainError(`${label} must not be empty or has an invalid format`, 400);
  return value.trim();
}
export function createdProjectFields(payload: Record<string, unknown>): CreatedProjectFields {
  if (typeof payload.description !== 'string' || payload.description.length > 1500 || payload.description.includes('\u0000')) throw new DomainError('Invalid project description format', 400);
  return { name: required(payload.name, 'Project name', 80), description: payload.description.trim(), remoteUrl: required(payload.remoteUrl, 'Repository URL', 500), repositoryIdentity: required(payload.repositoryIdentity, 'Repository identity', 200) };
}
export function createdProjectId(value: unknown): string {
  if (typeof value !== 'string' || !uuid.test(value)) throw new DomainError('Invalid project ID', 400);
  return value;
}
/** Missing projects is the explicit pre-create state. Present but invalid data must fail. */
export function validateCreatedProjects(value: unknown): asserts value is CreatedProject[] {
  if (!Array.isArray(value)) throw new Error('Created project list is corrupted; not overwritten automatically');
  const ids = new Set<string>();
  for (const project of value) {
    if (!project || typeof project !== 'object') throw new Error('Created project record is corrupted; not overwritten automatically');
    createdProjectId(project.id); createdProjectFields(project);
    if (Object.hasOwn(project, 'assets')) validateProjectAssets(project.assets);
    if (ids.has(project.id) || typeof project.teamId !== 'string' || !project.teamId || project.owner !== 'owner' || typeof project.createdAt !== 'string' || !Number.isFinite(Date.parse(project.createdAt)) || typeof project.updatedAt !== 'string' || !Number.isFinite(Date.parse(project.updatedAt))) throw new Error('Created project record is corrupted; not overwritten automatically');
    ids.add(project.id);
  }
}
export const createdProjectRoute = (id: string, tab = 'content') => 'projects?' + new URLSearchParams({ project: id, tab }).toString();

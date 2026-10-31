import { DomainError, type DemoState, type Role } from './domain.js';
import { projectMembers } from './teams-domain.js';

export function creationText(value: unknown, label: string, limit: number, multiline = false): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/ : /[\u0000-\u001f]/).test(value)) throw new DomainError(label + ' must not be empty or has an invalid format', 400);
  return value.trim();
}
export function requireProjectCreator(state: DemoState, role: Role, projectId: string) {
  if (role !== 'owner') throw new DomainError('Only the Owner can create or assign project tasks', 403);
  if (!['carddemo', 'teams'].includes(projectId) && !state.workspace.projects?.some(project => project.id === projectId)) throw new DomainError('Project not found', 404);
  if (!projectMembers(state, projectId).some(member => member.id === role && member.role === 'owner' && member.status === 'active')) throw new DomainError('The current identity is not allowed to manage this project', 403);
}
export function optionalAssignee(state: DemoState, projectId: string, value: unknown): string {
  if (value === undefined || value === '') return '';
  const id = creationText(value, 'Assignee', 100);
  if (!projectMembers(state, projectId).some(member => member.id === id && member.status === 'active')) throw new DomainError('Select an active project member', 400);
  return id;
}
export function optionalDue(value: unknown): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new DomainError('Invalid planned completion date', 400);
  return value;
}

import { DomainError, type DemoState, type Role } from './domain.js';
import { creationText, optionalAssignee, requireProjectCreator } from './task-creation.js';

export const issueSeverityLabels = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' } as const;
export interface ProjectIssue {
  id: string; projectId: string; title: string; description: string; severity: keyof typeof issueSeverityLabels;
  assigneeId: string; status: 'open'; source: 'teams'; createdAt: string; updatedAt: string; creationRequest: string;
}
export function createProjectIssue(state: DemoState, role: Role, input: Record<string, unknown>, at: string) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new DomainError('Invalid issue content', 400);
  const projectId = creationText(input.projectId, 'Project', 100); requireProjectCreator(state, role, projectId);
  const id = creationText(input.id, 'Issue ID', 100);
  if (!/^ISSUE-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new DomainError('Invalid issue ID', 400);
  if (typeof input.severity !== 'string' || !Object.hasOwn(issueSeverityLabels, input.severity)) throw new DomainError('Select a valid severity', 400);
  const fields = { id, projectId, title: creationText(input.title, 'Issue title', 160), description: creationText(input.description, 'Issue description', 4000, true), severity: input.severity as ProjectIssue['severity'], assigneeId: optionalAssignee(state, projectId, input.assigneeId) };
  const creationRequest = JSON.stringify(fields), existing = state.workspace.projectIssues?.find(item => item.id === id && item.projectId === projectId);
  if (existing) { if (existing.creationRequest !== creationRequest) throw new DomainError('The same issue ID cannot be used for different creation content', 409); return existing; }
  const issue: ProjectIssue = { ...fields, creationRequest, status: 'open', source: 'teams', createdAt: at, updatedAt: at };
  state.workspace.projectIssues = [...state.workspace.projectIssues ?? [], issue]; return issue;
}
export function validateProjectIssues(state: DemoState) {
  if (state.workspace.projectIssues === undefined) return;
  if (!Array.isArray(state.workspace.projectIssues)) throw new Error('Invalid local issue list');
  const ids = new Set<string>();
  for (const issue of state.workspace.projectIssues) {
    if (!issue || ids.has(issue.projectId + '/' + issue.id) || issue.source !== 'teams' || issue.status !== 'open' || !Number.isFinite(Date.parse(issue.createdAt)) || !Number.isFinite(Date.parse(issue.updatedAt))) throw new Error('Invalid local issue record; not overwritten automatically');
    const clone = structuredClone(state); clone.workspace.projectIssues = [];
    const normalized = createProjectIssue(clone, 'owner', issue as unknown as Record<string, unknown>, issue.createdAt);
    if (normalized.creationRequest !== issue.creationRequest) throw new Error('Invalid local issue creation basis');
    ids.add(issue.projectId + '/' + issue.id);
  }
}

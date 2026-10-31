import { projectMembers } from './teams-domain.js';
import type { DemoState, Role } from './domain.js';
import { DomainError } from './domain.js';

export interface GenericTask {
  id: string; projectId: string; title: string; description: string; assigneeId: string | null;
  due: string | null; status: 'pending' | 'active' | 'completed'; result: string;
  createdAt: string; updatedAt: string;
}
export const genericTaskLabels = { pending: 'Not started', active: 'In progress', completed: 'Completed' };
export type GenericTaskAction = 'task.create' | 'task.assign' | 'task.start' | 'task.complete';
const taskIdPattern = /^GT-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const validDate = (value: unknown) => value === null || typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
function need(ok: unknown, message: string): asserts ok { if (!ok) throw new DomainError(message); }
function value(input: Record<string, unknown>, key: string, max: number, required = false) {
  const raw = input[key]; need(typeof raw === 'string' && raw.trim().length <= max && (!required || raw.trim().length > 0), key + ' is invalid'); return raw.trim();
}
export function updateGenericTask(state: DemoState, role: Role, action: GenericTaskAction, input: Record<string, unknown>, at: string): string {
  const projectId = value(input, 'projectId', 100, true);
  need(projectId !== 'teams' && (projectId === 'carddemo' || state.workspace.projects?.some(project => project.id === projectId)), 'This project does not support changing local general tasks');
  const tasks = state.workspace.genericTasks ?? [];
  const id = value(input, 'id', 100, true);
  const assignee = () => { const id = input.assigneeId === null || input.assigneeId === '' ? null : value(input, 'assigneeId', 100, true); need(id === null || projectMembers(state, projectId).some(member => member.id === id && member.status === 'active'), 'Select an active member of the current team'); return id; };
  if (action === 'task.create') {
    need(role === 'owner', 'Only the Owner can create general tasks'); need(taskIdPattern.test(id) && !tasks.some(task => task.id === id), 'Task ID is invalid or already exists');
    const due = input.due === '' || input.due === null ? null : value(input, 'due', 10, true);
    need(validDate(due), 'Invalid planned completion date');
    state.workspace.genericTasks = [...tasks, { id, projectId, title: value(input, 'title', 120, true), description: value(input, 'description', 3000), assigneeId: assignee(), due, status: 'pending', result: '', createdAt: at, updatedAt: at }];
    return 'Create general task';
  }
  const task = tasks.find(task => task.id === id && task.projectId === projectId); need(task, 'General task not found');
  if (action === 'task.assign') { need(role === 'owner', 'Only the Owner can assign general tasks'); need(task.status === 'pending', 'The task has started; the owner cannot be changed'); task.assigneeId = assignee(); task.updatedAt = at; return 'Assign general task'; }
  need(task.assigneeId === role && projectMembers(state, projectId).some(member => member.id === role && member.status === 'active'), 'Only the assigned member can work on this task');
  if (action === 'task.start') { need(task.status === 'pending', 'This task cannot be started twice'); task.status = 'active'; task.updatedAt = at; return 'Start general task'; }
  need(task.status === 'active', 'Start working on this task first'); task.result = value(input, 'result', 3000, true); task.status = 'completed'; task.updatedAt = at; return 'Complete general task';
}
export function validateGenericTasks(state: DemoState) {
  if (!Object.hasOwn(state.workspace, 'genericTasks')) return;
  const tasks = state.workspace.genericTasks;
  const text = (value: unknown, max: number, required = false) => typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0);
  if (!Array.isArray(tasks) || new Set(tasks.map(task => task?.id)).size !== tasks.length || tasks.some(task =>
    !task || typeof task.id !== 'string' || !taskIdPattern.test(task.id)
    || !(task.projectId === 'carddemo' || state.workspace.projects?.some(project => project.id === task.projectId))
    || !text(task.title, 120, true) || !text(task.description, 3000) || !text(task.result, 3000, task.status === 'completed')
    || !['pending', 'active', 'completed'].includes(task.status) || task.assigneeId !== null && typeof task.assigneeId !== 'string'
    || !validDate(task.due) || typeof task.createdAt !== 'string' || typeof task.updatedAt !== 'string'
  )) throw new Error('Invalid general task records; not overwritten automatically');
}

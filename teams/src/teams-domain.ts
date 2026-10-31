import { DomainError, type DemoState, type Role } from './domain.js';

export interface TeamMember { id: string; name: string; role: Role; status: 'active' | 'invited' }
export interface TeamRecord { id: string; name: string; members: TeamMember[]; createdAt?: string }
export type TeamAction = 'team.create' | 'team.update' | 'team.project.assign' | 'member.invite' | 'member.approve' | 'member.role' | 'member.remove';
export const defaultTeamId = 'carddemo';
const teamIdPattern = /^team-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const need: (ok: unknown, message: string, status?: number) => asserts ok = (ok, message, status = 400) => { if (!ok) throw new DomainError(message, status); };
const clean = (value: unknown, label: string, max: number) => { need(typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f]/.test(value), label + ' must not be empty or has an invalid format'); return value.trim(); };
export const teamName = (value: unknown) => clean(value, 'Team name', 80);
const folded = (value: string) => value.normalize('NFKC').toLocaleLowerCase();
/** The original single team remains authoritative. Absent extra teams means the old schema, not a rewrite. */
export function allTeams(state: DemoState): TeamRecord[] { return [{ ...state.workspace.team, id: defaultTeamId }, ...(state.workspace.teams ?? [])]; }
export function findTeam(state: DemoState, teamId: string): TeamRecord { const team = allTeams(state).find(item => item.id === teamId); need(team, 'Team not found'); return team; }
export function projectTeam(state: DemoState, projectId: string): TeamRecord {
  if (projectId === 'carddemo') return findTeam(state, state.workspace.projectTeamId ?? defaultTeamId);
  const project = state.workspace.projects?.find(item => item.id === projectId); need(project, 'This project has no local team assignment that can be changed'); return findTeam(state, project.teamId);
}
/** New local work in the imported project uses local identities; source A/B/C remain unmodified. */
export const projectMembers = (state: DemoState, projectId: string) => projectId === 'teams' ? state.workspace.team.members.filter(member => member.id === 'owner' || member.id === 'member') : projectTeam(state, projectId).members;
export const visibleTeams = (state: DemoState, role: Role) => allTeams(state).filter(team => team.members.some(member => member.id === role && member.status === 'active'));
export function requireTeamOwner(state: DemoState, role: Role, teamId: string) { const team = findTeam(state, teamId); need(role === 'owner' && team.members.some(member => member.id === role && member.role === 'owner' && member.status === 'active'), 'The current role is not allowed to manage this team', 403); return team; }
export function teamProjects(state: DemoState) {
  return [{ id: 'carddemo', name: state.workspace.project.name, description: state.workspace.project.description, teamId: projectTeam(state, 'carddemo').id }, ...(state.workspace.projects ?? []).map(project => ({ id: project.id, name: project.name, description: project.description, teamId: project.teamId }))];
}
function assignedIds(state: DemoState, projectId: string) {
  const ids = (state.workspace.genericTasks ?? []).filter(task => task.projectId === projectId && task.assigneeId).map(task => task.assigneeId!);
  ids.push(...(state.workspace.projectIssues??[]).filter(issue=>issue.projectId===projectId&&issue.assigneeId).map(issue=>issue.assigneeId));
  ids.push(...(state.workspace.deliveryRequirements ?? []).filter(task => task.projectId === projectId && task.assigneeId).map(task => task.assigneeId));
  if (projectId === 'carddemo' && state.assigned && !state.workspace.deliveryRequirements?.some(task=>task.projectId===projectId&&task.id==='DEMO-MKT-001')) ids.push(state.assigneeId === undefined ? 'member' : state.assigneeId!);
  return new Set(ids);
}
export function updateTeam(state: DemoState, role: Role, action: TeamAction, input: Record<string, unknown>, at: string) {
  need(role === 'owner', 'The current role is not allowed to perform this action', 403);
  if (action === 'team.create') {
    const id = clean(input.id, 'Team ID', 100), name = teamName(input.name);
    need(teamIdPattern.test(id) && !allTeams(state).some(team => team.id === id), 'Team ID is invalid or already exists');
    need(!allTeams(state).some(team => folded(team.name) === folded(name)), 'Team name already exists'); need(allTeams(state).length < 30, 'Team limit reached');
    const creator = state.workspace.team.members.find(member => member.id === role); need(creator && creator.status === 'active' && creator.role === 'owner', 'Invalid creator identity', 403);
    state.workspace.teams = [...(state.workspace.teams ?? []), { id, name, members: [{ ...creator }], createdAt: at }]; return 'Create team';
  }
  const teamId = clean(input.teamId, 'Team scope', 100), team = requireTeamOwner(state, role, teamId);
  // Default team fields are mutated on their original object; other teams are stored directly.
  const target = teamId === defaultTeamId ? state.workspace.team : state.workspace.teams!.find(item => item.id === teamId)!;
  if (action === 'team.update') { const name = teamName(input.name); need(!allTeams(state).some(item => item.id !== teamId && folded(item.name) === folded(name)), 'Team name already exists'); target.name = name; return 'Update team info'; }
  if (action === 'team.project.assign') {
    const projectId = clean(input.projectId, 'Project ID', 100), source = projectTeam(state, projectId);
    requireTeamOwner(state, role, source.id); need(input.fromTeamId === source.id, 'The project team has changed; refresh and confirm again'); need(source.id !== teamId, 'The project already belongs to this team');
    need([...assignedIds(state, projectId)].every(id => team.members.some(member => member.id === id && member.status === 'active')), 'Add the existing project assignees to the target team before linking the project');
    if (projectId === 'carddemo') state.workspace.projectTeamId = teamId;
    else { const project = state.workspace.projects!.find(item => item.id === projectId)!; project.teamId = teamId; project.updatedAt = at; }
    return 'Change project team';
  }
  if (action === 'member.invite') {
    let member: TeamMember;
    if (input.memberId !== undefined) { const known = allTeams(state).flatMap(item => item.members).find(item => item.id === input.memberId && item.status === 'active'); need(known, 'The selected member does not exist'); member = { ...known, role: 'member', status: 'invited' }; }
    else { const name = clean(input.name, 'Member name', 40); need(!allTeams(state).some(item => item.members.some(person => folded(person.name) === folded(name))), 'A member with this name already exists; choose from existing members'); member = { id: 'member-' + (state.revision + 1), name, role: 'member', status: 'invited' }; }
    need(!team.members.some(item => item.id === member.id || folded(item.name) === folded(member.name)), 'This member is already in the team or the invitation list'); need(team.members.length < 50, 'Team member limit reached'); target.members.push(member); return 'Create member invitation';
  }
  const member = target.members.find(item => item.id === input.id); need(member, 'Member or invitation record not found');
  if (action === 'member.approve') { need(member.status === 'invited', 'Invitation record not found'); member.status = 'active'; return 'Confirm member joined'; }
  need(member.id !== 'owner' && !(teamId === defaultTeamId && member.id === 'member'), 'Fixed roles cannot be changed or removed');
  need(!teamProjects(state).some(project => project.teamId === teamId && assignedIds(state, project.id).has(member.id)), 'Reassign the requirements or tasks of this member before changing their role or removing them');
  if (action === 'member.role') { need(member.id !== 'member', 'The role of a fixed member cannot be changed'); need(member.status === 'active' && (input.role === 'owner' || input.role === 'member'), 'Invalid role'); member.role = input.role; return 'Change team role'; }
  target.members = target.members.filter(item => item.id !== member.id); return 'Remove team member';
}
export function validateTeams(state: DemoState) {
  const extras = state.workspace.teams;
  need(extras === undefined || Array.isArray(extras), 'Invalid team list; not overwritten automatically');
  const ids = new Set<string>(), names = new Set<string>();
  for (const team of allTeams(state)) {
    need(team && (team.id === defaultTeamId || teamIdPattern.test(team.id)) && !ids.has(team.id), 'Team ID is invalid or duplicated'); ids.add(team.id);
    const name = teamName(team.name); need(!names.has(folded(name)), 'Duplicate team name'); names.add(folded(name));
    need(Array.isArray(team.members) && team.members.length > 0 && team.members.length <= 50, 'Invalid team member list');
    const memberIds = new Set<string>();
    for (const member of team.members) { clean(member?.id, 'Member ID', 100); clean(member.name, 'Member name', 40); need(!memberIds.has(member.id) && ['owner','member'].includes(member.role) && ['active','invited'].includes(member.status), 'Invalid team member record'); memberIds.add(member.id); }
    need(team.members.some(member => member.id === 'owner' && member.role === 'owner' && member.status === 'active'), 'Invalid team creator record');
    if (team.id !== defaultTeamId) need(typeof team.createdAt === 'string' && Number.isFinite(Date.parse(team.createdAt)), 'Invalid team creation time');
  }
  need(!Object.hasOwn(state.workspace, 'projectTeamId') || typeof state.workspace.projectTeamId === 'string', 'Invalid project team assignment');
  projectTeam(state, 'carddemo'); for (const project of state.workspace.projects ?? []) projectTeam(state, project.id);
  for (const project of teamProjects(state)) need([...assignedIds(state, project.id)].every(id => projectMembers(state, project.id).some(member => member.id === id && member.status === 'active')), 'Project assignees do not match the project team');
}

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DomainError } from '../src/domain.js';
import type { TaskWorkspace } from '../src/task-workspace.js';
import { workspaceRepositoryIdentity } from './project-workspaces.js';
import { atomicJson } from './store.js';

const execute = promisify(execFile);
const platformRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
const git = async (directory: string, args: string[]) => (await execute('git', ['-C', directory, ...args], {
  encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true,
  env: { ...gitEnv, LC_ALL: 'C', LANG: 'C' },
})).stdout.trim();
const inside = (parent: string, child: string) => { const path = relative(parent, child); return path === '' || path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path); };
const commit = (directory: string) => git(directory, ['-c', 'user.name=Teams Demo', '-c', 'user.email=teams-demo@local', 'commit', '--allow-empty', '-m', 'Initial local workspace']);

/** Validate an optional project remote without turning a missing/invalid URL into a blocker. */
function projectRemote(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { workspaceRepositoryIdentity(value.trim()); return value.trim(); } catch { return null; }
}

export async function readTaskWorkspaces(runtime: string): Promise<{ version: 1; workspaces: TaskWorkspace[] }> {
  let value: any;
  try { value = JSON.parse(await readFile(join(runtime, 'task-workspaces.json'), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, workspaces: [] }; throw error; }
  if (!value || value.version !== 1 || !Array.isArray(value.workspaces)) throw new Error('The task workspace record is corrupt; it was not overwritten automatically');
  const identities = new Set<string>();
  for (const item of value.workspaces) {
    const key = typeof item?.projectId === 'string' && typeof item?.taskId === 'string' ? item.projectId + '/' + item.taskId : '';
    if (!key || identities.has(key) || !['git', 'directory'].includes(item.mode) || !isAbsolute(item.directory ?? '') || typeof item.localOnly !== 'boolean' || item.remoteUrl !== null && typeof item.remoteUrl !== 'string' || item.baseBranch !== null && typeof item.baseBranch !== 'string' || item.baseCommit !== null && typeof item.baseCommit !== 'string' || typeof item.createdAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt)) || typeof item.note !== 'string') throw new Error('The task workspace record is corrupt; it was not overwritten automatically');
    identities.add(key);
  }
  return value;
}

export async function readTaskWorkspace(runtime: string, scope: { projectId: string; taskId: string }): Promise<TaskWorkspace | null> {
  return (await readTaskWorkspaces(runtime)).workspaces.find(item => item.projectId === scope.projectId && item.taskId === scope.taskId) ?? null;
}

/**
 * Bind one task to a folder. Existing Git repositories are used unchanged; a
 * plain folder is initialized locally (empty initial commit, no file upload).
 * If Git is unavailable or initialization fails, the folder is still usable as
 * a plain task workspace. A real project remote is optional; without it the
 * workspace is local-only and remote PR delivery is unavailable.
 */
export async function prepareTaskWorkspace(runtime: string, input: { projectId: string; taskId: string; directory: string; projectRemoteUrl?: string | null; sourceRoot?: string; mode?: 'auto' | 'directory' }): Promise<TaskWorkspace> {
  if (typeof input.directory !== 'string' || !isAbsolute(input.directory) || input.directory.includes('\0')) throw new DomainError('Enter the absolute path of the task working directory', 400);
  let canonical = await realpath(input.directory);
  if (!(await stat(canonical)).isDirectory()) throw new DomainError('The selected location is not a directory', 400);
  if (inside(platformRoot, canonical)) throw new DomainError('The task working directory must be outside the Teams project', 400);
  if (input.sourceRoot) {
    try { const source = await realpath(input.sourceRoot); if (inside(source, canonical)) throw new DomainError('This directory is the read-only Teams reference repository; choose a writable task working directory', 400); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  const project = projectRemote(input.projectRemoteUrl);
  const requestedDirectory = input.mode === 'directory';
  let mode: TaskWorkspace['mode'] = 'directory', baseBranch: string | null = null, baseCommit: string | null = null, remoteUrl: string | null = null, localOnly = true, note = '';
  let gitRoot: string | null = null;
  if (!requestedDirectory) {
    try { gitRoot = await realpath(await git(canonical, ['rev-parse', '--show-toplevel'])); } catch { gitRoot = null; }
    if (gitRoot) {
      canonical = gitRoot;
      mode = 'git';
    } else {
      try {
        await git(canonical, ['init']);
        await git(canonical, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
        await commit(canonical);
        mode = 'git'; baseBranch = 'main';
      } catch (error) {
        note = 'Git initialization did not complete; continuing as a plain task directory: ' + (error as Error).message;
      }
    }
  }
  if (mode === 'git') {
    try { baseCommit = await git(canonical, ['rev-parse', '--verify', 'HEAD']); } catch { baseCommit = null; }
    if (!baseCommit) {
      try { await git(canonical, ['symbolic-ref', 'HEAD', 'refs/heads/main']); await commit(canonical); baseBranch = 'main'; baseCommit = await git(canonical, ['rev-parse', '--verify', 'HEAD']); }
      catch (error) { mode = 'directory'; note = 'The Git repository has no usable commit; continuing as a plain task directory: ' + (error as Error).message; }
    } else {
      try { baseBranch = await git(canonical, ['symbolic-ref', '--short', 'HEAD']); } catch { baseBranch = null; }
    }
  }
  if (mode === 'git') {
    try { remoteUrl = await git(canonical, ['remote', 'get-url', 'origin']); } catch { remoteUrl = null; }
    if (remoteUrl) {
      try { localOnly = !project || workspaceRepositoryIdentity(remoteUrl) !== workspaceRepositoryIdentity(project); }
      catch { localOnly = true; note = 'The existing origin cannot be verified; continuing with local Git.'; }
    } else if (project) {
      try { await git(canonical, ['remote', 'add', 'origin', project]); remoteUrl = project; localOnly = false; }
      catch (error) { note = 'Cannot write origin; continuing with local Git: ' + (error as Error).message; }
    }
    if (!note) note = localOnly
      ? 'Using a local Git workspace. No verifiable remote is configured, so local commits are allowed but nothing is pushed and no remote PR is created.'
      : 'Using a Git workspace. The origin matches the project registration, so delivery can use the task branch.';
    if (baseBranch) note += ` Baseline ${baseBranch}${baseCommit ? '@' + baseCommit.slice(0, 12) : ''}.`;
  } else if (!note) {
    note = 'Registered a plain task directory. Git is not used, so no commit, codeVersion or remote PR can be claimed.';
  }
  const record: TaskWorkspace = {
    projectId: input.projectId, taskId: input.taskId, mode, directory: canonical, localOnly,
    remoteUrl, baseBranch, baseCommit, createdAt: new Date().toISOString(), note,
  };
  const config = await readTaskWorkspaces(runtime);
  config.workspaces = [...config.workspaces.filter(item => item.projectId !== record.projectId || item.taskId !== record.taskId), record];
  await atomicJson(join(runtime, 'task-workspaces.json'), config);
  return record;
}

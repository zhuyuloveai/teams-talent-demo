import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import type { Artifact, Submission } from './model.ts';
import { HttpError } from './model.ts';
import { publishedText } from './export.ts';
import { minerIndex, readContent } from './content.ts';
import type { TeamsSnapshot } from '../../shared/contracts.ts';

export interface SubmitTarget { repository: string; base: string; note: string; skillDirectory?: string }
export type Github = (method: string, path: string, body?: unknown) => Promise<any>;
export const github: Github = (method, path, body) => new Promise((resolve, reject) => {
  const child = spawn('gh', ['api', '--method', method, path, ...(body ? ['--input', '-'] : [])], { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', error = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { error += chunk; });
  child.on('error', reject);
  child.stdin.on('error', reject);
  child.on('close', code => code === 0 ? resolve(JSON.parse(output)) : reject(new Error(error.trim() || 'gh request failed')));
  child.stdin.end(body ? JSON.stringify(body) : undefined);
});

const pathOf = (path: string) => path.split('/').map(encodeURIComponent).join('/');
/** gh reports the HTTP status of a failed request as "(HTTP 404)". */
const status = (error: unknown, code: number) => (error as Error).message?.includes('(HTTP ' + code + ')');

function safePath(path: string) {
  if (!path || path.startsWith('/') || path.split('/').some(p => p === '..' || p === '.git') || path.includes('\\')) throw new HttpError('Invalid file path in the repository');
  return path;
}

const githubRepository = (url: string) => /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(url)?.[1] ?? null;

export interface DefaultTarget { repository: string; base: string }
/** Where a project's PRs go by default: the origin and base branch of the workspace bound to the project in Teams. */
export function defaultTarget(snapshot: TeamsSnapshot, projectId: string | null): DefaultTarget {
  const repo = snapshot.projects.find(p => p.id === projectId)?.repositories.find(r => r.path);
  if (!repo) throw new HttpError('This project has no repository bound in iCode Teams yet. Configure a workspace in the Teams project overview first.', 404);
  const repository = githubRepository(repo.remote ?? '');
  if (!repository) throw new HttpError('The origin of the project repository is not on GitHub (' + (repo.remote ?? '') + '). Fill it in manually.', 404);
  return { repository, base: repo.branch ?? 'main' };
}

export function knowledgeFiles(a: Artifact) {
  return (a.files ?? []).map(key => {
    const revision = a.draft?.revisions.filter(r => r.file === key).at(-1);
    const text = !a.draft ? publishedText(a, key) : revision?.text ?? (key === 'miner/index.md' ? minerIndex(a.specs ?? []) : readContent(key));
    if (text == null) throw new HttpError('Artifact file not found: ' + key);
    return { path: safePath('docs/knowledge/' + a.id + '/' + key), text };
  });
}

/** Creates a commit on a dedicated branch through gh; the developer's checkout is never modified.
 *  onStep is called as each step starts: 0 read the base branch, 1 check the files, 2 commit, 3 branch, 4 PR (src/components/submit-pr.tsx). */
export async function submitPullRequest(a: Artifact, target: SubmitTarget, suggestionId?: string, gh: Github = github, onStep: (step: number) => void = () => undefined): Promise<Submission> {
  const repository = target.repository.trim().replace(/^https:\/\/github.com\//, '').replace(/\.git$/, '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !target.base.trim()) throw new HttpError('Enter the GitHub repository (owner/repo) and the target branch');
  if (a.kind === 'index') throw new HttpError('A remote index does not need a PR');
  const root = 'repos/' + repository;
  // Each gh call is a round trip to GitHub, so only small responses are read and independent ones run together.
  onStep(0);
  const head = await gh('GET', root + '/git/ref/heads/' + pathOf(target.base)).catch(error => {
    throw status(error, 404) ? new HttpError('Target branch does not exist: ' + target.base) : error;
  });
  const baseSha: string = head.object.sha;
  const baseTree: Promise<string> = gh('GET', root + '/git/commits/' + baseSha).then(c => c.tree.sha);
  baseTree.catch(() => undefined); // awaited below; reading the files may fail first
  /** The file as stored, line endings included; empty when it does not exist. */
  const read = (path: string): Promise<string> => gh('GET', root + '/contents/' + pathOf(path) + '?ref=' + baseSha)
    .then(file => Buffer.from(file.content, 'base64').toString('utf8'), error => { if (status(error, 404)) return ''; throw error; });
  const lf = (text: string) => text.replace(/\r\n/g, '\n');
  // Keep a file's CRLF line endings so the PR shows only the suggested change.
  const like = (stored: string, text: string) => stored.includes('\r\n') ? lf(text).replace(/\n/g, '\r\n') : text;
  onStep(1);
  let title = a.name;
  let files: { path: string; text: string }[];
  if (suggestionId) {
    const report = JSON.parse(readContent('trajectory/' + a.topic + '/report.json') ?? '{}');
    const suggestion = report.suggestions?.find((s: any) => s.id === suggestionId);
    if (!suggestion) throw new HttpError('Suggestion not found', 404);
    title = suggestion.title;
    if (suggestion.kind === 'skill') {
      const dir = safePath(target.skillDirectory?.trim() || posix.join('.agents/skills', suggestion.skill));
      files = await Promise.all(suggestion.files.map(async (f: any) => {
        const path = safePath(posix.join(dir, safePath(f.path)));
        const before = await read(path);
        if (lf(before).trim() !== lf(f.before).trim()) throw new HttpError('The target file differs from the one the suggestion is based on. Update the diagnosis and try again: ' + path);
        return { path, text: like(before, f.after) };
      }));
    } else {
      const rules = JSON.parse(readContent('trajectory/' + a.topic + '/rules.json') ?? '{}');
      if (!rules[suggestionId]) throw new HttpError('The suggestion has no project rule');
      const path = 'AGENTS.md', before = await read(path);
      files = [{ path, text: like(before, before.trimEnd() + '\n\n<!-- Talents: ' + a.id + '/' + suggestionId + ' -->\n- ' + rules[suggestionId] + '\n') }];
    }
  } else {
    if (!a.draft && a.submission) throw new HttpError('There is no new version to submit');
    files = knowledgeFiles(a);
  }
  if (!files.length) throw new HttpError('There are no files to submit');
  const version = (a.submission?.version ?? a.published?.version ?? 0) + 1;
  const digest = createHash('sha256').update(JSON.stringify([repository, target.base, a.id, suggestionId, files])).digest('hex').slice(0, 16);
  const branch = 'talents/' + digest;
  onStep(2);
  const tree = await gh('POST', root + '/git/trees', { base_tree: await baseTree, tree: files.map(f => ({ path: f.path, mode: '100644', type: 'blob', content: f.text })) });
  const commit = await gh('POST', root + '/git/commits', { message: title, tree: tree.sha, parents: [baseSha] });
  onStep(3);
  // The branch name is stable, so an existing branch means an earlier attempt got this far: reuse its PR if it has one.
  const created = await gh('POST', root + '/git/refs', { ref: 'refs/heads/' + branch, sha: commit.sha }).then(() => true, error => { if (status(error, 422)) return false; throw error; });
  onStep(4);
  const existing = created ? [] : await gh('GET', root + '/pulls?state=all&head=' + encodeURIComponent(repository.split('/')[0] + ':' + branch));
  const url: string = existing[0]?.html_url ?? (await gh('POST', root + '/pulls', { title, head: branch, base: target.base,
    body: [target.note || title, '', 'Source: Talents · ' + a.name + (suggestionId ? ' / ' + suggestionId : ''), '', 'Changed files:', ...files.map(f => '- `' + f.path + '`')].join('\n') })).html_url;
  return { url, repository, base: target.base, branch, at: new Date().toISOString(), version, ...(suggestionId ? { suggestionId } : {}), files };
}

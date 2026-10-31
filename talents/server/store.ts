import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runtimeDir } from './config.ts';
import { HttpError, type TalentsState } from './model.ts';
import { SEED_VERSION, seedState } from './seed.ts';

export async function atomicText(path: string, value: string) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = path + '.' + randomUUID() + '.tmp';
  const file = await open(tmp, 'wx', 0o600);
  try { await file.writeFile(value); await file.sync(); } finally { await file.close(); }
  await rename(tmp, path);
}
export async function atomicJson(path: string, value: unknown) { await atomicText(path, JSON.stringify(value, null, 2) + '\n'); }

/** Seed artifacts renamed after demo data was stored: index artifacts are named for what they are, and the project
 *  document set is "Design documents" as in Teams. An artifact still carrying an old seed name takes the current name and description. */
const RENAMED: Record<string, { from: string[]; name: string; desc: string }> = {
  'a-docidx': { from: ['信用卡营销交付文档 RAG 检索', '信用卡营销交付文档检索索引', '设计文档检索索引'], name: 'Design document search index', desc: 'Searches the design documents for passages relevant to a question.' },
};
/** Seed data removed after demo data was stored: the code graph shown from an archived scan of carddemo-java-1025, and the
 *  task that stood for its build (a code graph now comes from a build in the bound repository). */
const REMOVED = { artifacts: new Set(['a-cg-java']), tasks: new Set(['t-cg-java']) };
/** A task no longer links to a removed artifact (a CodeGraph run links its task to the artifact it built when shown). */
const unlinked = (t: TalentsState['tasks'][number]) => {
  const next = { ...t };
  for (const key of ['artifact', 'produced'] as const) if (REMOVED.artifacts.has(next[key] as string)) delete next[key];
  return next;
};
const renamed = (a: TalentsState['artifacts'][number]) => {
  const r = RENAMED[a.id];
  return r?.from.includes(a.name) ? { ...a, name: r.name, desc: r.desc } : a;
};

/** Talents-owned state in <state dir>/state.json. Every change is revision-checked and written atomically. */
export class Store {
  state!: TalentsState;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(readonly path = join(runtimeDir, 'state.json')) {}
  async init() {
    let stored: TalentsState | null = null;
    try { stored = JSON.parse(await readFile(this.path, 'utf8')); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    if (stored && stored.schemaVersion === 1 && stored.seedVersion === SEED_VERSION && Number.isInteger(stored.revision) && Array.isArray(stored.artifacts)) {
      // Categories and built-in capabilities describe what Talents offers, not demo progress: always take the
      // current ones. Capabilities imported during the demo are kept.
      const { categories, capabilities } = seedState();
      this.state = { ...stored, categories, capabilities: [...capabilities, ...(stored.capabilities ?? []).filter(c => c.custom)], artifacts: stored.artifacts.filter(a => !REMOVED.artifacts.has(a.id)).map(renamed),
        tasks: stored.tasks.filter(t => !REMOVED.tasks.has(t.id as string)).map(unlinked) }; return;
    }
    if (stored) {
      // Demo data from an older seed: keep a copy, then start from the current seed.
      const backup = this.path.replace(/\.json$/, '') + '.seed-' + (stored.seedVersion ?? 'unknown') + '.json';
      await atomicJson(backup, stored);
      console.log('Talents demo data is from an older version; backed up to ' + backup + ' and restored the initial data');
    }
    this.state = seedState();
    await atomicJson(this.path, this.state);
  }
  /** Runs `operation` on the current state when `revision` matches, then stores the result with the next revision. */
  mutate(revision: number | null, operation: (state: TalentsState) => TalentsState) {
    const next = this.queue.then(async () => {
      if (revision !== null && revision !== this.state.revision) throw new HttpError('The data was updated on another page. Refresh and try again.', 409);
      const state = { ...operation(this.state), revision: this.state.revision + 1 };
      await atomicJson(this.path, state); this.state = state; return state;
    });
    this.queue = next.catch(() => undefined); return next;
  }
  reset() { return this.mutate(null, () => seedState()); }
}

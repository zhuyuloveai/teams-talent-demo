// Simulated task runs. A run lasts `seconds`; its steps and log lines are revealed as time passes.
// Logs follow the real engines' output (Talents engines/, the trajectory analyser in bank-report-handoff);
// nothing is executed. Finishing a run produces (or updates) an artifact.
// CodeGraph is the exception: it is built for real by the service in the repository bound in Teams.
import type { Artifact, Capability, Draft, RunPlan, Session, Source, TalentsState, Task } from '../types.ts';
import { content } from '../content.ts';
import { hashId, now, num, uid, versionLabel } from './format.ts';
import { basisOf, capability, changesSince, latestVersion, minerFiles, session, source, sourceState } from './model.ts';
import { engineOf, operationText } from './engine.ts';
import { report } from './suggestions.ts';


/** Capabilities whose runs the service executes for real (CodeGraph); the others are simulated here. */
export const runsOnService = (cap: string) => cap === 'codegraph';

/** The artifact a run of this task would build or update (same level, same capability on the same input);
 *  every diagnosis run makes a new one. */
export function existingArtifact(st: TalentsState, t: Pick<Task, 'projectId' | 'cap' | 'sources' | 'sessions'>) {
  return st.artifacts.find(x => {
    if (x.projectId !== t.projectId) return false;
    if (x.cap !== t.cap && !(t.cap === 'miner-diff' && x.cap === 'miner-pr')) return false;
    if (t.cap === 'traj') return false;
    return x.sources[0] === t.sources[0];
  }) ?? null;
}

/** Builds a plan step by step: each step starts at the log line written next, so progress follows the log. */
function planner() {
  const steps: string[] = [], logs: string[] = [], marks: number[] = [];
  return {
    step(name: string) { steps.push(name); marks.push(logs.length); },
    log(...lines: string[]) { logs.push(...lines); },
    done(seconds: number): RunPlan { return { seconds, steps, logs, marks }; },
  };
}
const K = '[icode-knowledge]';
const short = (sha?: string | null) => (sha ?? '').slice(0, 7);
/** What Talents writes before handing over to the engine: the execution, the prepared source, the input file. */
function preamble(log: (...l: string[]) => void, cap: Capability, t: Task, src: Source | null, update: boolean) {
  const exec = hashId('exec:' + t.id + ':' + (t.lastRun ?? ''), 8);
  log(K + ' execution ' + exec + ': ' + cap.name + (update ? ' update' : ' build') + (cap.version ? ' (definition version ' + cap.version + ')' : ''));
  if (src?.type === 'repo') log(K + ' preparing repository ' + src.name + ': checking out ' + (src.branch ?? 'main') + ', fast-forwarding to ' + short(src.commit?.sha));
  if (src?.type === 'docs') log(K + ' checking document source ' + src.name + ': ' + (src.files ?? 0) + ' files, using the snapshot of ' + versionLabel(latestVersion(src)));
  log(K + ' writing input file runs/' + exec + '/input.json');
  return exec;
}

export function runPlan(st: TalentsState, t: Task): RunPlan {
  const cap = capability(st, t.cap), src = source(st, t.sources[0]);
  const sid = hashId(t.id || 'task');
  const update = !!(t.mode === 'update' && t.input);
  const ch = update && src ? changesSince(src, src.type === 'docs' ? { version: t.input!.from } : { commit: t.input!.from }) : null;
  const p = planner();
  if (t.cap === 'traj') return trajPlan(st, t, sid);
  if (cap.custom) return customPlan(st, t, cap, src, update, sid);

  // A CodeGraph build runs on the service (server/codegraph-runs.ts); its task keeps the real log.
  if (runsOnService(t.cap)) return p.done(0);
  if (t.cap === 'doc-index') {
    const P = '[icode-knowledge-rag]', touched = ch ? (ch.added?.length ?? 0) + (ch.modified?.length ?? 0) : 0;
    p.step('Self-check');
    preamble(p.log, cap, t, src, update);
    p.log(K + ' self-check: python3 scripts/run.py --check', P + ' self-check passed: icode-docs-rag 0.4.2, embedding model bge-m3 available');
    p.step(update ? 'Process changed documents' : 'Chunk and build index');
    p.log(P + ' document version: ' + versionLabel(latestVersion(src)) + '; last build: ' + (update ? versionLabel(t.input!.from) : 'none'));
    if (update) p.log(P + ' document changes: ' + (ch?.text || 'none'), P + ' chunked ' + touched + ' documents into ' + touched * 46 + ' chunks',
      P + ' computing embeddings: bge-m3, 1,024 dimensions, ' + touched * 46 + ' chunks', P + ' updating BM25 inverted index',
      ch?.removed?.length ? P + ' removed chunks of ' + ch.removed.length + ' deleted documents' : P + ' no chunks to remove');
    else p.log(P + ' read ' + (src?.files ?? 0) + ' documents', P + ' chunked by heading level into 1,146 chunks', P + ' computing embeddings: bge-m3, 1,024 dimensions', P + ' building BM25 inverted index');
    p.step('Validate');
    p.log(P + ' spot-checked 20 questions: hit rate 95%', P + ' done: index validated, ' + (src?.files ?? 0) + ' documents', K + ' process exited with code 0');
    return p.done(update ? 7 : 9);
  }
  if (t.cap === 'miner-pr' || t.cap === 'miner-diff') {
    const diff = t.cap === 'miner-diff', skill = 'icode-' + t.cap, run = '.icode-knowledge/miner/.runs/' + hashId(sid, 8);
    const prs = (st.prs[t.sources[0]] ?? []).filter(x => t.prs?.includes(x.number));
    p.step('Prepare input');
    preamble(p.log, cap, t, src, false);
    p.log('• iCode: ' + agentName(st, t) + ' ready, session ' + sid, '→ skill  ' + skill, '→ script  ' + skill + '/scripts/prepare_input.py --input-file input.json', '  ✓ 0.1s',
      '  Input for this run:', '  - Pattern description: ' + (t.name || 'not given; derived from the ' + (diff ? 'code snippets' : 'PRs') + ' in stage 3'),
      '  - Repository: ' + (src?.path ?? '') + ' (branch ' + (src?.branch ?? 'main') + ', commit ' + short(src?.commit?.sha) + ')',
      ...(diff ? ['  - Code snippets: ' + run + '/input/snippets/'] : ['  - PRs: the input of each PR is under ' + run + '/input/prs/<number>',
        ...prs.map(x => '    - #' + x.number + ' "' + x.title + '"')]),
      '  Output: run directory ' + run + ', artifact directory .icode-knowledge/miner');
    p.step(diff ? 'Analyze code snippets' : 'Analyze code changes');
    if (diff) p.log('→ read   ' + run + '/input/spec_desc.txt', '→ read   ' + run + '/input/snippets/01-*.patch');
    else prs.forEach(x => p.log('→ read   ' + run + '/input/prs/' + x.number + '/description.md', '→ read   ' + run + '/input/prs/' + x.number + '/files.md', '→ read   ' + run + '/input/prs/' + x.number + '/diff.patch (lines 1-240)'));
    p.log('→ resource  ' + skill + '/assets/analyzer_template.md', 'More context needed: reading the domain objects and application services of the related service.',
      '→ grep   class .*Service in services/', '→ read   services/marketing-service/src/main/java/com/carddemo/marketing/application/RewardEvaluationService.java',
      '→ write  ' + run + '/analyzer.md');
    p.step('Summarize and archive pattern');
    p.log('→ resource  ' + skill + '/assets/summarizer_template.md', '→ write  ' + run + '/summary.md', '→ write  ' + run + '/naming.json',
      '→ script  ' + skill + '/scripts/archive_spec.py ' + run, '  ✓ 0.1s', '  Archived: .icode-knowledge/miner/' + (t.name || '<pattern name>'),
      '✓ Done · ' + (17 + prs.length * 3) + ' tool calls · session ' + sid, K + ' process exited with code 0');
    return p.done(14);
  }
  // doc-extract (Skill)
  p.step(update ? 'Read document changes' : 'Read documents');
  preamble(p.log, cap, t, src, update);
  p.log('• iCode: ' + agentName(st, t) + ' ready, session ' + sid, '→ skill  doc-knowledge-extract', '→ script  doc-knowledge-extract/scripts/prepare_input.py --input-file input.json', '  ✓ 0.2s',
    '  Input for this run: document set "' + (src?.name ?? '') + '" ' + versionLabel(latestVersion(src)) + ', ' + (src?.files ?? 0) + ' files' + (update ? '; the previous artifact and the document changes' : ''));
  if (update) {
    p.log('Reading document changes (' + versionLabel(t.input!.from) + ' → ' + versionLabel(t.input!.to) + '): ' + (ch?.text || 'no changes'));
    [...(ch?.added ?? []), ...(ch?.modified ?? [])].forEach(f => p.log('→ read   ' + f));
    (ch?.removed ?? []).forEach(f => p.log('Deleted: ' + f + '; marking the knowledge entries that cite it'));
    p.step('Revise affected knowledge');
    const prev = existingArtifact(st, t), outs = prev ? (prev.files ?? []).filter(f => !/index\.md$/.test(f)).map(f => f.split('/').pop()!) : [];
    if (src?.fromTeams) p.log('→ read   previous Business Rules Catalog.md', '→ edit   Business Rules Catalog.md: add the cashback rules from the new documents', '→ edit   Ubiquitous Language Glossary.md: add new terms', '→ edit   Data Dictionary.md: add new fields');
    else outs.forEach(f => p.log('→ read   previous ' + f, '→ edit   ' + f + ': revise the entries affected by these documents'));
  } else {
    (src?.tree ?? []).flatMap(g => g.files.map(f => (g.dir ? g.dir + '/' : '') + f)).slice(0, 6).forEach(f => p.log('→ read   ' + f));
    p.step('Extract knowledge');
    p.log('→ write  Business Rules Catalog.md', '→ write  Data Dictionary.md', '→ write  Ubiquitous Language Glossary.md');
  }
  p.step('Organize artifact');
  p.log('→ write  index.md', '✓ Done, session ' + sid, K + ' process exited with code 0');
  return p.done(12);
}
const agentName = (st: TalentsState, t: Task) => st.agents.find(a => a.id === (t.agent ?? st.agents[0]?.id))?.name ?? 'Code Agent';

// ---------- Trajectory insights ----------
// The analyser (icode-traj-logic-analyser, recipe generalization-zh-vis) unfolds each session, parses it into spans,
// compresses and labels them, generalises the trace with an evidence ledger, then diagnoses and renders the report.
// The prepared session has the numbers of its real run; other sessions get numbers in proportion to their size.
const REAL = { spans: 1558, raw: 2155, delegations: 27, truncated: 353, leaves: 1512, mechanical: 1361, batches: 137, stages: 3, evidence: 2824, links: 3749, nodes: 628, reviewed: 133 };
function trajNumbers(st: TalentsState, s: Session | null) {
  if (s && Object.values(st.trajTopics).some(x => x.session === s.id)) return REAL;
  const spans = Math.max(180, Math.round((s?.messages || (s?.turns ?? 20) * 12) * 2.4)), leaves = Math.round(spans * 0.97);
  return { spans, raw: Math.round(spans * 1.38), delegations: Math.round((s?.turns ?? 20) / 4), truncated: Math.round(spans * 0.22), leaves, mechanical: Math.round(leaves * 0.9),
    batches: Math.ceil(leaves / 11), stages: Math.min(6, 2 + Math.round((s?.turns ?? 20) / 30)), evidence: Math.round(spans * 1.8), links: Math.round(spans * 2.4), nodes: Math.round(spans * 0.4), reviewed: Math.round(spans * 0.085) };
}
function trajPlan(st: TalentsState, t: Task, sid: string): RunPlan {
  const p = planner(), ids = t.sessions ?? [], n = ids.length, cap = capability(st, 'traj');
  const ws = 'runs/' + hashId('exec:' + t.id + ':' + (t.lastRun ?? ''), 8) + '/ch-traj-proprocess';
  const sessions = ids.map(id => session(st, id)), all = sessions.map(s => trajNumbers(st, s));
  const total = (k: keyof typeof REAL) => num(all.reduce((sum, x) => sum + x[k], 0));
  const r = report(trajTopic(st, ids)), ctx = t.context;
  const skills = (ctx?.skills ?? []).map(id => st.projects.flatMap(x => x.skills).find(s => s.id === id)?.name ?? id);
  const docs = (ctx?.docs ?? []).map(id => source(st, id)?.name ?? id);

  p.step('Read session trajectories');
  preamble(p.log, cap, t, null, false);
  p.log('• iCode: ' + agentName(st, t) + ' ready, session ' + sid, '→ skill  icode-traj-logic-analyser 0.1.6',
    '→ script  scripts/run.py preflight --workspace ' + ws, '  Analysis model: deepseek/deepseek-v4.1-flash (labeling, generalization, localization); reasoning: off; configuration source: host connection',
    '→ script  scripts/run.py raw sessions/ --recipe generalization-zh-vis --parser chrys --llm-concurrency 4 --background',
    '  Job started: ' + ws + '/jobs/' + hashId(sid, 6) + '; progress page status.html',
    'Reading ' + n + ' sessions' + (ctx && (skills.length || docs.length || ctx.note) ? '; supporting material: ' + [skills.length && 'Skill ' + skills.join(', '), docs.length && 'documents ' + docs.join(', '), ctx.note && 'task instructions'].filter(Boolean).join(', ') : ''));
  // Sessions are processed four at a time; the log names the first few.
  sessions.slice(0, 3).forEach((s, i) => p.log('[ingest.session_unfold] [' + (i + 1) + '/' + n + '] ' + (s?.title ?? ids[i]) + ': ' + (s?.turns ?? '') + ' turns, compressed history unfolded, ' + all[i].delegations + ' subtask delegations'));
  if (n > 3) p.log('[ingest.session_unfold] [' + n + '/' + n + '] remaining ' + (n - 3) + ' sessions unfolded, ' + num(all.slice(3).reduce((sum, x) => sum + x.delegations, 0)) + ' subtask delegations in total');
  p.step('Parse and compress');
  p.log('[ingest.unified_parsing] ' + total('raw') + ' raw spans, ' + total('spans') + ' analyzed (tool calls, messages, delegations)',
    '[enrich.compression] ' + total('truncated') + ' smart truncations; system prompts deduplicated, source references kept');
  p.step('Behavior labeling');
  const batches = all.reduce((sum, x) => sum + x.batches, 0);
  p.log('[enrich.label_summary] ' + total('leaves') + ' leaf nodes: ' + total('mechanical') + ' mechanical, ' + num(all.reduce((s, x) => s + x.leaves - x.mechanical, 0)) + ' cognitive or undecided',
    ...[1, 2, 3].map(k => '[enrich.label_summary] cognitive labeling batch ' + Math.round(batches * k / 3) + '/' + batches + (k === 3 ? ', 0 failed, 0 retried' : '')));
  p.step('Trace generalization and evidence certification');
  p.log('[enrich.trace_generalization] ' + total('stages') + ' execution stages; ' + total('evidence') + ' evidence nodes, ' + total('links') + ' evidence links',
    '[enrich.trace_generalization] evidence ledger validated, certification status certified (schema 4.0)', '[enrich.generalization_zh] localization done: 1 initial pass, 0 fields retranslated');
  p.step('Diagnosis');
  p.log('[diagnosis.prepare] ' + total('nodes') + ' logic nodes' + (skills.length || docs.length ? '; ' + (skills.length + docs.length) + ' supporting materials bound' : ''),
    '[diagnosis.review] reviewed ' + total('reviewed') + ' nodes one by one against completion claims, tests and evidence',
    '[diagnosis.chains] ' + (r?.chains ?? 0) + ' problem chains: 3 verification, 2 implementation and verification, 1 implementation',
    '[diagnosis.improvements] ' + (r?.suggestions.length ?? 0) + ' improvement suggestions: 1 Skill, 1 prompt, 1 tool');
  p.step('Generate report');
  p.log('[report] rendering Trajectory Diagnosis Report.html: execution flow, problem chains, patterns and lessons, improvement suggestions', '[report] data contract validated; key conclusions link to the original evidence',
    '✓ Done · ' + (n > 1 ? n + ' sessions' : '1 session') + ' · session ' + sid, K + ' process exited with code 0');
  return p.done(Math.min(30, 18 + n * 2));
}

// ---------- Imported capabilities ----------
function customPlan(st: TalentsState, t: Task, cap: Capability, src: Source | null, update: boolean, sid: string): RunPlan {
  const p = planner(), e = engineOf(cap), op = (update ? e?.update : null) ?? e?.build, P = '[' + cap.id + ']';
  const out = (src?.type === 'repo' && Object.values(e?.output ?? {})[0]?.relativeTo === 'repository' ? src.path + '/' : '') + (cap.outputPath ?? '');
  const values = Object.entries(t.params ?? {}).filter(([, v]) => v !== '' && !(Array.isArray(v) && !v.length));
  p.step('Self-check');
  preamble(p.log, cap, t, src, update);
  const pkg = (text: string) => text.replace('${inputFile.path}', 'input.json').replace(/\$\{package\.root\}/g, '<package>');
  if (e?.check) p.log(K + ' self-check: ' + pkg(operationText(e.check)), P + ' self-check passed');
  else p.log(K + ' this capability declares no self-check');
  p.step(update ? 'Update' : 'Build');
  if (op?.skill) p.log('• iCode: ' + agentName(st, t) + ' ready, session ' + sid, '→ skill  ' + op.skill.name, '→ read   input.json');
  else p.log(K + ' running: ' + pkg(operationText(op)));
  p.log(P + ' input: ' + (src?.name ?? '') + (values.length ? '; ' + values.map(([k, v]) => k + ' = ' + (Array.isArray(v) ? v.join(', ') : v)).join('; ') : ''));
  if (cap.id === 'db-schema') p.log(P + ' read 42 Flyway migration scripts and 86 JPA entities', P + ' reconstructed 86 tables, 1,204 columns, 97 foreign keys, 213 indexes',
    P + ' compared entities with migration scripts: 3 column type mismatches, marked in the index');
  else p.log(P + ' processing source…', P + ' writing ' + out);
  p.step('Validate artifact');
  p.log(P + ' done: artifact written to ' + out, op?.skill ? '✓ Done, session ' + sid : '', K + ' process exited with code 0');
  return p.done(10);
}
const DB_SCHEMA_STATS: [string, string][] = [['Tables', '86'], ['Columns', '1,204'], ['Foreign keys', '97']];

export function startRun(st: TalentsState, t: Task) {
  const src = source(st, t.sources[0]), a = existingArtifact(st, t), basis = a && basisOf(a);
  const at = sourceState(src);
  if (t.mode === 'update' && capability(st, t.cap).update && basis && at) t.input = { from: (basis.version ?? basis.commit)!, to: (at.version ?? at.commit)! };
  else delete t.input;
  t.status = 'running';
  t.lastRun = now();
  t.run = { startedAt: Date.now(), plan: runPlan(st, t) };
}

export interface Progress { pct: number; step: number; done: boolean; logs: string[] }
export function runProgress(t: Task, at = Date.now()): Progress {
  const r = t.run;
  if (!r) return { pct: 100, step: 99, done: true, logs: [] };
  // A run on the service ends when the service says so.
  if (r.live) return { pct: Math.round((r.live.step + 0.5) / r.plan.steps.length * 100), step: r.live.step, done: false, logs: r.plan.logs };
  const f = Math.min(1, (at - r.startedAt) / (r.plan.seconds * 1000));
  const steps = r.plan.steps.length;
  const logCount = Math.max(1, Math.ceil(f * r.plan.logs.length));
  // A plan with marks is in the step whose first log line was written last.
  const step = r.plan.marks ? Math.max(0, r.plan.marks.filter(m => m < logCount).length - 1) : Math.min(steps - 1, Math.floor(f * steps));
  return { pct: Math.round(f * 100), step, done: f >= 1, logs: r.plan.logs.slice(0, logCount).filter(Boolean) };
}
const seconds = (ms: number) => { const s = Math.max(1, Math.round(ms / 1000)); return s < 60 ? s + ' s' : Math.floor(s / 60) + ' min ' + String(s % 60).padStart(2, '0') + ' s'; };

/** Stops a running task: nothing is produced. A one-off task ends with it; a daily task runs again at its time. */
export function cancelRun(t: Task, by: string) {
  const r = t.run;
  if (r) { const p = runProgress(t); t.lastLogs = [...p.logs, K + ' cancelled: ' + by + ' cancelled this run during "' + r.plan.steps[p.step] + '"; the artifact was not changed']; t.duration = seconds(Date.now() - r.startedAt); }
  t.status = 'cancelled';
  delete t.run; delete t.produced; delete t.unchanged;
}

export function finishRun(st: TalentsState, t: Task) {
  const r = t.run;
  t.status = 'success';
  if (r) { t.duration = Math.round(r.plan.seconds) + ' s'; t.lastLogs = r.plan.logs.filter(Boolean); }
  delete t.run;
  const a = produce(st, t);
  if (a) { t.artifact = a.id; t.produced = a.id; } else delete t.produced;
  return a;
}

/** The report of the diagnosed session; sessions without a prepared report all get the first one. */
function trajTopic(st: TalentsState, ids: string[]) {
  return Object.keys(st.trajTopics).find(k => ids.includes(st.trajTopics[k].session)) ?? Object.keys(st.trajTopics)[0];
}
// Indexes are not reviewed after their first publish: each later run publishes itself, and an update that
// finds no change keeps the current version.
function autoPublish(st: TalentsState, a: Artifact, t: Task) {
  const src = source(st, t.sources[0]), p = a.published!;
  const c = t.mode === 'update' && t.input ? changesSince(src, src?.type === 'docs' ? { version: t.input.from } : { commit: t.input.from }) : null;
  t.unchanged = !!(c && !c.count);
  if (!t.unchanged) {
    a.published = { version: p.version + 1, at: now(), delivery: p.delivery, agents: p.agents, basis: a.draft!.basis, auto: true,
      note: c ? (src?.type === 'docs' ? 'Synced document changes: ' : 'Synced code changes: ') + c.text : 'Rebuilt' };
  }
  a.draft = null;
}

/** Same capability on the same input -> a new draft version of that artifact; different input -> a new artifact.
 *  An imported capability without an MCP entry only writes its output directory: nothing to review. */
export function produce(st: TalentsState, t: Task): Artifact | null {
  const cap = capability(st, t.cap);
  if (cap.custom && !cap.mcp) return null;
  let a = existingArtifact(st, t);
  if (a?.graphSnapshot) { t.unchanged = true; return a; }
  const draft: Draft = { created: now(), task: t.id, revisions: [], basis: sourceState(source(st, t.sources[0])) };
  if (a) {
    if (a.folder === 'miner') {
      const map: Record<string, string> = JSON.parse(content('miner/pr-map.json') ?? '{}');
      const base = (a.draft ? a.specs : a.published?.specs) ?? [];
      // PR mode: the selected PRs name the specs to add; diff mode: the task name is the spec.
      const add = t.prs ? t.prs.map(n => map[n]).filter(Boolean) : (t.name && t.name !== base[base.length - 1] ? [t.name] : []);
      a.specs = base.concat(add.filter((n, i) => !base.includes(n) && add.indexOf(n) === i));
      a.files = minerFiles(a.specs);
    }
    a.draft = draft;
    if (a.kind === 'index' && a.published) autoPublish(st, a, t);
    return a;
  }
  const src = source(st, t.sources[0])!;
  a = { id: uid('a'), projectId: t.projectId, cap: cap.id, sources: t.sources.slice(), published: null, draft, name: '', desc: '', kind: 'files' };
  if (t.cap === 'traj') {
    // A diagnosis: the report and its suggestions, each applied or declined on its own (see suggestions.ts).
    const ids = t.sessions ?? [], topic = trajTopic(st, ids), r = report(topic);
    a.name = 'Trajectory insights: ' + st.trajTopics[topic].title;
    a.desc = r ? r.chains + ' problem chains, ' + r.suggestions.length + ' improvement suggestions.' : '';
    a.kind = 'diagnosis'; a.sessions = ids.slice(); a.topic = topic;
    a.files = ['trajectory/' + topic + '/Trajectory Diagnosis Report.html'];
    a.suggestions = (r?.suggestions ?? []).map(s => ({ id: s.id, status: 'pending' }));
  } else if (cap.custom) {
    a.name = src.name + ' ' + cap.name;
    a.desc = cap.desc;
    a.kind = 'index';
    a.stats = cap.id === 'db-schema' ? DB_SCHEMA_STATS : [['Output directory', cap.outputPath ?? '']];
    a.mcpName = engineOf(cap)?.applications?.[0]?.command ?? cap.id;
  } else if (cap.cat === 'index') {
    // Named for what the index is, not the engine that builds it (carddemo-java-1025 code graph).
    const what = cap.id === 'codegraph' ? 'code graph' : 'search index';
    a.name = src.name + ' ' + what;
    a.desc = cap.id === 'codegraph' ? 'Query code definitions and call relationships in ' + src.name + '.' : 'Find the passages in ' + src.name + ' that answer a question.';
    a.kind = 'index';
    a.stats = cap.id === 'codegraph' ? [] : [['Documents', String(src.files || 30)], ['Passages', '1,402'], ['Vector dimensions', '1,024']];
    a.mcpName = cap.id === 'codegraph' ? 'codegraph' : 'docs-rag';
  } else if (cap.cat === 'doc') {
    a.name = src.name + ' business knowledge';
    a.desc = 'Business rules, terms and data dictionary extracted from "' + src.name + '".';
    a.folder = 'Business knowledge';
    a.files = ['doc-knowledge/index.md', 'doc-knowledge/Business Rules Catalog.md', 'doc-knowledge/Ubiquitous Language Glossary.md', 'doc-knowledge/Data Dictionary.md'];
    a.skills = ['bank-domain-payments'];
    a.usage = 'Consult first when the work involves business rules, field meanings, terms or business flows';
  } else {
    const map: Record<string, string> = JSON.parse(content('miner/pr-map.json') ?? '{}');
    a.specs = (t.prs ?? []).map(n => map[n]).filter((n, i, arr) => n && arr.indexOf(n) === i);
    if (!a.specs.length && t.name) a.specs = [t.name];
    if (!a.specs.length) a.specs = ['Spending Cashback and Reward Issuance'];
    a.name = src.name + ' development patterns';
    a.desc = 'Implementation patterns summarized from code changes or code snippets, with steps, constraints and sample code.';
    a.folder = 'miner';
    a.files = minerFiles(a.specs);
    a.skills = ['find-reference-spec'];
    a.usage = 'Before developing a new requirement or changing an existing feature, use find-reference-spec to find a pattern to follow';
  }
  st.artifacts.unshift(a);
  return a;
}

// Initial Talents state (formerly the static demo's js/data.js). Team, members, projects, code repositories,
// design documents and shared sessions are NOT here: they come from the Teams snapshot (teams-data.ts).
// What is here is owned by Talents: capabilities, tasks, artifacts, the developer's machine, the local
// document source, and Talents' own metadata about Teams sources (document versions, commits, PRs).
import { minerFiles } from './content.ts';
import { platinumCashbackPageArtifact } from './platinum-cashback-page.ts';
import { fourRequirementArtifacts } from './four-requirements.ts';
import type { TalentsState } from './model.ts';

/** Bump only for an explicit incompatible seed migration: another version replaces stored state.
 * Additive demo sources belong to fresh initialization/reset and must not reset existing user data. */
export const SEED_VERSION = 12;

export const PROJECT_ID = 'carddemo';
/** Source ids derived from the Teams snapshot (see teams-data.ts): repository id, and one document set per project. */
export const REPO_ID = 'repository:carddemo:carddemo-java-1025';
export const DOCSET_ID = 'docset:carddemo';
export const STD_ID = 's-std';
/** The diagnosed iCode session (Teams shares it; content/trajectory/carddemo-19 holds its report). */
export const TRAJ_SESSION = '6b82c08d-eb3b-4bdc-b373-54fed16a7fcd';

const MINER_DIFF = ['Spending Cashback and Reward Issuance', 'Cross-Service Idempotent Posting and Retry', 'Campaign Eligibility and Validity Control', 'Account Balance Optimistic Lock Update', 'User Maintenance and Delete Protection'];
const MINER_PR = ['Unified Error Codes and Exception Handling'];
const MINER_SPECS = [...MINER_DIFF, ...MINER_PR];
const BIZ_FILES = ['doc-knowledge/index.md', 'doc-knowledge/Business Rules Catalog.md', 'doc-knowledge/Ubiquitous Language Glossary.md', 'doc-knowledge/Data Dictionary.md'];
const STD_FILES = ['doc-knowledge/Bank Coding Standards Essentials.md'];

const PRS: [number, string, string][] = [
  [12, 'Unify ApiError and GlobalExceptionHandler across services', '2026-09-22'],
  [19, 'Map downstream unavailability to 503 consistently', '2026-09-25'],
  [23, 'Use @Version optimistic locking for account maintenance', '2026-09-28'],
  [29, 'Return 409 on concurrent card maintenance conflicts', '2026-09-30'],
  [35, 'Keep existing messages for validation errors', '2026-10-03'],
  [38, 'customer-service: validate SSN first segment and FICO range', '2026-10-05'],
  [41, 'Bill payment: local PENDING plus remote debit', '2026-10-08'],
  [44, 'card-service: card updates no longer overwrite CVV', '2026-10-10'],
  [47, 'End-of-day posting: per-item idempotency and partial success', '2026-10-12'],
  [50, 'Release held credit limit when cleaning up expired authorizations', '2026-10-14'],
  [52, 'Move booking / repayment / interest into domain methods', '2026-10-16'],
  [55, 'Interest rate by disclosure group, falling back to DEFAULT', '2026-10-18'],
  [58, 'Idempotent cashback posting by rewardId', '2026-10-19'],
  [61, 'Add marketing-service reward evaluation', '2026-10-21'],
  [63, 'Trigger reward evaluation after posting', '2026-10-22'],
  [64, 'transaction-service: transaction detail export', '2026-10-23'],
  [66, 'Keep PENDING on cashback failure and support manual retry', '2026-10-24'],
];

export function seedState(): TalentsState {
  return {
    schemaVersion: 1, seedVersion: SEED_VERSION, revision: 1,
    role: 'admin',
    agents: [
      { id: 'Code', name: 'Code Agent' },
      { id: 'QA', name: 'Q&A Agent' },
      { id: 'Reviewer', name: 'Code Review Assistant' },
    ],
    // The only source Talents owns: a local document directory, registered at team level.
    localSources: [
      { id: STD_ID, type: 'docs', name: 'Bank Development Standards', path: '/Volumes/team-share/standards/bank-dev', files: 10, desc: 'In-house Java development, security, database and API standards',
        from: { kind: 'shared' }, lastCheck: '2026-10-26 02:30', projectId: null,
        versions: [
          { at: '2026-10-22 16:40', added: ['Password and Key Management Standard.md'], modified: ['Secure Coding Guide.md'] },
          { at: '2026-10-12 10:00', initial: 9 },
        ],
        tree: [{ dir: '', files: ['Java Coding Standard.md', 'Secure Coding Guide.md', 'Password and Key Management Standard.md', 'Database Design Standard.md', 'API Design Standard.md', 'Logging and Audit Standard.md', 'Amount and Precision Handling Standard.md', 'Exception and Error Code Standard.md', 'Unit Testing Standard.md', 'Code Review Checklist.md'] }] },
    ],
    // Talents' mock metadata about sources Teams owns; versions newest first.
    sourceMeta: {
      [REPO_ID]: { prs: 66,
        commit: { sha: '4e1b7c2', message: 'Keep PENDING on cashback failure and support manual retry (#66)', time: '2026-10-24 15:58' } },
      [DOCSET_ID]: { lastCheck: '2026-10-27 09:05',
        versions: [
          { at: '2026-10-27 09:05', added: ['teams/docs/cashback-contract.md'] },
          { at: '2026-10-26 10:00', initial: 2, files: ['workspace/carddemo-java-1025/docs/design/adr/ADR-009-marketing-integration.md', 'workspace/carddemo-java-1025/docs/design/adr/ADR-007-authentication-scope.md'] },
        ] },
    },
    prs: { [REPO_ID]: PRS.map(([number, title, merged]) => ({ number, title, merged })) },
    categories: [
      { id: 'index', name: 'Knowledge index', desc: 'Find related code and documents quickly' },
      { id: 'doc', name: 'Document knowledge extraction', desc: 'Extract business knowledge from requirements and design documents' },
      { id: 'code', name: 'Code knowledge mining', desc: 'Reverse-engineer development patterns and business rules from PRs and code changes' },
      { id: 'traj', name: 'Trajectory analysis', desc: 'Find problems in agent traces and distil reusable experience' },
    ],
    capabilities: [
      // update: what the capability does when asked to update an existing artifact; absent = it only builds.
      { id: 'codegraph', version: '0.1.0', cat: 'index', name: 'CodeGraph', desc: 'Builds a code graph for the repository and answers questions about symbol definitions, call relations and dependencies.', input: 'repo', inputLabel: '1 repository', output: 'Code graph index (queried over MCP)',
        update: 'Syncs only code changes since the last build',
        detail: { input: 'Requires one repository bound to a local directory in iCode Teams; the graph is built from the current code in that directory. Only the code itself is analysed, no extra documents.',
          abilities: [
            ['Symbol index', 'Parses classes, methods and fields with their definition sites, searchable by exact name.'],
            ['Calls and dependencies', 'Builds call chains, inheritance and module dependencies, answering “who calls this” and “what breaks if I change it”.'],
            ['Structure overview', 'Clusters by package and service to show the overall structure and how services relate.'],
            ['Incremental sync', 'After the source changes, syncs only what changed since the last build, keeping the graph aligned with the code.'],
          ],
          output: 'A code graph index written to the repository’s .codegraph/ directory; after "Apply", the Code Agent queries it through the codegraph MCP. Talents can browse the graph and preview source interactively.' } },
      { id: 'doc-index', version: '0.1.0', cat: 'index', name: 'Document RAG search', desc: 'Hybrid BM25 + vector retrieval that finds the relevant passages for a question.', input: 'docs', inputLabel: '1 document set', output: 'Retrieval index (queried over MCP)',
        update: 'Processes only added and modified documents, and drops passages of deleted ones',
        detail: { input: 'Requires one document set, for example requirements, design, API descriptions and specifications in Markdown or plain text.',
          abilities: [
            ['Structured chunking', 'Splits documents by heading level and paragraph, keeping the document and section so the source can be traced.'],
            ['Hybrid retrieval', 'Combines BM25 keyword matching with vector semantic search, so both jargon and natural questions find results.'],
            ['Result fusion', 'Merges and re-ranks both result sets, returning the most relevant passages with their sources.'],
            ['Incremental update', 'Processes only added and modified documents and removes passages of deleted ones, without a full rebuild.'],
          ],
          output: 'A retrieval index kept remotely; agents query the relevant passages over MCP.' } },
      { id: 'doc-extract', version: '0.1.0', cat: 'doc', name: 'Business knowledge extraction', desc: 'Extracts business rules, ubiquitous-language terms and a data dictionary from documents.', input: 'docs', inputLabel: '1 document set', output: 'Business knowledge document', skill: true,
        update: 'Revises the affected knowledge as documents change',
        prompt: 'Extract business rules, ubiquitous-language terms and a data dictionary from the selected document set, citing the source of every item.',
        detail: { input: 'Requires one document set; the more complete the requirements, design, API descriptions and ADRs, the more accurate the extracted knowledge.',
          abilities: [
            ['Business rule extraction', 'Identifies calculation rules, constraints and process branches, and writes them as clear, checkable rule statements.'],
            ['Ubiquitous language', 'Collects domain terms, synonyms and abbreviations into consistent definitions that reduce an agent’s misreadings.'],
            ['Data dictionary', 'Summarises business entities, fields, value ranges and meanings.'],
            ['Provenance and incremental revision', 'Cites the source document of every item and revises only the affected knowledge when documents change.'],
          ],
          output: 'A business knowledge document (Markdown) submitted to the repository as a PR after review; agents consult it while developing.' } },
      { id: 'miner-pr', version: '0.1.0', cat: 'code', name: 'Pattern mining (PRs)', desc: 'Analyses merged PRs and summarises reusable development patterns.', input: 'repo+pr', inputLabel: '1 repository and some PRs', output: 'Pattern library', skill: true, noUpdate: 'Each run archives new patterns',
        prompt: 'Summarise the development patterns shown by the selected PRs and archive them into the repository’s pattern library.',
        detail: { input: 'Requires one repository and several merged PRs; the more complete the PR descriptions and review threads, the more accurate the patterns.',
          abilities: [
            ['Intent of the change', 'Reads the PR description, the diff and the repository context to understand what each change had to solve.'],
            ['Pattern induction', 'Distils reusable practices such as layering, naming conventions and error handling from repeated similar changes.'],
            ['Business rule recovery', 'Identifies implicit business rules and boundary conditions from the code changes.'],
            ['Pattern archiving', 'Deduplicates against existing patterns, archives into the library and rebuilds index.md.'],
          ],
          output: 'A pattern library: one document per pattern plus index.md, submitted to the repository as a PR after review.' } },
      { id: 'miner-diff', version: '0.1.0', cat: 'code', name: 'Pattern mining (code snippets)', desc: 'Analyses code snippets in the repository context and summarises development patterns.', input: 'repo+snippet', inputLabel: '1 repository and code snippets', output: 'Pattern library', skill: true, noUpdate: 'Each run archives new patterns',
        prompt: 'Summarise the development patterns shown by the given snippets and archive them into the repository’s pattern library.',
        detail: { input: 'Requires one repository and the snippets to analyse; the repository provides the context that explains each snippet’s module and dependencies.',
          abilities: [
            ['Context linking', 'Locates the snippet in the repository, its callers and dependencies, and understands its responsibility.'],
            ['Pattern induction', 'Distils the technique a snippet shows, such as idempotency, concurrency control, validation and retry.'],
            ['Applicability', 'States where the pattern applies, its preconditions and pitfalls, so it is not misused.'],
            ['Pattern archiving', 'Deduplicates against existing patterns, archives into the library and rebuilds index.md.'],
          ],
          output: 'A pattern library: one document per pattern plus index.md, submitted to the repository as a PR after review.' } },
      { id: 'traj', version: '0.1.6', cat: 'traj', name: 'Trajectory insights', desc: 'Reads complex execution traces, finds problems and distils reusable experience and improvement suggestions.', input: 'sessions', inputLabel: '1 or more team sessions', output: 'Visual diagnosis report and improvement plan', skill: true, noUpdate: 'Each run produces a new diagnosis',
        prompt: 'Diagnose the agent’s process errors in the selected sessions and propose reusable improvements.',
        detail: { input: 'Requires a session trajectory; Skills, related documents and task notes help produce a deeper, more targeted diagnosis.',
          abilities: [
            ['Execution reconstruction', 'Links tasks, decisions and actions so a complex process can be understood quickly.'],
            ['Problem correlation', 'Identifies problems and traces their cause, impact and fix.'],
            ['Pattern and experience mining', 'Distils recurring behaviour patterns and effective practices.'],
            ['Improvement suggestions', 'Proposes improvements to prompts, tools, Skills and the execution flow.'],
          ],
          output: 'An interactive visual diagnosis report plus a concrete improvement plan with suggested changes, rationale and verification; key findings trace back to the original evidence.' } },
    ],
    tasks: [
      { id: 't-docidx', projectId: PROJECT_ID, name: '', cap: 'doc-index', sources: [DOCSET_ID], schedule: { kind: 'daily', time: '02:30' }, mode: 'update', skipUnchanged: true, input: { from: '2026-10-26 10:00', to: '2026-10-27 09:05' }, status: 'success', lastRun: '2026-10-27 09:10', duration: '18 s', artifact: 'a-docidx', created: '2026-10-26 10:12' },
      { id: 't-biz', projectId: PROJECT_ID, name: '', cap: 'doc-extract', sources: [DOCSET_ID], mode: 'update', input: { from: '2026-10-26 10:00', to: '2026-10-27 09:05' }, schedule: { kind: 'now' }, status: 'success', lastRun: '2026-10-27 09:31', duration: '6 min 12 s', artifact: 'a-biz', created: '2026-10-25 22:24' },
      { id: 't-std', projectId: null, name: '', cap: 'doc-extract', sources: [STD_ID], schedule: { kind: 'now' }, status: 'success', lastRun: '2026-10-18 11:22', duration: '9 min 05 s', artifact: 'a-std', created: '2026-10-18 11:13' },
      { id: 't-miner-errors', projectId: PROJECT_ID, name: '', cap: 'miner-pr', sources: [REPO_ID], prs: [12, 19, 35], schedule: { kind: 'now' }, status: 'success', lastRun: '2026-10-24 17:10', duration: '13 min 22 s', artifact: 'a-miner', produced: 'a-miner', created: '2026-10-24 16:57' },
      { id: 't-miner-cashback', projectId: PROJECT_ID, name: 'Spending Cashback and Reward Issuance', cap: 'miner-diff', sources: [REPO_ID], mode: 'build', schedule: { kind: 'now' }, status: 'success', lastRun: '2026-10-27 11:06', duration: '8 min 12 s', artifact: 'a-miner', produced: 'a-miner', created: '2026-10-27 11:04' },
      { id: 't-miner-idempotent', projectId: PROJECT_ID, name: 'Cross-Service Idempotent Posting and Retry', cap: 'miner-diff', sources: [REPO_ID], mode: 'build', schedule: { kind: 'now' }, status: 'success', lastRun: '2026-10-27 17:44', duration: '9 min 26 s', artifact: 'a-miner', produced: 'a-miner', created: '2026-10-27 17:42' },
      { id: 't-miner-eligibility', projectId: PROJECT_ID, name: 'Campaign Eligibility and Validity Control', cap: 'miner-diff', sources: [REPO_ID], mode: 'build', schedule: { kind: 'now' }, status: 'success', lastRun: '2026-10-27 17:50', duration: '7 min 48 s', artifact: 'a-miner', produced: 'a-miner', created: '2026-10-27 17:48' },
      { id: 't-miner-lock', projectId: PROJECT_ID, name: 'Account Balance Optimistic Lock Update', cap: 'miner-diff', sources: [REPO_ID], mode: 'build', schedule: { kind: 'now' }, status: 'success', lastRun: '2026-10-27 18:45', duration: '6 min 31 s', artifact: 'a-miner', produced: 'a-miner', created: '2026-10-27 18:43' },
      { id: 't-miner-user', projectId: PROJECT_ID, name: 'User Maintenance and Delete Protection', cap: 'miner-diff', sources: [REPO_ID], mode: 'build', schedule: { kind: 'now' }, status: 'success', lastRun: '2026-10-27 18:50', duration: '5 min 54 s', artifact: 'a-miner', produced: 'a-miner', created: '2026-10-27 18:48' },
      { id: 't-traj', projectId: PROJECT_ID, name: '', cap: 'traj', sources: ['s-sessions'], sessions: [TRAJ_SESSION], schedule: { kind: 'now' }, status: 'success', lastRun: '2026-10-27 01:21', duration: '42 min 18 s', artifact: 'a-traj', created: '2026-10-27 00:38' },
    ],
    // published: what developers see; draft: the latest run, waiting for review (revisions are added while reviewing).
    // basis: the source state the artifact was built from (a document version, or a commit for code).
    artifacts: [
      platinumCashbackPageArtifact(),
      ...fourRequirementArtifacts(1),
      ...fourRequirementArtifacts(2),
      { id: 'a-docidx', projectId: PROJECT_ID, cap: 'doc-index', name: 'Design document search index', desc: 'Searches the design documents for passages relevant to a question.', sources: [DOCSET_ID], kind: 'index',
        stats: [['Documents', '3'], ['Passages', '146'], ['Vector dimensions', '1,024']], mcpName: 'docs-rag',
        published: { version: 2, at: '2026-10-27 09:12', note: 'Synced document changes: 1 added', delivery: 'cloud', agents: ['Code'], basis: { version: '2026-10-27 09:05' }, auto: true }, draft: null },
      { id: 'a-biz', projectId: PROJECT_ID, cap: 'doc-extract', name: 'Credit Card Marketing Cashback Business Knowledge', desc: 'Business rules catalog, ubiquitous language glossary and data dictionary, each item with its source.', sources: [DOCSET_ID], kind: 'files', folder: 'Business knowledge',
        files: BIZ_FILES, skills: ['bank-domain-payments'], usage: 'Consult first when working on cashback rules, field meanings, terms or business processes',
        published: { version: 1, at: '2026-10-26 14:40', note: 'First publish', delivery: 'local', files: BIZ_FILES, basis: { version: '2026-10-26 10:00' },
          over: { 'doc-knowledge/Business Rules Catalog.md': 'doc-knowledge-v1/Business Rules Catalog.md' } },
        draft: { created: '2026-10-27 09:31', task: 't-biz', revisions: [], basis: { version: '2026-10-27 09:05' } } },
      { id: 'a-std', projectId: null, cap: 'doc-extract', name: 'Bank coding standards essentials', desc: 'Layering, modelling, API and security conventions, plus five categories of check rules.', sources: [STD_ID], kind: 'files', folder: 'Coding standards',
        files: STD_FILES, skills: ['dev-bank-coding-standards'], usage: 'Check against it when writing or reviewing code',
        published: { version: 1, at: '2026-10-18 14:02', note: 'First publish', delivery: 'local', agents: ['Code', 'Reviewer'], files: STD_FILES, basis: { version: '2026-10-12 10:00' } }, draft: null },
      { id: 'a-miner', projectId: PROJECT_ID, cap: 'miner-diff', name: 'carddemo-java-1025 development patterns', desc: 'Implementation patterns mined from merged PRs and code snippets, with steps, constraints and sample code.', sources: [REPO_ID], kind: 'files', folder: 'miner',
        specs: MINER_SPECS, files: minerFiles(MINER_SPECS), skills: ['find-reference-spec'], usage: 'Before developing a new requirement or changing an existing feature, use find-reference-spec to find a pattern to follow',
        published: { version: 2, at: '2026-10-27 18:50', note: 'Added 5 development patterns mined from code snippets; kept "Unified Error Codes and Exception Handling"', delivery: 'local', specs: MINER_SPECS, files: minerFiles(MINER_SPECS) },
        history: [{ version: 1, specs: ['Unified Error Codes and Exception Handling'] }], draft: null },
      // A diagnosis is not published: its suggestions are submitted as PRs one by one (server/pull-requests.ts).
      { id: 'a-traj', projectId: PROJECT_ID, cap: 'traj', name: 'Trajectory insights: CardDemo migration and expansion (19 turns)', desc: '6 problem chains, 3 improvement suggestions.', sources: ['s-sessions'], kind: 'diagnosis',
        sessions: [TRAJ_SESSION], topic: 'carddemo-19', files: ['trajectory/carddemo-19/Trajectory Diagnosis Report.html'],
        suggestions: ['change-01', 'change-02', 'change-03'].map(id => ({ id, status: 'pending' })),
        published: null, draft: { created: '2026-10-27 01:21', task: 't-traj', revisions: [], basis: null } },
    ],
    // Diagnosis reports in content/trajectory/<topic>/, each for the session it analysed.
    trajTopics: { 'carddemo-19': { title: 'CardDemo migration and expansion (19 turns)', session: TRAJ_SESSION } },
    // Project skill versions written directly by earlier demo builds; suggestions now go through PRs.
    skillVersions: [],
  };
}

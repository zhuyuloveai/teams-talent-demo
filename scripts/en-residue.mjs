#!/usr/bin/env node
// demo-en: lists Chinese text left in tracked files. Run after every merge from main:
//   node scripts/en-residue.mjs            # exit 1 if a file outside the allow-list contains Chinese
//   node scripts/en-residue.mjs --all      # also list allowed files and tests
// Allowed files keep Chinese on purpose (semantic keys, matchers for old saved state, the zh catalog,
// Chinese-question parsing, internal docs). Light Skills translate only their front-matter description.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cjk = /[一-鿿]/g;
const fullSkills = new Set(['arch-solution-design', 'ba-acceptance-criteria', 'ba-requirement-analysis', 'bank-domain-payments',
  'dev-api-integration', 'dev-backend-service', 'dev-bank-coding-standards', 'dev-code-reviewer', 'dev-frontend-ui', 'dev-unit-test',
  'qa-integration-test', 'qa-uat-support', 'sec-scan-review', 'arch-adr-writing', 'arch-impact-analysis', 'ba-requirement-tracing',
  'cobol-legacy-knowledge']);
const allowed = [
  [/^(I18N|MIGRATION)\.md$|^analysis\/|^docs\/i18n\/|^i18n-baseline\.json$/, 'internal Chinese docs'],
  [/^docs\/en-glossary\.md$|^scripts\/en-rename-map\.json$|^scripts\/i18n-(scan|vendor)\.mjs$/, 'translation tooling'],
  [/^shared\/i18n\/(messages\/(zh|en)\.ts|format\.ts)$/, 'zh catalog / language names / zh number units'],
  [/^teams\/src\/task-labels-en\.ts$|^talents\/src\/demo\/catalog-en\.ts$/, 'lookup tables keyed by Chinese'],
  [/^teams\/src\/(operations|project-delivery-tasks|project-overview|imported-delivery|display-text|resource-sharing|source-plugins)\.ts$/, 'semantic keys / legacy matchers'],
  [/^teams\/src\/(pages|components)\//, 'semantic keys (DeliveryPhase, Presence, imported statuses)'],
  [/^teams\/src\/vendor\//, 'vendor copy (comments, routed through vt())'],
  [/^talents\/src\/vendor\//, 'vendor copy (comments, routed through vt())'],
  [/^teams\/server\/(task-reset|task-reset-legacy|talent-intake|task-automation|delivery-migration|model-context)\.ts$|^teams\/scripts\/reset-task\.ts$/, 'matchers for old saved state'],
  [/^talents\/server\/store\.ts$/, 'RENAMED migration of old Chinese names'],
  [/^talents\/src\/demo\/ask-icode\.ts$/, 'Chinese questions are still understood'],
  [/^teams\/fixtures\/teams-project\.json$/, 'imported upstream status values compared in code'],
  [/^shared\/contracts\.ts$/, 'comment quoting a zh UI label'],
];
const all = process.argv.includes('--all');
const files = execFileSync('git', ['-C', root, '-c', 'core.quotepath=off', 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 << 20 }).split('\0').filter(Boolean);
let failing = 0;
for (const path of files) {
  let text; try { text = readFileSync(resolve(root, path), 'utf8'); } catch { continue; }
  if (text.includes('\0')) continue; // binary
  let count = (text.match(cjk) ?? []).length;
  const light = /^workspace\/\.agents\/skills\/([^/]+)\/(.+)$/.exec(path);
  if (light && !fullSkills.has(light[1])) {
    if (light[2] !== 'SKILL.md') { if (count && all) console.log(`allowed ${count}\t${path}\t(light Skill body)`); continue; }
    count = ((/^---\r?\n[\s\S]*?\r?\n---/.exec(text)?.[0] ?? '').match(cjk) ?? []).length; // front-matter only
  }
  if (!count) continue;
  const reason = /(^|\/)tests\//.test(path) ? 'test input' : allowed.find(([pattern]) => pattern.test(path))?.[1];
  if (reason) { if (all) console.log(`allowed ${count}\t${path}\t(${reason})`); continue; }
  failing++; console.log(`CHINESE ${count}\t${path}`);
}
console.log(failing ? `${failing} file(s) with unexpected Chinese` : 'no unexpected Chinese');
process.exitCode = failing ? 1 : 0;

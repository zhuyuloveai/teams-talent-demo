// Artifact and Skill text lives in talents/content/ (the same files the page bundles, see tools/bundle-content.mjs).
import { readFileSync } from 'node:fs';
import { join, normalize, isAbsolute } from 'node:path';
import { contentDir } from './config.ts';

/** Text of a content file by its key (path under content/), or null when it does not exist. */
export function readContent(key: string, dir = contentDir): string | null {
  if (isAbsolute(key) || normalize(key).startsWith('..')) return null;
  try { return readFileSync(join(dir, key), 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

function prMap(dir = contentDir): Record<string, string> {
  return JSON.parse(readContent('miner/pr-map.json', dir) ?? '{}');
}
/** Files of a development-pattern library: index, then per spec pattern summary, code analysis report, its PR records (PR mode)
 *  or its mining metadata (diff mode: meta.json records the scenario, repository and engine). */
export function minerFiles(specs: string[], dir = contentDir) {
  const map = prMap(dir), out = ['miner/index.md'];
  for (const name of specs) {
    out.push(`miner/${name}/summary.md`, `miner/${name}/analyzer.md`);
    const prs = Object.keys(map).filter(pr => map[pr] === name);
    if (prs.length) for (const pr of prs) out.push(`miner/${name}/input/prs/${pr}/metadata.json`);
    else if (readContent(`miner/${name}/meta.json`, dir) != null) out.push(`miner/${name}/meta.json`);
  }
  return out;
}
/** miner/index.md restricted to the given specs (same rule as minerIndex in src/demo/knowledge.ts). */
export function minerIndex(specs: string[], dir = contentDir) {
  const text = readContent('miner/index.md', dir) ?? '';
  const rows: Record<string, string> = {};
  for (const line of text.split('\n')) { const m = /^\|\s*\[([^\]]+)\]/.exec(line); if (m) rows[m[1]] = line; }
  const head = text.split('\n').filter(line => /^#|^>/.test(line)).join('\n');
  return head + '\n\n| Name | Description | First archived |\n| --- | --- | --- |\n' + specs.map(n => rows[n] ?? `| [${n}](<./${n}/summary.md>) | — | — |`).join('\n') + '\n';
}
/** A project's AGENTS.md rules as published (same rule as rulesMarkdown in src/demo/suggestions.ts). */
export const RULES_FILE = 'rules/AGENTS.md';
export function rulesMarkdown(rules: { text: string }[]) {
  return '# AGENTS.md rules\n\n> Project rules distilled from session trajectory diagnosis. When applied, they are written to the iCode Talents block of the repository AGENTS.md.\n\n' + rules.map((r, i) => (i + 1) + '. ' + r.text).join('\n') + '\n';
}
/** Human label of a file in an artifact (same rule as K.fileLabel). */
export function fileLabel(key: string) {
  if (key === RULES_FILE) return 'AGENTS.md rules';
  const parts = key.split('/'), name = parts.pop() ?? key;
  if (name === 'summary.md') return parts[1] ? parts[1] + ': Pattern summary' : 'Pattern summary';
  if (name === 'analyzer.md') return parts[1] ? parts[1] + ': Code analysis report' : 'Code analysis report';
  if (name === 'metadata.json') return 'PR #' + parts.pop();
  if (name === 'meta.json') return parts[1] ? parts[1] + ': Mining metadata' : 'Mining metadata';
  if (name === 'index.md') return parts[0] === 'miner' ? 'Pattern index' : 'Index';
  if (name.startsWith('Skill Improvement - ')) return 'Skill improvement: ' + name.replace(/^Skill Improvement - |\.md$/g, '');
  return name.replace(/\.(md|html)$/, '');
}
export function fileType(key: string): 'markdown' | 'html' | 'json' | 'text' {
  if (key.endsWith('.md')) return 'markdown';
  if (key.endsWith('.html')) return 'html';
  if (key.endsWith('.json')) return 'json';
  return 'text';
}

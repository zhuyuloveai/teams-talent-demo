#!/usr/bin/env node
// demo-en: recomputes every digest that depends on translated content. Run from the repository root
// after translating content or merging main, once the changed Skill files are committed (the Skill
// manifest reads the Git index):  node scripts/en-regenerate.mjs
// Steps: Skill source manifest -> Skill catalog digests -> requirement/platinum provenance and the
// scenario constants -> miner snippet digests -> shared/seed/talents.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const content = join(root, 'talents/content');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fileSha = path => sha(readFileSync(path));
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path, value, indent = 2) => writeFileSync(path, JSON.stringify(value, null, indent) + '\n');
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });

// 1. Skill source manifest (reads committed blobs).
console.log(run(process.execPath, ['teams/scripts/generate-skill-source-manifest.mjs']).trim());

// 2. Digests of every catalog Skill as Teams computes them.
const catalog = JSON.parse(run(process.execPath, ['--import', 'tsx', '-e',
  "const m=await import('./server/skill-packages.ts');const c=await m.readSkillCatalog();console.log(JSON.stringify(c.skillCatalog.map(s=>({id:s.id,version:s.version,sha256:s.sha256,contentSha256:s.contentSha256}))))"],
  join(root, 'teams')).trim().split('\n').pop());
const skills = new Map(catalog.map(skill => [skill.id, skill]));

const indentOf = path => (/\n(\s+)"/.exec(readFileSync(path, 'utf8'))?.[1].length ?? 2);
function refreshManifest(path) {
  const manifest = readJson(path);
  for (const file of manifest.knowledgeFiles ?? []) file.sha256 = fileSha(join(content, file.path));
  for (const pkg of manifest.skillPackages ?? []) {
    const skill = skills.get(pkg.id);
    if (!skill) throw new Error(`${path}: unknown Skill ${pkg.id}`);
    Object.assign(pkg, { version: skill.version, sha256: skill.sha256, contentSha256: skill.contentSha256 });
  }
  return manifest;
}

// 3. Four requirement scenarios: v1 manifests first, v2 manifests point at the v1 manifest digest.
const scenarioFile = join(root, 'shared/four-requirement-scenarios.ts');
let scenarios = readFileSync(scenarioFile, 'utf8');
let profileV2;
for (const id of readdirSync(join(content, 'four-requirements')).filter(name => /^REQ-\d{4}-\d{3}$/.test(name)).sort()) {
  const dir = join(content, 'four-requirements', id);
  const source = fileSha(join(dir, 'Original Requirement.md'));
  for (const path of [join(dir, 'provenance.json'), join(dir, 'v2/provenance.json')]) {
    const manifest = refreshManifest(path);
    const old = manifest.sourceSha256;
    manifest.sourceSha256 = source;
    if (manifest.sourceRequirement) manifest.sourceRequirement.sha256 = source;
    if (manifest.testProfile) {
      manifest.testProfile.sha256 = fileSha(join(content, manifest.testProfile.path));
      if (manifest.testProfile.version === 'test-profile-v2') profileV2 = manifest.testProfile.sha256;
    }
    if (manifest.previousVersion) manifest.previousVersion.manifestSha256 = fileSha(join(content, manifest.previousVersion.manifestPath));
    writeJson(path, manifest, indentOf(path));
    if (old && old !== source) scenarios = scenarios.replaceAll(old, source);
  }
}
if (profileV2) scenarios = scenarios.replace(/(fourRequirementProfileV2Sha256 = ')[0-9a-f]{64}(')/, `$1${profileV2}$2`);
writeFileSync(scenarioFile, scenarios);

// 4. Platinum benefit page manifest (knowledge files only; sourceFiles record the carddemo commit they were read from).
const platinum = join(content, 'platinum-cashback-page/provenance.json');
writeJson(platinum, refreshManifest(platinum), indentOf(platinum));

// 5. Miner snippet/template digests.
const minerDir = join(content, 'miner');
for (const name of readdirSync(minerDir)) {
  const meta = join(minerDir, name, 'meta.json');
  if (!statSync(join(minerDir, name)).isDirectory() || !existsSync(meta)) continue;
  const value = readJson(meta);
  for (const item of [...(value.snippets ?? []), ...(value.template ? [value.template] : [])]) {
    const path = join(minerDir, name, item.archived);
    if (!existsSync(path)) continue;
    item.sha256 = fileSha(path);
    if ('size' in item) item.size = statSync(path).size;
  }
  writeJson(meta, value, indentOf(meta));
}

// 6. Committed Talents seed that Teams reads before Talents starts.
rmSync(join(root, 'shared/seed/talents'), { recursive: true, force: true });
console.log(run('npm', ['run', '--silent', 'seed:shared'], join(root, 'talents')).trim());
console.log('done; review `git diff` and commit');

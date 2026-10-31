// Owner workflow with a local fake gh executable; never submits to GitHub.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { fakeTeams } from './fixtures/fake-teams.ts';

const port = 45989, origin = 'http://127.0.0.1:' + port;
const dir = await mkdtemp(join(tmpdir(), 'talents-browser-'));
await mkdir(join(dir, 'bin'));
await copyFile('tests/fixtures/fake-gh.mjs', join(dir, 'bin', 'gh'));
await chmod(join(dir, 'bin', 'gh'), 0o755);
await writeFile(join(dir, 'fail-once'), '');
// Teams, with the Credit Card workspace bound: PRs default to its origin and base branch.
const teams = await fakeTeams(45979);
const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  env: { ...process.env, PATH: join(dir, 'bin') + ':' + process.env.PATH, TEST_GH_LOG: join(dir, 'gh.log'), TEST_GH_FAIL: join(dir, 'fail-once'), DEMO_TALENT_PORT: String(port), DEMO_PORT: '45979', DEMO_TALENT_STATE_DIR: join(dir, 'state'), DEMO_SHARED_DIR: join(dir, 'shared') }, stdio: 'pipe',
});
const stopped = new Promise(resolve => server.once('close', resolve));
let logs = ''; server.stdout.on('data', b => { logs += b; }); server.stderr.on('data', b => { logs += b; });
let browser;
try {
  for (let n = 0; ; n++) {
    if (server.exitCode !== null) throw new Error(logs);
    try { if ((await fetch(origin + '/api/health')).ok) break; } catch { /* starting */ }
    if (n > 80) throw new Error('Service did not start: ' + logs);
    await new Promise(done => setTimeout(done, 200));
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/talents?role=member#/dev-knowledge?project=carddemo');
  await page.locator('.item-card', { hasText: 'Credit Card Marketing Cashback Business Knowledge' }).waitFor();
  assert.equal(await page.locator('.compact-role-switch').count(), 0);
  assert.equal(await page.getByRole('link', { name: 'Local index', exact: true }).count(), 0);
  for (const hash of ['team', 'capabilities', 'projects?project=carddemo&tab=sources', 'projects?project=carddemo&tab=tasks']) {
    await page.goto(origin + '/talents/#/' + hash);
    await page.locator('.page-header h1').first().waitFor();
  }
  await page.goto(origin + '/talents/#/projects?project=carddemo&id=a-biz');
  await page.getByRole('button', { name: 'Submit PR', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.locator('input[value="JeffyLiu003/carddemo-java-1025"]').waitFor();
  assert.equal(await dialog.getByLabel('GitHub repository').inputValue(), 'JeffyLiu003/carddemo-java-1025');
  assert.equal(await dialog.getByLabel('Target branch').inputValue(), 'develop');
  await dialog.getByRole('button', { name: 'Submit PR', exact: true }).click();
  await dialog.getByText('Submission failed', { exact: true }).waitFor();
  assert.equal(await dialog.locator('.submit-steps .ant-steps-item-error').innerText(), 'Create PR');
  assert.equal(await dialog.locator('.submit-steps .ant-steps-item-finish').count(), 4);
  await dialog.getByRole('button', { name: 'Submit PR', exact: true }).click();
  await page.locator('.wb-side').getByRole('link', { name: 'View PR' }).waitFor();
  await page.reload();
  await page.locator('.wb-side').getByRole('link', { name: 'View PR' }).waitFor();
  await page.goto(origin + '/talents/#/projects?project=carddemo&id=a-traj');
  for (const title of ['Unify the section contract across the ADR Skill', 'to completion claims']) {
    await page.locator('.file-item', { hasText: title }).click();
    await page.getByRole('button', { name: 'Submit improvement PR', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.locator('input[value="JeffyLiu003/carddemo-java-1025"]').waitFor();
    if (title === 'Unify the section contract across the ADR Skill') assert.equal(await dialog.getByLabel('Skill directory in the repository').inputValue(), '.agents/skills/arch-adr-writing');
    await dialog.getByRole('button', { name: 'Submit PR', exact: true }).click();
    await page.locator('.wb-side').getByRole('link', { name: 'View PR' }).waitFor();
  }
  const boot = await (await fetch(origin + '/api/bootstrap')).json();
  const a = boot.state.artifacts.find((a: any) => a.id === 'a-biz');
  assert.ok(a.submission.url);
  assert.equal(a.draft, null);
  assert.deepEqual(boot.state.skillVersions, []);
  assert.ok(!boot.state.artifacts.some((a: any) => a.id === 'a-rules-carddemo'));
  const calls = (await readFile(join(dir, 'gh.log'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(calls.filter(c => c.method === 'POST' && c.path.endsWith('/pulls')).length, 4);
  assert.ok(!calls.some(c => c.path.includes('/merge')));
  const pulls = calls.filter(c => c.method === 'POST' && c.path.endsWith('/pulls'));
  assert.ok(pulls.every(c => c.path === 'repos/JeffyLiu003/carddemo-java-1025/pulls' && c.body.base === 'develop'));
  const trees = calls.filter(c => c.method === 'POST' && c.path.endsWith('/git/trees')).flatMap(c => c.body.tree);
  assert.ok(trees.some(f => f.path === 'AGENTS.md') && trees.some(f => f.path.startsWith('docs/knowledge/a-biz/')));
  assert.ok(trees.filter(f => f.path.startsWith('.agents/skills/arch-adr-writing/')).every(f => f.content.includes('\r\n')));
  await page.screenshot({ path: '/tmp/talents-pr-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/talents-pr-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('Admin entry, knowledge PR, suggestion PRs, failure retry and persistence passed; gh is simulated locally throughout.');
} finally {
  await browser?.close(); server.kill(); teams.close();
  await stopped;
  await rm(dir, { recursive: true, force: true });
}

import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { build } from 'esbuild';
import { chromium, type Browser, type Page, type Response as BrowserResponse } from 'playwright';
import type { DemoState } from '../src/domain.js';

// Exercise real routes and persisted records, with the current UI compiled only
// in memory. No live service, native launch, or model execution is involved.
const directory = await mkdtemp(join(tmpdir(), 'task-management-create-'));
const port = 46231, origin = `http://127.0.0.1:${port}`;
const evidence = 'test-results/task-management-create';
const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const env = { ...process.env, DEMO_PORT: String(port), DEMO_TALENT_PORT: '46232', DEMO_STATE_DIR: directory, DEMO_SHARED_DIR: join(directory, 'shared'), DEMO_SHARED_SEED_DIR: join(directory, 'no-seed'), DEMO_NATIVE_DISABLED: '1' };
let logs = '', server: ChildProcess | undefined, browser: Browser | undefined, page: Page | undefined;
const posts: Array<{ path: string; body: Record<string, unknown> }> = [], errors: string[] = [], checks: string[] = [];
const results: Array<Record<string, unknown>> = [];
const sourcePaths = ['src/components/project-task-management.tsx', 'src/components/project-task-create.tsx', 'src/components/requirement-detail.tsx', 'src/components/task-assignment.tsx', 'src/pages/project.tsx', 'src/pages/teams-project.tsx', 'src/delivery-requirements.ts', 'src/task-creation.ts', 'src/project-issues.ts', 'src/project-overview.ts', 'src/teams-domain.ts', 'src/workspace.ts', 'server/store.ts', 'server/index.ts', 'tests/task-management-create-browser.ts'];
const sourceHashes = () => Promise.all(sourcePaths.map(async path => ({ path, sha256: digest(await readFile(path)) })));

async function state(): Promise<DemoState> {
  const response = await fetch(origin + '/api/state');
  assert.equal(response.status, 200);
  return response.json();
}
async function waitUntil(check: () => Promise<boolean>, label: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${label}\n${logs}`);
}
async function start() {
  server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout!.on('data', value => { logs += value; });
  server.stderr!.on('data', value => { logs += value; });
  await waitUntil(async () => { try { const response = await fetch(origin + '/api/health'); const health = await response.json(); return response.ok && health.pid === server!.pid; } catch { return false; } }, 'owned isolated service');
}
async function stop() {
  const child = server;
  if (child && child.exitCode === null) await new Promise<void>(resolve => { child.once('exit', () => resolve()); child.kill('SIGTERM'); });
  server = undefined;
}
async function post(path: string, body: Record<string, unknown>, expected: number | number[] = 200) {
  const session = await (await fetch(origin + '/api/session')).json() as { token: string };
  const response = await fetch(origin + path, { method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-demo-token': session.token }, body: JSON.stringify({ role: 'owner', revision: (await state()).revision, ...body }) });
  const value = await response.json();
  assert.ok((Array.isArray(expected) ? expected : [expected]).includes(response.status), `${path}: ${response.status} ${JSON.stringify(value)}`);
  return value;
}
async function visit(projectId: string, tab = 'management', extra: Record<string, string> = {}, role = 'owner') {
  await page!.goto(origin + '/teams?demo-role=' + role + '#/projects?' + new URLSearchParams({ project: projectId, tab, ...extra }));
  await page!.locator(tab === 'management' ? `[data-task-project="${projectId}"]` : `[aria-label="Project toolbar"]`).waitFor();
}
async function noDrawer() {
  await waitUntil(async () => await page!.getByRole('dialog').count() === 0, 'no automatically opened detail');
}
async function closeDrawer() {
  await page!.locator('.ant-drawer-close:visible').click();
  await noDrawer();
}
async function assertCounts(kind: 'requirements' | 'issues', expected: number) {
  const list = page!.locator('[data-overview-list-summary]');
  await waitUntil(async () => await list.getAttribute('data-list-count') === String(expected), `${kind} visible count ${expected}`);
  assert.equal(await list.getAttribute('data-list-total'), String(expected));
  assert.equal(await page!.locator(`.overview-${kind} tbody tr.ant-table-row`).count(), expected);
  assert.ok(await page!.getByRole('tab', { name: `${kind === 'requirements' ? 'Requirements' : 'Issues'} · ${expected}`, exact: true }).isVisible());
}
async function cancelCreate(name: string, field: string) {
  const before = await readFile(join(directory, 'state.json')), requestCount = posts.length;
  await page!.getByRole('button', { name: new RegExp(name + '$') }).click();
  const dialog = page!.getByRole('dialog', { name, exact: true });
  await dialog.getByRole('textbox', { name: field, exact: true }).fill('Must not be saved after cancel');
  await dialog.getByRole('button', { name: /Cancel/ }).click();
  await noDrawer();
  assert.equal(posts.length, requestCount, 'cancel must not send a POST');
  assert.deepEqual(await readFile(join(directory, 'state.json')), before, 'cancel must preserve persisted state');
}
async function openCreation(name: string, title: string, description: string, failOnce = false) {
  await page!.getByRole('button', { name: new RegExp(name + '$') }).click();
  const dialog = page!.getByRole('dialog', { name, exact: true });
  await dialog.getByRole('textbox', { name: name === 'New requirement' ? 'requirement title' : 'issue title', exact: true }).fill(title);
  await dialog.getByRole('textbox', { name: name === 'New requirement' ? 'requirement description' : 'issue description', exact: true }).fill(description);
  assert.equal(await dialog.locator('input[aria-label*="ID"], input[aria-label*="identifier" i]').count(), 0, 'technical IDs must not be required from users');
  const path = name === 'New requirement' ? '/api/delivery-requirements' : '/api/workspace';
  let failedBody: Record<string, unknown> | undefined;
  if (failOnce) {
    const before = await readFile(join(directory, 'state.json'));
    await page!.route(origin + path, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Isolated check: cannot save right now, try again.' }) }), { times: 1 });
    const rejected = page!.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === 'POST');
    await dialog.getByRole('button', { name: name === 'New requirement' ? 'Create requirement' : 'Create issue', exact: true }).click();
    const response = await rejected;
    assert.equal(response.status(), 503);
    failedBody = response.request().postDataJSON();
    await dialog.getByText(/was not saved\. Check the error and try again/).waitFor();
    assert.equal(await dialog.getByRole('textbox', { name: name === 'New requirement' ? 'requirement title' : 'issue title', exact: true }).inputValue(), title);
    assert.equal(await dialog.getByRole('textbox', { name: name === 'New requirement' ? 'requirement description' : 'issue description', exact: true }).inputValue(), description);
    assert.deepEqual(await readFile(join(directory, 'state.json')), before);
    await page!.screenshot({ path: `${evidence}/${name === 'New requirement' ? 'requirement' : 'issue'}-failed-draft.png`, fullPage: true });
  }
  const response = page!.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: name === 'New requirement' ? 'Create requirement' : 'Create issue', exact: true }).click();
  const saved = await response;
  assert.equal(saved.status(), 200, await saved.text());
  if (failedBody) assert.deepEqual(saved.request().postDataJSON(), failedBody, 'retry must preserve the same draft and request identity');
  await noDrawer();
  return saved.request().postDataJSON() as Record<string, unknown>;
}

try {
  await mkdir(evidence, { recursive: true });
  const inputs = await sourceHashes();
  const bundle = await build({ entryPoints: ['src/main.tsx'], bundle: true, outdir: join(directory, 'bundle'), format: 'esm', minify: true, target: ['chrome120'], define: { 'process.env.NODE_ENV': '"production"' }, write: false });
  await start();
  const original = await state();
  const sourceTasks = (await (await fetch(origin + '/api/bootstrap')).json()).data.teamsProject.tasks;
  assert.equal(sourceTasks.length, 5);
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => { errors.push(error.message); });
  page.on('request', request => {
    if (request.method() !== 'POST') return;
    posts.push({ path: new URL(request.url()).pathname, body: request.postDataJSON() });
  });
  for (const file of bundle.outputFiles!) await page.route(origin + '/' + basename(file.path), route => route.fulfill({ body: Buffer.from(file.contents), contentType: file.path.endsWith('.css') ? 'text/css' : 'text/javascript' }));

  for (const fixture of [{ id: 'carddemo', requirements: 5, issues: 7, task: 'DEMO-MKT-001', assignee: 'Su Qing', assigneeId: 'su' }, { id: 'teams', requirements: 4, issues: 1, task: 'T104', assignee: 'Chen Chen', assigneeId: 'member' }]) {
    const projectId = fixture.id;
    // Both regular navigation and a legacy URL carrying a selected delivery task
    // must enter the list; only an explicit title click opens its detail.
    await visit(projectId, 'content');
    await page.getByRole('region', { name: 'Project toolbar' }).getByRole('tab', { name: 'Task management', exact: true }).click();
    await page.locator(`[data-task-project="${projectId}"]`).waitFor();
    await noDrawer();
    await visit(projectId, 'management', { category: 'requirements', task: fixture.task });
    await noDrawer();
    await assertCounts('requirements', fixture.requirements);
    await page.locator('.overview-requirements .overview-title').first().click();
    await page.getByRole('dialog').waitFor();
    await closeDrawer();
    await page.reload();
    await page.locator(`[data-task-project="${projectId}"]`).waitFor();
    await noDrawer();
    await cancelCreate('New requirement', 'requirement title');
    await page.getByRole('tab', { name: `Issues · ${fixture.issues}`, exact: true }).click();
    await cancelCreate('New issue', 'issue title');
    await page.getByRole('tab', { name: `Requirements · ${fixture.requirements}`, exact: true }).click();
    checks.push(`${projectId}: toolbar/residual task enter list; explicit open/close persists; both create cancellations send no POST`);

    const title = `${projectId} new requirement · ${randomUUID().slice(0, 8)}`;
    const description = 'Platinum cards get an extra 0.5% cashback on spending over the next three months; start and settlement policy await confirmation.';
    const createBody = await openCreation('New requirement', title, description, projectId === 'carddemo');
    const input = createBody.input as Record<string, unknown>;
    const taskId = String(input.id);
    assert.match(taskId, /^REQ-/);
    let task = (await state()).workspace.deliveryRequirements!.find(item => item.id === taskId)!;
    assert.ok(task);
    assert.equal(task.projectId, projectId);
    assert.equal(task.assigneeId, '');
    assert.deepEqual(task.skillIds, []);
    assert.equal(task.stage, 'preparing');
    assert.ok(Object.values(task.nodes).every(node => node.status === 'pending'));
    await assertCounts('requirements', fixture.requirements + 1);
    const row = page.locator('.overview-requirements tbody tr').filter({ hasText: title });
    assert.equal(await row.count(), 1);
    assert.match(await row.innerText(), /Unassigned|Not started/);
    await page.reload();
    await page.locator(`[data-task-project="${projectId}"]`).waitFor();
    await noDrawer();
    await assertCounts('requirements', fixture.requirements + 1);
    await page.getByRole('button', { name: title, exact: true }).click();
    let detail = page.getByRole('dialog', { name: title, exact: true });
    await detail.getByText(description, { exact: true }).waitFor();
    await detail.getByRole('button', { name: 'Assign assignee', exact: true }).click();
    const assignment = page.getByRole('dialog').filter({ has: page.getByRole('combobox', { name: 'Choose the requirement assignee', exact: true }) });
    await assignment.getByRole('combobox', { name: 'Choose the requirement assignee', exact: true }).click();
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').getByText(fixture.assignee, { exact: true }).click();
    const assigned: Promise<BrowserResponse> = page.waitForResponse(response => new URL(response.url()).pathname === '/api/delivery-requirements' && response.request().method() === 'POST');
    await assignment.getByRole('button', { name: 'Confirm the requirement assignment', exact: true }).click();
    const assignedResponse: BrowserResponse = await assigned;
    assert.equal(assignedResponse.status(), 200, await assignedResponse.text());
    task = (await state()).workspace.deliveryRequirements!.find(item => item.id === taskId)!;
    assert.equal(task.assigneeId, fixture.assigneeId);
    assert.equal(task.stage, 'preparing');
    await detail.getByRole('button', { name: 'View delivery progress', exact: true }).click();
    await page.locator(`[data-delivery-scope="${projectId}/${taskId}"]`).waitFor();
    assert.equal(new URLSearchParams((await page.evaluate(() => location.hash)).split('?')[1]).get('task'), taskId);
    assert.ok(await page.locator('.project-flow-heading').getByText(title, { exact: true }).isVisible());
    assert.ok(await page.locator(`[data-material-task="${taskId}"]`).getByText(new RegExp(fixture.assignee)).count());
    if (projectId === 'teams') {
      assert.equal(await page.locator('[aria-label="Delivery task list"]').getAttribute('data-task-count'), '6');
      for (const source of sourceTasks) assert.equal(await page.locator(`[data-delivery-task="${source.id}"]`).count(), 1);
      await page.locator('[data-delivery-task="T104"]').click();
      await page.locator('[data-delivery-scope="teams/T104"]').waitFor();
      await page.getByText('Source records · read-only', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: /Assign assignee|Change assignee/ }).count(), 0);
      await page.locator(`[data-delivery-task="${taskId}"]`).click();
      await page.locator(`[data-delivery-scope="teams/${taskId}"]`).waitFor();
    }
    assert.equal(await page.getByRole('region', { name: 'Project toolbar' }).getByRole('tab', { name: 'Task delivery', exact: true }).getAttribute('aria-selected'), 'true');
    await page.screenshot({ path: `${evidence}/${projectId}-created-delivery.png`, fullPage: true, animations: 'disabled' });

    await visit(projectId, 'management', { category: 'issues' });
    const issueTitle = `${projectId} new issue · ${randomUUID().slice(0, 8)}`;
    const issueBody = await openCreation('New issue', issueTitle, 'The spending amount boundary needs extra validation; no fix has been made yet.', projectId === 'teams');
    assert.equal(issueBody.kind, 'issue.create');
    const payload = issueBody.payload as Record<string, unknown>;
    assert.match(String(payload.id), /^ISSUE-/);
    assert.equal(payload.projectId, projectId);
    await assertCounts('issues', fixture.issues + 1);
    await page.reload();
    await page.locator(`[data-task-project="${projectId}"]`).waitFor();
    await noDrawer();
    await assertCounts('issues', fixture.issues + 1);
    await page.getByRole('button', { name: issueTitle, exact: true }).click();
    await page.getByRole('dialog', { name: issueTitle, exact: true }).waitFor();
    await closeDrawer();
    await page.getByRole('tab', { name: `Requirements · ${fixture.requirements + 1}`, exact: true }).click();
    await noDrawer();
    assert.equal(new URLSearchParams((await page.evaluate(() => location.hash)).split('?')[1]).get('item'), null);
    await page.getByRole('tab', { name: `Issues · ${fixture.issues + 1}`, exact: true }).click();
    await page.screenshot({ path: `${evidence}/${projectId}-created-issues.png`, fullPage: true });
    if (projectId === 'teams') {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: `${evidence}/teams-issues-narrow.png`, fullPage: true });
      assert.ok(await page.evaluate(() => document.body.scrollWidth <= innerWidth), 'task management must not overflow the narrow viewport');
      await page.setViewportSize({ width: 1440, height: 1000 });
    }

    await visit(projectId, 'content');
    assert.equal(await page.locator('[data-metric="all"] strong').innerText(), String(fixture.requirements + 1));
    assert.equal(await page.locator('[data-metric="issues"] strong').innerText(), String(fixture.issues + 1));
    await page.locator('[data-metric="all"]').click();
    await assertCounts('requirements', fixture.requirements + 1);
    await noDrawer();
    checks.push(`${projectId}: unassigned requirement persists, explicit assignee saved, own four-node delivery visible, issue persists, overview/tab/list totals agree`);

    // Replaying a submitted identity must not duplicate records; changing its
    // content under the same identity must fail without changing saved data.
    await post('/api/delivery-requirements', { revision: createBody.revision, action: 'create', input });
    await post('/api/workspace', { revision: issueBody.revision, kind: 'issue.create', payload });
    const beforeDenied = await state();
    await post('/api/delivery-requirements', { action: 'create', input: { ...input, title: title + ' changed' } }, 409);
    await post('/api/workspace', { kind: 'issue.create', payload: { ...payload, title: issueTitle + ' changed' } }, 409);
    await post('/api/delivery-requirements', { role: 'member', action: 'create', input: { ...input, id: 'REQ-' + randomUUID() } }, 403);
    await post('/api/workspace', { role: 'member', kind: 'issue.create', payload: { ...payload, id: 'ISSUE-' + randomUUID() } }, 403);
    await post('/api/delivery-requirements', { role: 'member', action: 'assign', input: { projectId, taskId, assigneeId: 'owner' } }, 403);
    await post('/api/delivery-requirements', { action: 'assign', input: { projectId, taskId, assigneeId: 'A' } }, [400, 409]);
    assert.deepEqual(await state(), beforeDenied);
    await visit(projectId, 'management', { category: 'requirements' }, 'member');
    assert.equal(await page.getByRole('button', { name: 'New requirement', exact: true }).count(), 0);
    await assertCounts('requirements', fixture.requirements + 1);
    await page.getByRole('button', { name: title, exact: true }).click();
    detail = page.getByRole('dialog', { name: title, exact: true });
    assert.equal(await detail.getByRole('button', { name: /Assign assignee|Change assignee/ }).count(), 0);
    await closeDrawer();
    await page.getByRole('tab', { name: `Issues · ${fixture.issues + 1}`, exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'New issue', exact: true }).count(), 0);
    await assertCounts('issues', fixture.issues + 1);
    results.push({ projectId, taskId, issueId: payload.id, title, issueTitle, assigneeId: fixture.assigneeId, requirements: fixture.requirements + 1, issues: fixture.issues + 1 });
  }

  const beforeSourceAttempt = await state();
  await post('/api/delivery-requirements', { action: 'assign', input: { projectId: 'teams', taskId: 'T104', assigneeId: 'member' } }, 404);
  assert.deepEqual(await state(), beforeSourceAttempt);
  assert.deepEqual((await (await fetch(origin + '/api/bootstrap')).json()).data.teamsProject.tasks, sourceTasks);
  assert.deepEqual((await state()).workspace.deliveryRequirements!.find(task => task.id === 'DEMO-MKT-001'), original.workspace.deliveryRequirements!.find(task => task.id === 'DEMO-MKT-001'));
  assert.equal((await state()).workspace.deliveryRequirements!.filter(task => task.id.startsWith('REQ-')).length, 2);
  const persisted = await readFile(join(directory, 'state.json'));
  await stop();
  await start();
  assert.deepEqual(await readFile(join(directory, 'state.json')), persisted, 'restarting an isolated service must not rewrite records');
  for (const result of results) {
    await visit(String(result.projectId), 'management', { category: 'requirements' });
    await noDrawer();
    await assertCounts('requirements', Number(result.requirements));
    assert.ok(await page.getByRole('button', { name: String(result.title), exact: true }).isVisible());
  }
  checks.push('Failed create retains draft/request identity and retries once; category switch clears explicit detail; Teams mixed sidebar retains five read-only source tasks; narrow management has no body overflow');
  checks.push('Owner/member authorization, original Teams imports read-only, same-ID replay/conflict, original main task untouched, process restart persistence');
  assert.deepEqual(errors, []);
  assert.equal(posts.filter(request => request.path.startsWith('/api/native/')).length, 0);
  assert.equal(posts.filter(request => !['/api/delivery-requirements', '/api/workspace'].includes(request.path)).length, 0, 'opening and reading must not trigger other business actions');
  assert.deepEqual(await sourceHashes(), inputs, 'tested production sources must stay unchanged throughout this run');
  await writeFile(`${evidence}/result.json`, JSON.stringify({ passed: true, scope: 'Real isolated HTTP persistence and in-memory UI; no native/model execution or live state changes', checks, results, browserPostPaths: posts.map(request => request.path), errors, persistedStateSha256: digest(persisted), inputs }, null, 2));
  console.log('PASS task-management explicit details, two-project creates/assignment/counts, read-only imports, authorization and restart persistence');
} catch (error) {
  await writeFile(`${evidence}/server.log`, logs);
  await page?.screenshot({ path: `${evidence}/failure.png`, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await stop();
  await rm(directory, { recursive: true, force: true });
}

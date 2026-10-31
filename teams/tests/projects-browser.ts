import { chromium, type Page } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initialState } from '../src/domain.js';
import { sharedPaths, type PublishedArtifact, type TalentsKnowledge } from '../../shared/contracts.js';

const origin = 'http://127.0.0.1:45973', dir = await mkdtemp(join(tmpdir(), 'teams-create-e2e-')), shared = join(dir, 'shared');
const talentOrigin = 'http://127.0.0.1:45983';
const legacy = initialState(); legacy.knowledge = true; legacy.revision = 1;
await writeFile(join(dir, 'state.json'), JSON.stringify(legacy));
const serviceEnv = { ...process.env, DEMO_PORT: '45973', DEMO_TALENT_PORT: '45983', DEMO_STATE_DIR: dir, DEMO_SHARED_DIR: shared, DEMO_SHARED_SEED_DIR: join(dir, 'no-seed'), DEMO_NATIVE_DISABLED: '1' };
const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { env: serviceEnv, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = ''; server.stdout.on('data', c => logs += c); server.stderr.on('data', c => logs += c);
/** Stands in for the Talents service: publishes one markdown artifact per project into the shared data directory. */
const published: PublishedArtifact[] = [];
async function publishFromTalents(projectId: string, id: string, name: string) {
  const file = 'doc-knowledge/' + name + '.md';
  published.push({ id, projectId, name, description: name + ' (published by Talents)', capability: 'doc-extract', capabilityName: 'Business knowledge extraction', category: 'doc', kind: 'files', version: 1, publishedAt: '2026-10-27T10:00:00.000Z', note: '', delivery: 'local', files: [{ path: file, title: name, type: 'markdown' }] });
  await mkdir(join(shared, 'talents', 'files', id, 'v1', 'doc-knowledge'), { recursive: true });
  await writeFile(join(shared, sharedPaths.talentsFile(id, 1, file)), '# ' + name + '\n\n- Source: ' + projectId + '\n<script>parent.__publishedArtifactExecuted = true</script><img src="https://invalid.example/preview-probe" onerror="parent.__publishedArtifactExecuted = true">');
  await writeFile(join(shared, sharedPaths.talentsKnowledge), JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), artifacts: published } satisfies TalentsKnowledge));
}
await mkdir('test-results', { recursive: true });
let browser, page: Page | undefined;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + '/api/health')).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 100)); }
  assert.ok(ready, logs);
  const bootstrap = await (await fetch(origin + '/api/bootstrap')).json() as any;
  const state = async () => await (await fetch(origin + '/api/state')).json() as any;
  let initial = await state(); const headers = { 'content-type': 'application/json', 'x-demo-token': bootstrap.token, origin };
  const draft = { id: randomUUID(), name: 'Customer Service Portal', description: 'Standalone project description', remoteUrl: 'https://github.com/example/customer-portal.git', repositoryIdentity: 'github.com/example/customer-portal' };
  const request = async (role: string, kind: string, payload: unknown) => fetch(origin + '/api/workspace', { method: 'POST', headers, body: JSON.stringify({ role, kind, payload, revision: (await state()).revision }) });
  assert.equal((await request('member', 'project.create', draft)).status, 403);
  assert.equal((await request('owner', 'project.create', { ...draft, name: '' })).status, 400);
  assert.deepEqual(await state(), initial);
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.setDefaultTimeout(7000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const visit = async (path: string) => { await page!.goto(origin + '/teams#/' + path); await page!.getByRole('combobox', { name: 'Switch role' }).waitFor(); };
  const closePanels = async (target = page!) => { for (const selector of ['.owner-project-panel', '.project-knowledge-drawer']) { const panel = target.locator(selector); if (await panel.isVisible()) { await panel.locator('.ant-drawer-close').click(); await panel.waitFor({ state: 'hidden' }); } } };
  const openPanel = async (name: string, target = page!) => { await closePanels(target); await target.getByRole('button', { name, exact: true }).click(); };
  const closeText = async (target = page!) => { await target.locator('.ant-drawer').filter({ has: target.locator('.drawer-console') }).locator('.ant-drawer-close').click(); await target.locator('.drawer-console').waitFor({ state: 'hidden' }); };
  const save = async (kind: string, name: string) => { const [response] = await Promise.all([page!.waitForResponse(r => r.url() === origin + '/api/workspace' && r.request().postDataJSON().kind === kind), page!.getByRole('button', { name, exact: true }).click()]); assert.equal(response.status(), 200, await response.text()); };
  const talentsHref = async (target = page!) => new URL((await target.locator('.project-knowledge').getByRole('link', { name: /(Mine|Apply) knowledge in Talents/ }).getAttribute('href'))!);
  await visit('projects?project=carddemo&tab=content'); await openPanel('View knowledge');
  await page.locator('.project-knowledge').getByText('No project knowledge to show yet', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-action="knowledge"]').count(), 0, 'Teams no longer starts knowledge integration');
  let href = await talentsHref(); assert.equal(href.origin, talentOrigin); assert.equal(href.hash, '#/review?project=carddemo');
  assert.deepEqual(await state(), initial, 'legacy Teams knowledge flag is not shown as published knowledge and is left unchanged');
  await publishFromTalents('carddemo', 'a-card', 'Platinum Cashback Business Rules'); await page.reload(); await openPanel('View knowledge');
  await page.locator('[data-artifact="a-card"]').getByText('Platinum Cashback Business Rules', { exact: true }).waitFor();
  await page.locator('[data-artifact="a-card"]').getByRole('button', { name: /View/ }).click(); await page.frameLocator('.talents-artifact-drawer .talents-markdown').locator('h1').getByText('Platinum Cashback Business Rules', { exact: true }).waitFor();
  assert.equal(await page.locator('.talents-artifact-drawer .talents-markdown').getAttribute('sandbox'), '');
  assert.equal(await page.evaluate(() => (window as Window & { __publishedArtifactExecuted?: boolean }).__publishedArtifactExecuted), undefined, 'published Markdown cannot execute against the Teams origin');
  await page.locator('.talents-artifact-drawer .ant-drawer-close').click(); await page.locator('.talents-artifact-drawer').waitFor({ state: 'hidden' }); await closePanels();
  const synced = await state(); assert.equal(synced.knowledgeVersion, 'Platinum Cashback Business Rules v1'); assert.equal(synced.audit.at(-1).detail, 'Talents published project knowledge: Platinum Cashback Business Rules v1');
  initial = synced;
  await visit('projects?tab=list');
  await page.getByRole('button', { name: 'Add project', exact: true }).click();
  await page.screenshot({ path: 'test-results/project-create-form.png' });
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByText('Enter a project name', { exact: true }).waitFor(); assert.deepEqual(await state(), initial);
  await page.getByRole('textbox', { name: 'Project name', exact: true }).fill(draft.name);
  await page.getByRole('textbox', { name: 'Project description', exact: true }).fill(draft.description);
  await page.getByRole('textbox', { name: 'Repository address', exact: true }).fill(draft.remoteUrl);
  await page.getByRole('textbox', { name: 'Repository identity (host/organization/repository)', exact: true }).fill(draft.repositoryIdentity);
  await save('project.create', 'Create project');
  await page.locator('.breadcrumb strong').getByText(draft.name, { exact: true }).waitFor();
  let created = await state(); const projectId = created.workspace.projects[0].id;
  assert.ok(!['carddemo', 'teams'].includes(projectId));
  const business = (value: any) => { const copy = structuredClone(value); delete copy.workspace.projects; copy.revision = 0; copy.audit = []; return copy; };
  assert.deepEqual(business(created), business(initial));
  await openPanel('Project materials'); await page.getByText('No project material linked yet', { exact: true }).waitFor(); await closePanels(); await openPanel('View knowledge');
  assert.equal(await page.locator('.created-project [data-action]').count(), 0);
  await page.locator('.project-knowledge').getByText('No project knowledge to show yet', { exact: true }).waitFor();
  href = await talentsHref(); assert.equal(href.hash, '#/review?project=' + projectId); await closePanels();
  await page.screenshot({ path: 'test-results/project-create-content.png' });
  await page.reload(); await page.locator('.breadcrumb strong').getByText(draft.name, { exact: true }).waitFor();
  const empty = [['Task management', 'No project requirements yet'], ['Task delivery', 'No deliverable task yet']];
  for (const [tab, text] of empty) { await page.getByRole('tab', { name: tab, exact: true }).click(); await page.getByText(text, { exact: true }).waitFor(); }
  assert.deepEqual(await page.locator('.project-toolbar [role=tab]').allTextContents(), ['Project overview', 'Task management', 'Task delivery']);
  await visit('projects?project=' + projectId + '&tab=release'); await page.getByText('Project page not found', { exact: true }).waitFor();
  await visit('projects?project=' + projectId + '&tab=content');
  await page.getByRole('button', { name: 'Project settings', exact: true }).click();
  await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('Customer Portal v2'); await save('project.metadata.update', 'Save project information');
  await page.locator('.breadcrumb strong').getByText('Customer Portal v2', { exact: true }).waitFor();
  await visit('projects?tab=list'); await page.locator('[data-project-primary="' + projectId + '"]').waitFor(); assert.equal(await page.locator('[data-project-primary="' + projectId + '"]').innerText(), 'Enter task management');
  await page.locator('.framework-sidebar').getByRole('link', { name: 'Customer Portal v2', exact: true }).click();
  await page.locator('.breadcrumb strong').getByText('Customer Portal v2', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  for (const width of [1440, 390]) { await page.setViewportSize({ width, height: 1000 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await page.screenshot({ path: `test-results/project-create-dark-${width}.png` }); }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await visit('projects?project=carddemo&tab=content'); await page.locator('.breadcrumb strong').getByText(initial.workspace.project.name, { exact: true }).waitFor(); await openPanel('Project materials'); await page.getByRole('button', { name: 'Link project asset' }).waitFor();
  await visit('projects?project=teams&tab=content'); await page.locator('.breadcrumb strong').getByText('iCode Teams', { exact: true }).waitFor(); await openPanel('Project materials'); await page.getByRole('button', { name: 'View AGENTS.md', exact: true }).waitFor();
  const member = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); await member.addInitScript(() => localStorage.setItem('carddemo-role', 'member'));
  await member.goto(origin + '/teams#/projects?tab=list'); await member.getByRole('combobox', { name: 'Switch role' }).waitFor(); assert.equal(await member.getByRole('button', { name: 'Add project', exact: true }).count(), 0); assert.equal(await member.locator('[data-project-primary="' + projectId + '"]').innerText(), 'Enter task delivery');
  await member.goto(origin + '/teams#/projects?project=' + projectId + '&tab=settings'); await member.getByText('Project members can view the basics; the Owner maintains them.', { exact: true }).waitFor(); assert.equal(await member.getByRole('textbox', { name: 'Project name', exact: true }).isDisabled(), true);
  assert.equal((await request('member', 'project.metadata.update', { ...draft, id: projectId, name: 'Unauthorized update' })).status, 403);
  await closePanels(); await page.getByRole('button', { name: 'Switch to light mode' }).click();
  const sharedTitles = ['Project basics', 'Project materials and assets', 'Project knowledge', 'Requirement materials and sources', 'Skills available to the project'];
  const layoutChecks: unknown[] = [];
  for (const [roleName, target] of [['owner', page], ['member', member]] as const) for (const id of ['carddemo', 'teams', projectId]) {
    await target.goto(origin + '/teams#/projects?project=' + id + '&tab=content');
    if (roleName === 'owner') {
      await target.locator('.project-owner-overview').waitFor(); assert.equal(await target.locator('[data-metric]').count(), 10);
      await openPanel('View knowledge', target); await target.locator('.project-knowledge').getByText(id === 'carddemo' ? 'Platinum Cashback Business Rules' : 'No project knowledge to show yet', { exact: true }).waitFor(); await closePanels(target);
      await openPanel('Project materials', target);
    } else { await target.locator('.project-content-template').waitFor(); assert.deepEqual(await target.locator('.project-content-template h2').allTextContents(), sharedTitles); await target.locator('.project-knowledge').getByText(id === 'carddemo' ? 'Platinum Cashback Business Rules' : 'No project knowledge to show yet', { exact: true }).waitFor(); assert.equal(await target.locator('.project-knowledge a[href*="/talents"]').count(), 0); }
    if (id === 'teams') { assert.equal(await target.getByRole('button', { name: 'Link project asset', exact: true }).count(), 0); await target.getByRole('button', { name: 'Project members and responsibilities', exact: true }).click(); await target.getByText('Members A, B and C collaborate on this project.', { exact: false }).waitFor(); }
    if (roleName === 'owner') await openPanel('View Skills', target);
    if (id === 'teams') for (const skill of bootstrap.data.teamsProject.project.skills) { await target.getByRole('button', { name: 'View Skill: ' + skill.name, exact: true }).click(); const original = bootstrap.data.teamsProject.documents.find((doc: any) => doc.path === '.agents/skills/' + skill.name + '/SKILL.md').content; assert.ok((await target.locator('.drawer-console').innerText()).includes(original)); await closeText(target); }
    await target.getByRole('tab', { name: 'User Skills · 4', exact: true }).click(); await target.getByRole('button', { name: 'View Skill: Teams collaboration', exact: true }).click(); assert.ok((await target.locator('.drawer-console').innerText()).includes('available across projects')); await closeText(target); await closePanels(target);
    for (const width of [1440, 390]) { await target.setViewportSize({ width, height: 1000 }); const layout = await target.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth })); assert.ok(layout.scrollWidth <= layout.width, JSON.stringify({ roleName, id, ...layout })); layoutChecks.push({ roleName, id, ...layout }); }
    await target.setViewportSize({ width: 1440, height: 1000 }); await target.locator('.page-scroll').evaluate(element => { element.scrollTop = 0; }); await target.screenshot({ path: `test-results/project-template-${id === projectId ? 'new' : id}-${roleName}.png`, animations: 'disabled' });
  }
  await visit('projects?project=' + projectId + '&tab=content');
  await openPanel('Project materials'); await page.getByRole('button', { name: 'Link project asset', exact: true }).click();
  await page.getByRole('combobox', { name: 'Filter asset source', exact: true }).click(); await page.locator('.ant-select-item-option-content').getByText('Requirements platform', { exact: true }).click();
  const sourcePicker = page.getByRole('combobox', { name: 'Select source asset', exact: true }); await sourcePicker.click(); await sourcePicker.fill('Credit Card Spending Cashback'); await page.locator('.ant-select-item-option-content').getByText('Credit Card Spending Cashback · Requirements platform · Credit Card', { exact: true }).waitFor(); await sourcePicker.press('Enter');
  await save('asset.link', 'Link selected asset');
  await page.getByRole('button', { name: 'View source: Credit Card Spending Cashback', exact: true }).click();
  assert.ok((await page.locator('.drawer-console').innerText()).includes('source plugin')); await closeText();
  await page.reload(); await openPanel('Project materials'); await page.getByRole('button', { name: 'View source: Credit Card Spending Cashback', exact: true }).waitFor(); await openPanel('View knowledge');
  await page.locator('.project-knowledge').getByText('No project knowledge to show yet', { exact: true }).waitFor();
  const beforeIndex = await state();
  await publishFromTalents(projectId, 'a-portal', 'Customer Portal Source Index'); await page.reload(); await openPanel('View knowledge');
  await page.locator('[data-artifact="a-portal"]').getByText('Customer Portal Source Index', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-artifact="a-card"]').count(), 0, 'no cross-project knowledge');
  assert.deepEqual(await state(), beforeIndex, 'knowledge published for a new project must not update CardDemo state');
  await page.route('**/api/talents/knowledge?project=' + projectId, route => route.abort());
  await page.locator('.project-knowledge').getByRole('button', { name: /^Refresh$/ }).click(); await page.getByText('Could not read Talents project knowledge', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-artifact="a-portal"]').count(), 0);
  await page.screenshot({ path: 'test-results/project-knowledge-offline.png', animations: 'disabled' });
  await page.unroute('**/api/talents/knowledge?project=' + projectId);
  await page.locator('.project-knowledge').getByRole('button', { name: /^Retry$/ }).click(); await page.locator('[data-artifact="a-portal"]').waitFor();
  assert.equal((await request('member', 'asset.link', { projectId, sourceAssetId: 'repository:teams:icode-teams' })).status, 403);
  assert.equal((await request('owner', 'asset.link', { projectId, sourceAssetId: 'not-in-provider' })).status, 409);
  assert.equal((await state()).assigned, false);
  created = await state(); assert.equal(created.workspace.projects.length, 1); assert.equal(created.workspace.projects[0].name, 'Customer Portal v2'); assert.deepEqual(business(created), business(initial)); assert.deepEqual(errors, []);
  await writeFile('test-results/project-create-results.json', JSON.stringify({ passed: true, projectId, roleProtection: true, requiredValidation: true, refreshPersistence: true, cardDemoUnchanged: true, emptyTabs: true, sharedTitles, layoutChecks, providerAssociation: true, talentsKnowledge: ['legacy flag ignored', 'shared-dir publish syncs CardDemo', 'artifact markdown drawer', 'new project knowledge', 'no cross-project results', 'offline retry'], pageErrors: errors }, null, 2));
  console.log('PASS: independent project create/edit, list/sidebar, refresh, empty tabs, Owner enforcement, invalid fields, existing projects unchanged');
} catch (error) { await page?.screenshot({ path: 'test-results/project-create-failure.png' }); throw error; }
finally { await browser?.close(); await Promise.all([server].map(process => new Promise(resolve => { process.once('exit', resolve); process.kill('SIGTERM'); }))); await rm(dir, { recursive: true, force: true }); }

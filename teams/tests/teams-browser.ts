import { chromium, type Page } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initialState } from '../src/domain.js';
const origin = 'http://127.0.0.1:46172', dir = await mkdtemp(join(tmpdir(), 'teams-groups-e2e-'));
await writeFile(join(dir, 'state.json'), JSON.stringify(initialState()));
const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { env: { ...process.env, DEMO_PORT: '46172', DEMO_TALENT_PORT: '46182', DEMO_STATE_DIR: dir, DEMO_SHARED_DIR: join(dir, 'shared'), DEMO_SHARED_SEED_DIR: join(dir, 'no-seed'), DEMO_NATIVE_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = ''; server.stdout.on('data', data => logs += data); server.stderr.on('data', data => logs += data);
await mkdir('test-results/teams', { recursive: true });
let browser, page: Page | undefined;
try {
  let ready = false; for (let n = 0; n < 100; n++) { try { if ((await fetch(origin + '/api/health')).ok) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 100)); } assert.ok(ready, logs);
  const boot = await (await fetch(origin + '/api/bootstrap')).json() as any;
  const state = async () => await (await fetch(origin + '/api/state')).json() as any;
  const before = await state();
  const request = async (role: string, kind: string, payload: unknown) => fetch(origin + '/api/workspace', { method: 'POST', headers: { 'content-type': 'application/json', origin, 'x-demo-token': boot.token }, body: JSON.stringify({ role, kind, payload, revision: (await state()).revision }) });
  for (const name of ['', ' ', 'x'.repeat(81)]) assert.equal((await request('owner', 'team.create', { id: 'team-' + randomUUID(), name })).status, 400);
  assert.equal((await request('member', 'team.create', { id: 'team-' + randomUUID(), name: 'Unauthorized team' })).status, 403);
  assert.equal((await request('owner', 'member.invite', { name: 'No scope given' })).status, 400); assert.deepEqual(await state(), before);
  browser = await chromium.launch({ channel: 'chrome', headless: true }); page = await browser.newPage({ viewport: { width: 1440, height: 1050 } }); page.setDefaultTimeout(8000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const visit = async (path: string) => { await page!.goto(origin + '/teams#/' + path); await page!.getByRole('combobox', { name: 'Switch role' }).waitFor(); };
  const save = async (kind: string, button: string) => { const [response] = await Promise.all([page!.waitForResponse(response => response.url() === origin + '/api/workspace' && response.request().postDataJSON().kind === kind), page!.getByRole('button', { name: new RegExp('^' + button.split('').join('\\s*') + '$') }).click()]); assert.equal(response.status(), 200, await response.text()); };
  await visit('team'); await page.getByRole('button', { name: 'New team', exact: true }).click(); await page.getByRole('button', { name: 'Create team', exact: true }).click(); await page.getByText('Enter a team name', { exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'New team name' }).fill('Cancelled team'); await page.getByRole('button', { name: /Cancel/ }).click(); assert.deepEqual(await state(), before);
  await page.getByRole('button', { name: 'New team', exact: true }).click(); await page.getByRole('textbox', { name: 'New team name' }).fill('Customer Service Team'); await save('team.create', 'Create team');
  let current = await state(); const teamId = current.workspace.teams[0].id;
  await page.locator(`[data-selected-team="${teamId}"]`).waitFor(); assert.equal(await page.locator('[data-team-members] [data-member-id]').count(), 1); assert.equal(await page.locator('[data-team-project]').count(), 0);
  assert.deepEqual(current.workspace.team, before.workspace.team); assert.equal(current.stage, before.stage); assert.ok(page.url().includes(teamId));
  await page.reload(); await page.locator(`[data-selected-team="${teamId}"]`).waitFor(); await page.screenshot({ path: 'test-results/teams/new-team.png' });
  assert.equal((await request('owner', 'team.create', { id: 'team-' + randomUUID(), name: 'Customer Service Team' })).status, 400);
  await page.getByRole('button', { name: 'Invite members', exact: true }).click(); await page.getByRole('combobox', { name: 'Select an existing member' }).click(); await page.locator('.ant-select-dropdown:visible').getByText('Chen Chen', { exact: true }).click(); await save('member.invite', 'Create invitation');
  await page.locator('[data-invitation-id="member"]').waitFor(); assert.equal(await page.locator('[data-team-members] [data-member-id]').count(), 1); await save('member.approve', 'Accept invitation'); await page.locator('[data-team-members] [data-member-id="member"]').waitFor();
  await page.getByRole('button', { name: 'Invite members', exact: true }).click(); await page.getByRole('textbox', { name: 'Invitee name' }).fill('Liu Ning'); await save('member.invite', 'Create invitation'); await save('member.approve', 'Accept invitation');
  current = await state(); const personId = current.workspace.teams[0].members.find((person: any) => person.name === 'Liu Ning').id;
  assert.equal((await request('owner', 'member.remove', { teamId: 'carddemo', id: personId })).status, 400);
  await page.getByRole('button', { name: 'Edit team name', exact: true }).click(); await page.getByRole('textbox', { name: 'Team name', exact: true }).fill('Customer Experience Team'); await save('team.update', 'Save'); await page.locator(`[data-team-id="${teamId}"]`).getByText('Customer Experience Team', { exact: true }).waitFor();
  // Browser navigation must also discard the old team's unsaved dialog.
  const beforeNavigation = await state(); await page.getByRole('button', { name: 'Invite members', exact: true }).click(); await page.getByRole('textbox', { name: 'Invitee name' }).fill('Unsubmitted member');
  await page.evaluate(() => { location.hash = '#/team?team=carddemo'; }); await page.locator('[data-selected-team="carddemo"]').waitFor(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); assert.deepEqual(await state(), beforeNavigation); await visit('team?team=' + teamId);
  // Create directly in the selected team using the shared project form.
  await page.getByRole('button', { name: 'Add project', exact: true }).click(); await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('Customer Service Portal'); await page.getByRole('textbox', { name: 'Project description', exact: true }).fill('Belongs to a separate team'); await page.getByRole('textbox', { name: 'Repository address', exact: true }).fill('https://example.test/customer.git'); await page.getByRole('textbox', { name: 'Repository identity (host/organization/repository)', exact: true }).fill('example.test/customer'); await save('project.create', 'Create project');
  current = await state(); assert.equal(current.workspace.projects[0].teamId, teamId); const createdId = current.workspace.projects[0].id;
  const otherId = randomUUID(); assert.equal((await request('owner', 'project.create', { id: otherId, name: 'Project to link', description: '', remoteUrl: 'https://example.test/other.git', repositoryIdentity: 'example.test/other' })).status, 200);
  await visit('team?team=' + teamId); await page.getByRole('button', { name: 'Link an existing project', exact: true }).click(); await page.getByRole('combobox', { name: 'Select a project to link' }).click(); await page.locator('.ant-select-dropdown:visible').getByText('Project to link · Credit Card R&D Team', { exact: true }).click(); assert.equal(await page.getByRole('button', { name: 'Confirm ownership change', exact: true }).isDisabled(), true);
  await page.getByRole('checkbox', { name: 'Confirm moving this project from its original team to this one' }).check(); await page.screenshot({ path: 'test-results/teams/project-association.png' }); await save('team.project.assign', 'Confirm ownership change'); await page.locator(`[data-team-project="${otherId}"]`).waitFor();
  await page.locator('[data-team-id="carddemo"]').click(); await page.locator('[data-selected-team="carddemo"]').waitFor(); assert.equal(await page.locator('[data-team-project]').count(), 1); await page.locator('[data-team-project="carddemo"]').waitFor(); assert.deepEqual((await state()).workspace.team, before.workspace.team);
  // A previous selection of a new team must not replace the original project's assignee list.
  await page.locator(`[data-team-id="${teamId}"]`).click(); await visit('projects?project=carddemo&tab=management&item=requirements%3Acarddemo%3ADEMO-MKT-001');
  await page.getByRole('button', { name: 'Assign assignee', exact: true }).click(); await page.getByRole('combobox', { name: 'Choose the requirement assignee', exact: true }).click();
  assert.deepEqual(await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').allTextContents(), ['Lin Yue','Chen Chen','Su Qing','Yang Fan','Zhao Ning','Wang Xiao']); await page.keyboard.press('Escape'); await page.getByRole('button', { name: /Cancel/ }).click();
  // Shared role identity only sees teams it joined; management remains Owner-only.
  const member = await browser.newPage({ viewport: { width: 1440, height: 1050 } }); await member.addInitScript(() => localStorage.setItem('carddemo-role', 'member')); await member.goto(origin + '/teams#/team?team=' + teamId); await member.locator(`[data-selected-team="${teamId}"]`).waitFor();
  assert.equal(await member.locator('[data-team-id]').count(), 2); assert.equal(await member.getByRole('button', { name: 'New team', exact: true }).count(), 0); assert.equal(await member.getByRole('button', { name: 'Invite members', exact: true }).count(), 0); assert.equal(await member.getByRole('button', { name: 'Link an existing project', exact: true }).count(), 0);
  for (const kind of ['team.update','member.invite','member.approve','member.role','member.remove','team.project.assign']) assert.equal((await request('member', kind, { teamId, id: personId, name: 'Unauthorized', projectId: createdId, fromTeamId: teamId })).status, 403);
  await visit('team?team=' + teamId); const layouts: unknown[] = [];
  for (const theme of ['light','dark']) {
    await page.setViewportSize({ width: 1440, height: 1050 }); if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    for (const width of [1440,768,390]) { await page.setViewportSize({ width, height: 1050 }); await page.mouse.move(0, 0); await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), theme + ':' + width); await page.screenshot({ path: `test-results/teams/team-${theme}-${width}.png` }); layouts.push({ theme, width, overflow: false }); }
  }
  await page.reload(); await page.locator(`[data-team-project="${createdId}"]`).waitFor(); assert.equal(await page.locator('[data-team-project]').count(), 2);
  assert.deepEqual((await state()).workspace.team, before.workspace.team); assert.equal((await state()).stage, before.stage); assert.deepEqual(errors, []);
  await writeFile('test-results/teams/result.json', JSON.stringify({ passed: true, teamId, projectId: createdId, layouts, checks: ['cancel/invalid/duplicate/permission', 'create/rename/refresh', 'scoped invite/approve', 'project create/explicit transfer', 'original project assignment isolated', 'member visibility/read-only'] }, null, 2));
  console.log('Teams browser passed: creation, member/project isolation, persistence, permissions, six layouts.');
} catch (error) { if (page) await page.screenshot({ path: 'test-results/teams/failure.png', fullPage: true }); console.error(logs); throw error; }
finally { await browser?.close(); server.kill('SIGTERM'); await new Promise(resolve => server.once('exit', resolve)); await rm(dir, { recursive: true, force: true }); }

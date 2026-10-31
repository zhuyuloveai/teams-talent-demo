import { createHash } from 'node:crypto';
import { DomainError, type DemoState } from '../src/domain.js';
import { deliveryRequirement } from '../src/delivery-requirements.js';
import { collectTaskSessions } from '../src/task-automation.js';
import type { TalentTaskInputs, TalentTaskIntake, TalentTaskSession, TalentTaskSessionPayload } from '../src/talent-contract.js';
import type { SkillBinding } from '../src/resource-sharing.js';
import { loadSourceSkillPackage, loadNativeSkillPackage } from './skill-packages.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicJson } from './store.js';
import { sharedDir, talentOrigin } from './config.js';
import { projectKnowledge } from './shared-data.js';
import { validateSessionDocumentCapacity } from './session-capacity.js';

/** Resolve the recorded immutable package; never relabel current bytes as an old version. */
export async function registeredTaskSkill(id:string,binding?:SkillBinding):Promise<TalentTaskInputs['skills'][number]>{
 const pkg=binding?.sha256?await loadNativeSkillPackage(id,binding.version,binding.sha256):await loadSourceSkillPackage(id);
 if(binding&&pkg.version!==binding.version)throw new DomainError('The registered Skill does not match the selected version',409);
 const main=pkg.files.find(file=>file.path==='SKILL.md');if(!main)throw new DomainError('The registered Skill has no body',500);
 if(binding?.contentSha256&&binding.contentSha256!==main.sha256)throw new DomainError('The pinned Skill body digest does not match',409);
 return{id:pkg.id,name:pkg.name,version:pkg.version,sha256:pkg.sha256,contentSha256:main.sha256,content:main.bytes.toString('utf8'),source:'teams-registered-package'};
}

/** Task facts stay in Teams; published knowledge comes from the Talents shared directory. */
export async function sharedTaskInputs(state: DemoState, projectId: string, taskId: string): Promise<TalentTaskInputs> {
  const task = deliveryRequirement(state, projectId, taskId);
  if (!task) throw new DomainError('The delivery requirement does not exist or does not belong to the selected project', 404);
  const published = await projectKnowledge(projectId);
  const sourceDigest = createHash('sha256').update(JSON.stringify({ title: task.title, description: task.description, skillIds: task.skillIds })).digest('hex');
  const version = 'requirement-' + sourceDigest.slice(0, 12);
  const skills = await Promise.all(task.skillIds.map(id=>registeredTaskSkill(id,task.skillBindings?.find(binding=>binding.id===id))));
  return { projectId, taskId, generation: state.talentGeneration ?? 'initial', origin: talentOrigin,
    requirement: { id: taskId, title: task.title, description: task.description },
    knowledge: { status: 'ready', version, assets: [
      { id: 'requirement:' + projectId + ':' + taskId, title: 'Confirmed content of this requirement · ' + task.title, version, detail: task.description, origin: 'teams-task' },
      ...published.map(item => ({ id: item.id, title: item.name, version: String(item.version), detail: item.description, origin: 'talents-shared' as const })),
    ] }, skills };
}

/** A persisted export receipt confirms sharing, not Talents processing or model execution. */
export async function exportTaskSessions(state: DemoState, value: unknown, directory = sharedDir) {
  const payload = taskSessionPayload(value), task = deliveryRequirement(state, payload.projectId, payload.taskId);
  const main = payload.projectId === 'carddemo' && payload.taskId === 'DEMO-MKT-001';
  if (!task && !main) throw new DomainError('Delivery requirement does not exist', 404);
  const acceptedAt = task?.acceptedAt ?? [...state.audit].reverse().find(item => ['通过功能验收','Functional acceptance passed'].includes(item.action))?.at;
  if ((task?.stage ?? state.stage) !== 'accepted' || acceptedAt !== payload.acceptedAt) throw new DomainError('The task is not accepted yet or the acceptance time does not match', 409);
  const inputDigest = task?.inputDigest ?? createHash('sha256').update(JSON.stringify(state.context)).digest('hex');
  if (inputDigest !== payload.inputDigest) throw new DomainError('The adoption basis digest does not match the accepted task', 409);
  if (JSON.stringify(normalizeTaskSessions(collectTaskSessions(state, payload))) !== JSON.stringify(payload.sessions)) throw new DomainError('The session list does not match the node links of the accepted task', 409);
  const key = createHash('sha256').update(payload.idempotencyKey).digest('hex');
  const path = join(directory, 'teams', 'task-sessions', key + '.json');
  const payloadSha256 = taskSessionPayloadDigest(payload);
  try {
    const previous = JSON.parse(await readFile(path, 'utf8')) as TalentTaskIntake;
    validateTaskIntakes([previous]);
    if (previous.generation !== (state.talentGeneration ?? 'initial') || previous.receipt.payloadSha256 !== payloadSha256) throw new DomainError('The idempotency key is already used for a different report', 409);
    return previous.receipt;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const receipt = { id: 'SHARED-' + key, receivedAt: payload.acceptedAt, projectId: payload.projectId, taskId: payload.taskId,
    sessionIds: [...new Set(payload.sessions.map(item => item.sessionId))], payloadSha256,
    ...(payload.sessionDocuments ? { documentHashes: payload.sessionDocuments.map(({ sessionId, sha256 }) => ({ sessionId, sha256 })) } : {}) };
  await atomicJson(path, { generation: state.talentGeneration ?? 'initial', payload, receipt });
  return receipt;
}

const need: (value: unknown, message: string, status?: number) => asserts value = (value, message, status = 400) => { if (!value) throw new DomainError(message, status); };
const text = (value: unknown, label: string, max = 200) => { need(typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max && !/[\u0000-\u001f]/.test(value), label + ' is invalid'); return value; };
const at = (value: unknown, label: string) => { const result = text(value, label, 40); need(/^\d{4}-\d{2}-\d{2}T/.test(result) && Number.isFinite(Date.parse(result)), label + ' is invalid'); return result; };
const digest = (value: unknown, label: string) => { need(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), label + ' is invalid'); return value; };
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
function values(value: unknown, label: string, empty = false) {
  need(Array.isArray(value) && value.length <= 100 && (empty || value.length > 0), label + ' is invalid');
  return [...new Set(value.map(item => text(item, label)))].sort(compare);
}
export function normalizeTaskSessions(value: unknown): TalentTaskSession[] {
  need(Array.isArray(value) && value.length > 0 && value.length <= 200, 'The session list cannot be empty or out of range');
  const keys = new Set<string>();
  return value.map((item): TalentTaskSession => {
    need(item && typeof item === 'object', 'Invalid session record');
    const raw = item as Record<string, unknown>; need(raw.tool === 'icode' || raw.tool === 'opencode', 'Invalid session tool');
    const sessionId = text(raw.sessionId, 'Session ID'), key = raw.tool + ':' + sessionId; need(!keys.has(key), 'The session list is not deduplicated by tool and ID'); keys.add(key);
    const nodeIds = values(raw.nodeIds, 'Linked nodes'); need(nodeIds.every(id => ['develop','verify'].includes(id)), 'Only development and verification node sessions are accepted');
    const firstAt = at(raw.firstAt, 'First linked time'), lastAt = at(raw.lastAt, 'Last linked time'); need(Date.parse(firstAt) <= Date.parse(lastAt), 'Invalid order of session link times');
    return { tool: raw.tool, sessionId, nodeIds, runIds: values(raw.runIds, 'Run IDs', true), sources: values(raw.sources, 'Link sources'), firstAt, lastAt };
  }).sort((a,b) => compare(a.tool + ':' + a.sessionId, b.tool + ':' + b.sessionId));
}
function sessionDocuments(value: unknown, sessions: TalentTaskSession[]): NonNullable<TalentTaskSessionPayload['sessionDocuments']> {
  need(Array.isArray(value) && value.length <= sessions.length, 'Invalid session document list'); const ids = new Set<string>();
  validateSessionDocumentCapacity(value);
  return value.map(item => {
    need(item && typeof item === 'object', 'Invalid session document'); const sessionId = text(item.sessionId, 'Document session ID');
    need(sessions.some(session => session.sessionId === sessionId) && !ids.has(sessionId), 'The session document ID is duplicated or outside the reported scope'); ids.add(sessionId);
    const sha256 = digest(item.sha256, 'Session document digest'); need(createHash('sha256').update(item.content, 'utf8').digest('hex') === sha256, 'The session document content does not match its digest');
    let document: unknown; try { document = JSON.parse(item.content); } catch { throw new DomainError('The session document is not valid JSON', 400); }
    need(document && typeof document === 'object' && !Array.isArray(document), 'The session document must be a JSON object');
    need(sessions.some(session => session.sessionId === sessionId && session.tool === 'icode'), 'Only session documents in the verified iCode format are accepted for now');
    need((document as { meta?: { session_id?: unknown } }).meta?.session_id === sessionId, 'The ID inside the native session document does not match the reported scope');
    return { sessionId, sha256, content: item.content as string };
  }).sort((a,b) => compare(a.sessionId, b.sessionId));
}
export function taskSessionPayload(value: unknown): TalentTaskSessionPayload {
  need(value && typeof value === 'object' && !Array.isArray(value), 'Invalid session report content'); const input = value as Record<string, unknown>;
  const payload: TalentTaskSessionPayload = { projectId: text(input.projectId, 'Project scope'), taskId: text(input.taskId, 'Task scope'), deliveryId: text(input.deliveryId, 'Delivery ID'), idempotencyKey: text(input.idempotencyKey, 'Idempotency key'), acceptedAt: at(input.acceptedAt, 'Acceptance time'), inputDigest: digest(input.inputDigest, 'Adoption basis digest'), sessions: normalizeTaskSessions(input.sessions) };
  if (Object.hasOwn(input, 'sessionDocuments')) payload.sessionDocuments = sessionDocuments(input.sessionDocuments, payload.sessions);
  return payload;
}
export const taskSessionPayloadDigest = (payload: TalentTaskSessionPayload) => createHash('sha256').update(JSON.stringify(taskSessionPayload(payload))).digest('hex');
export function validateTaskIntakes(value: unknown): asserts value is TalentTaskIntake[] {
  need(Array.isArray(value), 'The shared session list is corrupted'); const keys = new Set<string>(), receiptIds = new Set<string>();
  for (const record of value) {
    need(record && typeof record === 'object', 'A shared session record is corrupted'); const payload = taskSessionPayload(record.payload), receipt = record.receipt;
    text(record.generation, 'Project generation'); need(!keys.has(payload.idempotencyKey), 'Duplicate shared session idempotency key'); keys.add(payload.idempotencyKey);
    need(receipt && typeof receipt === 'object', 'A shared session receipt is corrupted'); text(receipt.id, 'Receipt ID'); at(receipt.receivedAt, 'Received time'); need(!receiptIds.has(receipt.id), 'Duplicate shared session receipt'); receiptIds.add(receipt.id);
    need(receipt.projectId === payload.projectId && receipt.taskId === payload.taskId && receipt.payloadSha256 === taskSessionPayloadDigest(payload) && JSON.stringify(receipt.sessionIds) === JSON.stringify([...new Set(payload.sessions.map(item => item.sessionId))]), 'The shared session content does not match its receipt');
    need(JSON.stringify(receipt.documentHashes ?? []) === JSON.stringify(payload.sessionDocuments?.map(({ sessionId, sha256 }) => ({ sessionId, sha256 })) ?? []), 'The shared session document receipt does not match the content');
  }
}

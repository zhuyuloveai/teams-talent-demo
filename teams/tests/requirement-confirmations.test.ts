import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState } from '../src/domain.js';
import { createDeliveryRequirement, updateRequirementConfirmations, validateDeliveryRequirements } from '../src/delivery-requirements.js';
import { taskNodeDefinitions, taskNodeView } from '../src/task-node-contract.js';

const at = '2026-10-27T00:00:00Z', later = '2026-10-28T00:00:00Z';
function setup() {
  const state = initialState();
  const task = createDeliveryRequirement(state, 'owner', { projectId: 'carddemo', id: 'MKT-CONFIRM-001', title: 'Confirmation basis', description: 'Open items must not be treated as confirmed', assigneeId: 'member' }, at);
  return { state, task };
}

test('owner registers confirmation basis; unchanged entries keep their original id and time', () => {
  const { state, task } = setup();
  updateRequirementConfirmations(state, 'owner', 'carddemo', task.id, [{ item: 'Campaign period', basis: 'Business confirmation: 2026-11-01 to 2027-01-31', confirmedBy: 'Lin Yue' }], at);
  const first = structuredClone(task.confirmations!);
  assert.equal(first.length, 1); assert.equal(first[0].confirmedAt, at); assert.ok(first[0].id);
  updateRequirementConfirmations(state, 'owner', 'carddemo', task.id, [{ id: first[0].id, item: first[0].item, basis: first[0].basis, confirmedBy: first[0].confirmedBy }], later);
  assert.deepEqual(task.confirmations, first);
  updateRequirementConfirmations(state, 'owner', 'carddemo', task.id, [{ id: first[0].id, item: first[0].item, basis: 'Addendum: refunds reverse the original transaction', confirmedBy: first[0].confirmedBy }], later);
  assert.equal(task.confirmations![0].id, first[0].id); assert.equal(task.confirmations![0].confirmedAt, later); assert.equal(task.updatedAt, later);
  updateRequirementConfirmations(state, 'owner', 'carddemo', task.id, [], later);
  assert.deepEqual(task.confirmations, []);
});

test('confirmations are a prepare input only, with the Owner as source', () => {
  const { state, task } = setup();
  updateRequirementConfirmations(state, 'owner', 'carddemo', task.id, [{ item: 'Campaign period', basis: 'Business confirmation email', confirmedBy: 'Lin Yue' }], at);
  const prepare = taskNodeView(state, task, 'prepare').inputs.find(item => item.id === 'confirmations')!;
  assert.equal(prepare.status, 'ready'); assert.equal(prepare.references.length, 1); assert.equal(prepare.references[0].source, 'owner');
  assert.match(prepare.references[0].description, /Basis: Business confirmation email/); assert.match(prepare.references[0].description, /Confirmed by: Lin Yue/);
  assert.equal(taskNodeView(state, task, 'develop').inputs.some(item => item.id === 'confirmations'), false);
});

test('only the Owner may record; invalid, duplicate or locked entries are rejected', () => {
  const { state, task } = setup();
  assert.throws(() => updateRequirementConfirmations(state, 'member', 'carddemo', task.id, [{ item: 'a', basis: 'b', confirmedBy: 'c' }], at), /Only the project Owner/);
  for (const value of [undefined, {}, [{ item: '', basis: 'b', confirmedBy: 'c' }], [{ item: 'a', basis: '', confirmedBy: 'c' }], [{ item: 'a', basis: 'b', confirmedBy: '' }], Array.from({ length: 21 }, (_, index) => ({ item: 'i' + index, basis: 'b', confirmedBy: 'c' }))]) {
    assert.throws(() => updateRequirementConfirmations(state, 'owner', 'carddemo', task.id, value, at), /[Cc]onfirm/);
  }
  const duplicateId = 'confirmation-1';
  assert.throws(() => updateRequirementConfirmations(state, 'owner', 'carddemo', task.id, [{ id: duplicateId, item: 'a', basis: 'b', confirmedBy: 'c' }, { id: duplicateId, item: 'd', basis: 'e', confirmedBy: 'f' }], at), /Duplicate confirmation basis ID/);
  updateRequirementConfirmations(state, 'owner', 'carddemo', task.id, [{ item: 'a', basis: 'b', confirmedBy: 'c' }], at);
  task.stage = 'awaiting-acceptance'; assert.throws(() => updateRequirementConfirmations(state, 'owner', 'carddemo', task.id, [], later), /cannot be changed/);
  task.stage = 'accepted'; assert.throws(() => updateRequirementConfirmations(state, 'owner', 'carddemo', task.id, [], later), /cannot be changed/);
});

test('persisted confirmation records are shape-checked; the prepare criterion distinguishes confirmed and open items', () => {
  const { state, task } = setup();
  updateRequirementConfirmations(state, 'owner', 'carddemo', task.id, [{ item: 'Campaign period', basis: 'Business confirmation', confirmedBy: 'Lin Yue' }], at);
  validateDeliveryRequirements(state);
  task.confirmations![0].confirmedAt = 'not-a-date';
  assert.throws(() => validateDeliveryRequirements(state), /Invalid requirement confirmation basis/);
  const label = taskNodeDefinitions.prepare.completionCriteria.find(item => item.id === 'prepare.confirmed')!.label;
  assert.match(label, /separates confirmed and open items/); assert.match(label, /not treated as confirmed/);
});

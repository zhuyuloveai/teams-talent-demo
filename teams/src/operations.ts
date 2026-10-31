import type { DemoState } from './domain.js';
import { currentT, type MessageKey } from '../../shared/i18n/index.js';

export type Presence = '未使用' | '离线' | '在线空闲' | '执行中' | '等待人工处理';
/** The enum values are business keys; this is the label shown in the UI. */
const presenceKeys: Record<Presence, MessageKey> = { '未使用': 'presence.unused', '离线': 'presence.offline', '在线空闲': 'presence.online', '执行中': 'presence.running', '等待人工处理': 'presence.waiting' };
export const presenceLabel = (value: Presence): string => currentT(presenceKeys[value]);
export interface DemoInstance { id: string; state: Presence; task: string; project: string }
export interface DemoMember { id: string; name: string; used: boolean; today: boolean; lastActive: string; tokens: number; instances: DemoInstance[] }
export function teamUsage(state: DemoState): DemoMember[] {
  const current: Presence = state.stage === 'developing' ? '执行中' : ['failed', 'returned'].includes(state.stage) ? '等待人工处理' : '在线空闲';
  return [
    { id: 'lin', name: 'Lin Yue', used: true, today: true, lastActive: 'Just now', tokens: 42000, instances: [{ id: 'IC-DEMO-01', state: '在线空闲', task: 'Waiting to start a run', project: state.workspace.project.name }] },
    { id: 'chen', name: 'Chen Chen', used: true, today: true, lastActive: state.context ? 'Just now' : 'Today 09:12', tokens: state.context ? 168000 : 12000, instances: [{ id: 'IC-DEMO-02', state: current, task: state.assigned ? 'Credit Card Spending Cashback' : 'Waiting for requirement assignment', project: state.workspace.project.name }, { id: 'IC-DEMO-03', state: '离线', task: 'Reading legacy code', project: state.workspace.project.name }] },
    { id: 'su', name: 'Su Qing', used: true, today: true, lastActive: 'Just now', tokens: 96000, instances: [{ id: 'IC-DEMO-04', state: '执行中', task: 'Statement query API regression', project: 'Account Service Maintenance' }] },
    { id: 'yang', name: 'Yang Fan', used: true, today: true, lastActive: '2 minutes ago', tokens: 64000, instances: [{ id: 'IC-DEMO-05', state: '等待人工处理', task: 'Confirm API change scope', project: 'Account Service Maintenance' }] },
    { id: 'zhao', name: 'Zhao Ning', used: true, today: false, lastActive: 'Yesterday 17:38', tokens: 0, instances: [{ id: 'IC-DEMO-06', state: '离线', task: 'No running job', project: state.workspace.project.name }] },
    { id: 'wang', name: 'Wang Xiao', used: false, today: false, lastActive: 'No record yet', tokens: 0, instances: [] },
  ];
}
export function presence(member: DemoMember): Presence {
  if (!member.used) return '未使用';
  for (const status of ['执行中', '等待人工处理', '在线空闲', '离线'] as const) if (member.instances.some(i => i.state === status)) return status;
  return '离线';
}
export function usageSummary(members: DemoMember[]) {
  const people = [...new Map(members.map(m => [m.id, m])).values()];
  return { total: people.length, used: people.filter(m => m.used).length, today: people.filter(m => m.today).length,
    online: people.filter(m => m.instances.some(i => ['在线空闲', '执行中', '等待人工处理'].includes(i.state))).length,
    running: people.filter(m => m.instances.some(i => i.state === '执行中')).length,
    tokens: people.reduce((sum, m) => sum + m.tokens, 0) };
}

import inventory from '../fixtures/skill-inventory.json';
import type { DemoState, Role } from './domain.js';
import { userSkillExamples } from './project-skill-examples.js';

export const projectSkillIds = ['cobol-legacy-knowledge','arch-impact-analysis','arch-adr-writing','ba-requirement-analysis','ba-acceptance-criteria','dev-backend-service','dev-frontend-ui','dev-code-reviewer','dev-unit-test','qa-integration-test','sec-scan-review','qa-uat-support','ba-requirement-tracing'];
export const availableSkillIds = [...projectSkillIds, ...userSkillExamples.map(skill => skill.id)];
export const shareableResourceIds = [...inventory.map(skill => skill.name), 'code-agent'];
export type ResourcePublisher = 'owner' | 'library';
export interface SkillCatalogEntry {
  id: string; name: string; description: string; version: string;
  /** SHA-256 of the sorted complete package manifest; contentSha256 is SKILL.md alone. */
  sha256: string; contentSha256: string; category: 'skill';
  publisher: ResourcePublisher; publisherName: string; source: string;
}
export interface ResourcePublication {
  id: string; version: string; publishedAt: string | null; scope: 'team'; publisher: ResourcePublisher;
  sha256?: string; contentSha256?: string; publisherName?: string; source?: string;
}
export interface ResourceSubscription {
  id: string; version: string; sha256: string; contentSha256?: string;
  actor: Role; subscribedAt: string | null; source: 'subscription';
}
export interface SkillBinding { id: string; version: string; sha256?: string; contentSha256?: string; source: 'project' | 'user' | 'subscription' }
/** File-backed resource versions are independent of Talent candidate labels. */
export function resourceVersion(state: DemoState, id: string) {
  return id === 'code-agent' ? state.adoptedAgent : inventory.find(skill => skill.name === id)?.version ?? '';
}
export function resourceCatalog(data: { skillCatalog: SkillCatalogEntry[] }): SkillCatalogEntry[] { return data.skillCatalog; }
/** Historical shares remain visible without rewriting the saved state or inventing content hashes. */
export function resourcePublicationHistory(state: DemoState): ResourcePublication[] {
  const legacy: ResourcePublication[] = state.published ? [...projectSkillIds, 'code-agent'].map(id => ({ id, version: id === 'code-agent' ? 'r1' : '1.0.0', publishedAt: state.audit.find(item => item.action === '发布共享能力包')?.at ?? null, scope: 'team', publisher: 'owner', publisherName: 'Lin Yue', source: 'legacy-project-share' })) : [];
  return [...legacy, ...(state.workspace.resourcePublications ?? [])];
}
export function resourcePublications(state: DemoState): ResourcePublication[] {
  const records = new Map<string, ResourcePublication>();
  for (const item of resourcePublicationHistory(state)) records.set(item.id, item);
  return [...records.values()];
}
/** Old acquiredResources did not record an actor. Preserve it as history without granting a subscription. */
export function resourceSubscriptions(state: DemoState, role: Role): ResourceSubscription[] {
  return (state.workspace.resourceSubscriptions ?? []).filter(item => item.actor === role);
}
export function availableSkillIdsFor(state: DemoState, role: Role): string[] {
  return [...new Set([...availableSkillIds, ...resourceSubscriptions(state, role).filter(item => item.sha256 && inventory.some(skill => skill.name === item.id)).map(item => item.id)])];
}
export function selectedSkillBindings(state: DemoState, role: Role): SkillBinding[] {
  const subscribed = new Map(resourceSubscriptions(state, role).map(item => [item.id, item]));
  return state.workspace.selectedSkills.map(id => {
    const subscription = subscribed.get(id);
    if (subscription?.sha256) return { id, version: subscription.version, sha256: subscription.sha256, contentSha256: subscription.contentSha256, source: 'subscription' };
    const user = userSkillExamples.find(skill => skill.id === id);
    return { id, version: user ? 'user-scope' : resourceVersion(state, id), source: user ? 'user' : 'project' };
  });
}
export function validateResourceState(state: DemoState): void {
  const publications = state.workspace.resourcePublications;
  const digest = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  if (Object.hasOwn(state.workspace, 'resourcePublications') && (!Array.isArray(publications) || publications.some(item => !item || !shareableResourceIds.includes(item.id) || !item.version || item.scope !== 'team' || !['owner','library'].includes(item.publisher) || typeof item.publishedAt !== 'string' || (item.sha256 !== undefined && (!digest(item.sha256) || !digest(item.contentSha256)))) || new Set(publications.map(item => `${item.id}:${item.version}:${item.sha256 ?? ''}`)).size !== publications.length)) throw new Error('Invalid resource publication records; not overwritten automatically');
  const subscriptions = state.workspace.resourceSubscriptions;
  if (Object.hasOwn(state.workspace, 'resourceSubscriptions') && (!Array.isArray(subscriptions) || subscriptions.some(item => !item || !shareableResourceIds.includes(item.id) || !item.version || !['owner','member'].includes(item.actor) || item.source !== 'subscription' || typeof item.subscribedAt !== 'string' || (item.id !== 'code-agent' && (!digest(item.sha256) || !digest(item.contentSha256))) || !resourcePublicationHistory(state).some(publication => publication.id === item.id && publication.version === item.version && (publication.sha256 ?? '') === item.sha256)) || new Set(subscriptions.map(item => `${item.actor}:${item.id}`)).size !== subscriptions.length)) throw new Error('Invalid resource subscription records; not overwritten automatically');
}

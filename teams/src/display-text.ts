/** Presentation-only labels. Never apply to protocol values, paths, hashes, or source/Skill text. */
import { currentT, type MessageKey } from '../../shared/i18n/index.js';
import { knownServerNote } from './task-labels-en.js';

/**
 * What the service says about a node's selected inputs. The service sends prose for other cases;
 * the two it produces most often are rebuilt here so they follow the UI language.
 */
export function selectionNote(selection: { status: string; note: string } | undefined): string | undefined {
  if (!selection) return undefined;
  if (selection.status === 'configured') return currentT('sel.configured');
  if (selection.status === 'not-configured') return currentT('sel.notConfigured');
  return selection.note;
}
/** Session streams carry a fixed explanatory note from the service; rebuild it so it follows the UI language. */
export function streamNote(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const key = knownServerNote(text);
  return key ? currentT(key as MessageKey) : text;
}
export function displayRequirementId(value: string): string {
  return value.replace(/\bDEMO-MKT-001\b/g, 'MKT-001');
}
/** Use explicitly on product metadata or saved UI messages; source bodies stay untouched. */
export function displayText(value: string): string {
  return displayRequirementId(value)
    .replace(/\s*\((?:demo|mock|simulated|sample)\)/gi, '')
    .replace(/\b(?:demo|mock|simulated)\s+(data|records?)\b/gi, (match: string, noun: string) => { const word = noun.toLowerCase().startsWith('data') ? 'records' : noun.toLowerCase(); return /^[A-Z]/.test(match) ? word[0].toUpperCase() + word.slice(1) : word; })
    .replace(/\b(?:demo|mock|simulated)\s+(workspace|service|role|configuration|config|project|flow|integration)\b/gi, '$1')
    .replace(/(?<![\w/.:-])(?:mock|demo|simulated)(?![\w/.:-])\s*/gi, '')
    .replace(/ {2,}/g, ' ').replace(/ +([,.;:)])/g, '$1').trim();
}

/** Upgrade only the former default project description in the view; saved/custom text stays untouched. */
export function displayProjectDescription(value: string): string {
  // The left-hand side is the old default persisted in saved state (Chinese), kept as a match key.
  return value === '基于存量 CardDemo 系统交付餐饮返现能力，形成可追溯的项目知识与研发经验。' || value === '针对白金卡客户未来 3 个月的消费，额外增加 0.5% 的消费返现。'
    ? 'Platinum card customers get an extra 0.5% cashback on their spending over the next 3 months.' : value;
}

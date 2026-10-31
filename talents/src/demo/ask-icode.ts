// Mock "ask iCode to filter sessions". The real product sends the request to iCode; here a few common
// phrasings (English, and the original Chinese ones) are understood locally.
import type { Session, TalentsState } from '../types.ts';
import { now, num, tokens } from './format.ts';

interface Condition { test(s: Session): boolean; text: string }
type Field = 'turns' | 'messages' | 'tokens' | 'files';

const LABEL: Record<Field, string> = { turns: 'Conversation turns', messages: 'Messages', tokens: 'Token usage', files: 'Files modified' };
const LESS = /少于|小于|低于|不到|以下|不超过|<|以内|fewer|less|under|below|at most|no more|within/;
const QUALIFIER = '(more than|greater than|over|above|at least|fewer than|less than|under|below|at most|no more than|within|>|<)';
const NUMBER = '(\\d+(?:\\.\\d+)?)\\s*(k\\b)?';
const UNIT: [Field, string][] = [
  ['turns', '(?:conversation\\s+)?(?:turns?|rounds?)'],
  ['messages', 'messages?'],
  ['tokens', 'tokens?'],
  ['files', '(?:(?:modified|changed|edited)\\s+)?files?'],
];

/** Topics a question can name, and how a session title mentions them (Chinese or English titles). */
const TOPICS: { zh: string; en: RegExp; label: string }[] = [
  { zh: '白金卡', en: /platinum/i, label: 'Platinum card' },
  { zh: '返现', en: /cash\s?back/i, label: 'Cashback' },
  { zh: '营销', en: /marketing|campaign/i, label: 'Marketing' },
  { zh: '奖励', en: /reward/i, label: 'Reward' },
  { zh: '资格', en: /eligib/i, label: 'Eligibility' },
  { zh: '明细', en: /detail/i, label: 'Details' },
  { zh: '账单', en: /statement|\bbill/i, label: 'Statement' },
  { zh: '通知', en: /notif/i, label: 'Notification' },
  { zh: '权益', en: /benefit/i, label: 'Benefit' },
  { zh: '入账', en: /posting|booking/i, label: 'Posting' },
  { zh: '账户', en: /account/i, label: 'Account' },
  { zh: '交易', en: /transaction/i, label: 'Transaction' },
  { zh: '测试', en: /\btest/i, label: 'Test' },
  { zh: '幂等', en: /idempoten/i, label: 'Idempotency' },
  { zh: '冲正', en: /reversal|rollback/i, label: 'Reversal' },
  { zh: '乐观锁', en: /optimistic lock/i, label: 'Optimistic lock' },
  { zh: '分页', en: /paginat|paging|cursor/i, label: 'Pagination' },
  { zh: '排序', en: /\bsort/i, label: 'Sorting' },
  { zh: '联调', en: /integration|docker compose/i, label: 'Integration' },
  { zh: '修复', en: /\bfix|defect/i, label: 'Fix' },
];
/** Session titles that are about a problem, for questions about failures, errors or rework. */
const PROBLEM_TITLE = /问题|修复|缺陷|排查|失败|冲突|issue|problem|fix|defect|bug|troubleshoot|investigat|fail|conflict|mismatch|inconsisten/i;

export function askICode(st: TalentsState, prompt: string, sessions: Session[]) {
  const text = prompt.replace(/\s+/g, '');
  const en = prompt.toLowerCase().replace(/\s+/g, ' ');
  const conds: Condition[] = [];
  function push(field: Field, words: string, n: number) {
    if (conds.some(c => c.text.startsWith(LABEL[field]))) return; // a second phrasing of the same condition
    const less = LESS.test(words);
    conds.push({ test: s => less ? s[field] < n : s[field] > n, text: LABEL[field] + (less ? ' fewer than ' : ' more than ') + (field === 'tokens' ? tokens(n) : num(n)) });
  }
  function cmp(re: RegExp, field: Field, scale: boolean) {
    const m = re.exec(text);
    if (m) push(field, m[0], parseFloat(m[2]) * (scale && /万/.test(m[0]) ? 10000 : 1));
  }
  cmp(/(轮次|轮数|轮对话|对话轮|轮)[^0-9]{0,6}?(\d+(?:\.\d+)?)/, 'turns', false);
  cmp(/(超过|大于|多于|高于|少于|小于|低于|不到|不超过)(\d+(?:\.\d+)?)轮/, 'turns', false);
  cmp(/(消息)[^0-9]{0,6}?(\d+(?:\.\d+)?)/, 'messages', false);
  cmp(/(token|Token|TOKEN)[^0-9]{0,6}?(\d+(?:\.\d+)?)万?/, 'tokens', true);
  cmp(/(修改|改动)[^0-9]{0,6}?(\d+(?:\.\d+)?)个?文件/, 'files', false);
  // English: "more than 20 turns", "fewer than 50k tokens", "turns over 20", "changed more than 5 files".
  for (const [field, unit] of UNIT) {
    const m = new RegExp(QUALIFIER + '\\s*' + NUMBER + '\\s*' + unit).exec(en)
      ?? new RegExp(unit + '\\s*(?:(?:count|of|is|are)\\s+)?' + QUALIFIER + '\\s*' + NUMBER).exec(en);
    if (m) push(field, m[1], parseFloat(m[2]) * (m[3] ? 1000 : 1));
  }

  const days = /最近(\d+)天/.exec(text) ?? /(?:last|past|recent)\s+(\d+)\s+days?/.exec(en);
  const today = new Date(now().replace(' ', 'T')).getTime();
  const daysAgo = (s: Session) => (today - new Date(s.updated.replace(' ', 'T')).getTime()) / 86400000;
  if (days) conds.push({ test: s => daysAgo(s) <= +days[1], text: 'Updated in the last ' + days[1] + ' days' });
  else if (/本周|这周|最近一周|近一周/.test(text) || /this week|(?:last|past) week/.test(en)) conds.push({ test: s => daysAgo(s) <= 7, text: 'Updated in the last 7 days' });
  else if (/今天/.test(text) || /\btoday\b/.test(en)) conds.push({ test: s => daysAgo(s) < 1, text: 'Updated today' });

  st.team.members.forEach(m => {
    if (text.includes(m.name) || en.includes(m.name.toLowerCase())) conds.push({ test: s => s.owner === m.id, text: 'Shared by ' + m.name });
  });
  if (/问答|Q&A|QA/.test(text) || /q&a|\bqa\b/.test(en)) conds.push({ test: s => s.agent === 'Q&A Agent', text: 'Uses Q&A Agent' });

  const topicHits = TOPICS.filter(t => text.includes(t.zh) || t.en.test(en));
  const problems = /失败|报错|出错|返工|问题|缺陷|bug/i.test(text) || /fail|error|rework|problem|issue|defect|bug/.test(en);
  const labels = [...topicHits.map(t => t.label), ...(problems ? ['Problems'] : [])];
  if (labels.length) {
    conds.push({
      test: s => (problems && PROBLEM_TITLE.test(s.title)) || topicHits.some(t => s.title.includes(t.zh) || t.en.test(s.title)),
      text: 'Topic related to "' + labels.join(', ') + '"',
    });
  }

  let result: Session[], answer: string;
  if (conds.length) {
    result = sessions.filter(s => conds.every(c => c.test(s)));
    const list = conds.map(c => c.text).join('; ');
    answer = result.length ? 'Found ' + result.length + (result.length === 1 ? ' matching session: ' : ' matching sessions: ') + list + '.' : 'No session meets all these conditions: ' + list + '.';
  } else {
    // Nothing recognisable: fall back to the sessions most worth diagnosing.
    result = sessions.slice().sort((a, b) => b.turns - a.turns).slice(0, 8);
    answer = 'Picked the ' + result.length + ' sessions most worth diagnosing, by conversation turns and change size.';
  }
  result.sort((a, b) => a.updated < b.updated ? 1 : -1);
  return { ids: result.map(s => s.id), answer };
}

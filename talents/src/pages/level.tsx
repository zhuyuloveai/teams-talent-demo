// Team and project: two sibling levels, each with its own artifact management, knowledge tasks and sources, switched with the tabs at the top.
// Team-level sources, tasks and knowledge are shared across the team, and team knowledge is available in every project; projects come from iCode Teams.
import type { ReactNode } from 'react';
import { Badge, Button, Tabs, Tag } from 'antd';
import { ArrowLeftOutlined, ExportOutlined } from '@ant-design/icons';
import { PageHeader } from '../vendor/teams/components/page-layout.tsx';
import { useTalents } from '../store.tsx';
import { useT } from '../i18n.tsx';
import { levelHash, levelTabs, type LevelTab } from '../navigation.ts';
import type { Project, Source, TalentsState } from '../types.ts';
import { artifact, levelSources, project } from '../demo/model.ts';
import { CardGrid, EmptyState, Fields, ItemCard, SourceIcon } from '../components/ui.tsx';
import { LevelSources } from './sources.tsx';
import { LevelTasks } from './tasks.tsx';
import { LevelReview, Workbench } from './review.tsx';
import { DiagnosisWorkbench } from './trajectory.tsx';
import { isDiagnosis, pendingCount } from '../demo/suggestions.ts';

/** The tabs of the level, with the current tab's actions on the right. */
export type Toolbar = (actions?: ReactNode) => ReactNode;
/** What waits for the admin in a level: artifacts to review, and diagnosis suggestions to apply;
 *  artifacts counts both kinds of artifact once, as the "Needs attention" section lists them. */
function waiting(st: TalentsState, pid: string | null) {
  const mine = st.artifacts.filter(a => a.projectId === pid);
  const review = mine.filter(a => a.draft && !isDiagnosis(a)).length, diagnoses = mine.filter(a => pendingCount(a) > 0).length;
  return { review, suggestions: mine.reduce((n, a) => n + pendingCount(a), 0), artifacts: review + diagnoses };
}

export function Team() {
  return <Level pid={null} />;
}

export function Projects() {
  const { state: st, route } = useTalents();
  const p = project(st, route.params.project);
  return p ? <Level key={p.id} pid={p.id} /> : <ProjectList />;
}

function Level({ pid }: { pid: string | null }) {
  const { state: st, route, go } = useTalents();
  const t = useT();
  const tab: LevelTab = levelTabs.find(t => t.key === route.params.tab)?.key ?? 'review';
  const opened = tab === 'review' && route.params.id ? artifact(st, route.params.id) : null;
  if (tab === 'review' && route.params.id) return <div className="page-stack opened-page">
    <div><Button icon={<ArrowLeftOutlined />} onClick={() => go(levelHash(pid, 'review'))}>{t('lv.backToReview')}</Button></div>
    {opened?.kind === 'diagnosis' ? <DiagnosisWorkbench key={opened.id} id={opened.id} /> : <Workbench key={route.params.id} id={route.params.id} />}
  </div>;
  const p = project(st, pid), w = waiting(st, pid), pending = w.artifacts;
  const toolbar: Toolbar = actions => <div className="project-toolbar" role="region" aria-label={t('lv.toolbarAria', { name: p?.name ?? t('tnav.team') })}>
    <Tabs activeKey={tab} onChange={key => go(levelHash(pid, key as LevelTab))}
      items={levelTabs.map(item => ({ key: item.key, label: item.key === 'review' && pending ? <>{item.label} <Badge count={pending} size="small" color="var(--ui-color-primary)" /></> : item.label }))} />
    <div className="project-toolbar-actions">{actions}</div>
  </div>;
  const Body = { sources: LevelSources, tasks: LevelTasks, review: LevelReview }[tab];
  return <div className="page-stack level-page">
    {p ? <PageHeader title={p.name} description={p.readonly ? t('lv.readonlyNote') : undefined} />
      : <PageHeader title={t('tnav.team')} />}
    <Body key={tab} pid={pid} toolbar={toolbar} />
  </div>;
}

function ProjectList() {
  const { state: st, go, teamsLink } = useTalents();
  const t = useT();
  const names = (list: Source[]) => list.length ? list.map(s => s.name).join(t('common.listSeparator')) : <span className="ui-note">{t('lv.none')}</span>;
  const card = (p: Project) => {
    const list = levelSources(st, p.id), w = waiting(st, p.id), open = () => go(levelHash(p.id));
    return <ItemCard key={p.id} icon={<SourceIcon type="project" />} title={p.name} onClick={open}
      extra={<>{p.readonly && <Tag>{t('lv.imported')}</Tag>}{w.review > 0 && <Tag color="processing">{t('lv.reviewCount', { count: w.review })}</Tag>}{w.suggestions > 0 && <Tag color="warning">{t('lv.suggestions', { count: w.suggestions })}</Tag>}</>}
      actions={<Button type="link" size="small" onClick={open}>{t('lv.enter')}</Button>}>
      <Fields rows={[[t('lv.repo'), names(list.filter(s => s.type === 'repo'))], [t('lv.docs'), names(list.filter(s => s.type === 'docs'))]]} />
    </ItemCard>;
  };
  return <div className="page-stack">
    <PageHeader title={t('tnav.projects')}
      actions={<Button href={teamsLink(null)} icon={<ExportOutlined />}>{t('lv.manageInTeams')}</Button>} />
    {st.projects.length ? <CardGrid>{st.projects.map(card)}</CardGrid> : <EmptyState title={t('lv.noProjects')} />}
  </div>;
}

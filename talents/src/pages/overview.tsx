// Roadmap: an introduction to the overall future plan for Talents (original draft carddemo/overview.html, body in src/overview/, recolored with the Talents theme).
// Opened from the book icon at the top right. The table of contents and cross references in the body are #<id> anchors, which clash with #/<page> routes, so they are intercepted here and turned into scrolling to the target.
import { useEffect, useRef, type MouseEvent } from 'react';
import { Tag } from 'antd';
import { PageHeader } from '../vendor/teams/components/page-layout.tsx';
import { useT } from '../i18n.tsx';
import doc from '../overview/overview.html';
import '../overview/overview.css';

export function Overview() {
  const ref = useRef<HTMLDivElement>(null);
  const t = useT();
  // The body is written once on mount and not rendered by React: on repeated route updates React may rewrite innerHTML, leaving the TOC highlight attached to stale nodes.
  // The TOC highlights the section being read: the last section that has scrolled past the top.
  useEffect(() => {
    const root = ref.current!, scroller = root.closest('.page-scroll')!;
    root.innerHTML = doc;
    const links = [...root.querySelectorAll<HTMLAnchorElement>('.rail a[href^="#"]')];
    const targets = links.map(a => document.getElementById(a.getAttribute('href')!.slice(1)));
    const spy = () => {
      const top = scroller.getBoundingClientRect().top + 24;
      let current = 0;
      targets.forEach((t, i) => { if (t && t.getBoundingClientRect().top <= top) current = i; });
      links.forEach((a, i) => a.classList.toggle('active', i === current));
    };
    spy();
    scroller.addEventListener('scroll', spy, { passive: true });
    return () => scroller.removeEventListener('scroll', spy);
  }, []);
  const follow = (e: MouseEvent) => {
    const href = (e.target as Element).closest('a')?.getAttribute('href');
    const target = href?.startsWith('#') && !href.startsWith('#/') ? document.getElementById(href.slice(1)) : null;
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return <div className="page-stack">
    <PageHeader title={t('tov.pageTitle')} description={t('tov.pageDescription')}
      actions={<span className="actions"><Tag color="purple">v3.0</Tag><Tag>{t('tov.lite')}</Tag><span className="caption">{t('tov.lastUpdated', { date: '2026-10-28' })}</span></span>} />
    <div ref={ref} className="overview-doc" onClick={follow} />
  </div>;
}

// Personal settings: opened from the avatar at the bottom left of the sidebar (as in iCode Teams). Resetting demo data lives here, not in the top bar, so it stays out of sight during a demo.
import { Button, Popconfirm } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { FrameworkCard, PageHeader } from '../vendor/teams/components/page-layout.tsx';
import { useT } from '../i18n.tsx';
import { home } from '../navigation.ts';
import { useTalents } from '../store.tsx';

export function Account() {
  const { role, go, reset, toast } = useTalents();
  const t = useT();
  const resetDemo = () => reset().then(() => { go('#/' + home[role]); toast(t('ac.resetDone')); }, e => toast(t('ac.resetFailed', { error: (e as Error).message })));
  return <div className="page-stack">
    <PageHeader title={t('ac.title')} description={t('ac.description')} />
    <FrameworkCard title={t('ac.cardTitle')}>
      <p>{t('ac.resetBody')}</p>
      <p className="muted">{t('ac.resetNote')}</p>
      <Popconfirm title={t('ac.confirmTitle')} description={t('ac.confirmBody')} okText={t('ac.confirmOk')} cancelText={t('common.cancel')} okButtonProps={{ danger: true }} onConfirm={resetDemo}>
        <Button danger icon={<ReloadOutlined />}>{t('ac.reset')}</Button>
      </Popconfirm>
    </FrameworkCard>
  </div>;
}

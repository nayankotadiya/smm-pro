import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, SlidersHorizontal, X, Zap } from 'lucide-react';
import { get } from '@/lib/api';
import { useCan } from '@/store/auth';
import { Async, Badge, Button, Card, Empty, Input, PageHeader, Select, Table } from '@/components/ui';
import { ContentTable } from '@/components/Lists';
import { ContentFormModal, FastTrackVideoModal } from '@/components/Forms';
import { useClients, useTeam } from '@/hooks/useData';
import { STAGES, fmtDate, fmtDateTime, label, roleLabel } from '@/lib/format';

const FILTERS = ['clientId', 'campaignId', 'platform', 'type', 'status', 'stage', 'priority', 'member', 'from', 'to', 'q', 'owner', 'overdue'];
/** Shared filter bar: client, platform, type, status, stage, priority, team member, date. State lives in the URL so KPI cards can deep-link. */
export function ContentFilters({ fixedStage }: { fixedStage?: boolean }) {
  const [sp, setSp] = useSearchParams(); const clients = useClients(); const team = useTeam(); const [open, setOpen] = useState(false);
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  const active = FILTERS.filter((k) => sp.get(k) && !(fixedStage && k === 'stage')).length;
  const S = (k: string, lbl: string, opts: [string, string][]) => <Select aria-label={lbl} value={sp.get(k) || ''} onChange={(e) => set(k, e.target.value)}><option value="">{lbl}</option>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>;
  return (
    <div className="mb-4">
      <div className="flex gap-2">
        <Input placeholder="Search by title or content ID" value={sp.get('q') || ''} onChange={(e) => set('q', e.target.value)} className="sm:max-w-xs" />
        <Button onClick={() => setOpen((v) => !v)} icon={<SlidersHorizontal size={15} />}>Filters{active > 0 && <Badge t="blue">{active}</Badge>}</Button>
        {active > 0 && <Button variant="ghost" icon={<X size={15} />} onClick={() => setSp(fixedStage && sp.get('stage') ? { stage: sp.get('stage')! } : {}, { replace: true })}>Clear</Button>}
      </div>
      {open && <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-line/60 bg-surface/80 p-4 backdrop-blur-xl shadow-lift md:grid-cols-4 xl:grid-cols-8 animate-rise">
        {S('clientId', 'Client', (clients.data || []).map((c) => [c._id, c.name]))}
        {S('platform', 'Platform', ['INSTAGRAM', 'FACEBOOK', 'YOUTUBE', 'LINKEDIN', 'X', 'MULTI'].map((x) => [x, roleLabel(x)]))}
        {S('type', 'Type', ['REEL', 'POST', 'CAROUSEL', 'STORY', 'VIDEO', 'SHORT', 'AD'].map((x) => [x, roleLabel(x)]))}
        {S('status', 'Status', ['ACTIVE', 'BLOCKED', 'CHANGES_REQUESTED', 'COMPLETED'].map((x) => [x, label(x)]))}
        {!fixedStage && S('stage', 'Stage', STAGES.map((x) => [x, label(x)]))}
        {S('priority', 'Priority', ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((x) => [x, roleLabel(x)]))}
        {S('member', 'Team member', (team.data || []).map((u) => [u._id, u.name]))}
        <Input type="date" aria-label="Deadline from" value={sp.get('from') || ''} onChange={(e) => set('from', e.target.value)} />
        <Input type="date" aria-label="Deadline to" value={sp.get('to') || ''} onChange={(e) => set('to', e.target.value)} />
      </div>}
    </div>
  );
}
function useContentQuery(extra: Record<string, string> = {}) {
  const [sp] = useSearchParams();
  const params: any = { ...Object.fromEntries(FILTERS.filter((k) => sp.get(k)).map((k) => [k, sp.get(k)])), ...extra };
  return useQuery({ queryKey: ['content', 'list', params], queryFn: () => get('/content', params) });
}

export function ContentList() {
  const can = useCan();
  const [open, setOpen] = useState(false);
  const q = useContentQuery();
  const [sp, setSp] = useSearchParams();
  const [fastTrackOpen, setFastTrackOpen] = useState(sp.get('action') === 'fast-track');
  const stage = sp.get('stage');

  useEffect(() => {
    if (sp.get('action') === 'fast-track') {
      setFastTrackOpen(true);
      const next = new URLSearchParams(sp);
      next.delete('action');
      setSp(next, { replace: true });
    }
  }, [sp, setSp]);

  return (
    <>
      <PageHeader
        title="Content"
        sub={stage ? `Filtered: ${stage.split(',').map(label).join(', ')}` : q.data ? `${q.data.total} items` : undefined}
        actions={
          <div className="flex items-center gap-2">
            {can('content.write') && (
              <Button
                variant="primary"
                icon={<Zap size={15} className="text-amber-300 fill-amber-300/30" />}
                onClick={() => setFastTrackOpen(true)}
              >
                Fast-track Video
              </Button>
            )}
            {can('content.write') && (
              <Button icon={<Plus size={16} />} onClick={() => setOpen(true)}>
                New content
              </Button>
            )}
          </div>
        }
      />
      <ContentFilters />
      <Card pad={false}><Async q={q}>{(d: any) => <ContentTable items={d.items} />}</Async></Card>
      <ContentFormModal open={open} onClose={() => setOpen(false)} />
      <FastTrackVideoModal open={fastTrackOpen} onClose={() => setFastTrackOpen(false)} />
    </>
  );
}

export function Scripts() {
  const [sp, setSp] = useSearchParams(); const nav = useNavigate(); const status = sp.get('status') || '';
  const from = sp.get('from') || ''; const to = sp.get('to') || '';
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  const q = useQuery({ queryKey: ['scripts', status, from, to], queryFn: () => get<any[]>('/scripts', { ...(status ? { status } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) }) });
  return (
    <>
      <PageHeader title="Scripts" sub="Every script with its current version and review state." />
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="max-w-xs"><Select aria-label="Status" value={status} onChange={(e) => set('status', e.target.value)}><option value="">All statuses</option>{['DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'FINAL'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></div>
        <div className="flex items-center gap-1.5 rounded-xl border border-line/70 bg-surface/80 px-2.5 py-1.5 backdrop-blur-md shadow-xs">
          <input type="date" aria-label="From" value={from} onChange={(e) => set('from', e.target.value)} className="bg-transparent text-[13px] font-medium text-ink outline-none [color-scheme:dark] w-32" />
          <span className="text-ink-3">—</span>
          <input type="date" aria-label="To" value={to} onChange={(e) => set('to', e.target.value)} className="bg-transparent text-[13px] font-medium text-ink outline-none [color-scheme:dark] w-32" />
          {(from || to) && <button onClick={() => { set('from', ''); set('to', ''); }} className="ml-1 rounded-md p-0.5 text-ink-3 hover:bg-surface-3/80 hover:text-ink transition-colors" aria-label="Clear"><X size={13} /></button>}
        </div>
      </div>
      <Card pad={false}><Async q={q} empty={<Empty title="No scripts yet" hint="A script is created with every content item." />}>{(d: any[]) => (
        <Table head={['Content', 'Client', 'Writer', 'Version', 'Status', 'Updated']}>
          {d.filter((s) => s.contentId).map((s) => <tr key={s._id} onClick={() => nav(`/content/${s.contentId._id}?tab=script`)} className="group cursor-pointer hover:bg-surface-2 transition-colors"><td className="td"><div className="font-semibold text-ink group-hover:text-primary-ink transition-colors">{s.contentId.title}</div><div className="font-mono text-meta font-medium text-ink-3">{s.contentId.contentId}</div></td><td className="td font-medium text-ink-2">{s.contentId.clientId?.name}</td><td className="td font-medium text-ink">{s.writerId?.name || '—'}</td><td className="td tabular font-medium text-ink">{s.currentVersion ? `V${s.currentVersion}` : 'Not started'}</td><td className="td"><Badge status={s.status} /></td><td className="td whitespace-nowrap text-meta font-medium text-ink-2">{fmtDateTime(s.updatedAt)}</td></tr>)}
        </Table>
      )}</Async></Card>
    </>
  );
}

export function Shooting() {
  const q = useContentQuery({ stage: 'SHOOTING,RAW_FOOTAGE' });
  return (
    <>
      <PageHeader title="Shooting" sub="Content waiting to be shot or with raw footage just uploaded." />
      <ContentFilters fixedStage />
      <Card pad={false}><Async q={q}>{(d: any) => <ContentTable items={d.items} compact />}</Async></Card>
    </>
  );
}
export function Editing() {
  const q = useContentQuery({ stage: 'RAW_FOOTAGE,EDITING,SMM_REVIEW,FINAL_REVIEW' });
  return (
    <>
      <PageHeader title="Editing" sub="From raw footage to final review." />
      <ContentFilters fixedStage />
      <Card pad={false}><Async q={q}>{(d: any) => <ContentTable items={d.items} compact />}</Async></Card>
    </>
  );
}
export { fmtDate };

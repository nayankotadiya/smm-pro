import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { get } from '@/lib/api';
import { Async, Badge, Card, Empty, Input, PageHeader, Select, Table, Tabs } from '@/components/ui';
import { FileCard, MediaButtons, MediaThumb, fileIcon, useMediaActions } from '@/components/Media';
import { useClients, useTeam } from '@/hooks/useData';
import { fmtDateTime, fmtSize, label } from '@/lib/format';

const GROUPS = [['all', 'All'], ['raw', 'Raw'], ['editing', 'Editing'], ['review', 'Review'], ['final', 'Final'], ['images', 'Images'], ['documents', 'Documents'], ['audio', 'Audio']] as const;
export default function MediaLibrary() {
  const [sp, setSp] = useSearchParams(); const a = useMediaActions(); const clients = useClients(); const team = useTeam();
  const g = sp.get('group') || 'all';
  const params: any = { ...(g !== 'all' ? { group: g } : {}), ...Object.fromEntries(['q', 'clientId', 'uploadedBy', 'version', 'from', 'to', 'latest'].filter((k) => sp.get(k)).map((k) => [k, sp.get(k)])) };
  const q = useQuery({ queryKey: ['media', 'library', params], queryFn: () => get<any[]>('/media', params) });
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  return (
    <>
      <PageHeader title="Media" sub="All files across content. Stored in Google Drive, with access controlled here." />
      <Tabs value={g as any} onChange={(k) => set('group', k === 'all' ? '' : k)} tabs={GROUPS.map(([key, l]) => ({ key, label: l }))} />
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        <Input className="col-span-2" placeholder="Search content ID, client or filename" value={sp.get('q') || ''} onChange={(e) => set('q', e.target.value)} />
        <Select aria-label="Client" value={sp.get('clientId') || ''} onChange={(e) => set('clientId', e.target.value)}><option value="">All clients</option>{(clients.data || []).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</Select>
        <Select aria-label="Uploaded by" value={sp.get('uploadedBy') || ''} onChange={(e) => set('uploadedBy', e.target.value)}><option value="">Uploaded by anyone</option>{(team.data || []).map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}</Select>
        <Select aria-label="Version" value={sp.get('latest') ? 'latest' : sp.get('version') || ''} onChange={(e) => { const n = new URLSearchParams(sp); n.delete('latest'); n.delete('version'); if (e.target.value === 'latest') n.set('latest', '1'); else if (e.target.value) n.set('version', e.target.value); setSp(n, { replace: true }); }}><option value="">All versions</option><option value="latest">Latest only</option>{[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>V{v}</option>)}</Select>
        <Input type="date" aria-label="From date" value={sp.get('from') || ''} onChange={(e) => set('from', e.target.value)} />
        <Input type="date" aria-label="To date" value={sp.get('to') || ''} onChange={(e) => set('to', e.target.value)} />
      </div>
      <Card pad={false}><Async q={q} empty={<Empty title="No files match" hint="Files appear here as soon as they are uploaded to content." />}>{(d: any[]) => (
        <>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 p-4 md:hidden">
            {d.map((m) => <FileCard key={m._id} m={m} a={a} />)}
          </div>
          <div className="hidden md:block"><Table head={['File', 'Content', 'Client', 'Type', 'Version', 'Uploaded by', 'Date', 'Size', 'Status', '']} minWidth={1100}>
            {d.map((m) => <tr key={m._id} className="group hover:bg-surface-2 transition-colors"><td className="td"><span className="flex items-center gap-2"><span className="text-ink-2">{fileIcon(m.mimeType)}</span><span className="max-w-[260px] truncate font-semibold text-ink group-hover:text-primary-ink transition-colors" title={m.fileName}>{m.fileName}</span></span></td><td className="td font-mono font-medium text-ink-3">{m.contentId ? <Link className="hover:text-primary-ink" to={`/content/${m.contentId._id}?tab=files`}>{m.contentId.contentId}</Link> : '—'}</td><td className="td font-medium text-ink-2">{m.clientId?.name || '—'}</td><td className="td font-medium text-ink-2">{label(m.category)}</td><td className="td tabular font-medium text-ink">{m.version ? `V${m.versionNumber}` : '—'}</td><td className="td font-medium text-ink">{m.uploadedBy?.name}</td><td className="td whitespace-nowrap text-meta font-medium text-ink-2">{fmtDateTime(m.uploadedAt || m.createdAt)}</td><td className="td whitespace-nowrap tabular font-medium text-ink-2">{fmtSize(m.size)}</td><td className="td"><Badge status={m.status} t={m.status === 'SUPERSEDED' ? 'neutral' : undefined}>{m.status === 'SUPERSEDED' ? 'Previous' : undefined}</Badge></td><td className="td"><MediaButtons m={m} a={a} compact /></td></tr>)}
          </Table></div>
        </>
      )}</Async></Card>
      {a.modal}
    </>
  );
}

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Pencil, Phone, Mail, Globe, Instagram, Facebook, MapPin, ExternalLink, MessageSquareText, Eye, EyeOff, Copy, Check, KeyRound, Trash2, Sparkles } from 'lucide-react';
import { get, post, patch, del, errMsg } from '@/lib/api';
import { useAuth, useCan } from '@/store/auth';
import { toast } from '@/store/ui';
import { Async, Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Stat, Table, Tabs, Textarea } from '@/components/ui';
import { ContentTable, ActivityFeed } from '@/components/Lists';
import { ContentFormModal } from '@/components/Forms';
import { FileCard, UploadButton, useMediaActions } from '@/components/Media';
import { ChatThread } from '@/features/ChatThread';
import { ClientTracking, useClientReviewActions } from '@/features/ContentTabs';
import { CalendarView } from './Calendar';
import { useTeam } from '@/hooks/useData';
import { ClientReportModal } from '@/components/ClientReportModal';
import { ago, fmtDate, fmtDateTime, label, roleLabel, toLocalInput } from '@/lib/format';

export function Clients() {
  const can = useCan(); const nav = useNavigate(); const { user } = useAuth(); const qc = useQueryClient();
  const [open, setOpen] = useState(false); const [term, setTerm] = useState('');
  const [deleteClientItem, setDeleteClientItem] = useState<any>(null);
  const q = useQuery({ queryKey: ['clients', 'list', term], queryFn: () => get<any[]>('/clients', term ? { q: term } : {}) });

  const deleteItemMut = useMutation({
    mutationFn: (id: string) => del(`/clients/${id}?permanent=true`),
    onSuccess: () => {
      toast.success('Client and associated data permanently deleted.');
      setDeleteClientItem(null);
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['content'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <>
      <PageHeader title="Clients" sub="Internal records. Clients never sign in to this workspace." actions={can('clients.write') && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>New client</Button>} />
      <div className="mb-4 max-w-xs"><Input placeholder="Search clients" value={term} onChange={(e) => setTerm(e.target.value)} /></div>
      <Card pad={false}><Async q={q} empty={<Empty title="No clients yet" action={can('clients.write') && <Button variant="primary" onClick={() => setOpen(true)}>Add first client</Button>} />}>{(d: any[]) => (
        <>
          {/* Mobile Card List: Smooth vertical scrolling on mobile touch screens */}
          <ul className="divide-y divide-line sm:hidden">
            {d.map((c) => (
              <li
                key={c._id}
                onClick={() => nav(`/clients/${c._id}`)}
                className="p-3.5 active:bg-surface-2 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-ink text-[15px] truncate">{c.name}</div>
                    {c.businessName && c.businessName !== c.name && (
                      <div className="text-[12px] font-medium text-ink-2 truncate">{c.businessName}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge status={c.status} />
                    {(user?.role === 'SUPER_ADMIN' || can('clients.delete')) && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setDeleteClientItem(c); }}
                        className="p-1 text-ink-3 hover:text-rose-500 transition-colors"
                        title="Delete client"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-2">
                  {c.category && (
                    <span className="font-medium text-ink bg-surface-2 px-2 py-0.5 rounded-md border border-line/60">
                      {c.category}
                    </span>
                  )}
                  {c.contactPerson && (
                    <span className="truncate">👤 {c.contactPerson}</span>
                  )}
                  {c.phone && (
                    <a
                      href={`tel:${c.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-mono text-primary font-semibold hover:underline"
                    >
                      📞 {c.phone}
                    </a>
                  )}
                </div>

                <div className="mt-2.5 flex items-center justify-between text-[12px] text-ink-3 pt-2 border-t border-line/40">
                  <span className="truncate max-w-[65%]">
                    👥 {(c.assignedTeam || []).slice(0, 3).map((u: any) => u.name).join(', ') || 'No team'}
                    {c.assignedTeam?.length > 3 && ` +${c.assignedTeam.length - 3}`}
                  </span>
                  <span className="font-semibold text-ink">
                    🎬 {c.contentCount.active} <span className="font-normal text-ink-3">/ {c.contentCount.total}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop Table View */}
          <div className="hidden sm:block">
            <Table head={['Client', 'Category', 'Contact', 'Team', 'Active content', 'Status', ...(user?.role === 'SUPER_ADMIN' || can('clients.delete') ? ['Actions'] : [])]}>
              {d.map((c) => (
                <tr key={c._id} onClick={() => nav(`/clients/${c._id}`)} className="group cursor-pointer hover:bg-surface-2 transition-colors">
                  <td className="td">
                    <div className="font-semibold text-ink group-hover:text-primary-ink transition-colors">{c.name}</div>
                    {c.businessName && c.businessName !== c.name && <div className="text-meta font-medium text-ink-2">{c.businessName}</div>}
                  </td>
                  <td className="td font-medium text-ink-2">{c.category || '—'}</td>
                  <td className="td font-medium text-ink-2">
                    {c.contactPerson || '—'}
                    {c.phone && <div className="text-meta text-ink-3 font-mono">{c.phone}</div>}
                  </td>
                  <td className="td font-medium text-ink-2">
                    {(c.assignedTeam || []).slice(0, 3).map((u: any) => u.name).join(', ') || '—'}
                    {c.assignedTeam?.length > 3 && ` +${c.assignedTeam.length - 3}`}
                  </td>
                  <td className="td tabular font-semibold text-ink">
                    {c.contentCount.active} <span className="font-normal text-ink-3">/ {c.contentCount.total}</span>
                  </td>
                  <td className="td"><Badge status={c.status} /></td>
                  {(user?.role === 'SUPER_ADMIN' || can('clients.delete')) && (
                    <td className="td text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setDeleteClientItem(c)}
                        className="p-1.5 text-ink-3 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                        title="Delete client"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </Table>
          </div>
        </>
      )}</Async></Card>
      <ClientForm open={open} onClose={() => setOpen(false)} />
      <Modal
        open={!!deleteClientItem}
        onClose={() => setDeleteClientItem(null)}
        title={`Delete Client: ${deleteClientItem?.name}`}
        footer={
          <>
            <Button onClick={() => setDeleteClientItem(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={deleteItemMut.isPending}
              onClick={() => deleteItemMut.mutate(deleteClientItem?._id)}
            >
              Permanently Delete
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-[14px]">
          <div className="rounded border border-rose-500/30 bg-rose-500/10 p-3 text-rose-500 font-medium">
            ⚠️ Are you sure you want to delete client <b>{deleteClientItem?.name}</b>?
          </div>
          <p className="text-ink-2">
            This will permanently delete this client, along with all their campaigns, contents, scripts, shoots, tasks, reviews, and chat history.
          </p>
        </div>
      </Modal>
    </>
  );
}

const schema = z.object({
  name: z.string().min(2, 'Client name is required'),
  businessName: z.string().optional(),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Enter a valid email').or(z.literal('')).optional(),
  website: z.string().optional(),
  instagram: z.string().optional(),
  instagramPassword: z.string().optional(),
  facebook: z.string().optional(),
  facebookPassword: z.string().optional(),
  youtube: z.string().optional(),
  location: z.string().optional(),
  category: z.string().optional(),
  status: z.string().optional(),
  description: z.string().optional(),
  products: z.string().optional(),
  services: z.string().optional(),
  usp: z.string().optional(),
  targetAudience: z.string().optional(),
  goals: z.string().optional(),
  expectations: z.string().optional(),
  marketTrend: z.string().optional(),
  sellingPurpose: z.string().optional(),
  brandTone: z.string().optional(),
  brandColors: z.string().optional(),
  fonts: z.string().optional(),
  brandGuidelines: z.string().optional()
});
const TEXT: [string, string][] = [['description', 'Description'], ['products', 'Products'], ['services', 'Services'], ['usp', 'USP'], ['targetAudience', 'Target audience'], ['goals', 'Goals'], ['expectations', 'Expectations'], ['marketTrend', 'Market trend'], ['sellingPurpose', 'Selling purpose'], ['brandTone', 'Brand tone'], ['brandGuidelines', 'Brand guidelines']];

function ClientForm({ open, onClose, client }: { open: boolean; onClose: () => void; client?: any }) {
  const qc = useQueryClient(); const nav = useNavigate(); const team = useTeam(); const [step, setStep] = useState<'basic' | 'brand' | 'team'>('basic');
  const [showIgPass, setShowIgPass] = useState(false);
  const [showFbPass, setShowFbPass] = useState(false);
  const f = useForm<any>({ resolver: zodResolver(schema) }); const [assigned, setAssigned] = useState<string[]>([]); const [dt, setDt] = useState<any>({});
  useEffect(() => {
    if (!open) return;
    setStep('basic');
    setShowIgPass(false);
    setShowFbPass(false);
    f.reset(client ? { ...client, brandColors: (client.brandColors || []).join(', '), fonts: (client.fonts || []).join(', '), status: client.status } : { status: 'ACTIVE' });
    setAssigned((client?.assignedTeam || []).map((u: any) => u._id || u));
    setDt(Object.fromEntries(Object.entries(client?.defaultTeam || {}).map(([k, v]: any) => [k, v?._id || v || ''])));
  }, [open, client?._id]); // eslint-disable-line
  const m = useMutation({
    mutationFn: (v: any) => {
      const b: any = Object.fromEntries(Object.keys(schema.shape).map((k) => [k, v[k] ?? '']));
      b.brandColors = String(v.brandColors || '').split(',').map((s) => s.trim()).filter(Boolean);
      b.fonts = String(v.fonts || '').split(',').map((s) => s.trim()).filter(Boolean);
      b.assignedTeam = assigned;
      b.defaultTeam = Object.fromEntries(['writer', 'shooter', 'editor', 'smm', 'reviewer'].map((k) => [k, dt[k] || null]));
      return client ? patch(`/clients/${client._id}`, b) : post('/clients', b);
    },
    onSuccess: (c) => { toast.success(client ? 'Client updated.' : 'Client created. Drive folders are being set up.'); qc.invalidateQueries({ queryKey: ['clients'] }); onClose(); if (!client) nav(`/clients/${c._id}`); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const e: any = f.formState.errors; const I = (k: string, l: string, p?: any) => <Field label={l} error={e[k]?.message}><Input {...f.register(k)} {...p} /></Field>;
  const roleFor: Record<string, string[]> = { writer: ['SCRIPT_WRITER'], shooter: ['SHOOTER'], editor: ['EDITOR'], smm: ['SMM'], reviewer: ['MANAGER', 'TEAM_LEAD', 'ADMIN', 'SUPER_ADMIN'] };
  return (
    <Modal open={open} onClose={onClose} wide title={client ? `Edit ${client.name}` : 'New client'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={m.isPending} onClick={f.handleSubmit((v) => m.mutate(v), () => setStep('basic'))}>{client ? 'Save changes' : 'Create client'}</Button></>}>
      <Tabs value={step} onChange={setStep} tabs={[{ key: 'basic', label: 'Basics & Logins' }, { key: 'brand', label: 'Brand and strategy' }, { key: 'team', label: 'Team' }]} />
      <div className={step === 'basic' ? 'space-y-4' : 'hidden'}>
        <div className="grid gap-3 sm:grid-cols-2">
          {I('name', 'Client name *', { autoFocus: true, placeholder: 'e.g. Zemora Jewels' })}
          {I('businessName', 'Business / Brand name', { placeholder: 'Trading or legal name' })}
          {I('contactPerson', 'Contact person')}
          {I('phone', 'WhatsApp / phone', { inputMode: 'tel', placeholder: '919876543210' })}
          {I('email', 'Email', { type: 'email' })}
          {I('website', 'Website', { placeholder: 'https://brand.com' })}
          {I('location', 'Location', { placeholder: 'Surat, Gujarat' })}
          {I('category', 'Category', { placeholder: 'Jewellery, Fashion...' })}
          <Field label="Status">
            <Select {...f.register('status')}>
              {['ACTIVE', 'ONBOARDING', 'PAUSED', 'ARCHIVED'].map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </Select>
          </Field>
          {I('youtube', 'YouTube channel', { placeholder: '@channel' })}
        </div>

        {/* Social media credentials block */}
        <div className="rounded-2xl border border-line/80 bg-surface-2/40 p-4 space-y-3.5 backdrop-blur-md">
          <div className="flex items-center gap-2 text-[13.5px] font-bold text-ink">
            <KeyRound size={16} className="text-primary-ink" />
            Social Media Credentials (Instagram &amp; Facebook)
          </div>
          <p className="text-[12px] text-ink-3">
            Securely saved in client profile for SMMs and publishing team.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line/60 bg-surface/70 p-3 space-y-2.5">
              <div className="flex items-center gap-1.5 text-[12.5px] font-bold text-ink">
                <Instagram size={14} className="text-pink-500" />
                Instagram Account
              </div>
              {I('instagram', 'Instagram ID / Username', { placeholder: '@brand_official' })}
              <Field label="Instagram Password">
                <div className="relative">
                  <Input
                    type={showIgPass ? 'text' : 'password'}
                    placeholder="Instagram password"
                    {...f.register('instagramPassword')}
                    className="pr-10 font-mono text-[13px]"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowIgPass((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink p-1 transition-colors"
                    title={showIgPass ? 'Hide password' : 'Show password'}
                  >
                    {showIgPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </Field>
            </div>

            <div className="rounded-xl border border-line/60 bg-surface/70 p-3 space-y-2.5">
              <div className="flex items-center gap-1.5 text-[12.5px] font-bold text-ink">
                <Facebook size={14} className="text-blue-500" />
                Facebook Account
              </div>
              {I('facebook', 'Facebook ID / Page', { placeholder: 'facebook.com/brandpage' })}
              <Field label="Facebook Password">
                <div className="relative">
                  <Input
                    type={showFbPass ? 'text' : 'password'}
                    placeholder="Facebook password"
                    {...f.register('facebookPassword')}
                    className="pr-10 font-mono text-[13px]"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowFbPass((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink p-1 transition-colors"
                    title={showFbPass ? 'Hide password' : 'Show password'}
                  >
                    {showFbPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </Field>
            </div>
          </div>
        </div>
      </div>
      <div className={step === 'brand' ? 'grid gap-3 sm:grid-cols-2' : 'hidden'}>{TEXT.map(([k, l]) => <Field key={k} label={l}><Textarea rows={2} {...f.register(k)} /></Field>)}{I('brandColors', 'Brand colors', { placeholder: '#0F172A, #C9A227' })}{I('fonts', 'Fonts', { placeholder: 'Playfair Display, Inter' })}</div>
      <div className={step === 'team' ? 'space-y-4' : 'hidden'}>
        <div><div className="label">Default team for new content</div><p className="mb-2 text-meta text-ink-3">New content for this client is assigned to these people automatically, so the next owner is always known.</p><div className="grid gap-3 sm:grid-cols-2">{Object.keys(roleFor).map((k) => <Field key={k} label={k === 'smm' ? 'SMM' : roleLabel(k.toUpperCase())}><Select value={dt[k] || ''} onChange={(ev) => setDt({ ...dt, [k]: ev.target.value })}><option value="">Not set</option>{(team.data || []).filter((u) => roleFor[k].includes(u.role)).map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}</Select></Field>)}</div></div>
        <div><div className="label">Assigned team</div><div className="grid gap-1 sm:grid-cols-2">{(team.data || []).map((u) => <label key={u._id} className="flex min-h-[36px] items-center gap-2"><input type="checkbox" checked={assigned.includes(u._id)} onChange={(ev) => setAssigned((s) => (ev.target.checked ? [...s, u._id] : s.filter((x) => x !== u._id)))} />{u.name}<span className="text-meta text-ink-3">{roleLabel(u.role)}</span></label>)}</div></div>
      </div>
    </Modal>
  );
}

type CTab = 'overview' | 'campaigns' | 'content' | 'scripts' | 'reviews' | 'communication' | 'files' | 'calendar' | 'reports' | 'activity' | 'chat';
export function ClientDetail() {
  const { id } = useParams(); const [sp, setSp] = useSearchParams(); const can = useCan(); const tab = (sp.get('tab') as CTab) || 'overview';
  const { user } = useAuth(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['clients', 'one', id], queryFn: () => get(`/clients/${id}`) });
  const ov = useQuery({ queryKey: ['clients', 'overview', id], queryFn: () => get(`/clients/${id}/overview`) });
  const [edit, setEdit] = useState(false); const [newContent, setNewContent] = useState(false); const a = useMediaActions(); const nav = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const deleteClient = useMutation({
    mutationFn: () => del(`/clients/${id}?permanent=true`),
    onSuccess: () => {
      toast.success('Client and associated records deleted permanently.');
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['content'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      nav('/clients');
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <Async q={q}>{(c: any) => (
      <>
        <PageHeader title={c.name} sub={<span className="flex flex-wrap items-center gap-2"><Badge status={c.status} />{c.category && <span>{c.category}</span>}{c.location && <span className="flex items-center gap-1"><MapPin size={13} />{c.location}</span>}</span>}
          actions={<>
            {can('content.write') && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setNewContent(true)}>New content</Button>}
            {can('clients.write') && <Button icon={<Pencil size={15} />} onClick={() => setEdit(true)}>Edit</Button>}
            {(user?.role === 'SUPER_ADMIN' || can('clients.delete')) && (
              <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => setDeleteOpen(true)}>
                Delete Client
              </Button>
            )}
          </>} />
        <Tabs value={tab} onChange={(k) => setSp(k === 'overview' ? {} : { tab: k }, { replace: true })} tabs={[{ key: 'overview', label: 'Overview' }, { key: 'campaigns', label: 'Campaigns' }, { key: 'content', label: 'Content', count: ov.data?.stats.active }, { key: 'scripts', label: 'Scripts' }, { key: 'reviews', label: 'Client Reviews', count: ov.data?.stats.approvalsOpen }, { key: 'communication', label: 'Communication' }, { key: 'files', label: 'Files' }, { key: 'calendar', label: 'Calendar' }, { key: 'reports', label: 'Reports' }, { key: 'activity', label: 'Activity' }, { key: 'chat', label: 'Internal Chat' }]} />
        {tab === 'overview' && <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            {ov.data && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label="Active content" value={ov.data.stats.active} /><Stat label="Published" value={ov.data.stats.published} /><Stat label="Open client reviews" value={ov.data.stats.approvalsOpen} tone="amber" /><Stat label="Overdue" value={ov.data.stats.overdue} tone="red" /></div>}
            <Card title="About"><dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{TEXT.filter(([k]) => c[k]).map(([k, l]) => <div key={k}><dt className="text-meta text-ink-2">{l}</dt><dd className="whitespace-pre-wrap">{c[k]}</dd></div>)}</dl>{!TEXT.some(([k]) => c[k]) && <p className="text-ink-3">No brand notes yet. Add products, audience, goals and tone so the team has context.</p>}</Card>
            <Card title="Upcoming follow-ups" pad={false}>{!ov.data?.followUps.length ? <Empty title="No follow-ups scheduled" /> : <ul className="divide-y divide-line">{ov.data.followUps.map((r: any) => <li key={r._id} className="flex justify-between gap-3 px-4 py-2.5"><span>{r.title}</span><span className="shrink-0 text-meta text-ink-2">{fmtDateTime(r.remindAt)}</span></li>)}</ul>}</Card>
          </div>
          <div className="space-y-5">
            <SocialCredentialsCard c={c} onEdit={() => setEdit(true)} />
            <Card title="Contact"><ul className="space-y-2 text-[13px]">{c.contactPerson && <li className="font-medium">{c.contactPerson}</li>}{c.phone && <li className="flex items-center gap-2"><Phone size={14} className="text-ink-2" /><a className="link" href={`tel:${c.phone}`}>{c.phone}</a></li>}{c.email && <li className="flex items-center gap-2"><Mail size={14} className="text-ink-2" /><a className="link" href={`mailto:${c.email}`}>{c.email}</a></li>}{c.website && <li className="flex items-center gap-2"><Globe size={14} className="text-ink-2" /><a className="link" href={c.website.startsWith('http') ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer">{c.website}</a></li>}{!c.phone && !c.email && !c.contactPerson && <li className="text-ink-3">No contact details. A phone number is needed to send WhatsApp reviews.</li>}</ul></Card>
            <Card title="Brand"><div className="space-y-2 text-[13px]">{c.brandColors?.length > 0 && <div className="flex flex-wrap items-center gap-2">{c.brandColors.map((x: string) => <span key={x} className="flex items-center gap-1.5 rounded border border-line px-1.5 py-0.5 text-meta"><span className="h-3 w-3 rounded-sm border border-line" style={{ background: x }} />{x}</span>)}</div>}{c.fonts?.length > 0 && <div><span className="text-ink-2">Fonts:</span> {c.fonts.join(', ')}</div>}{c.driveFolderId && <a className="link flex items-center gap-1" target="_blank" rel="noopener noreferrer" href={`https://drive.google.com/drive/folders/${c.driveFolderId}`}>Open Drive folder<ExternalLink size={13} /></a>}{!c.brandColors?.length && !c.fonts?.length && !c.driveFolderId && <span className="text-ink-3">No brand assets recorded.</span>}</div></Card>
            <Card title="Team"><ul className="space-y-1.5 text-[13px]">{(c.assignedTeam || []).map((u: any) => <li key={u._id} className="flex justify-between"><Link to={`/team/${u._id}`} className="font-medium hover:text-primary-ink">{u.name}</Link><span className="text-ink-2">{roleLabel(u.role)}</span></li>)}{!c.assignedTeam?.length && <li className="text-ink-3">No team assigned.</li>}</ul></Card>
          </div>
        </div>}
        {tab === 'campaigns' && <Campaigns clientId={c._id} />}
        {tab === 'content' && <Card pad={false}><Async q={ov}>{(d: any) => <ContentTable items={d.content.map((x: any) => ({ ...x, clientId: { name: c.name } }))} compact />}</Async></Card>}
        {tab === 'scripts' && (
          <Card pad={false}>
            <Async q={ov}>
              {(d: any) => {
                const scripts = (d.scripts || []).filter((s: any) => s.contentId);
                if (!scripts.length) return <Empty title="No scripts yet" />;
                return (
                  <>
                    <ul className="divide-y divide-line sm:hidden">
                      {scripts.map((s: any) => (
                        <li
                          key={s._id}
                          className="p-3.5 active:bg-surface-2 transition-colors cursor-pointer"
                          onClick={() => nav(`/content/${s.contentId._id}?tab=script`)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-ink text-[15px] truncate">{s.contentId.title}</div>
                              <div className="font-mono text-[12px] text-ink-3">{s.contentId.contentId}</div>
                            </div>
                            <Badge status={s.status} />
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[12.5px] text-ink-2 pt-2 border-t border-line/40">
                            <span>✍️ {s.writerId?.name || 'Unassigned'}</span>
                            <span className="font-semibold text-ink">{s.currentVersion ? `V${s.currentVersion}` : '—'}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div className="hidden sm:block">
                      <Table head={['Content', 'Writer', 'Version', 'Status']}>
                        {scripts.map((s: any) => (
                          <tr
                            key={s._id}
                            className="group cursor-pointer hover:bg-surface-2 transition-colors"
                            onClick={() => nav(`/content/${s.contentId._id}?tab=script`)}
                          >
                            <td className="td">
                              <div className="font-semibold text-ink group-hover:text-primary-ink transition-colors">{s.contentId.title}</div>
                              <div className="font-mono text-meta font-medium text-ink-3">{s.contentId.contentId}</div>
                            </td>
                            <td className="td font-medium text-ink-2">{s.writerId?.name || '—'}</td>
                            <td className="td tabular font-semibold text-ink">{s.currentVersion ? `V${s.currentVersion}` : '—'}</td>
                            <td className="td"><Badge status={s.status} /></td>
                          </tr>
                        ))}
                      </Table>
                    </div>
                  </>
                );
              }}
            </Async>
          </Card>
        )}
        {tab === 'reviews' && <Async q={ov}>{(d: any) => !d.reviews.length ? <Card><Empty title="No client reviews yet" hint="Reviews appear here when content is sent to the client." /></Card> : <div className="space-y-3">{d.reviews.map((r: any) => <Card key={r._id} title={<span className="flex flex-wrap items-center gap-2"><Link className="hover:text-primary-ink" to={`/content/${r.contentId?._id}?tab=reviews`}>{r.contentId?.title}</Link><span className="font-normal text-ink-2">{r.version}</span><Badge status={r.status} /></span>}><ClientTracking a={r} /><div className="mt-2 text-meta text-ink-2">Source: {label(r.source)}{r.feedbackCount ? ` · ${r.feedbackCount} comment${r.feedbackCount > 1 ? 's' : ''}` : ''}</div></Card>)}</div>}</Async>}
        {tab === 'communication' && <Communication clientId={c._id} reviews={ov.data?.reviews || []} />}
        {tab === 'files' && <div className="space-y-4"><div><UploadButton label="Upload brand asset" category="BRAND_ASSET" clientId={c._id} onDone={() => ov.refetch()} /></div><Async q={ov}>{(d: any) => !d.files.length ? <Card><Empty title="No files for this client" /></Card> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{d.files.map((m: any) => <FileCard key={m._id} m={m} a={a} />)}</div>}</Async></div>}
        {tab === 'calendar' && <CalendarView clientId={c._id} />}
        {tab === 'reports' && <ClientReport clientId={c._id} />}
        {tab === 'activity' && <ClientActivity clientId={c._id} />}
        {tab === 'chat' && (ov.data ? <ChatThread roomId={ov.data.roomId} embedded /> : null)}
        <ClientForm open={edit} onClose={() => setEdit(false)} client={c} />
        <ContentFormModal open={newContent} onClose={() => setNewContent(false)} clientId={c._id} />
        <Modal
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          title={`Delete Client: ${c.name}`}
          footer={
            <>
              <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button
                variant="danger"
                loading={deleteClient.isPending}
                onClick={() => deleteClient.mutate()}
              >
                Permanently Delete Client
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-[14px]">
            <div className="rounded border border-rose-500/30 bg-rose-500/10 p-3 text-rose-500 font-medium">
              ⚠️ Are you sure you want to permanently delete <b>{c.name}</b>?
            </div>
            <p className="text-ink-2">
              This will permanently delete this client and all their content items, scripts, shooting schedules, tasks, review links, and chat records. This cannot be undone.
            </p>
          </div>
        </Modal>
        {a.modal}
      </>
    )}</Async>
  );
}
function SocialCredentialsCard({ c, onEdit }: { c: any; onEdit: () => void }) {
  const [showIg, setShowIg] = useState(false);
  const [showFb, setShowFb] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copy = (val: string, key: string, labelText: string) => {
    if (!val) return;
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    toast.success(`${labelText} copied to clipboard`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const hasAny = c.instagram || c.instagramPassword || c.facebook || c.facebookPassword;

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <KeyRound size={15} className="text-primary-ink" />
          Social Credentials
        </span>
      }
      action={
        <button onClick={onEdit} className="text-meta font-semibold text-primary-ink hover:underline">
          Edit
        </button>
      }
    >
      {!hasAny ? (
        <div className="text-center py-2">
          <p className="text-[13px] text-ink-3">No Instagram or Facebook credentials saved yet.</p>
          <Button size="sm" variant="secondary" className="mt-2" onClick={onEdit}>
            Add logins &amp; passwords
          </Button>
        </div>
      ) : (
        <div className="space-y-3 text-[13px]">
          {/* Instagram */}
          <div className="rounded-xl border border-line/60 bg-surface-2/40 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-bold text-ink">
                <Instagram size={14} className="text-pink-500" />
                Instagram
              </span>
              {c.instagram && (
                <a
                  href={`https://instagram.com/${c.instagram.replace(/^@/, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link text-meta flex items-center gap-0.5"
                >
                  Visit <ExternalLink size={11} />
                </a>
              )}
            </div>
            <div className="flex items-center justify-between text-meta">
              <span className="text-ink-2">Username / ID:</span>
              <span className="font-semibold text-ink font-mono">{c.instagram || '—'}</span>
            </div>
            <div className="flex items-center justify-between text-meta">
              <span className="text-ink-2">Password:</span>
              {c.instagramPassword ? (
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-semibold text-ink">
                    {showIg ? c.instagramPassword : '••••••••••••'}
                  </span>
                  <button
                    onClick={() => setShowIg((v) => !v)}
                    className="rounded p-1 text-ink-3 hover:text-ink hover:bg-surface-3 transition-colors"
                    title={showIg ? 'Hide password' : 'Show password'}
                  >
                    {showIg ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  <button
                    onClick={() => copy(c.instagramPassword, 'ig', 'Instagram password')}
                    className="rounded p-1 text-ink-3 hover:text-primary-ink hover:bg-surface-3 transition-colors"
                    title="Copy password"
                  >
                    {copiedKey === 'ig' ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                  </button>
                </div>
              ) : (
                <span className="text-ink-3">Not set</span>
              )}
            </div>
          </div>

          {/* Facebook */}
          <div className="rounded-xl border border-line/60 bg-surface-2/40 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-bold text-ink">
                <Facebook size={14} className="text-blue-500" />
                Facebook
              </span>
              {c.facebook && (
                <a
                  href={c.facebook.startsWith('http') ? c.facebook : `https://facebook.com/${c.facebook}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link text-meta flex items-center gap-0.5"
                >
                  Visit <ExternalLink size={11} />
                </a>
              )}
            </div>
            <div className="flex items-center justify-between text-meta">
              <span className="text-ink-2">Page / ID:</span>
              <span className="font-semibold text-ink font-mono">{c.facebook || '—'}</span>
            </div>
            <div className="flex items-center justify-between text-meta">
              <span className="text-ink-2">Password:</span>
              {c.facebookPassword ? (
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-semibold text-ink">
                    {showFb ? c.facebookPassword : '••••••••••••'}
                  </span>
                  <button
                    onClick={() => setShowFb((v) => !v)}
                    className="rounded p-1 text-ink-3 hover:text-ink hover:bg-surface-3 transition-colors"
                    title={showFb ? 'Hide password' : 'Show password'}
                  >
                    {showFb ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  <button
                    onClick={() => copy(c.facebookPassword, 'fb', 'Facebook password')}
                    className="rounded p-1 text-ink-3 hover:text-primary-ink hover:bg-surface-3 transition-colors"
                    title="Copy password"
                  >
                    {copiedKey === 'fb' ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                  </button>
                </div>
              ) : (
                <span className="text-ink-3">Not set</span>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function Campaigns({ clientId }: { clientId: string }) {
  const qc = useQueryClient(); const can = useCan(); const q = useQuery({ queryKey: ['clients', 'campaigns', clientId], queryFn: () => get<any[]>(`/clients/${clientId}/campaigns`) }); const [open, setOpen] = useState(false); const [v, setV] = useState({ name: '', description: '', startDate: '', endDate: '' });
  const m = useMutation({ mutationFn: () => post(`/clients/${clientId}/campaigns`, { ...v, startDate: v.startDate || null, endDate: v.endDate || null }), onSuccess: () => { toast.success('Campaign created.'); setOpen(false); setV({ name: '', description: '', startDate: '', endDate: '' }); qc.invalidateQueries({ queryKey: ['clients', 'campaigns', clientId] }); }, onError: (e) => toast.error(errMsg(e)) });
  return (
    <Card title="Campaigns" pad={false} action={can('content.write') && <Button size="sm" icon={<Plus size={14} />} onClick={() => setOpen(true)}>Campaign</Button>}>
      <Async q={q} empty={<Empty title="No campaigns" hint="Group related content, like a festival or a launch." />}>
        {(d: any[]) => (
          <>
            <ul className="divide-y divide-line sm:hidden">
              {d.map((x) => (
                <li key={x._id} className="p-3.5 active:bg-surface-2 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to={`/content?clientId=${clientId}&campaignId=${x._id}`}
                      className="font-bold text-ink text-[15px] hover:text-primary-ink"
                    >
                      {x.name}
                    </Link>
                    <Badge status={x.status} />
                  </div>
                  {x.description && <div className="mt-1 text-[12.5px] text-ink-2">{x.description}</div>}
                  <div className="mt-2 text-[12px] text-ink-3">
                    📅 {x.startDate ? `${fmtDate(x.startDate)} – ${x.endDate ? fmtDate(x.endDate) : ''}` : 'No date set'}
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden sm:block">
              <Table head={['Campaign', 'Dates', 'Status']} minWidth={420}>
                {d.map((x) => (
                  <tr key={x._id}>
                    <td className="td">
                      <Link to={`/content?clientId=${clientId}&campaignId=${x._id}`} className="font-medium hover:text-primary-ink">
                        {x.name}
                      </Link>
                      {x.description && <div className="text-meta text-ink-2">{x.description}</div>}
                    </td>
                    <td className="td whitespace-nowrap text-ink-2">
                      {x.startDate ? `${fmtDate(x.startDate)} – ${x.endDate ? fmtDate(x.endDate) : ''}` : '—'}
                    </td>
                    <td className="td">
                      <Badge status={x.status} />
                    </td>
                  </tr>
                ))}
              </Table>
            </div>
          </>
        )}
      </Async>
      <Modal open={open} onClose={() => setOpen(false)} title="New campaign" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={!v.name.trim()} loading={m.isPending} onClick={() => m.mutate()}>Create</Button></>}><div className="grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><Field label="Name"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoFocus /></Field></div><Field label="Start"><Input type="date" value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value })} /></Field><Field label="End"><Input type="date" value={v.endDate} onChange={(e) => setV({ ...v, endDate: e.target.value })} /></Field><div className="sm:col-span-2"><Field label="Description"><Textarea value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field></div></div></Modal>
    </Card>
  );
}
const COMM = ['WHATSAPP', 'PHONE', 'EMAIL', 'MEETING', 'INSTAGRAM_DM', 'OTHER'];
function Communication({ clientId, reviews }: { clientId: string; reviews: any[] }) {
  const qc = useQueryClient(); const can = useCan(); const q = useQuery({ queryKey: ['clients', 'comm', clientId], queryFn: () => get<any[]>(`/clients/${clientId}/communication`) });
  const init = () => ({ type: 'WHATSAPP', direction: 'INBOUND', occurredAt: toLocalInput(new Date()), summary: '', actionRequired: '', nextFollowUp: '' });
  const [open, setOpen] = useState(false); const [v, setV] = useState(init); const [att, setAtt] = useState<any>(null); const ma = useMediaActions(); const [resolve, setResolve] = useState<null | { log: any; action: 'MARK_APPROVED' | 'CREATE_CHANGE_REQUEST' }>(null); const [approvalId, setApprovalId] = useState(''); const [comment, setComment] = useState('');
  const openReviews = reviews.filter((r) => ['SENT', 'DELIVERED', 'OPENED', 'WAITING_FOR_CLIENT'].includes(r.status));
  const inv = () => { ['clients', 'approvals', 'content', 'content-detail', 'dashboard', 'reminders'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); };
  const add = useMutation({ mutationFn: () => post(`/clients/${clientId}/communication`, { ...v, occurredAt: new Date(v.occurredAt).toISOString(), nextFollowUp: v.nextFollowUp ? new Date(v.nextFollowUp).toISOString() : null, attachmentMediaId: att?._id || null }), onSuccess: () => { toast.success(v.nextFollowUp ? 'Communication logged. Follow-up reminder created.' : 'Communication logged.'); setOpen(false); setV(init()); setAtt(null); inv(); }, onError: (e) => toast.error(errMsg(e)) });
  const res = useMutation({ mutationFn: () => post(`/clients/communication/${resolve!.log._id}/resolve`, { action: resolve!.action, approvalId, comment: comment || undefined }), onSuccess: () => { toast.success(resolve!.action === 'MARK_APPROVED' ? 'Approval recorded.' : 'Changes request created.'); setResolve(null); inv(); }, onError: (e) => toast.error(errMsg(e)) });
  const start = (log: any, action: any) => { setResolve({ log, action }); setApprovalId(openReviews.find((r) => r.contentId?._id === log.contentId?._id)?._id || openReviews[0]?._id || ''); setComment(action === 'CREATE_CHANGE_REQUEST' ? log.summary : ''); };
  return (
    <>
      <Card title="Communication log" pad={false} action={can('communication.write') && <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setOpen(true)}>Log communication</Button>}>
        <Async q={q} empty={<Empty icon={<MessageSquareText size={22} />} title="No communication logged" hint="Record calls, WhatsApp messages, emails and meetings. WhatsApp replies received through AiSensy appear here automatically." />}>{(d: any[]) => (
          <ul className="divide-y divide-line">{d.map((l) => (
            <li key={l._id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-ink-2"><Badge t="neutral">{label(l.type)}</Badge><span>{l.direction === 'INBOUND' ? 'From client' : 'To client'}</span><span>{l.source === 'AISENSY' ? 'via AiSensy' : l.employeeId?.name}</span><span>{fmtDateTime(l.occurredAt)}</span>{l.contentId && <Link className="hover:text-primary-ink" to={`/content/${l.contentId._id}`}>{l.contentId.contentId}</Link>}{l.resolution && <Badge t="green">{l.resolution === 'MARKED_APPROVED' ? 'Marked approved' : 'Change request created'}</Badge>}</div>
              <p className="mt-1.5 whitespace-pre-wrap">{l.summary}</p>
              {l.actionRequired && <p className="mt-1 text-[13px]"><span className="text-ink-2">Action:</span> {l.actionRequired}</p>}
              {l.nextFollowUp && <p className="text-[13px]"><span className="text-ink-2">Next follow-up:</span> {fmtDateTime(l.nextFollowUp)}</p>}
              {l.attachmentMediaId && <button className="link mt-1 text-[13px]" onClick={() => ma.setPreview(l.attachmentMediaId)}>Attachment: {l.attachmentMediaId.fileName}</button>}
              {l.direction === 'INBOUND' && !l.resolution && openReviews.length > 0 && can('approvals.send') && <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" onClick={() => start(l, 'MARK_APPROVED')}>Mark approved</Button><Button size="sm" onClick={() => start(l, 'CREATE_CHANGE_REQUEST')}>Create change request</Button></div>}
            </li>))}</ul>
        )}</Async>
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="Log communication" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={!v.summary.trim()} loading={add.isPending} onClick={() => add.mutate()}>Save</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type"><Select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>{COMM.map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select></Field>
          <Field label="Direction"><Select value={v.direction} onChange={(e) => setV({ ...v, direction: e.target.value })}><option value="INBOUND">From client</option><option value="OUTBOUND">To client</option></Select></Field>
          <div className="sm:col-span-2"><Field label="Date and time"><Input type="datetime-local" value={v.occurredAt} onChange={(e) => setV({ ...v, occurredAt: e.target.value })} /></Field></div>
          <div className="sm:col-span-2"><Field label="Summary"><Textarea rows={3} value={v.summary} onChange={(e) => setV({ ...v, summary: e.target.value })} placeholder="Client requested changes to opening scene." autoFocus /></Field></div>
          <div className="sm:col-span-2"><Field label="Action required"><Input value={v.actionRequired} onChange={(e) => setV({ ...v, actionRequired: e.target.value })} placeholder="Update Edit V3." /></Field></div>
          <div className="sm:col-span-2"><Field label="Next follow-up" hint="Creates a reminder for you."><Input type="datetime-local" value={v.nextFollowUp} onChange={(e) => setV({ ...v, nextFollowUp: e.target.value })} /></Field></div>
          <div className="flex items-center gap-2 sm:col-span-2">{att ? <span className="text-[13px]">Attached: <b>{att.fileName}</b> <button className="link" onClick={() => setAtt(null)}>Remove</button></span> : <UploadButton label="Attach file" category="DOCUMENT" clientId={clientId} variant="secondary" size="sm" onDone={setAtt} camera />}</div>
        </div>
      </Modal>
      {ma.modal}
      <Modal open={!!resolve} onClose={() => setResolve(null)} title={resolve?.action === 'MARK_APPROVED' ? 'Mark as approved by client' : 'Create change request'} footer={<><Button onClick={() => setResolve(null)}>Cancel</Button><Button variant="primary" disabled={!approvalId || (resolve?.action === 'CREATE_CHANGE_REQUEST' && !comment.trim())} loading={res.isPending} onClick={() => res.mutate()}>{resolve?.action === 'MARK_APPROVED' ? 'Confirm approval' : 'Create change request'}</Button></>}>
        <div className="space-y-3">
          <div className="rounded border border-line bg-surface-2 p-3 text-[13px]"><div className="text-meta text-ink-2">Client message</div>{resolve?.log.summary}</div>
          <Field label="Which review does this apply to?"><Select value={approvalId} onChange={(e) => setApprovalId(e.target.value)}>{openReviews.map((r) => <option key={r._id} value={r._id}>{r.contentId?.title} — {r.version}</option>)}</Select></Field>
          {resolve?.action === 'CREATE_CHANGE_REQUEST' && <Field label="Change requested"><Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>}
          <p className="text-meta text-ink-3">This is recorded under your name as a manual decision and moves the workflow forward, exactly as if the client had used the link.</p>
        </div>
      </Modal>
    </>
  );
}
function ClientActivity({ clientId }: { clientId: string }) { const q = useQuery({ queryKey: ['activity', 'client', clientId], queryFn: () => get<any[]>(`/clients/${clientId}/activity`) }); return <Card pad={false}><Async q={q}>{(d: any[]) => <ActivityFeed items={d} />}</Async></Card>; }
function ClientReport({ clientId }: { clientId: string }) {
  const can = useCan();
  const [showStatusModal, setShowStatusModal] = useState(false);
  const q = useQuery({ queryKey: ['reports', clientId], queryFn: () => get('/reports', { clientId, days: 90 }), enabled: can('reports.view') });
  if (!can('reports.view')) return <Card><Empty title="Reports are available to managers" /></Card>;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-bold text-ink">90-Day Production &amp; Approval Overview</h3>
        <Button
          variant="primary"
          size="sm"
          icon={<Sparkles size={14} className="text-emerald-300" />}
          onClick={() => setShowStatusModal(true)}
        >
          Detailed Status Report &amp; PDF
        </Button>
      </div>
      <Async q={q}>{(r: any) => <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label="Created (90 days)" value={r.created} /><Stat label="Published (90 days)" value={r.published} /><Stat label="In production" value={r.pending} /><Stat label="Revisions requested" value={r.revisionCount.total} /><Stat label="Client approval time" value={r.approvalTimeHours.client != null ? `${r.approvalTimeHours.client} h` : '—'} hint="Average, sent to decision" /><Stat label="Internal review time" value={r.approvalTimeHours.internal != null ? `${r.approvalTimeHours.internal} h` : '—'} /><Stat label="Blocked" value={r.blocked} tone="red" /><Stat label="Files uploaded" value={r.filesUploaded} /></div>}</Async>
      <ClientReportModal open={showStatusModal} onClose={() => setShowStatusModal(false)} defaultClientId={clientId} />
    </>
  );
}
export { ago, useClientReviewActions };

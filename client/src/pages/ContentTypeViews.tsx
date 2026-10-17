import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  Film, Image as ImageIcon, Layers, Sparkles, Plus, CheckCircle2,
  AlertTriangle, Clock, ExternalLink, SlidersHorizontal, Camera,
  Scissors, User, Check, X, ShieldAlert, ArrowRight, Play
} from 'lucide-react';
import { get, post, patch, errMsg } from '@/lib/api';
import { Button, Card, Empty, Input, Modal, PageHeader, Select, Table, Progress } from '@/components/ui';
import { ContentThumb, StatusBadge, PlatformBadge } from '@/components/Lists';
import { ContentFormModal } from '@/components/Forms';
import { useClients, useTeam } from '@/hooks/useData';
import { fmtDate, fmtDateTime, isOverdue, label, roleLabel } from '@/lib/format';
import { toast } from '@/store/ui';

// ==========================================
// 1. REELS WORKFLOW VIEW
// ==========================================
export function ReelsView() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [cancelShootContent, setCancelShootContent] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const clients = useClients();

  const q = useQuery({
    queryKey: ['content', 'reels', selectedClient],
    queryFn: () => get<any>('/content', { type: 'REEL', clientId: selectedClient || undefined, limit: 100 }),
  });

  const cancelShootMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      post(`/content/${id}/shoot/cancel`, { reason }),
    onSuccess: () => {
      toast.success('Shoot marked as Cancelled. Assigned shooting tasks cleaned up.');
      setCancelShootContent(null);
      setCancelReason('');
      qc.invalidateQueries({ queryKey: ['content'] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const items: any[] = (q.data?.items || []).filter((c: any) => {
    if (search) {
      const s = search.toLowerCase();
      return (c.title || '').toLowerCase().includes(s) || (c.contentId || '').toLowerCase().includes(s);
    }
    return true;
  });

  return (
    <div className="space-y-5 pb-16">
      <PageHeader
        title="Reels Production"
        sub="Shoot planning, raw footage intake, video editing, reviews, and client sign-offs for Reels."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              onClick={() => setCreateOpen(true)}
            >
              New Reel
            </Button>
          </div>
        }
      />

      {/* Summary KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card pad className="bg-surface/80 border-cyan-500/20">
          <div className="text-xs font-semibold text-cyan-600 dark:text-cyan-400">Total Reels</div>
          <div className="text-2xl font-black mt-1 text-ink">{items.length}</div>
        </Card>
        <Card pad className="bg-surface/80 border-orange-500/20">
          <div className="text-xs font-semibold text-orange-600 dark:text-orange-400">In Shooting Phase</div>
          <div className="text-2xl font-black mt-1 text-orange-500">
            {items.filter(c => c.stage === 'SHOOTING' || c.stage === 'RAW_FOOTAGE').length}
          </div>
        </Card>
        <Card pad className="bg-surface/80 border-yellow-500/20">
          <div className="text-xs font-semibold text-yellow-600 dark:text-yellow-400">In Video Editing</div>
          <div className="text-2xl font-black mt-1 text-yellow-500">
            {items.filter(c => c.stage === 'EDITING' || c.stage === 'SMM_REVIEW').length}
          </div>
        </Card>
        <Card pad className="bg-surface/80 border-emerald-500/20">
          <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Client Approved / Scheduled</div>
          <div className="text-2xl font-black mt-1 text-emerald-500">
            {items.filter(c => c.stage === 'SCHEDULE' || c.stage === 'PUBLISHED').length}
          </div>
        </Card>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 max-w-md">
        <Input
          placeholder="Filter by title or Reel ID (e.g. SAG-001)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)}>
          <option value="">All Clients</option>
          {(clients.data || []).map((c) => (
            <option key={c._id} value={c._id}>{c.name}</option>
          ))}
        </Select>
      </div>

      {/* Reels Table */}
      <Card pad={false}>
        {items.length === 0 ? (
          <Empty title="No Reels Found" hint="Create your first Reel to start tracking shooting and editing." />
        ) : (
          <Table head={['Reel ID & Title', 'Client', 'Stage', 'Shooter / Date', 'Editor', 'Progress', 'Status', 'Actions']} minWidth={950}>
            {items.map((c) => (
              <tr key={c._id} onClick={() => nav(`/content/${c._id}`)} className="cursor-pointer hover:bg-surface-2/70 transition-colors">
                <td className="td">
                  <div className="flex items-center gap-3">
                    <ContentThumb content={c} />
                    <div className="min-w-0">
                      <div className="font-semibold text-ink truncate max-w-[220px]">{c.title}</div>
                      <div className="font-mono text-xs font-bold text-indigo-500">{c.contentId}</div>
                    </div>
                  </div>
                </td>
                <td className="td font-medium text-ink-2">{c.clientId?.name}</td>
                <td className="td font-bold text-xs">{label(c.stage)}</td>
                <td className="td text-xs">
                  <div className="font-semibold text-ink flex items-center gap-1">
                    <Camera size={13} className="text-orange-500" />
                    {c.assignedShooter?.name || 'Unassigned'}
                  </div>
                  {c.stageDeadlines?.shoot && (
                    <div className="text-[11px] text-ink-3 mt-0.5">
                      Shoot: {fmtDate(c.stageDeadlines.shoot)}
                    </div>
                  )}
                </td>
                <td className="td text-xs">
                  <div className="font-semibold text-ink flex items-center gap-1">
                    <Scissors size={13} className="text-yellow-500" />
                    {c.assignedEditor?.name || 'Unassigned'}
                  </div>
                  {c.stageDeadlines?.edit && (
                    <div className="text-[11px] text-ink-3 mt-0.5">
                      Edit: {fmtDate(c.stageDeadlines.edit)}
                    </div>
                  )}
                </td>
                <td className="td">
                  <div className="flex w-24 items-center gap-1.5">
                    <Progress value={c.progress} tone={c.status === 'BLOCKED' ? 'red' : undefined} />
                    <span className="text-[11px] font-bold tabular text-ink-2">{c.progress}%</span>
                  </div>
                </td>
                <td className="td"><StatusBadge c={c} /></td>
                <td className="td text-right" onClick={(e) => e.stopPropagation()}>
                  {c.stage === 'SHOOTING' && c.productionStatus !== 'SHOOT_CANCELLED' && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => setCancelShootContent(c)}
                    >
                      Cancel Shoot
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {/* Cancel Shoot Modal */}
      {cancelShootContent && (
        <Modal
          open={!!cancelShootContent}
          onClose={() => setCancelShootContent(null)}
          title={`Cancel Shoot: ${cancelShootContent.contentId}`}
        >
          <div className="space-y-4">
            <p className="text-sm text-ink-2">
              Are you sure you want to cancel the scheduled shoot for <strong>{cancelShootContent.title}</strong>? This will set the status to <strong>Shoot Cancelled (#FF0000)</strong> and release the shooter task.
            </p>
            <div>
              <label className="text-xs font-bold text-ink-2 block mb-1">Reason for cancellation</label>
              <Input
                placeholder="Client requested date change, weather issue, etc."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setCancelShootContent(null)}>Back</Button>
              <Button
                variant="danger"
                loading={cancelShootMut.isPending}
                onClick={() => cancelShootMut.mutate({ id: cancelShootContent._id, reason: cancelReason })}
              >
                Confirm Cancel Shoot
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <ContentFormModal open={createOpen} onClose={() => setCreateOpen(false)} defaultType="REEL" />
    </div>
  );
}

// ==========================================
// 2. POSTS (GRAPHIC) WORKFLOW VIEW
// ==========================================
export function PostsView() {
  const nav = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const clients = useClients();

  const q = useQuery({
    queryKey: ['content', 'posts', selectedClient],
    queryFn: () => get<any>('/content', { type: 'POST', clientId: selectedClient || undefined, limit: 100 }),
  });

  const items: any[] = (q.data?.items || []).filter((c: any) => {
    if (search) {
      const s = search.toLowerCase();
      return (c.title || '').toLowerCase().includes(s) || (c.contentId || '').toLowerCase().includes(s);
    }
    return true;
  });

  return (
    <div className="space-y-5 pb-16">
      <PageHeader
        title="Posts Production (Graphics)"
        sub="Copywriting, graphic design, layout approval, client sign-off, and scheduling for static social posts."
        actions={
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => setCreateOpen(true)}
          >
            New Post
          </Button>
        }
      />

      {/* Info Notice: No Shooting Required */}
      <div className="rounded-xl border border-blue-400/30 bg-blue-500/10 p-3.5 text-xs text-blue-900 dark:text-blue-200 flex items-center justify-between">
        <span>💡 <strong>Fast Graphic Pipeline:</strong> Static Posts bypass physical shooting. Copywriting transitions directly to Graphic Design &rarr; Internal SMM Review &rarr; Client Approval &rarr; Schedule.</span>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 max-w-md">
        <Input
          placeholder="Filter by title or Post ID (e.g. SAG-003)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)}>
          <option value="">All Clients</option>
          {(clients.data || []).map((c) => (
            <option key={c._id} value={c._id}>{c.name}</option>
          ))}
        </Select>
      </div>

      <Card pad={false}>
        {items.length === 0 ? (
          <Empty title="No Posts Found" hint="Create your first static post to start graphic production." />
        ) : (
          <Table head={['Post ID & Title', 'Client', 'Stage', 'Copywriter', 'Graphic Designer', 'Progress', 'Status']} minWidth={900}>
            {items.map((c) => (
              <tr key={c._id} onClick={() => nav(`/content/${c._id}`)} className="cursor-pointer hover:bg-surface-2/70 transition-colors">
                <td className="td">
                  <div className="flex items-center gap-3">
                    <ContentThumb content={c} />
                    <div className="min-w-0">
                      <div className="font-semibold text-ink truncate max-w-[220px]">{c.title}</div>
                      <div className="font-mono text-xs font-bold text-blue-500">{c.contentId}</div>
                    </div>
                  </div>
                </td>
                <td className="td font-medium text-ink-2">{c.clientId?.name}</td>
                <td className="td font-bold text-xs">{label(c.stage)}</td>
                <td className="td text-xs font-semibold text-ink">{c.assignedWriter?.name || 'Unassigned'}</td>
                <td className="td text-xs">
                  <div className="font-semibold text-ink flex items-center gap-1">
                    <ImageIcon size={13} className="text-teal-500" />
                    {c.assignedDesigner?.name || 'Unassigned'}
                  </div>
                  {c.stageDeadlines?.design && (
                    <div className="text-[11px] text-ink-3 mt-0.5">
                      Design: {fmtDate(c.stageDeadlines.design)}
                    </div>
                  )}
                </td>
                <td className="td">
                  <div className="flex w-24 items-center gap-1.5">
                    <Progress value={c.progress} tone={c.status === 'BLOCKED' ? 'red' : undefined} />
                    <span className="text-[11px] font-bold tabular text-ink-2">{c.progress}%</span>
                  </div>
                </td>
                <td className="td"><StatusBadge c={c} /></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <ContentFormModal open={createOpen} onClose={() => setCreateOpen(false)} defaultType="POST" />
    </div>
  );
}

// ==========================================
// 3. CAROUSELS WORKFLOW VIEW
// ==========================================
export function CarouselsView() {
  const nav = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const clients = useClients();

  const q = useQuery({
    queryKey: ['content', 'carousels', selectedClient],
    queryFn: () => get<any>('/content', { type: 'CAROUSEL', clientId: selectedClient || undefined, limit: 100 }),
  });

  const items: any[] = (q.data?.items || []).filter((c: any) => {
    if (search) {
      const s = search.toLowerCase();
      return (c.title || '').toLowerCase().includes(s) || (c.contentId || '').toLowerCase().includes(s);
    }
    return true;
  });

  return (
    <div className="space-y-5 pb-16">
      <PageHeader
        title="Carousels Production"
        sub="Multi-slide content planning, graphic slide creation, slide reviews, and sequencing."
        actions={
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => setCreateOpen(true)}
          >
            New Carousel
          </Button>
        }
      />

      {/* Filter bar */}
      <div className="flex items-center gap-2 max-w-md">
        <Input
          placeholder="Filter by title or Carousel ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)}>
          <option value="">All Clients</option>
          {(clients.data || []).map((c) => (
            <option key={c._id} value={c._id}>{c.name}</option>
          ))}
        </Select>
      </div>

      <Card pad={false}>
        {items.length === 0 ? (
          <Empty title="No Carousels Found" hint="Create your first multi-slide carousel to begin production." />
        ) : (
          <Table head={['Carousel ID & Title', 'Client', 'Stage', 'Slide Content / Writer', 'Graphic Designer', 'Progress', 'Status']} minWidth={900}>
            {items.map((c) => (
              <tr key={c._id} onClick={() => nav(`/content/${c._id}`)} className="cursor-pointer hover:bg-surface-2/70 transition-colors">
                <td className="td">
                  <div className="flex items-center gap-3">
                    <ContentThumb content={c} />
                    <div className="min-w-0">
                      <div className="font-semibold text-ink truncate max-w-[220px]">{c.title}</div>
                      <div className="font-mono text-xs font-bold text-teal-500">{c.contentId}</div>
                    </div>
                  </div>
                </td>
                <td className="td font-medium text-ink-2">{c.clientId?.name}</td>
                <td className="td font-bold text-xs">{label(c.stage)}</td>
                <td className="td text-xs font-semibold text-ink">{c.assignedWriter?.name || 'Unassigned'}</td>
                <td className="td text-xs">
                  <div className="font-semibold text-ink flex items-center gap-1">
                    <Layers size={13} className="text-teal-500" />
                    {c.assignedDesigner?.name || 'Unassigned'}
                  </div>
                </td>
                <td className="td">
                  <div className="flex w-24 items-center gap-1.5">
                    <Progress value={c.progress} tone={c.status === 'BLOCKED' ? 'red' : undefined} />
                    <span className="text-[11px] font-bold tabular text-ink-2">{c.progress}%</span>
                  </div>
                </td>
                <td className="td"><StatusBadge c={c} /></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <ContentFormModal open={createOpen} onClose={() => setCreateOpen(false)} defaultType="CAROUSEL" />
    </div>
  );
}

// ==========================================
// 4. AI REELS WORKFLOW VIEW
// ==========================================
export function AiReelsView() {
  const nav = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const clients = useClients();

  const q = useQuery({
    queryKey: ['content', 'ai_reels', selectedClient],
    queryFn: () => get<any>('/content', { type: 'AI_REEL', clientId: selectedClient || undefined, limit: 100 }),
  });

  const items: any[] = (q.data?.items || []).filter((c: any) => {
    if (search) {
      const s = search.toLowerCase();
      return (c.title || '').toLowerCase().includes(s) || (c.contentId || '').toLowerCase().includes(s);
    }
    return true;
  });

  return (
    <div className="space-y-5 pb-16">
      <PageHeader
        title="AI Reels Production"
        sub="AI prompt generation, synthesis, automated animation, and video editing workflow."
        actions={
          <Button
            variant="primary"
            icon={<Sparkles size={16} />}
            onClick={() => setCreateOpen(true)}
          >
            New AI Reel
          </Button>
        }
      />

      {/* Info Notice: AI Generation Pipeline */}
      <div className="rounded-xl border border-purple-400/30 bg-purple-500/10 p-3.5 text-xs text-purple-900 dark:text-purple-200 flex items-center justify-between">
        <span>✨ <strong>AI Generation Pipeline:</strong> AI Prompt &rarr; AI Generation &rarr; Video Editing &rarr; Internal Review &rarr; Client Approval &rarr; Schedule.</span>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 max-w-md">
        <Input
          placeholder="Filter by title or AI Reel ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)}>
          <option value="">All Clients</option>
          {(clients.data || []).map((c) => (
            <option key={c._id} value={c._id}>{c.name}</option>
          ))}
        </Select>
      </div>

      <Card pad={false}>
        {items.length === 0 ? (
          <Empty title="No AI Reels Found" hint="Create your first AI Reel to start generative video production." />
        ) : (
          <Table head={['AI Reel ID & Title', 'Client', 'Stage', 'Prompt / Script', 'Editor', 'Progress', 'Status']} minWidth={900}>
            {items.map((c) => (
              <tr key={c._id} onClick={() => nav(`/content/${c._id}`)} className="cursor-pointer hover:bg-surface-2/70 transition-colors">
                <td className="td">
                  <div className="flex items-center gap-3">
                    <ContentThumb content={c} />
                    <div className="min-w-0">
                      <div className="font-semibold text-ink truncate max-w-[220px]">{c.title}</div>
                      <div className="font-mono text-xs font-bold text-purple-500">{c.contentId}</div>
                    </div>
                  </div>
                </td>
                <td className="td font-medium text-ink-2">{c.clientId?.name}</td>
                <td className="td font-bold text-xs">{label(c.stage)}</td>
                <td className="td text-xs font-semibold text-ink truncate max-w-[200px]">
                  {c.assignedWriter?.name || 'AI Prompt Spec'}
                </td>
                <td className="td text-xs">
                  <div className="font-semibold text-ink flex items-center gap-1">
                    <Scissors size={13} className="text-yellow-500" />
                    {c.assignedEditor?.name || 'Unassigned'}
                  </div>
                </td>
                <td className="td">
                  <div className="flex w-24 items-center gap-1.5">
                    <Progress value={c.progress} tone={c.status === 'BLOCKED' ? 'red' : undefined} />
                    <span className="text-[11px] font-bold tabular text-ink-2">{c.progress}%</span>
                  </div>
                </td>
                <td className="td"><StatusBadge c={c} /></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <ContentFormModal open={createOpen} onClose={() => setCreateOpen(false)} defaultType="AI_REEL" />
    </div>
  );
}

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  FileSpreadsheet, Sparkles, Filter, Calendar, ExternalLink, Copy, Check,
  Camera, Film, CheckCircle2, Clock, AlertTriangle, Layers, Image as ImageIcon,
  ChevronDown, Search, ArrowRight, UserCheck, RefreshCw
} from 'lucide-react';
import { get, post, errMsg } from '@/lib/api';
import { useClients, useTeam } from '@/hooks/useData';
import { Button, Modal, Card, Input, Select, Badge, Spinner } from '@/components/ui';
import { TypeBadge, PlatformBadge } from '@/components/Lists';
import { fmtDate, label, roleLabel } from '@/lib/format';
import { toast } from '@/store/ui';

interface Props {
  open: boolean;
  onClose: () => void;
  defaultRole?: 'ALL' | 'SHOOTER' | 'EDITOR';
  defaultClientId?: string;
}

export function ShooterEditorReportModal({ open, onClose, defaultRole = 'ALL', defaultClientId = '' }: Props) {
  const clients = useClients();
  const team = useTeam();

  // Filters State
  const [role, setRole] = useState<'ALL' | 'SHOOTER' | 'EDITOR'>(defaultRole);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedClient, setSelectedClient] = useState(defaultClientId);
  const [selectedType, setSelectedType] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [timePreset, setTimePreset] = useState<'ALL' | 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_YEAR' | 'CUSTOM'>('THIS_MONTH');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');

  // Generated Sheet State
  const [generatedSheet, setGeneratedSheet] = useState<{
    url: string;
    sheetTitle: string;
    itemsCount: number;
    summary: any;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Compute month/year/dates from preset
  const queryDates = useMemo(() => {
    const now = new Date();
    if (timePreset === 'TODAY') {
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      return { startDate: todayStr, endDate: todayStr };
    }
    if (timePreset === 'THIS_WEEK') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const s = new Date(now.getFullYear(), now.getMonth(), diff);
      const e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
      const sStr = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`;
      const eStr = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`;
      return { startDate: sStr, endDate: eStr };
    }
    if (timePreset === 'THIS_MONTH') {
      return { month: now.getMonth() + 1, year: now.getFullYear() };
    }
    if (timePreset === 'LAST_MONTH') {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { month: lm.getMonth() + 1, year: lm.getFullYear() };
    }
    if (timePreset === 'THIS_YEAR') {
      return { year: now.getFullYear() };
    }
    if (timePreset === 'CUSTOM') {
      return { startDate: startDate || undefined, endDate: endDate || undefined };
    }
    return {};
  }, [timePreset, startDate, endDate]);

  // Filter team members based on selected role
  const filteredTeamMembers = useMemo(() => {
    const list = team.data || [];
    if (role === 'SHOOTER') {
      return list.filter((u: any) => u.role === 'SHOOTER' || (u.role && u.role.includes('SHOOT')));
    }
    if (role === 'EDITOR') {
      return list.filter((u: any) => u.role === 'EDITOR' || (u.role && u.role.includes('EDIT')));
    }
    return list.filter((u: any) => ['SHOOTER', 'EDITOR', 'DESIGNER', 'TEAM_LEAD', 'SMM'].includes(u.role));
  }, [team.data, role]);

  // Query live preview data from backend
  const previewQ = useQuery({
    queryKey: ['reports', 'shooter-editor', 'preview', role, selectedUser, selectedClient, selectedType, selectedStatus, queryDates],
    queryFn: () => get<any>('/sheets/reports/shooter-editor/preview', {
      role,
      userId: selectedUser || undefined,
      clientId: selectedClient || undefined,
      contentType: selectedType || undefined,
      status: selectedStatus || undefined,
      ...queryDates,
    }),
    enabled: open,
  });

  // Mutation to generate the Google Sheet tab
  const exportMut = useMutation({
    mutationFn: () => post<any>('/sheets/reports/shooter-editor', {
      role,
      userId: selectedUser || undefined,
      clientId: selectedClient || undefined,
      contentType: selectedType || undefined,
      status: selectedStatus || undefined,
      ...queryDates,
    }),
    onSuccess: (data) => {
      setGeneratedSheet({
        url: data.url,
        sheetTitle: data.sheetTitle,
        itemsCount: data.itemsCount,
        summary: data.summary,
      });
      toast.success(`Google Sheet "${data.sheetTitle}" generated with live colors and links!`);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const handleCopyLink = () => {
    if (generatedSheet?.url) {
      navigator.clipboard.writeText(generatedSheet.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Google Sheet direct link copied to clipboard!');
    }
  };

  const previewData = previewQ.data || { total: 0, shot: 0, pendingShoot: 0, editing: 0, editDone: 0, completed: 0, items: [] };

  const displayedItems = useMemo(() => {
    const items: any[] = previewData.items || [];
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((c: any) =>
      (c.title || '').toLowerCase().includes(q) ||
      (c.contentId || '').toLowerCase().includes(q) ||
      (c.clientId?.name || '').toLowerCase().includes(q) ||
      (c.assignedShooter?.name || '').toLowerCase().includes(q) ||
      (c.assignedEditor?.name || '').toLowerCase().includes(q)
    );
  }, [previewData.items, search]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-500">
            <FileSpreadsheet size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-black text-ink">Shooter &amp; Editor Production Report</span>
              <Badge t="blue">Live Sheets Generator</Badge>
            </div>
            <p className="text-xs text-ink-3">
              Filter deliverables by Shooter, Editor, Client, and Date Range — then export a color-formatted Google Sheet.
            </p>
          </div>
        </div>
      }
      wide
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 w-full">
          <div className="text-xs text-ink-3">
            Showing <strong className="text-ink">{displayedItems.length}</strong> matching deliverable(s)
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={onClose}>Close</Button>
            <Button
              variant="primary"
              icon={<Sparkles size={15} className="text-amber-300" />}
              loading={exportMut.isPending}
              onClick={() => exportMut.mutate()}
            >
              Generate Color-Coded Google Sheet
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        {/* Prominent Success Banner if Sheet Was Just Generated */}
        {generatedSheet && (
          <div className="rounded-xl border border-emerald-500/50 bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-emerald-500/15 p-4 shadow-sm animate-rise">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm">
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      Google Sheet Generated Successfully
                    </span>
                    <Badge t="green">Active Tab: {generatedSheet.sheetTitle}</Badge>
                  </div>
                  <p className="text-xs font-semibold text-ink mt-0.5">
                    Synchronized {generatedSheet.itemsCount} deliverables with status color-coding, direct asset links, and deadlines.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  onClick={handleCopyLink}
                >
                  {copied ? 'Copied Link!' : 'Copy Link'}
                </Button>
                <a
                  href={generatedSheet.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition-colors"
                >
                  <span>Open Sheet ↗</span>
                  <ExternalLink size={13} />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Filter Controls Panel */}
        <div className="rounded-xl border border-line bg-surface-2/40 p-3.5 space-y-3">
          <div className="flex items-center justify-between border-b border-line/60 pb-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-ink">
              <Filter size={14} className="text-primary" />
              <span>Report Filter Controls</span>
            </div>
            {/* Role Switcher Pills */}
            <div className="flex items-center gap-1 bg-surface-3/70 p-1 rounded-lg">
              {(['ALL', 'SHOOTER', 'EDITOR'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setRole(r);
                    setSelectedUser('');
                  }}
                  className={clsx(
                    'px-2.5 py-0.5 text-xs font-bold rounded-md transition-all',
                    role === r ? 'bg-primary text-white shadow-xs' : 'text-ink-3 hover:text-ink'
                  )}
                >
                  {r === 'ALL' ? 'All Roles' : r === 'SHOOTER' ? '📹 Shooters' : '✂️ Editors'}
                </button>
              ))}
            </div>
          </div>

          {/* Filter Dropdowns Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {/* Person Selector */}
            <div>
              <label className="text-[11px] font-bold text-ink-3 block mb-1">
                {role === 'SHOOTER' ? 'Shooter Name' : role === 'EDITOR' ? 'Editor Name' : 'Team Member'}
              </label>
              <Select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} className="w-full text-xs">
                <option value="">All Team Members</option>
                {filteredTeamMembers.map((u: any) => (
                  <option key={u._id} value={u._id}>
                    {u.name} ({roleLabel(u.role)})
                  </option>
                ))}
              </Select>
            </div>

            {/* Client Selector */}
            <div>
              <label className="text-[11px] font-bold text-ink-3 block mb-1">Client Business</label>
              <Select value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)} className="w-full text-xs">
                <option value="">All Clients</option>
                {(clients.data || []).map((c: any) => (
                  <option key={c._id} value={c._id}>
                    {c.name} {c.clientCode ? `(${c.clientCode})` : ''}
                  </option>
                ))}
              </Select>
            </div>

            {/* Deliverable Type */}
            <div>
              <label className="text-[11px] font-bold text-ink-3 block mb-1">Content Type</label>
              <Select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} className="w-full text-xs">
                <option value="">All Types (Reels, Posts, Carousels)</option>
                <option value="REEL">Reels &amp; Short Videos</option>
                <option value="POST">Posts &amp; Graphics</option>
                <option value="CAROUSEL">Multi-slide Carousels</option>
                <option value="AI_REEL">AI Reels</option>
              </Select>
            </div>

            {/* Status Filter */}
            <div>
              <label className="text-[11px] font-bold text-ink-3 block mb-1">Production Status</label>
              <Select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} className="w-full text-xs">
                <option value="ALL">All Statuses</option>
                <option value="SHOT">✅ Shot / Footage Uploaded</option>
                <option value="PENDING_SHOOT">⚠️ Pending Shoot / Script Ready</option>
                <option value="EDITING">✂️ In Video Editing</option>
                <option value="EDIT_DONE">⭐ Edit Completed / In Review</option>
                <option value="COMPLETED">🎉 Published / Completed</option>
              </Select>
            </div>
          </div>

          {/* Time & Date Presets */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-line/40">
            <span className="text-[11px] font-bold text-ink-3 flex items-center gap-1">
              <Calendar size={12} /> Period:
            </span>
            {[
              { id: 'TODAY', label: 'Today' },
              { id: 'THIS_WEEK', label: 'This Week' },
              { id: 'THIS_MONTH', label: 'This Month' },
              { id: 'LAST_MONTH', label: 'Last Month' },
              { id: 'THIS_YEAR', label: 'Year 2026' },
              { id: 'ALL', label: 'All Time' },
              { id: 'CUSTOM', label: 'Custom Date Range' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setTimePreset(p.id as any)}
                className={clsx(
                  'px-2 py-0.5 text-xs font-semibold rounded transition-colors',
                  timePreset === p.id
                    ? 'bg-primary text-white font-bold'
                    : 'bg-surface-3 text-ink-2 hover:bg-surface-3/80 hover:text-ink'
                )}
              >
                {p.label}
              </button>
            ))}

            {timePreset === 'CUSTOM' && (
              <div className="flex items-center gap-2 ml-auto">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="!py-1 !text-xs !w-32"
                />
                <span className="text-xs text-ink-3">to</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="!py-1 !text-xs !w-32"
                />
              </div>
            )}
          </div>
        </div>

        {/* Live KPI Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <div className="rounded-xl border border-line bg-surface p-3">
            <div className="text-[11px] font-bold text-ink-3 uppercase tracking-wider">Total Content</div>
            <div className="mt-1 text-2xl font-black text-ink tabular">{previewData.total}</div>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
            <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
              Footage Shot
            </div>
            <div className="mt-1 text-2xl font-black text-emerald-500 tabular">{previewData.shot}</div>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="text-[11px] font-bold text-amber-500 uppercase tracking-wider">
              Pending Shoot
            </div>
            <div className="mt-1 text-2xl font-black text-amber-500 tabular">{previewData.pendingShoot}</div>
          </div>
          <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-3">
            <div className="text-[11px] font-bold text-purple-500 uppercase tracking-wider">
              In Video Edit
            </div>
            <div className="mt-1 text-2xl font-black text-purple-500 tabular">{previewData.editing}</div>
          </div>
          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-3">
            <div className="text-[11px] font-bold text-yellow-600 dark:text-yellow-400 uppercase tracking-wider">
              Edit Completed
            </div>
            <div className="mt-1 text-2xl font-black text-yellow-500 tabular">{previewData.editDone}</div>
          </div>
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3">
            <div className="text-[11px] font-bold text-blue-500 uppercase tracking-wider">
              Posted Live
            </div>
            <div className="mt-1 text-2xl font-black text-blue-500 tabular">{previewData.completed}</div>
          </div>
        </div>

        {/* Search & Deliverables Preview Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <Input
                placeholder="Search by title, Content ID, shooter, editor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full !py-1.5 !text-xs"
              />
            </div>
            <div className="text-xs text-ink-3">
              Google Sheet will include columns A–Q with live formulas and Drive folders.
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface overflow-hidden">
            {previewQ.isFetching ? (
              <div className="p-8 text-center">
                <Spinner />
                <p className="mt-2 text-xs font-semibold text-ink-3">Loading report deliverables...</p>
              </div>
            ) : displayedItems.length === 0 ? (
              <div className="p-8 text-center text-ink-3 text-xs">
                No deliverables found matching the selected filters.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-surface-2 text-ink-2 font-bold sticky top-0 border-b border-line">
                    <tr>
                      <th className="p-2.5">Content ID</th>
                      <th className="p-2.5">Client</th>
                      <th className="p-2.5">Deliverable Title</th>
                      <th className="p-2.5">Shooter</th>
                      <th className="p-2.5">Shoot Status</th>
                      <th className="p-2.5">Editor</th>
                      <th className="p-2.5">Edit Status</th>
                      <th className="p-2.5">Stage</th>
                      <th className="p-2.5">Deadline</th>
                      <th className="p-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {displayedItems.map((c: any) => {
                      const isShot = ['RAW_FOOTAGE', 'EDITING', 'SMM_REVIEW', 'FINAL_REVIEW', 'SCHEDULE', 'PUBLISHED'].includes(c.stage) ||
                        ['RAW_UPLOADED', 'EDITING', 'COMPLETED'].includes(c.productionStatus);
                      const isEditDone = ['SMM_REVIEW', 'FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'SCHEDULE', 'PUBLISHED'].includes(c.stage) || c.status === 'COMPLETED';

                      return (
                        <tr key={c._id} className="hover:bg-surface-2/60 transition-colors">
                          <td className="p-2.5 font-mono font-bold text-primary">
                            <Link to={`/content/${c._id}`} target="_blank" className="hover:underline">
                              {c.contentId}
                            </Link>
                          </td>
                          <td className="p-2.5 font-semibold text-ink truncate max-w-[120px]">
                            {c.clientId?.name || 'Client'}
                          </td>
                          <td className="p-2.5 text-ink truncate max-w-[200px]">
                            {c.title}
                          </td>
                          <td className="p-2.5 font-medium text-ink-2">
                            {c.assignedShooter?.name || 'Unassigned'}
                          </td>
                          <td className="p-2.5">
                            <span className={clsx(
                              'px-2 py-0.5 rounded text-[10px] font-bold',
                              isShot ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                            )}>
                              {isShot ? '3. Shoot Done' : 'Pending Shoot'}
                            </span>
                          </td>
                          <td className="p-2.5 font-medium text-ink-2">
                            {c.assignedEditor?.name || 'Unassigned'}
                          </td>
                          <td className="p-2.5">
                            <span className={clsx(
                              'px-2 py-0.5 rounded text-[10px] font-bold',
                              isEditDone ? 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300' : 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
                            )}>
                              {isEditDone ? '4. Edit Done' : 'In Editing'}
                            </span>
                          </td>
                          <td className="p-2.5 text-ink-3">
                            {label(c.stage)}
                          </td>
                          <td className="p-2.5 whitespace-nowrap text-ink-3">
                            {c.deadline ? fmtDate(c.deadline) : '—'}
                          </td>
                          <td className="p-2.5 text-right">
                            <Link
                              to={`/content/${c._id}`}
                              target="_blank"
                              className="text-primary hover:underline font-semibold"
                            >
                              View ➔
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

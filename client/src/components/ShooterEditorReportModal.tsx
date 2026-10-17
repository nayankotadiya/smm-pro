import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  FileSpreadsheet, Sparkles, Filter, Calendar, ExternalLink, Copy, Check,
  Camera, Film, CheckCircle2, Clock, AlertTriangle, Layers, Image as ImageIcon,
  ChevronDown, Search, ArrowRight, UserCheck, RefreshCw, Printer, Download
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

  const handleExportPdf = () => {
    const selectedUserName = (team.data || []).find((u: any) => u._id === selectedUser)?.name;
    const selectedClientName = (clients.data || []).find((c: any) => c._id === selectedClient)?.name;

    let periodLabel = 'This Month';
    if (timePreset === 'TODAY') periodLabel = 'Today';
    else if (timePreset === 'THIS_WEEK') periodLabel = 'This Week';
    else if (timePreset === 'THIS_MONTH') periodLabel = 'This Month';
    else if (timePreset === 'LAST_MONTH') periodLabel = 'Last Month';
    else if (timePreset === 'THIS_YEAR') periodLabel = 'Year 2026';
    else if (timePreset === 'ALL') periodLabel = 'All Time';
    else if (timePreset === 'CUSTOM') periodLabel = `${startDate || 'Start'} to ${endDate || 'End'}`;

    exportShooterEditorPdf({
      items: displayedItems,
      summary: previewData,
      role,
      selectedUserName,
      selectedClientName,
      selectedType,
      selectedStatus,
      periodLabel,
    });
    toast.success('Generated PDF preview! Select "Save as PDF" in the print dialog.');
  };

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
              <Badge t="blue">Live Sheets &amp; PDF</Badge>
            </div>
            <p className="text-xs text-ink-3">
              Filter deliverables by Shooter, Editor, Client, and Date Range — then export an attractive PDF or color-coded Google Sheet.
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
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onClose}>Close</Button>
            <Button
              variant="secondary"
              icon={<Printer size={15} className="text-purple-400" />}
              onClick={handleExportPdf}
            >
              Export / Save PDF
            </Button>
            <Button
              variant="primary"
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-sm font-semibold"
              icon={<FileSpreadsheet size={15} />}
              loading={exportMut.isPending}
              onClick={() => exportMut.mutate()}
            >
              Generate Google Sheet
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <Input
                placeholder="Search by title, Content ID, shooter, editor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full !py-1.5 !text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={<Printer size={13} className="text-purple-400" />}
                onClick={handleExportPdf}
              >
                Print / Save PDF
              </Button>
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

function escapeHtml(str: string) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function exportShooterEditorPdf({
  items,
  summary,
  role,
  selectedUserName,
  selectedClientName,
  selectedType,
  selectedStatus,
  periodLabel,
}: {
  items: any[];
  summary: { total: number; shot: number; pendingShoot: number; editing: number; editDone: number; completed: number };
  role: string;
  selectedUserName?: string;
  selectedClientName?: string;
  selectedType?: string;
  selectedStatus?: string;
  periodLabel: string;
}) {
  const now = new Date();
  const dateFormatted = now.toLocaleDateString('en-IN', { dateStyle: 'full' });
  const timeFormatted = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  // Compute shooter & editor workloads
  const shooterStats: Record<string, { name: string; total: number; shot: number; pending: number }> = {};
  const editorStats: Record<string, { name: string; total: number; done: number; editing: number }> = {};

  items.forEach((c: any) => {
    const sName = c.assignedShooter?.name || 'Unassigned';
    if (!shooterStats[sName]) shooterStats[sName] = { name: sName, total: 0, shot: 0, pending: 0 };
    shooterStats[sName].total++;
    const isShot = ['RAW_FOOTAGE', 'EDITING', 'SMM_REVIEW', 'FINAL_REVIEW', 'SCHEDULE', 'PUBLISHED'].includes(c.stage) ||
      ['RAW_UPLOADED', 'EDITING', 'COMPLETED'].includes(c.productionStatus);
    if (isShot) shooterStats[sName].shot++;
    else shooterStats[sName].pending++;

    const eName = c.assignedEditor?.name || 'Unassigned';
    if (!editorStats[eName]) editorStats[eName] = { name: eName, total: 0, done: 0, editing: 0 };
    editorStats[eName].total++;
    const isEditDone = ['SMM_REVIEW', 'FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'SCHEDULE', 'PUBLISHED'].includes(c.stage) || c.status === 'COMPLETED';
    const isEditing = ['RAW_FOOTAGE', 'EDITING'].includes(c.stage);
    if (isEditDone) editorStats[eName].done++;
    else if (isEditing) editorStats[eName].editing++;
  });

  const shooterList = Object.values(shooterStats).sort((a, b) => b.total - a.total);
  const editorList = Object.values(editorStats).sort((a, b) => b.total - a.total);

  const shootersHtml = shooterList.length > 0 ? shooterList.map((s) => `
    <tr>
      <td style="padding: 5px 8px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${escapeHtml(s.name)}</td>
      <td style="padding: 5px 8px; text-align: center; font-weight: 700; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${s.total}</td>
      <td style="padding: 5px 8px; text-align: center; color: #059669; font-weight: 700; border-bottom: 1px solid #f1f5f9;">${s.shot}</td>
      <td style="padding: 5px 8px; text-align: center; color: #d97706; font-weight: 700; border-bottom: 1px solid #f1f5f9;">${s.pending}</td>
    </tr>
  `).join('') : '<tr><td colspan="4" style="padding: 8px; text-align: center; color: #94a3b8;">No shooters assigned</td></tr>';

  const editorsHtml = editorList.length > 0 ? editorList.map((e) => `
    <tr>
      <td style="padding: 5px 8px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${escapeHtml(e.name)}</td>
      <td style="padding: 5px 8px; text-align: center; font-weight: 700; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${e.total}</td>
      <td style="padding: 5px 8px; text-align: center; color: #ca8a04; font-weight: 700; border-bottom: 1px solid #f1f5f9;">${e.done}</td>
      <td style="padding: 5px 8px; text-align: center; color: #7c3aed; font-weight: 700; border-bottom: 1px solid #f1f5f9;">${e.editing}</td>
    </tr>
  `).join('') : '<tr><td colspan="4" style="padding: 8px; text-align: center; color: #94a3b8;">No editors assigned</td></tr>';

  const itemsRowsHtml = items.map((c: any, idx: number) => {
    const isShot = ['RAW_FOOTAGE', 'EDITING', 'SMM_REVIEW', 'FINAL_REVIEW', 'SCHEDULE', 'PUBLISHED'].includes(c.stage) ||
      ['RAW_UPLOADED', 'EDITING', 'COMPLETED'].includes(c.productionStatus);
    const isEditDone = ['SMM_REVIEW', 'FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL', 'SCHEDULE', 'PUBLISHED'].includes(c.stage) || c.status === 'COMPLETED';
    const isEditing = ['RAW_FOOTAGE', 'EDITING'].includes(c.stage);

    const shootBadge = isShot
      ? '<span style="display: inline-block; padding: 2px 7px; border-radius: 9999px; font-size: 9px; font-weight: 700; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0;">✅ Shot Done</span>'
      : '<span style="display: inline-block; padding: 2px 7px; border-radius: 9999px; font-size: 9px; font-weight: 700; background: #fffbeb; color: #b45309; border: 1px solid #fde68a;">⏳ Pending Shoot</span>';

    const editBadge = isEditDone
      ? '<span style="display: inline-block; padding: 2px 7px; border-radius: 9999px; font-size: 9px; font-weight: 700; background: #fefce8; color: #854d0e; border: 1px solid #fef08a;">⭐ Edit Done</span>'
      : isEditing
      ? '<span style="display: inline-block; padding: 2px 7px; border-radius: 9999px; font-size: 9px; font-weight: 700; background: #faf5ff; color: #6b21a8; border: 1px solid #e9d5ff;">✂️ In Editing</span>'
      : isShot
      ? '<span style="display: inline-block; padding: 2px 7px; border-radius: 9999px; font-size: 9px; font-weight: 700; background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe;">Ready for Edit</span>'
      : '<span style="display: inline-block; padding: 2px 7px; border-radius: 9999px; font-size: 9px; font-weight: 600; background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0;">Awaiting Footage</span>';

    let typeColor = 'background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;';
    let typeIcon = '🎬';
    if (c.type === 'POST') { typeColor = 'background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0;'; typeIcon = '🖼️'; }
    else if (c.type === 'CAROUSEL') { typeColor = 'background: #faf5ff; color: #7e22ce; border: 1px solid #e9d5ff;'; typeIcon = '📑'; }
    else if (c.type === 'AI_REEL') { typeColor = 'background: #fff7ed; color: #c2410c; border: 1px solid #fed7aa;'; typeIcon = '✨'; }

    const deadlineStr = c.deadline ? new Date(c.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';
    const isOverdue = c.deadline && new Date(c.deadline) < now && c.status !== 'COMPLETED' && c.stage !== 'PUBLISHED';

    return `
      <tr>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9.5px; font-weight: 700; color: #4338ca;">
          ${escapeHtml(c.contentId || `#${idx + 1}`)}
        </td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 10px; font-weight: 600; color: #0f172a; max-width: 140px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${escapeHtml(c.clientId?.name || 'General')}
          ${c.clientId?.clientCode ? `<div style="font-size: 8.5px; color: #64748b;">${escapeHtml(c.clientId.clientCode)}</div>` : ''}
        </td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 10.5px; color: #0f172a; font-weight: 500; max-width: 240px;">
          <div style="font-weight: 600; color: #0f172a; line-height: 1.25;">${escapeHtml(c.title || 'Untitled')}</div>
        </td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; white-space: nowrap;">
          <span style="display: inline-block; padding: 1.5px 6px; border-radius: 9999px; font-size: 9px; font-weight: 600; ${typeColor}">
            ${typeIcon} ${escapeHtml(c.type || 'REEL')}
          </span>
        </td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 10px; color: #1e293b; font-weight: 600;">
          ${escapeHtml(c.assignedShooter?.name || 'Unassigned')}
        </td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; white-space: nowrap;">
          ${shootBadge}
        </td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 10px; color: #1e293b; font-weight: 600;">
          ${escapeHtml(c.assignedEditor?.name || 'Unassigned')}
        </td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; white-space: nowrap;">
          ${editBadge}
        </td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 9.5px; color: #475569; font-weight: 600;">
          ${escapeHtml(label(c.stage || '—'))}
        </td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 9.5px; font-weight: 600; white-space: nowrap; ${isOverdue ? 'color: #dc2626;' : 'color: #475569;'}">
          ${deadlineStr} ${isOverdue ? '⚠️' : ''}
        </td>
      </tr>
    `;
  }).join('');

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>Shooter &amp; Editor Production Report - SMM PRO</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        @page {
          size: A4 landscape;
          margin: 8mm 10mm;
        }
        * {
          box-sizing: border-box;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          color: #0f172a;
          margin: 0;
          padding: 8px 12px;
          font-size: 10px;
          line-height: 1.4;
          background: #ffffff;
        }
        .header-card {
          background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 45%, #312e81 80%, #4338ca 100%);
          border-radius: 12px;
          padding: 14px 18px;
          color: #ffffff;
          margin-bottom: 12px;
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15);
          page-break-inside: avoid;
        }
        .header-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 1px solid rgba(255, 255, 255, 0.15);
          padding-bottom: 10px;
          margin-bottom: 10px;
        }
        .brand {
          font-size: 9px;
          font-weight: 800;
          color: #a5b4fc;
          letter-spacing: 1.5px;
          text-transform: uppercase;
        }
        .title {
          font-size: 20px;
          font-weight: 900;
          color: #ffffff;
          letter-spacing: -0.3px;
          margin-top: 2px;
        }
        .meta-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
        }
        .meta-pill {
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 6px;
          padding: 3px 8px;
          font-size: 9.5px;
          font-weight: 600;
          color: #f1f5f9;
        }
        .meta-pill strong {
          color: #ffffff;
        }
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 8px;
          margin-bottom: 12px;
          page-break-inside: avoid;
        }
        .kpi-card {
          border-radius: 8px;
          padding: 8px 6px;
          text-align: center;
          border: 1px solid #e2e8f0;
          background: #ffffff;
        }
        .kpi-card.total { background: #f8fafc; border-color: #cbd5e1; }
        .kpi-card.shot { background: #ecfdf5; border-color: #a7f3d0; }
        .kpi-card.shot .kpi-val { color: #059669; }
        .kpi-card.pending { background: #fffbeb; border-color: #fde68a; }
        .kpi-card.pending .kpi-val { color: #d97706; }
        .kpi-card.edit { background: #faf5ff; border-color: #e9d5ff; }
        .kpi-card.edit .kpi-val { color: #7c3aed; }
        .kpi-card.editdone { background: #fefce8; border-color: #fef08a; }
        .kpi-card.editdone .kpi-val { color: #ca8a04; }
        .kpi-card.live { background: #eff6ff; border-color: #bfdbfe; }
        .kpi-card.live .kpi-val { color: #2563eb; }
        .kpi-val {
          font-size: 19px;
          font-weight: 900;
          line-height: 1.1;
        }
        .kpi-lbl {
          font-size: 8.5px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #475569;
          margin-top: 3px;
        }
        .team-summary-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-bottom: 12px;
          page-break-inside: avoid;
        }
        .team-box {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #ffffff;
          overflow: hidden;
        }
        .team-box-header {
          padding: 6px 10px;
          font-size: 9.5px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .team-box.shooter .team-box-header { background: #ecfdf5; color: #065f46; border-color: #a7f3d0; }
        .team-box.editor .team-box-header { background: #faf5ff; color: #581c87; border-color: #e9d5ff; }
        .team-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 9.5px;
        }
        .team-table th {
          background: #f8fafc;
          padding: 4px 8px;
          font-size: 8.5px;
          text-transform: uppercase;
          color: #64748b;
          font-weight: 700;
          border-bottom: 1px solid #e2e8f0;
        }
        table.deliverables-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 9.5px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          overflow: hidden;
        }
        thead {
          display: table-header-group;
        }
        table.deliverables-table th {
          background: #1e293b;
          color: #f8fafc;
          padding: 7px 8px;
          font-size: 8.5px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-weight: 800;
          border-bottom: 2px solid #0f172a;
        }
        table.deliverables-table tr {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        table.deliverables-table tr:nth-child(even) td {
          background-color: #f8fafc;
        }
        .footer {
          border-top: 1px solid #e2e8f0;
          padding-top: 8px;
          margin-top: 14px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: #94a3b8;
          font-size: 8.5px;
          font-weight: 600;
        }
      </style>
    </head>
    <body>
      <div class="header-card">
        <div class="header-top">
          <div>
            <div class="brand">SMM PRO STUDIO · EXECUTIVE PRODUCTION AUDIT</div>
            <div class="title">Shooter &amp; Editor Production Report</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 10px; color: #cbd5e1;">Generated: <strong>${dateFormatted}</strong> @ ${timeFormatted}</div>
            <div style="font-size: 9.5px; color: #a5b4fc; margin-top: 2px;">Scope: <strong>${items.length} Deliverable(s)</strong></div>
          </div>
        </div>
        <div class="meta-pills">
          <div class="meta-pill">Role: <strong>${role === 'ALL' ? 'Shooters &amp; Editors' : role === 'SHOOTER' ? 'Shooters Only' : 'Editors Only'}</strong></div>
          <div class="meta-pill">Period: <strong>${escapeHtml(periodLabel)}</strong></div>
          <div class="meta-pill">Client: <strong>${escapeHtml(selectedClientName || 'All Clients')}</strong></div>
          ${selectedUserName ? `<div class="meta-pill">Member: <strong>${escapeHtml(selectedUserName)}</strong></div>` : ''}
          ${selectedType ? `<div class="meta-pill">Type: <strong>${escapeHtml(selectedType)}</strong></div>` : ''}
          ${selectedStatus && selectedStatus !== 'ALL' ? `<div class="meta-pill">Status: <strong>${escapeHtml(selectedStatus)}</strong></div>` : ''}
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card total">
          <div class="kpi-val">${summary.total}</div>
          <div class="kpi-lbl">Total Content</div>
        </div>
        <div class="kpi-card shot">
          <div class="kpi-val">${summary.shot}</div>
          <div class="kpi-lbl">Footage Shot</div>
        </div>
        <div class="kpi-card pending">
          <div class="kpi-val">${summary.pendingShoot}</div>
          <div class="kpi-lbl">Pending Shoot</div>
        </div>
        <div class="kpi-card edit">
          <div class="kpi-val">${summary.editing}</div>
          <div class="kpi-lbl">In Video Edit</div>
        </div>
        <div class="kpi-card editdone">
          <div class="kpi-val">${summary.editDone}</div>
          <div class="kpi-lbl">Edit Completed</div>
        </div>
        <div class="kpi-card live">
          <div class="kpi-val">${summary.completed}</div>
          <div class="kpi-lbl">Posted Live</div>
        </div>
      </div>

      <div class="team-summary-grid">
        <div class="team-box shooter">
          <div class="team-box-header">
            <span>📹 Shooter Workload Breakdown</span>
            <span>${shooterList.length} Active Shooter(s)</span>
          </div>
          <table class="team-table">
            <thead>
              <tr>
                <th style="text-align: left;">Shooter Name</th>
                <th style="text-align: center;">Assigned</th>
                <th style="text-align: center;">Shot Done</th>
                <th style="text-align: center;">Pending</th>
              </tr>
            </thead>
            <tbody>
              ${shootersHtml}
            </tbody>
          </table>
        </div>

        <div class="team-box editor">
          <div class="team-box-header">
            <span>✂️ Editor Workload Breakdown</span>
            <span>${editorList.length} Active Editor(s)</span>
          </div>
          <table class="team-table">
            <thead>
              <tr>
                <th style="text-align: left;">Editor Name</th>
                <th style="text-align: center;">Assigned</th>
                <th style="text-align: center;">Edit Done</th>
                <th style="text-align: center;">In Editing</th>
              </tr>
            </thead>
            <tbody>
              ${editorsHtml}
            </tbody>
          </table>
        </div>
      </div>

      <table class="deliverables-table">
        <thead>
          <tr>
            <th style="width: 8%;">ID</th>
            <th style="width: 14%;">Client</th>
            <th style="width: 25%;">Deliverable Title</th>
            <th style="width: 8%;">Type</th>
            <th style="width: 11%;">Shooter</th>
            <th style="width: 9%;">Shoot Status</th>
            <th style="width: 11%;">Editor</th>
            <th style="width: 9%;">Edit Status</th>
            <th style="width: 8%;">Stage</th>
            <th style="width: 7%;">Deadline</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRowsHtml || '<tr><td colspan="10" style="padding: 16px; text-align: center; color: #94a3b8;">No deliverables match the selected filters.</td></tr>'}
        </tbody>
      </table>

      <div class="footer">
        <div>BULLETPROOF SCRIPT MANAGEMENT SYSTEM · SMM PRO PRODUCTION SUITE · CONFIDENTIAL</div>
        <div>Page automatically formatted for A4 Landscape PDF export</div>
      </div>
    </body>
    </html>
  `;

  // Print via isolated iframe
  try {
    let iframe = document.getElementById('shooter-report-print-frame') as HTMLIFrameElement;
    if (iframe) iframe.remove();

    iframe = document.createElement('iframe');
    iframe.id = 'shooter-report-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      }, 350);
      return;
    }
  } catch (err) {
    console.error('Iframe print failed, falling back to window.open', err);
  }

  const win = window.open('', '_blank');
  if (win) {
    win.document.open();
    win.document.write(html);
    win.document.close();
    setTimeout(() => {
      win.focus();
      win.print();
    }, 350);
  }
}

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  FileSpreadsheet, ExternalLink, RefreshCw, Palette, Download,
  Search, SlidersHorizontal, X, Check, Eye, Table as TableIcon,
  AlertTriangle, Filter, Sparkles, Layers, Film, Image as ImageIcon,
  CalendarDays, CheckCircle2, Building2, Users, ListTodo, ShieldAlert
} from 'lucide-react';
import { get, post, errMsg } from '@/lib/api';
import { Button, Card, Empty, Input, PageHeader, Select, Spinner, Badge } from '@/components/ui';
import { toast } from '@/store/ui';

// 9 Reference Status Color Codes matching the user's reference image
export const STATUS_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  'Script done': { bg: '#00FFFF', fg: '#000000', label: '1. Script done' },
  'Script Done': { bg: '#00FFFF', fg: '#000000', label: '1. Script done' },
  'voice over': { bg: '#8E7CC3', fg: '#FFFFFF', label: '2. voice over' },
  'Voice Over': { bg: '#8E7CC3', fg: '#FFFFFF', label: '2. voice over' },
  'Shoot': { bg: '#FF9900', fg: '#000000', label: '3. Shoot' },
  'shoot': { bg: '#FF9900', fg: '#000000', label: '3. Shoot' },
  'Edit done': { bg: '#FFFF00', fg: '#000000', label: '4. Edit done' },
  'Edit Done': { bg: '#FFFF00', fg: '#000000', label: '4. Edit done' },
  'Scheduling': { bg: '#FF00FF', fg: '#FFFFFF', label: '5. Scheduling' },
  'Scheduled': { bg: '#FF00FF', fg: '#FFFFFF', label: '5. Scheduling' },
  'Upload done': { bg: '#00FF00', fg: '#000000', label: '6. Upload done' },
  'Upload Done': { bg: '#00FF00', fg: '#000000', label: '6. Upload done' },
  'Shoot Done': { bg: '#00FF00', fg: '#000000', label: '6. Upload done' },
  'Graphic Done': { bg: '#00FF00', fg: '#000000', label: '6. Upload done' },
  'Approved': { bg: '#00FF00', fg: '#000000', label: '6. Upload done' },
  'Posted': { bg: '#00FF00', fg: '#000000', label: '6. Upload done' },
  '0 (Done)': { bg: '#00FF00', fg: '#000000', label: '6. Upload done' },
  'ALL QUOTA COMPLETED': { bg: '#00FF00', fg: '#000000', label: '6. Upload done' },
  'shoot pachi cancel': { bg: '#FF0000', fg: '#FFFFFF', label: '7. shoot pachi cancel' },
  'Shoot Cancelled': { bg: '#FF0000', fg: '#FFFFFF', label: '7. shoot pachi cancel' },
  'Cancelled': { bg: '#FF0000', fg: '#FFFFFF', label: '7. shoot pachi cancel' },
  'YES': { bg: '#FF0000', fg: '#FFFFFF', label: 'Overdue YES' },
  'Client Review': { bg: '#CB8754', fg: '#FFFFFF', label: '8. Client Review' },
  'Needs Review': { bg: '#CB8754', fg: '#FFFFFF', label: '8. Client Review' },
  'Trail': { bg: '#B4A7D6', fg: '#000000', label: '9: Trail' },
  'In Progress': { bg: '#B4A7D6', fg: '#000000', label: '9: Trail' },
};

export const COLOR_LEGEND_ITEMS = [
  { id: '1', title: '1. Script done', key: 'Script done', bg: '#00FFFF', fg: '#000000' },
  { id: '2', title: '2. voice over', key: 'voice over', bg: '#8E7CC3', fg: '#FFFFFF' },
  { id: '3', title: '3. Shoot', key: 'Shoot', bg: '#FF9900', fg: '#000000' },
  { id: '4', title: '4. Edit done', key: 'Edit done', bg: '#FFFF00', fg: '#000000' },
  { id: '5', title: '5. Scheduling', key: 'Scheduling', bg: '#FF00FF', fg: '#FFFFFF' },
  { id: '6', title: '6. Upload done', key: 'Upload done', bg: '#00FF00', fg: '#000000' },
  { id: '7', title: '7. shoot pachi cancel', key: 'shoot pachi cancel', bg: '#FF0000', fg: '#FFFFFF' },
  { id: '8', title: '8. Client Review', key: 'Client Review', bg: '#CB8754', fg: '#FFFFFF' },
  { id: '9', title: '9: Trail', key: 'Trail', bg: '#B4A7D6', fg: '#000000' },
];

export default function SheetsHub() {
  const qc = useQueryClient();
  const [activeSheet, setActiveSheet] = useState('Content Tracker');
  const [viewMode, setViewMode] = useState<'grid' | 'embedded'>('grid');
  const [search, setSearch] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Status & Metadata Query
  const statusQ = useQuery({
    queryKey: ['sheets', 'status'],
    queryFn: () => get<any>('/sheets/status'),
    refetchInterval: 30000,
  });

  // Sheet Data Query
  const dataQ = useQuery({
    queryKey: ['sheets', 'data', activeSheet],
    queryFn: () => get<any>('/sheets/data', { sheetName: activeSheet }),
    refetchInterval: 20000,
  });

  // Sync Mutation
  const syncMut = useMutation({
    mutationFn: () => post('/sheets/sync', {}),
    onSuccess: (data: any) => {
      toast.success(data?.message || 'Google Sheets synchronized in real-time!');
      qc.invalidateQueries({ queryKey: ['sheets'] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  // Re-apply formatting mutation
  const formatMut = useMutation({
    mutationFn: () => post('/sheets/formatting', {}),
    onSuccess: (data: any) => {
      toast.success(data?.message || 'Status color formatting applied successfully!');
      qc.invalidateQueries({ queryKey: ['sheets'] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const spreadsheetUrl =
    statusQ.data?.spreadsheetUrl ||
    'https://docs.google.com/spreadsheets/d/1KIO1fYoFtGR-rG2yt1-bU9MtNIYeJccNGdMyE0qVMOA';

  const rawHeaders: string[] = dataQ.data?.headers || [];
  const rawRows: string[][] = dataQ.data?.rows || [];

  // Filtered rows
  const filteredRows = useMemo(() => {
    return rawRows.filter((row) => {
      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const matches = row.some((cell) => String(cell || '').toLowerCase().includes(q));
        if (!matches) return false;
      }
      // Status filter
      if (selectedStatusFilter) {
        const q = selectedStatusFilter.toLowerCase();
        const matches = row.some((cell) => String(cell || '').toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [rawRows, search, selectedStatusFilter]);

  // Export CSV
  const handleExportCSV = () => {
    if (rawHeaders.length === 0 && rawRows.length === 0) return;
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [rawHeaders.join(','), ...filteredRows.map((r) => r.map((c) => `"${(c || '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${activeSheet.replace(/\s+/g, '_')}_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${filteredRows.length} rows to CSV`);
  };

  // Helper to get cell styling
  const getCellStyle = (cellValue: string) => {
    if (!cellValue) return undefined;
    const str = String(cellValue).trim();

    // Check exact text
    if (STATUS_COLORS[str]) {
      return {
        backgroundColor: STATUS_COLORS[str].bg,
        color: STATUS_COLORS[str].fg,
        fontWeight: 'bold',
      };
    }

    // Check substring
    for (const [key, val] of Object.entries(STATUS_COLORS)) {
      if (str.toLowerCase().includes(key.toLowerCase())) {
        return {
          backgroundColor: val.bg,
          color: val.fg,
          fontWeight: 'bold',
        };
      }
    }

    // Check REMAINING / ACTION
    if (str.includes('REMAINING')) {
      return {
        backgroundColor: '#FFE082',
        color: '#7C2D12',
        fontWeight: 'bold',
      };
    }
    if (str.includes('ACTION')) {
      return {
        backgroundColor: '#FFCDD2',
        color: '#991B1B',
        fontWeight: 'bold',
      };
    }

    return undefined;
  };

  const tabsList = [
    { name: 'Content Tracker', icon: FileSpreadsheet },
    { name: 'Master Plan', icon: Sparkles },
    { name: 'Schedule', icon: CalendarDays },
    { name: 'Clients', icon: Building2 },
    { name: 'Reels', icon: Film },
    { name: 'Posts', icon: ImageIcon },
    { name: 'Carousels', icon: Layers },
    { name: 'AI Reels', icon: Sparkles },
    { name: 'Employees', icon: Users },
    { name: 'Tasks', icon: ListTodo },
    { name: 'Setup Guide', icon: FileSpreadsheet },
  ];

  return (
    <div className="space-y-5 pb-16">
      <PageHeader
        title="Google Sheets Master Hub & Live Tracker"
        sub="Real-time bi-directional synchronization, automated status colors, and dedicated sheets data grid."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant={viewMode === 'grid' ? 'primary' : 'secondary'}
              size="sm"
              icon={<TableIcon size={14} />}
              onClick={() => setViewMode('grid')}
            >
              Data Grid
            </Button>
            <Button
              variant={viewMode === 'embedded' ? 'primary' : 'secondary'}
              size="sm"
              icon={<Eye size={14} />}
              onClick={() => setViewMode('embedded')}
            >
              Live Embedded Sheet
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw size={14} className={syncMut.isPending ? 'animate-spin' : ''} />}
              onClick={() => syncMut.mutate()}
            >
              {syncMut.isPending ? 'Syncing...' : 'Sync to Sheets'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Palette size={14} className={formatMut.isPending ? 'animate-spin' : ''} />}
              onClick={() => formatMut.mutate()}
            >
              Apply Colors
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Download size={14} />}
              onClick={handleExportCSV}
            >
              Export CSV
            </Button>
            <a
              href={spreadsheetUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-bold text-primary hover:bg-surface-2 transition-all shadow-xs"
            >
              <span>Open in Sheets</span>
              <ExternalLink size={13} />
            </a>
          </div>
        }
      />

      {/* 9 Reference Colors Legend Card (Matching User Reference Image) */}
      <div className="rounded-2xl border border-line/80 bg-surface/85 backdrop-blur-xl p-4 sm:p-5 shadow-card space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Palette size={16} className="text-primary" />
            <h4 className="text-xs font-black uppercase tracking-wider text-ink">
              Status Color Code Reference (Real-Time Automated Sheets Colors)
            </h4>
            <span className="text-[11px] text-ink-3">
              Click any color pill to instantly filter the table
            </span>
          </div>
          {selectedStatusFilter && (
            <button
              onClick={() => setSelectedStatusFilter('')}
              className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
            >
              <X size={12} />
              Clear Color Filter
            </button>
          )}
        </div>

        {/* Color Legend Pills Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
          {COLOR_LEGEND_ITEMS.map((item) => {
            const isSelected = selectedStatusFilter.toLowerCase() === item.key.toLowerCase();
            return (
              <button
                key={item.id}
                onClick={() => setSelectedStatusFilter(isSelected ? '' : item.key)}
                className={clsx(
                  'rounded-lg px-2.5 py-2 text-xs font-bold text-center transition-all shadow-xs border flex items-center justify-center gap-1.5 hover:-translate-y-0.5',
                  isSelected
                    ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface'
                    : 'opacity-90 hover:opacity-100'
                )}
                style={{
                  backgroundColor: item.bg,
                  color: item.fg,
                  borderColor: isSelected ? '#000000' : 'transparent',
                }}
              >
                <span>{item.title}</span>
                {isSelected && <Check size={12} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-line/60 scrollbar-none">
        {tabsList.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSheet === tab.name;
          return (
            <button
              key={tab.name}
              onClick={() => setActiveSheet(tab.name)}
              className={clsx(
                'whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold transition-all flex items-center gap-2',
                isActive
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-surface/80 text-ink-2 hover:bg-surface-2 hover:text-ink border border-line/40'
              )}
            >
              <Icon size={14} className={isActive ? 'text-white' : 'text-ink-3'} />
              <span>{tab.name}</span>
              {isActive && dataQ.data?.totalRows !== undefined && (
                <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px] text-white">
                  {dataQ.data.totalRows}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Embedded Iframe View Mode */}
      {viewMode === 'embedded' ? (
        <div className="rounded-2xl border border-line bg-surface p-2 shadow-card">
          <div className="flex items-center justify-between p-2 pb-3 border-b border-line/60">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-ink">
                Live Interactive Google Spreadsheet Embed
              </span>
            </div>
            <a
              href={spreadsheetUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
            >
              Open in full tab <ExternalLink size={12} />
            </a>
          </div>
          <iframe
            src={`${spreadsheetUrl}?widget=true&headers=false`}
            className="w-full h-[750px] rounded-xl border border-line/40"
            title="Google Sheets Live Embed"
          />
        </div>
      ) : (
        /* Data Grid View Mode */
        <div className="space-y-4">
          {/* Search & Quick Filters Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <Input
                placeholder={`Search across ${activeSheet}...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-sm"
              />
              <Button
                size="sm"
                variant="secondary"
                icon={<SlidersHorizontal size={14} />}
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                Filters
              </Button>
              {(search || selectedStatusFilter) && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<X size={14} />}
                  onClick={() => {
                    setSearch('');
                    setSelectedStatusFilter('');
                  }}
                >
                  Reset
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold text-ink-3">
              <span>
                Showing <strong className="text-ink">{filteredRows.length}</strong> of{' '}
                <strong className="text-ink">{rawRows.length}</strong> rows
              </span>
              {dataQ.isFetching && <Spinner className="h-4 w-4" />}
            </div>
          </div>

          {/* Extended Filters Drawer */}
          {filtersOpen && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 rounded-xl border border-line bg-surface/90 p-4 shadow-lift animate-rise">
              <div>
                <label className="text-[11px] font-bold text-ink-3">Filter by Status</label>
                <Select
                  value={selectedStatusFilter}
                  onChange={(e) => setSelectedStatusFilter(e.target.value)}
                >
                  <option value="">All Statuses</option>
                  {COLOR_LEGEND_ITEMS.map((item) => (
                    <option key={item.id} value={item.key}>
                      {item.title}
                    </option>
                  ))}
                  <option value="REMAINING">⚠️ REMAINING (Alert)</option>
                  <option value="ACTION">🚨 ACTION (Alert)</option>
                </Select>
              </div>
            </div>
          )}

          {/* Interactive Data Table */}
          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            {dataQ.isLoading ? (
              <div className="flex h-64 items-center justify-center">
                <Spinner className="h-8 w-8" />
              </div>
            ) : filteredRows.length === 0 ? (
              <Empty
                title={`No records found in ${activeSheet}`}
                hint="Try clearing your search query or trigger a live sync."
              />
            ) : (
              <div className="overflow-x-auto max-h-[680px] scrollbar-thin">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-surface-2/95 backdrop-blur-md border-b border-line shadow-xs">
                    <tr>
                      <th className="py-2.5 px-3 font-bold text-ink-3 uppercase tracking-wider text-[10px] w-12 border-r border-line/40">
                        #
                      </th>
                      {rawHeaders.map((head, idx) => (
                        <th
                          key={idx}
                          className="py-2.5 px-3 font-bold text-ink uppercase tracking-wider text-[11px] whitespace-nowrap border-r border-line/40 last:border-r-0"
                        >
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/40">
                    {filteredRows.map((row, rowIdx) => (
                      <tr
                        key={rowIdx}
                        className="hover:bg-surface-2/60 transition-colors"
                      >
                        <td className="py-2 px-3 text-[11px] font-medium text-ink-3 border-r border-line/30 bg-surface-2/20">
                          {rowIdx + 1}
                        </td>
                        {row.map((cell, cellIdx) => {
                          const style = getCellStyle(cell);
                          const isUrl =
                            typeof cell === 'string' &&
                            (cell.startsWith('http://') || cell.startsWith('https://'));

                          return (
                            <td
                              key={cellIdx}
                              className={clsx(
                                'py-2 px-3 whitespace-nowrap border-r border-line/30 last:border-r-0 text-xs font-medium',
                                style ? 'rounded-md shadow-xs' : 'text-ink'
                              )}
                              style={style}
                            >
                              {isUrl ? (
                                <a
                                  href={cell}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary hover:underline flex items-center gap-1"
                                >
                                  <span>Open Link</span>
                                  <ExternalLink size={11} />
                                </a>
                              ) : (
                                cell || '—'
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

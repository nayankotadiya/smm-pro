import { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  FileSpreadsheet, ExternalLink, RefreshCw, Palette, Download,
  Search, SlidersHorizontal, X, Check, Eye, Table as TableIcon,
  AlertTriangle, Filter, Sparkles, Layers, Film, Image as ImageIcon,
  CalendarDays, CheckCircle2, Building2, Users, ListTodo, ShieldAlert,
  Command, Keyboard, ArrowUpRight, GripVertical, ChevronLeft, ChevronRight,
  Columns, Settings2, Paintbrush, CheckSquare, Square, RotateCcw
} from 'lucide-react';
import { get, post, errMsg } from '@/lib/api';
import { Button, Card, Empty, Input, PageHeader, Select, Spinner, Badge, Modal } from '@/components/ui';
import { toast } from '@/store/ui';

// Default 9 Status Color Codes matching the user's reference image
export const DEFAULT_STATUS_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  'Script done': { bg: '#00FFFF', fg: '#000000', label: '1. Script done' },
  'Script Done': { bg: '#00FFFF', fg: '#000000', label: '1. Script done' },
  '1. Script done': { bg: '#00FFFF', fg: '#000000', label: '1. Script done' },
  'voice over': { bg: '#8E7CC3', fg: '#FFFFFF', label: '2. voice over' },
  'Voice Over': { bg: '#8E7CC3', fg: '#FFFFFF', label: '2. voice over' },
  'Voice Over Done': { bg: '#8E7CC3', fg: '#FFFFFF', label: '2. voice over' },
  '2. voice over': { bg: '#8E7CC3', fg: '#FFFFFF', label: '2. voice over' },
  'Shoot': { bg: '#FF9900', fg: '#000000', label: '3. Shoot' },
  'shoot': { bg: '#FF9900', fg: '#000000', label: '3. Shoot' },
  'Shooting': { bg: '#FF9900', fg: '#000000', label: '3. Shoot' },
  '3. Shoot': { bg: '#FF9900', fg: '#000000', label: '3. Shoot' },
  'Edit done': { bg: '#FFFF00', fg: '#000000', label: '4. Edit done' },
  'Edit Done': { bg: '#FFFF00', fg: '#000000', label: '4. Edit done' },
  '4. Edit done': { bg: '#FFFF00', fg: '#000000', label: '4. Edit done' },
  'Scheduling': { bg: '#FF00FF', fg: '#FFFFFF', label: '5. Scheduling' },
  'Scheduled': { bg: '#FF00FF', fg: '#FFFFFF', label: '5. Scheduling' },
  '5. Scheduling': { bg: '#FF00FF', fg: '#FFFFFF', label: '5. Scheduling' },
  'Upload done': { bg: '#00FF00', fg: '#000000', label: '6. Upload done' },
  'Upload Done': { bg: '#00FF00', fg: '#000000', label: '6. Upload done' },
  '6. Upload done': { bg: '#00FF00', fg: '#000000', label: '6. Upload done' },
  'Shoot Done': { bg: '#00FF00', fg: '#000000', label: '6. Upload done' },
  'Graphic Done': { bg: '#00FF00', fg: '#000000', label: '6. Upload done' },
  'Approved': { bg: '#00FF00', fg: '#000000', label: '6. Upload done' },
  'Posted': { bg: '#00FF00', fg: '#000000', label: '6. Upload done' },
  '0 (Done)': { bg: '#00FF00', fg: '#000000', label: '6. Upload done' },
  'ALL QUOTA COMPLETED': { bg: '#00FF00', fg: '#000000', label: '6. Upload done' },
  'shoot pachi cancel': { bg: '#FF0000', fg: '#FFFFFF', label: '7. shoot pachi cancel' },
  'Shoot Cancelled': { bg: '#FF0000', fg: '#FFFFFF', label: '7. shoot pachi cancel' },
  'Cancelled': { bg: '#FF0000', fg: '#FFFFFF', label: '7. shoot pachi cancel' },
  '7. shoot pachi cancel': { bg: '#FF0000', fg: '#FFFFFF', label: '7. shoot pachi cancel' },
  'YES': { bg: '#FF0000', fg: '#FFFFFF', label: 'Overdue YES' },
  'Client Review': { bg: '#CB8754', fg: '#FFFFFF', label: '8. Client Review' },
  'Needs Review': { bg: '#CB8754', fg: '#FFFFFF', label: '8. Client Review' },
  '8. Client Review': { bg: '#CB8754', fg: '#FFFFFF', label: '8. Client Review' },
  'Trail': { bg: '#B4A7D6', fg: '#000000', label: '9: Trail' },
  'In Progress': { bg: '#B4A7D6', fg: '#000000', label: '9: Trail' },
  '9: Trail': { bg: '#B4A7D6', fg: '#000000', label: '9: Trail' },
};

export const COLOR_PRESETS = [
  {
    id: 'cyber',
    name: 'SMM Pro Cyber (Default)',
    colors: {
      '1': { bg: '#00FFFF', fg: '#000000' },
      '2': { bg: '#8E7CC3', fg: '#FFFFFF' },
      '3': { bg: '#FF9900', fg: '#000000' },
      '4': { bg: '#FFFF00', fg: '#000000' },
      '5': { bg: '#FF00FF', fg: '#FFFFFF' },
      '6': { bg: '#00FF00', fg: '#000000' },
      '7': { bg: '#FF0000', fg: '#FFFFFF' },
      '8': { bg: '#CB8754', fg: '#FFFFFF' },
      '9': { bg: '#B4A7D6', fg: '#000000' },
    },
  },
  {
    id: 'pastel',
    name: 'Modern Pastel Harmony',
    colors: {
      '1': { bg: '#4FD1C5', fg: '#000000' },
      '2': { bg: '#9F7AEA', fg: '#FFFFFF' },
      '3': { bg: '#F6AD55', fg: '#000000' },
      '4': { bg: '#FAF089', fg: '#000000' },
      '5': { bg: '#ED64A6', fg: '#FFFFFF' },
      '6': { bg: '#68D391', fg: '#000000' },
      '7': { bg: '#F56565', fg: '#FFFFFF' },
      '8': { bg: '#D69E2E', fg: '#FFFFFF' },
      '9': { bg: '#B794F4', fg: '#000000' },
    },
  },
  {
    id: 'vivid',
    name: 'High-Contrast Vivid',
    colors: {
      '1': { bg: '#38BDF8', fg: '#000000' },
      '2': { bg: '#818CF8', fg: '#FFFFFF' },
      '3': { bg: '#F59E0B', fg: '#000000' },
      '4': { bg: '#FACC15', fg: '#000000' },
      '5': { bg: '#F43F5E', fg: '#FFFFFF' },
      '6': { bg: '#10B981', fg: '#000000' },
      '7': { bg: '#EF4444', fg: '#FFFFFF' },
      '8': { bg: '#EA580C', fg: '#FFFFFF' },
      '9': { bg: '#A855F7', fg: '#FFFFFF' },
    },
  },
];

export const COLOR_LEGEND_ITEMS = [
  { id: '1', title: '1. Script done', key: 'Script done', defaultBg: '#00FFFF', defaultFg: '#000000' },
  { id: '2', title: '2. voice over', key: 'voice over', defaultBg: '#8E7CC3', defaultFg: '#FFFFFF' },
  { id: '3', title: '3. Shoot', key: 'Shoot', defaultBg: '#FF9900', defaultFg: '#000000' },
  { id: '4', title: '4. Edit done', key: 'Edit done', defaultBg: '#FFFF00', defaultFg: '#000000' },
  { id: '5', title: '5. Scheduling', key: 'Scheduling', defaultBg: '#FF00FF', defaultFg: '#FFFFFF' },
  { id: '6', title: '6. Upload done', key: 'Upload done', defaultBg: '#00FF00', defaultFg: '#000000' },
  { id: '7', title: '7. shoot pachi cancel', key: 'shoot pachi cancel', defaultBg: '#FF0000', defaultFg: '#FFFFFF' },
  { id: '8', title: '8. Client Review', key: 'Client Review', defaultBg: '#CB8754', defaultFg: '#FFFFFF' },
  { id: '9', title: '9: Trail', key: 'Trail', defaultBg: '#B4A7D6', defaultFg: '#000000' },
];

/**
 * Intelligent Lifecycle Stage Determination for Content Rows
 */
export function getRowStage(row: string[], headers: string[], customColors?: Record<string, { bg: string; fg: string }>) {
  if (!row || !headers || headers.length === 0) return null;

  const getCol = (name: string): string => {
    const idx = headers.findIndex((h) => h.toLowerCase().includes(name.toLowerCase()));
    return idx !== -1 ? String(row[idx] || '').trim() : '';
  };

  const getColors = (id: string, defBg: string, defFg: string) => {
    if (customColors && customColors[id]) {
      return { bg: customColors[id].bg, fg: customColors[id].fg };
    }
    return { bg: defBg, fg: defFg };
  };

  // If the sheet already contains the Current Stage column
  const explicitStage = getCol('current stage');
  if (explicitStage) {
    for (const item of COLOR_LEGEND_ITEMS) {
      if (explicitStage.toLowerCase().includes(item.key.toLowerCase()) || explicitStage.startsWith(item.id)) {
        const c = getColors(item.id, item.defaultBg, item.defaultFg);
        return { id: item.id, key: item.key, label: explicitStage, bg: c.bg, fg: c.fg };
      }
    }
  }

  const scheduleStatus = getCol('schedule status');
  const uploadStatus = getCol('upload status');
  const clientApproval = getCol('client approval');
  const graphicApproval = getCol('graphic approval');
  const editStatus = getCol('edit status');
  const graphicStatus = getCol('graphic status');
  const shootStatus = getCol('shoot status');
  const scriptStatus = getCol('script status');
  const voiceOverStatus = getCol('voice over status');

  const rowText = row.map((c) => String(c || '').toLowerCase()).join(' ');

  // 7. Shoot Cancelled / Cancelled
  if (
    shootStatus.toLowerCase().includes('cancel') ||
    scheduleStatus.toLowerCase().includes('cancel') ||
    rowText.includes('shoot cancelled') ||
    rowText.includes('shoot pachi cancel') ||
    rowText.includes('cancelled')
  ) {
    const c = getColors('7', '#FF0000', '#FFFFFF');
    return { id: '7', key: 'shoot pachi cancel', label: '7. shoot pachi cancel', bg: c.bg, fg: c.fg };
  }

  // 6. Upload done / Posted
  if (
    scheduleStatus.toLowerCase() === 'posted' ||
    uploadStatus.toLowerCase() === 'upload done' ||
    rowText.includes('all quota completed')
  ) {
    const c = getColors('6', '#00FF00', '#000000');
    return { id: '6', key: 'Upload done', label: '6. Upload done', bg: c.bg, fg: c.fg };
  }

  // 5. Scheduling / Scheduled
  if (
    scheduleStatus.toLowerCase() === 'scheduling' ||
    scheduleStatus.toLowerCase() === 'scheduled' ||
    rowText.includes('scheduling')
  ) {
    const c = getColors('5', '#FF00FF', '#FFFFFF');
    return { id: '5', key: 'Scheduling', label: '5. Scheduling', bg: c.bg, fg: c.fg };
  }

  // 8. Client Review
  if (
    clientApproval.toLowerCase() === 'client review' ||
    graphicApproval.toLowerCase() === 'needs review' ||
    rowText.includes('client review') ||
    rowText.includes('needs review')
  ) {
    const c = getColors('8', '#CB8754', '#FFFFFF');
    return { id: '8', key: 'Client Review', label: '8. Client Review', bg: c.bg, fg: c.fg };
  }

  // 4. Edit done / Graphic done
  if (
    editStatus.toLowerCase() === 'edit done' ||
    editStatus.toLowerCase() === 'edit complete' ||
    graphicStatus.toLowerCase() === 'graphic done'
  ) {
    const c = getColors('4', '#FFFF00', '#000000');
    return { id: '4', key: 'Edit done', label: '4. Edit done', bg: c.bg, fg: c.fg };
  }

  // 3. Shoot
  if (
    shootStatus.toLowerCase() === 'shoot' ||
    shootStatus.toLowerCase() === 'shooting'
  ) {
    const c = getColors('3', '#FF9900', '#000000');
    return { id: '3', key: 'Shoot', label: '3. Shoot', bg: c.bg, fg: c.fg };
  }

  // 2. voice over
  if (
    voiceOverStatus.toLowerCase().includes('voice over') ||
    rowText.includes('voice over') ||
    rowText.includes('voiceover')
  ) {
    const c = getColors('2', '#8E7CC3', '#FFFFFF');
    return { id: '2', key: 'voice over', label: '2. voice over', bg: c.bg, fg: c.fg };
  }

  // 1. Script done
  if (
    scriptStatus.toLowerCase() === 'script done' ||
    scriptStatus.toLowerCase() === 'script complete'
  ) {
    const c = getColors('1', '#00FFFF', '#000000');
    return { id: '1', key: 'Script done', label: '1. Script done', bg: c.bg, fg: c.fg };
  }

  // 9: Trail / In Progress
  if (
    rowText.includes('trail') ||
    rowText.includes('in progress')
  ) {
    const c = getColors('9', '#B4A7D6', '#000000');
    return { id: '9', key: 'Trail', label: '9: Trail', bg: c.bg, fg: c.fg };
  }

  return null;
}

/**
 * Filter predicate matching status legend filters accurately
 */
export function matchesStatusFilter(
  row: string[],
  headers: string[],
  filterKey: string,
  filterId?: string
): boolean {
  if (!filterKey) return true;
  const q = filterKey.toLowerCase().trim();
  const fid = filterId || '';

  const stage = getRowStage(row, headers);
  if (stage && (stage.id === fid || stage.key.toLowerCase() === q || stage.label.toLowerCase().includes(q))) {
    return true;
  }

  const getCol = (name: string): string => {
    const idx = headers.findIndex((h) => h.toLowerCase().includes(name.toLowerCase()));
    return idx !== -1 ? String(row[idx] || '').trim().toLowerCase() : '';
  };

  const scriptStatus = getCol('script status');
  const shootStatus = getCol('shoot status');
  const editStatus = getCol('edit status');
  const graphicStatus = getCol('graphic status');
  const clientApproval = getCol('client approval');
  const graphicApproval = getCol('graphic approval');
  const uploadStatus = getCol('upload status');
  const scheduleStatus = getCol('schedule status');
  const explicitStage = getCol('current stage');

  if (explicitStage.includes(q)) return true;

  if (fid === '1' || q.includes('script done')) {
    return scriptStatus.includes('script done') || stage?.id === '1';
  }
  if (fid === '2' || q.includes('voice over')) {
    return row.some((c) => String(c).toLowerCase().includes('voice over') || String(c).toLowerCase().includes('voiceover'));
  }
  if (fid === '3' || q === 'shoot') {
    return shootStatus === 'shoot' || shootStatus === 'shooting';
  }
  if (fid === '4' || q.includes('edit done')) {
    return editStatus.includes('edit done') || graphicStatus.includes('graphic done') || stage?.id === '4';
  }
  if (fid === '5' || q.includes('scheduling')) {
    return scheduleStatus.includes('scheduling') || scheduleStatus.includes('scheduled') || stage?.id === '5';
  }
  if (fid === '6' || q.includes('upload done')) {
    return uploadStatus.includes('upload done') || scheduleStatus.includes('posted') || row.some((c) => String(c).includes('ALL QUOTA COMPLETED')) || stage?.id === '6';
  }
  if (fid === '7' || q.includes('cancel') || q.includes('shoot pachi cancel')) {
    return shootStatus.includes('cancel') || scheduleStatus.includes('cancel') || row.some((c) => String(c).toLowerCase().includes('cancel')) || stage?.id === '7';
  }
  if (fid === '8' || q.includes('client review')) {
    return clientApproval.includes('client review') || graphicApproval.includes('needs review') || stage?.id === '8';
  }
  if (fid === '9' || q.includes('trail')) {
    return row.some((c) => String(c).toLowerCase().includes('trail') || String(c).toLowerCase().includes('in progress')) || stage?.id === '9';
  }
  if (q.includes('remaining')) {
    return row.some((c) => String(c).includes('REMAINING'));
  }
  if (q.includes('action')) {
    return row.some((c) => String(c).includes('ACTION'));
  }

  return row.some((cell) => String(cell || '').toLowerCase().includes(q));
}

export default function SheetsHub() {
  const qc = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [activeSheet, setActiveSheet] = useState('Content Tracker');
  const [viewMode, setViewMode] = useState<'grid' | 'embedded'>('grid');
  const [search, setSearch] = useState('');
  
  // Enhanced Multi-Color Filter Support
  const [selectedStatusFilters, setSelectedStatusFilters] = useState<string[]>([]);
  const [filterMode, setFilterMode] = useState<'filter' | 'highlight'>('filter');

  // Movable Columns State
  const [columnOrder, setColumnOrder] = useState<number[]>([]);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [draggedColIdx, setDraggedColIdx] = useState<number | null>(null);
  const [dragOverColIdx, setDragOverColIdx] = useState<number | null>(null);
  const [columnsModalOpen, setColumnsModalOpen] = useState(false);

  // Palette & Theme Customizer State
  const [paletteModalOpen, setPaletteModalOpen] = useState(false);
  const [customColors, setCustomColors] = useState<Record<string, { bg: string; fg: string }>>(() => {
    try {
      const saved = localStorage.getItem('smm_custom_palette');
      return saved ? JSON.parse(saved) : COLOR_PRESETS[0].colors;
    } catch {
      return COLOR_PRESETS[0].colors;
    }
  });

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
  const contentLookup: Record<string, any> = dataQ.data?.contentLookup || {};
  const clientLookup: Record<string, string> = dataQ.data?.clientLookup || {};

  // Check if raw headers already contain the Current Stage column
  const hasStageInHeaders = useMemo(() => {
    return rawHeaders.some((h) => (h || '').toLowerCase().includes('current stage'));
  }, [rawHeaders]);

  const isContentSheet = useMemo(() => {
    const headerStr = rawHeaders.map((h) => (h || '').toLowerCase()).join(' ');
    return (
      headerStr.includes('script status') ||
      headerStr.includes('schedule status') ||
      headerStr.includes('shoot status') ||
      headerStr.includes('edit status') ||
      ['Content Tracker', 'Reels', 'Posts', 'Carousels', 'AI Reels', 'Master Plan'].includes(activeSheet)
    );
  }, [rawHeaders, activeSheet]);

  const showUpfrontStage = isContentSheet && !hasStageInHeaders;

  // Initialize and load column order from localStorage
  useEffect(() => {
    if (rawHeaders.length === 0) return;
    try {
      const savedKey = `smm_sheets_cols_${activeSheet}`;
      const saved = localStorage.getItem(savedKey);
      if (saved) {
        const parsed: number[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === rawHeaders.length) {
          setColumnOrder(parsed);
          return;
        }
      }
    } catch {}
    setColumnOrder(rawHeaders.map((_, i) => i));
  }, [rawHeaders, activeSheet]);

  // Load hidden columns from localStorage
  useEffect(() => {
    try {
      const savedKey = `smm_sheets_hidden_${activeSheet}`;
      const saved = localStorage.getItem(savedKey);
      if (saved) setHiddenColumns(JSON.parse(saved));
      else setHiddenColumns([]);
    } catch {}
  }, [activeSheet]);

  // Reorder column function
  const moveColumn = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= columnOrder.length || fromIdx === toIdx) return;
    const newOrder = [...columnOrder];
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);
    setColumnOrder(newOrder);
    localStorage.setItem(`smm_sheets_cols_${activeSheet}`, JSON.stringify(newOrder));
    toast.success(`Column "${rawHeaders[moved]}" moved.`);
  };

  // Reset columns
  const resetColumns = () => {
    const defaultOrder = rawHeaders.map((_, i) => i);
    setColumnOrder(defaultOrder);
    setHiddenColumns([]);
    localStorage.removeItem(`smm_sheets_cols_${activeSheet}`);
    localStorage.removeItem(`smm_sheets_hidden_${activeSheet}`);
    toast.success('Column layout reset to standard workflow sequence.');
  };

  // Toggle column visibility
  const toggleColumnVisibility = (colName: string) => {
    setHiddenColumns((prev) => {
      const next = prev.includes(colName) ? prev.filter((c) => c !== colName) : [...prev, colName];
      localStorage.setItem(`smm_sheets_hidden_${activeSheet}`, JSON.stringify(next));
      return next;
    });
  };

  // Drag and drop column handlers
  const handleDragStart = (e: React.DragEvent, colIndex: number) => {
    setDraggedColIdx(colIndex);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, colIndex: number) => {
    e.preventDefault();
    if (dragOverColIdx !== colIndex) {
      setDragOverColIdx(colIndex);
    }
  };

  const handleDrop = (e: React.DragEvent, dropTargetIdx: number) => {
    e.preventDefault();
    if (draggedColIdx !== null && draggedColIdx !== dropTargetIdx) {
      moveColumn(draggedColIdx, dropTargetIdx);
    }
    setDraggedColIdx(null);
    setDragOverColIdx(null);
  };

  // Live count per status shortcut pill
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    COLOR_LEGEND_ITEMS.forEach((it) => {
      counts[it.id] = 0;
    });

    rawRows.forEach((row) => {
      COLOR_LEGEND_ITEMS.forEach((it) => {
        if (matchesStatusFilter(row, rawHeaders, it.key, it.id)) {
          counts[it.id] = (counts[it.id] || 0) + 1;
        }
      });
    });

    return counts;
  }, [rawRows, rawHeaders]);

  // Toggle status filter (Supports Multi-Select!)
  const toggleStatusFilter = (key: string) => {
    setSelectedStatusFilters((prev) => {
      const exists = prev.some((k) => k.toLowerCase() === key.toLowerCase());
      if (exists) {
        const next = prev.filter((k) => k.toLowerCase() !== key.toLowerCase());
        toast.success(next.length > 0 ? `Active filters: ${next.length}` : 'Status filters cleared');
        return next;
      } else {
        const next = [...prev, key];
        toast.success(`Filter added: [${key}] (${next.length} active)`);
        return next;
      }
    });
  };

  // Check if a row matches the selected filters
  const doesRowMatchSelectedFilters = (row: string[]) => {
    if (selectedStatusFilters.length === 0) return true;
    return selectedStatusFilters.some((filterKey) => {
      const legendItem = COLOR_LEGEND_ITEMS.find(
        (it) => it.key.toLowerCase() === filterKey.toLowerCase()
      );
      return matchesStatusFilter(row, rawHeaders, filterKey, legendItem?.id);
    });
  };

  // Filtered rows
  const filteredRows = useMemo(() => {
    return rawRows.filter((row) => {
      // Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const matches = row.some((cell) => String(cell || '').toLowerCase().includes(q));
        if (!matches) return false;
      }

      // If in 'filter' mode, hide non-matching rows
      if (filterMode === 'filter' && selectedStatusFilters.length > 0) {
        if (!doesRowMatchSelectedFilters(row)) return false;
      }

      return true;
    });
  }, [rawRows, rawHeaders, search, selectedStatusFilters, filterMode]);

  // Keyboard Shortcuts: 1-9 to toggle status filters, 0 or Escape to clear, / to search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl instanceof HTMLSelectElement;

      if (e.key === 'Escape') {
        if (isInput) (activeEl as HTMLElement).blur();
        if (selectedStatusFilters.length > 0 || search) {
          e.preventDefault();
          setSelectedStatusFilters([]);
          setSearch('');
          toast.success('All filters cleared');
        }
        return;
      }

      if (isInput) return;

      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= 9) {
        e.preventDefault();
        const legendItem = COLOR_LEGEND_ITEMS.find((it) => it.id === String(num));
        if (legendItem) {
          toggleStatusFilter(legendItem.key);
        }
        return;
      }

      if (e.key === '0') {
        e.preventDefault();
        setSelectedStatusFilters([]);
        setSearch('');
        toast.success('Filters reset');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedStatusFilters, search]);

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

  // Helper to get cell styling with custom palette
  const getCellStyle = (cellValue: string) => {
    if (!cellValue) return undefined;
    const str = String(cellValue).trim();

    // Check legend items by id or title
    for (const item of COLOR_LEGEND_ITEMS) {
      if (str.toLowerCase().includes(item.key.toLowerCase()) || str.startsWith(item.id)) {
        const c = customColors[item.id] || { bg: item.defaultBg, fg: item.defaultFg };
        return {
          backgroundColor: c.bg,
          color: c.fg,
          fontWeight: 'bold',
        };
      }
    }

    if (DEFAULT_STATUS_COLORS[str]) {
      return {
        backgroundColor: DEFAULT_STATUS_COLORS[str].bg,
        color: DEFAULT_STATUS_COLORS[str].fg,
        fontWeight: 'bold',
      };
    }

    for (const [key, val] of Object.entries(DEFAULT_STATUS_COLORS)) {
      if (str.toLowerCase().includes(key.toLowerCase())) {
        return {
          backgroundColor: val.bg,
          color: val.fg,
          fontWeight: 'bold',
        };
      }
    }

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

  // Save custom colors
  const handleSavePalette = (preset: typeof COLOR_PRESETS[0]) => {
    setCustomColors(preset.colors);
    localStorage.setItem('smm_custom_palette', JSON.stringify(preset.colors));
    toast.success(`Applied ${preset.name} palette!`);
  };

  const handleUpdateCustomColor = (id: string, bg: string, fg: string) => {
    const next = { ...customColors, [id]: { bg, fg } };
    setCustomColors(next);
    localStorage.setItem('smm_custom_palette', JSON.stringify(next));
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

  // Active display columns according to columnOrder & hiddenColumns
  const visibleColIndices = useMemo(() => {
    if (columnOrder.length === 0) return rawHeaders.map((_, i) => i);
    return columnOrder.filter((idx) => !hiddenColumns.includes(rawHeaders[idx]));
  }, [columnOrder, hiddenColumns, rawHeaders]);

  return (
    <div className="space-y-5 pb-16">
      <PageHeader
        title="Google Sheets Master Hub & Live Tracker"
        sub="Real-time bi-directional synchronization, automated status colors, movable workflow columns, and interactive navigation."
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
              icon={<Columns size={14} />}
              onClick={() => setColumnsModalOpen(true)}
              title="Reorder and customize columns"
            >
              Movable Columns
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Paintbrush size={14} />}
              onClick={() => setPaletteModalOpen(true)}
              title="Change status colors and theme palette"
            >
              Set Colors & Palette
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

      {/* 9 Reference Colors Legend Card with Multi-Select Filter & Mode Switch */}
      <div className="rounded-2xl border border-line/80 bg-surface/85 backdrop-blur-xl p-4 sm:p-5 shadow-card space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Palette size={16} className="text-primary" />
            <h4 className="text-xs font-black uppercase tracking-wider text-ink">
              Status Color Filters (Automated Sheets Colors)
            </h4>
            <span className="text-[11px] text-ink-3 hidden sm:inline">
              Click any color pill to toggle • Multi-select supported • Press [1-9] on keyboard
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Filter Mode Toggle */}
            <div className="inline-flex items-center rounded-lg border border-line/60 bg-surface-2/60 p-0.5 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setFilterMode('filter')}
                className={clsx(
                  'rounded-md px-2 py-1 transition-all',
                  filterMode === 'filter'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-ink-3 hover:text-ink'
                )}
              >
                Filter Rows
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('highlight')}
                className={clsx(
                  'rounded-md px-2 py-1 transition-all',
                  filterMode === 'highlight'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-ink-3 hover:text-ink'
                )}
              >
                Highlight Glow
              </button>
            </div>

            {selectedStatusFilters.length > 0 && (
              <button
                onClick={() => setSelectedStatusFilters([])}
                className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
              >
                <X size={12} />
                Clear Filters ({selectedStatusFilters.length})
              </button>
            )}
          </div>
        </div>

        {/* Keyboard Shortcuts Hint Bar */}
        <div className="flex items-center justify-between gap-3 text-[11px] font-semibold text-ink-3 bg-surface-2/60 border border-line/40 rounded-xl px-3 py-1.5 overflow-x-auto">
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-1 text-primary shrink-0">
              <Keyboard size={13} />
              <span className="font-bold">Shortcuts:</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-line bg-surface px-1.5 py-0.2 text-[10px] font-mono font-bold text-ink">1 - 9</kbd>
                <span>Toggle Status</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-line bg-surface px-1.5 py-0.2 text-[10px] font-mono font-bold text-ink">/</kbd>
                <span>Search</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-line bg-surface px-1.5 py-0.2 text-[10px] font-mono font-bold text-ink">Esc</kbd>
                <span>or</span>
                <kbd className="rounded border border-line bg-surface px-1.5 py-0.2 text-[10px] font-mono font-bold text-ink">0</kbd>
                <span>Reset</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedStatusFilters(COLOR_LEGEND_ITEMS.map((i) => i.key))}
              className="text-[10px] font-bold text-ink-3 hover:text-primary transition-colors underline"
            >
              Select All
            </button>
            <span>•</span>
            <button
              onClick={() => setPaletteModalOpen(true)}
              className="text-[10px] font-bold text-ink-3 hover:text-primary transition-colors flex items-center gap-1"
            >
              <Paintbrush size={10} />
              <span>Customize Colors</span>
            </button>
          </div>
        </div>

        {/* Color Legend Pills Row with Keyboard Badges & Live Counts */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
          {COLOR_LEGEND_ITEMS.map((item) => {
            const isSelected = selectedStatusFilters.some((k) => k.toLowerCase() === item.key.toLowerCase());
            const count = statusCounts[item.id] ?? 0;
            const c = customColors[item.id] || { bg: item.defaultBg, fg: item.defaultFg };

            return (
              <button
                key={item.id}
                onClick={() => toggleStatusFilter(item.key)}
                title={`Press "${item.id}" on keyboard to toggle`}
                className={clsx(
                  'rounded-lg px-2.5 py-2 text-xs font-bold text-center transition-all shadow-xs border flex items-center justify-between gap-1 hover:-translate-y-0.5 select-none relative group cursor-pointer',
                  isSelected
                    ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface scale-[1.02] shadow-md z-10'
                    : 'opacity-90 hover:opacity-100'
                )}
                style={{
                  backgroundColor: c.bg,
                  color: c.fg,
                  borderColor: isSelected ? '#000000' : 'transparent',
                }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="rounded bg-black/20 dark:bg-white/20 px-1 py-0.2 text-[9px] font-mono font-black shrink-0">
                    {item.id}
                  </span>
                  <span className="truncate text-[11px]">{item.title}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="rounded-full bg-black/20 dark:bg-white/20 px-1.5 py-0.2 text-[10px] font-black">
                    {count}
                  </span>
                  {isSelected && <Check size={12} className="stroke-[3]" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Active Filters Notification Banner */}
        {selectedStatusFilters.length > 0 && (
          <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2 animate-fade-in shadow-2xs">
            <div className="flex items-center gap-2 text-xs font-semibold text-ink flex-wrap">
              <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
              <span>
                Active Color Filters:{' '}
                <strong className="text-primary font-bold">
                  {selectedStatusFilters.join(', ')}
                </strong>{' '}
                ({filterMode === 'filter' ? `Showing ${filteredRows.length} matching rows` : 'Highlight Mode Active'})
              </span>
              <span className="text-[11px] text-ink-3 hidden sm:inline">
                • Press <kbd className="rounded border border-line bg-surface px-1 py-0.5 text-[10px] font-mono font-bold">Esc</kbd> to clear
              </span>
            </div>
            <button
              onClick={() => setSelectedStatusFilters([])}
              className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline hover:text-primary-ink shrink-0"
            >
              <X size={13} />
              <span>Clear All</span>
            </button>
          </div>
        )}
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
              <div className="relative w-full">
                <Input
                  ref={searchInputRef}
                  placeholder={`Search across ${activeSheet}... (Press / to focus)`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full text-sm pr-8"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <Button
                size="sm"
                variant="secondary"
                icon={<SlidersHorizontal size={14} />}
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                Filters
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon={<Columns size={14} />}
                onClick={() => setColumnsModalOpen(true)}
                title="Reorder and customize columns"
              >
                Columns
              </Button>
              {(search || selectedStatusFilters.length > 0) && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<X size={14} />}
                  onClick={() => {
                    setSearch('');
                    setSelectedStatusFilters([]);
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
                <label className="text-[11px] font-bold text-ink-3">Quick Filter by Status</label>
                <Select
                  value={selectedStatusFilters[0] || ''}
                  onChange={(e) => {
                    if (!e.target.value) setSelectedStatusFilters([]);
                    else setSelectedStatusFilters([e.target.value]);
                  }}
                >
                  <option value="">All Statuses</option>
                  {COLOR_LEGEND_ITEMS.map((item) => (
                    <option key={item.id} value={item.key}>
                      [{item.id}] {item.title} ({statusCounts[item.id] ?? 0})
                    </option>
                  ))}
                  <option value="REMAINING">⚠️ REMAINING (Alert)</option>
                  <option value="ACTION">🚨 ACTION (Alert)</option>
                </Select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-ink-3">Column Customization</label>
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full mt-1.5"
                  icon={<Columns size={13} />}
                  onClick={() => setColumnsModalOpen(true)}
                >
                  Movable Columns ({visibleColIndices.length}/{rawHeaders.length} visible)
                </Button>
              </div>
              <div>
                <label className="text-[11px] font-bold text-ink-3">Sheet Theme & Colors</label>
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full mt-1.5"
                  icon={<Paintbrush size={13} />}
                  onClick={() => setPaletteModalOpen(true)}
                >
                  Customize Status Palette
                </Button>
              </div>
            </div>
          )}

          {/* Interactive Data Table with Movable Headers, Clickable Links, and Rich Hover Controls */}
          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            {dataQ.isLoading ? (
              <div className="flex h-64 items-center justify-center">
                <Spinner className="h-8 w-8" />
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <Empty
                  title={`No records match filters in ${activeSheet}`}
                  hint={
                    selectedStatusFilters.length > 0
                      ? 'No items currently match your active color filters. Try clearing status filters or press [Esc].'
                      : 'Try clearing your search query or trigger a live sync.'
                  }
                />
                {(selectedStatusFilters.length > 0 || search) && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setSelectedStatusFilters([]);
                      setSearch('');
                    }}
                  >
                    Clear All Filters
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[680px] scrollbar-thin">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 z-20 bg-surface-2/95 backdrop-blur-md border-b border-line shadow-xs select-none">
                    <tr>
                      {/* Sticky Row Number Column */}
                      <th className="sticky left-0 z-30 py-2.5 px-3 font-bold text-ink-3 uppercase tracking-wider text-[10px] w-12 border-r border-line/40 bg-surface-2/95 backdrop-blur-md">
                        #
                      </th>

                      {/* Prominent Current Stage Column (If not already present in sheet headers) */}
                      {showUpfrontStage && (
                        <th className="sticky left-12 z-30 py-2.5 px-3 font-bold text-ink uppercase tracking-wider text-[11px] whitespace-nowrap border-r-2 border-primary/40 bg-surface-2/95 backdrop-blur-md min-w-[150px] shadow-xs">
                          Current Stage
                        </th>
                      )}

                      {/* Movable Columns from Sheet */}
                      {visibleColIndices.map((origColIdx, displayIdx) => {
                        const head = rawHeaders[origColIdx];
                        const isDragging = draggedColIdx === displayIdx;
                        const isDragOver = dragOverColIdx === displayIdx;

                        return (
                          <th
                            key={origColIdx}
                            draggable
                            onDragStart={(e) => handleDragStart(e, displayIdx)}
                            onDragOver={(e) => handleDragOver(e, displayIdx)}
                            onDrop={(e) => handleDrop(e, displayIdx)}
                            className={clsx(
                              'py-2 px-3 font-bold text-ink uppercase tracking-wider text-[11px] whitespace-nowrap border-r border-line/40 last:border-r-0 transition-colors group/th relative',
                              isDragging && 'opacity-40 bg-primary/20',
                              isDragOver && 'border-l-2 border-l-primary bg-primary/10'
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 cursor-grab active:cursor-grabbing">
                                <GripVertical size={11} className="text-ink-4 group-hover/th:text-primary transition-colors" />
                                <span>{head}</span>
                              </div>

                              {/* Quick Move Left / Right Arrows on Hover */}
                              <div className="opacity-0 group-hover/th:opacity-100 flex items-center gap-0.5 transition-opacity">
                                <button
                                  type="button"
                                  disabled={displayIdx === 0}
                                  onClick={() => moveColumn(displayIdx, displayIdx - 1)}
                                  className="p-0.5 rounded hover:bg-surface text-ink-3 hover:text-primary disabled:opacity-30 disabled:hover:text-ink-3"
                                  title="Move column left"
                                >
                                  <ChevronLeft size={12} />
                                </button>
                                <button
                                  type="button"
                                  disabled={displayIdx === visibleColIndices.length - 1}
                                  onClick={() => moveColumn(displayIdx, displayIdx + 1)}
                                  className="p-0.5 rounded hover:bg-surface text-ink-3 hover:text-primary disabled:opacity-30 disabled:hover:text-ink-3"
                                  title="Move column right"
                                >
                                  <ChevronRight size={12} />
                                </button>
                              </div>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/40">
                    {filteredRows.map((row, rowIdx) => {
                      const stage = getRowStage(row, rawHeaders, customColors);
                      const contentIdCell = row[0] || '';
                      const contentMeta = contentLookup[contentIdCell];
                      const isHighlighted = filterMode === 'highlight' && doesRowMatchSelectedFilters(row);

                      return (
                        <tr
                          key={rowIdx}
                          className={clsx(
                            'hover:bg-surface-2/60 transition-all group',
                            isHighlighted && 'ring-2 ring-primary bg-primary/10 font-bold'
                          )}
                        >
                          {/* Sticky Row Number Cell */}
                          <td className="sticky left-0 z-10 py-2 px-3 text-[11px] font-medium text-ink-3 border-r border-line/30 bg-surface/95 backdrop-blur-xs group-hover:bg-surface-2/90">
                            {rowIdx + 1}
                          </td>

                          {/* Sticky Current Stage Badge Cell (if not in headers) */}
                          {showUpfrontStage && (
                            <td className="sticky left-12 z-10 py-2 px-3 whitespace-nowrap border-r-2 border-primary/40 bg-surface/95 backdrop-blur-xs group-hover:bg-surface-2/90">
                              {stage ? (
                                <button
                                  type="button"
                                  onClick={() => toggleStatusFilter(stage.key)}
                                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-black shadow-xs tracking-tight transition-transform hover:scale-105 cursor-pointer"
                                  style={{
                                    backgroundColor: stage.bg,
                                    color: stage.fg,
                                  }}
                                  title="Click to filter table by this stage"
                                >
                                  <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
                                  <span>{stage.label}</span>
                                </button>
                              ) : (
                                <span className="text-ink-4 text-[11px] font-medium">—</span>
                              )}
                            </td>
                          )}

                          {/* Movable Cells with Rich Clickable Routing */}
                          {visibleColIndices.map((origColIdx) => {
                            const headerName = (rawHeaders[origColIdx] || '').toLowerCase().trim();
                            const cell = row[origColIdx];
                            const cellStr = String(cell || '').trim();
                            const style = getCellStyle(cellStr);

                            // 1. Content ID column: Clickable directly to Content Workspace
                            if (headerName === 'content id') {
                              if (contentMeta) {
                                return (
                                  <td key={origColIdx} className="py-2 px-3 whitespace-nowrap border-r border-line/30 text-xs font-medium">
                                    <Link
                                      to={`/content/${contentMeta._id}`}
                                      className="inline-flex items-center gap-1.5 font-mono font-black text-primary hover:underline hover:text-primary-ink bg-primary/10 border border-primary/25 rounded-md px-2 py-0.5 transition-all shadow-2xs group/link"
                                      title={`Open ${cell} Workspace (${contentMeta.type})`}
                                    >
                                      <span>{cell}</span>
                                      <ExternalLink size={10} className="opacity-70 group-hover/link:opacity-100" />
                                    </Link>
                                  </td>
                                );
                              }
                            }

                            // 2. Client column: Clickable directly to Client Dashboard
                            if (headerName === 'client' && cellStr) {
                              const clientId = clientLookup[cellStr.toLowerCase()];
                              if (clientId) {
                                return (
                                  <td key={origColIdx} className="py-2 px-3 whitespace-nowrap border-r border-line/30 text-xs font-semibold text-ink">
                                    <Link
                                      to={`/clients/${clientId}`}
                                      className="font-bold text-ink hover:text-primary hover:underline transition-colors"
                                      title={`View ${cell} Client Profile`}
                                    >
                                      {cell}
                                    </Link>
                                  </td>
                                );
                              }
                            }

                            // 3. Content Type column: Clickable filter to dedicated sheet
                            if (headerName === 'content type' && cellStr) {
                              return (
                                <td key={origColIdx} className="py-2 px-3 whitespace-nowrap border-r border-line/30 text-xs">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const t = cellStr.toUpperCase();
                                      if (['REEL', 'VIDEO', 'SHORT'].includes(t)) setActiveSheet('Reels');
                                      else if (['POST', 'IMAGE'].includes(t)) setActiveSheet('Posts');
                                      else if (t === 'CAROUSEL') setActiveSheet('Carousels');
                                      else if (['AI_REEL', 'AI_IMAGE'].includes(t)) setActiveSheet('AI Reels');
                                    }}
                                    className="font-bold uppercase tracking-wider text-[10px] px-2 py-0.5 rounded border border-line/60 bg-surface-2/60 hover:border-primary hover:bg-surface-2 transition-all cursor-pointer"
                                    title={`View dedicated ${cell} sheet tab`}
                                  >
                                    {cell}
                                  </button>
                                </td>
                              );
                            }

                            // 4. Topic / Brief column: Clickable directly to content workspace
                            if ((headerName.includes('topic') || headerName.includes('brief') || headerName === 'title') && contentMeta) {
                              return (
                                <td key={origColIdx} className="py-2 px-3 whitespace-nowrap border-r border-line/30 text-xs font-medium text-ink max-w-sm truncate">
                                  <Link
                                    to={`/content/${contentMeta._id}`}
                                    className="hover:text-primary hover:underline transition-colors truncate block font-medium"
                                    title={`Open ${contentMeta.title || cell}`}
                                  >
                                    {cell || '—'}
                                  </Link>
                                </td>
                              );
                            }

                            // 5. Current Stage column: Render vibrant color status pill
                            if (headerName === 'current stage' && cellStr) {
                              const s = getCellStyle(cellStr);
                              return (
                                <td key={origColIdx} className="py-2 px-3 whitespace-nowrap border-r border-line/30 text-xs">
                                  <button
                                    type="button"
                                    onClick={() => toggleStatusFilter(cellStr)}
                                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-black shadow-xs tracking-tight transition-transform hover:scale-105 cursor-pointer"
                                    style={s}
                                    title="Click to toggle filter for this stage"
                                  >
                                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
                                    <span>{cell}</span>
                                  </button>
                                </td>
                              );
                            }

                            // 6. Google Drive Link: Render dedicated folder button
                            if ((headerName.includes('drive') || cellStr.includes('drive.google.com')) && cellStr) {
                              return (
                                <td key={origColIdx} className="py-2 px-3 whitespace-nowrap border-r border-line/30 text-xs">
                                  <a
                                    href={cellStr}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-500/10 px-2.5 py-1 text-[11px] font-bold text-blue-400 hover:bg-blue-500/20 transition-all shadow-xs"
                                    title="Open Google Drive Folder"
                                  >
                                    <span>📁 Open Drive</span>
                                    <ExternalLink size={10} />
                                  </a>
                                </td>
                              );
                            }

                            // 7. Live Social Media URL: Render dedicated Live button
                            if ((headerName.includes('live url') || cellStr.includes('instagram.com') || cellStr.includes('youtube.com')) && cellStr) {
                              return (
                                <td key={origColIdx} className="py-2 px-3 whitespace-nowrap border-r border-line/30 text-xs">
                                  <a
                                    href={cellStr}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-pink-500/40 bg-pink-500/10 px-2.5 py-1 text-[11px] font-bold text-pink-400 hover:bg-pink-500/20 transition-all shadow-xs"
                                    title="View Live Post on Social Media"
                                  >
                                    <span>🎬 View Live</span>
                                    <ExternalLink size={10} />
                                  </a>
                                </td>
                              );
                            }

                            // 8. General URLs
                            const isUrl = cellStr.startsWith('http://') || cellStr.startsWith('https://');

                            return (
                              <td
                                key={origColIdx}
                                className={clsx(
                                  'py-2 px-3 whitespace-nowrap border-r border-line/30 last:border-r-0 text-xs font-medium',
                                  style ? 'rounded-md shadow-xs' : 'text-ink'
                                )}
                                style={style}
                              >
                                {isUrl ? (
                                  <a
                                    href={cellStr}
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Movable Columns Organizer Modal */}
      {columnsModalOpen && (
        <Modal
          open={columnsModalOpen}
          onClose={() => setColumnsModalOpen(false)}
          title="Organize & Customize Movable Columns"
        >
          <div className="space-y-4">
            <p className="text-xs text-ink-3">
              Drag columns or use the move buttons to customize your workflow order. Uncheck any column to hide it from your grid.
            </p>

            <div className="max-h-[400px] overflow-y-auto space-y-1.5 pr-1 divide-y divide-line/40">
              {columnOrder.map((origColIdx, currentPos) => {
                const colName = rawHeaders[origColIdx];
                const isHidden = hiddenColumns.includes(colName);

                return (
                  <div
                    key={origColIdx}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-surface-2 transition-colors pt-2"
                  >
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => toggleColumnVisibility(colName)}
                        className="text-primary"
                        title={isHidden ? 'Show Column' : 'Hide Column'}
                      >
                        {isHidden ? <Square size={16} className="text-ink-3" /> : <CheckSquare size={16} />}
                      </button>
                      <span className={clsx('text-xs font-bold', isHidden ? 'text-ink-4 line-through' : 'text-ink')}>
                        {colName}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={currentPos === 0}
                        onClick={() => moveColumn(currentPos, currentPos - 1)}
                        title="Move Up"
                      >
                        <ChevronLeft size={13} />
                      </Button>
                      <span className="text-[10px] font-mono font-bold text-ink-3 w-5 text-center">
                        {currentPos + 1}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={currentPos === columnOrder.length - 1}
                        onClick={() => moveColumn(currentPos, currentPos + 1)}
                        title="Move Down"
                      >
                        <ChevronRight size={13} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-line">
              <Button
                variant="ghost"
                size="sm"
                icon={<RotateCcw size={13} />}
                onClick={resetColumns}
              >
                Reset Default Order
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setColumnsModalOpen(false)}
              >
                Done
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Customize Palette & Status Colors Modal */}
      {paletteModalOpen && (
        <Modal
          open={paletteModalOpen}
          onClose={() => setPaletteModalOpen(false)}
          title="Customize Status Colors & Themes"
        >
          <div className="space-y-5">
            <p className="text-xs text-ink-3">
              Choose a curated color theme or customize the exact background and text color for each production stage.
            </p>

            {/* Theme Presets */}
            <div>
              <label className="text-xs font-bold text-ink uppercase tracking-wider mb-2 block">
                Preset Color Themes
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSavePalette(preset)}
                    className="p-3 rounded-xl border border-line bg-surface hover:border-primary transition-all text-left space-y-2 group shadow-2xs"
                  >
                    <span className="text-xs font-bold text-ink group-hover:text-primary block">
                      {preset.name}
                    </span>
                    <div className="flex items-center gap-1">
                      {Object.values(preset.colors).slice(0, 7).map((c, i) => (
                        <span
                          key={i}
                          className="h-3 w-3 rounded-full border border-black/20"
                          style={{ backgroundColor: c.bg }}
                        />
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Individual Status Stage Color Editor */}
            <div>
              <label className="text-xs font-bold text-ink uppercase tracking-wider mb-2 block">
                Custom Stage Color Pickers
              </label>
              <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
                {COLOR_LEGEND_ITEMS.map((item) => {
                  const current = customColors[item.id] || { bg: item.defaultBg, fg: item.defaultFg };

                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2 rounded-lg border border-line/60 bg-surface-2/40"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-4 w-4 rounded-md border border-black/20 shrink-0"
                          style={{ backgroundColor: current.bg }}
                        />
                        <span className="text-xs font-bold text-ink">{item.title}</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-ink-3">
                          <span>Bg:</span>
                          <input
                            type="color"
                            value={current.bg}
                            onChange={(e) => handleUpdateCustomColor(item.id, e.target.value, current.fg)}
                            className="h-6 w-7 rounded cursor-pointer border border-line"
                          />
                        </label>
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-ink-3">
                          <span>Text:</span>
                          <input
                            type="color"
                            value={current.fg}
                            onChange={(e) => handleUpdateCustomColor(item.id, current.bg, e.target.value)}
                            className="h-6 w-7 rounded cursor-pointer border border-line"
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-line">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  handleSavePalette(COLOR_PRESETS[0]);
                }}
              >
                Reset Default Colors
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => formatMut.mutate()}
                >
                  Apply to Google Sheets
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setPaletteModalOpen(false)}
                >
                  Save & Close
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

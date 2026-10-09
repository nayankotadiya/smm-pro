import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Printer, Check, Sparkles, Calendar, FileText, Camera, Scissors, Rocket, Hourglass, ExternalLink, ArrowLeft } from 'lucide-react';
import { get } from '@/lib/api';
import { Badge, Button, Modal, Select, Spinner } from '@/components/ui';
import { toast } from '@/store/ui';

export function ClientReportModal({
  open,
  onClose,
  defaultClientId,
}: {
  open: boolean;
  onClose: () => void;
  defaultClientId?: string;
}) {
  const [clientId, setClientId] = useState<string>(defaultClientId || '');
  const [period, setPeriod] = useState<string>('week');
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'whatsapp' | 'visual'>('visual');

  useEffect(() => {
    if (defaultClientId) setClientId(defaultClientId);
  }, [defaultClientId, open]);

  const clientsQ = useQuery({
    queryKey: ['clients-list'],
    queryFn: () => get<any[]>('/clients'),
    enabled: open,
  });

  const reportQ = useQuery({
    queryKey: ['dashboard', 'client-report', clientId, period],
    queryFn: () => get<any>('/dashboard/client-report', { clientId: clientId || undefined, period }),
    enabled: open,
  });

  const rep = reportQ.data;

  const handleCopy = () => {
    if (!rep?.whatsappText) return;
    navigator.clipboard.writeText(rep.whatsappText);
    setCopied(true);
    toast.success('WhatsApp report copied to clipboard!');
    setTimeout(() => setCopied(false), 2500);
  };

  const handlePrint = () => {
    if (!rep) return;
    printOrSavePdf(rep);
  };

  const clientOptions = [
    { value: '', label: 'All Clients (Overall Summary)' },
    ...(clientsQ.data || []).map((c: any) => ({ value: c._id, label: c.name })),
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="mr-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line/70 bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink transition-colors cursor-pointer"
            title="Go back"
            aria-label="Go back"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
            <Sparkles size={16} />
          </span>
          <span className="text-[15px] sm:text-[16px] font-bold">Daily &amp; Weekly Status Report</span>
        </div>
      }
      wide
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="text-meta text-ink-3">
            {rep?.stats?.total ?? 0} content pieces in this report period
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={onClose} icon={<ArrowLeft size={15} />}>Back</Button>
            {tab === 'whatsapp' ? (
              <Button
                variant="primary"
                className="!bg-emerald-600 hover:!bg-emerald-700 !text-white gap-1.5"
                onClick={handleCopy}
                disabled={!rep?.whatsappText}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? 'Copied to Clipboard!' : 'Copy WhatsApp Update'}
              </Button>
            ) : (
              <Button
                variant="primary"
                className="gap-1.5"
                onClick={handlePrint}
                disabled={!rep}
              >
                <Printer size={15} /> Print / Save PDF
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Controls Bar */}
        <div className="grid gap-3 rounded-2xl border border-line/60 bg-surface-2/40 p-3.5 backdrop-blur-md sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-meta font-bold text-ink-2">Select Client</label>
            <Select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              {clientOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-meta font-bold text-ink-2">Time Period</label>
            <Select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              <option value="today">Today's Update</option>
              <option value="week">This Week (Last 7 Days)</option>
              <option value="month">This Month (Last 30 Days)</option>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-meta font-bold text-ink-2">Export Mode</label>
            <div className="flex rounded-xl bg-surface/60 p-1 border border-line/60">
              <button
                type="button"
                onClick={() => setTab('whatsapp')}
                className={`flex-1 rounded-lg py-1.5 text-[12px] font-bold transition-all ${
                  tab === 'whatsapp'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-ink-2 hover:text-ink'
                }`}
              >
                WhatsApp Text
              </button>
              <button
                type="button"
                onClick={() => setTab('visual')}
                className={`flex-1 rounded-lg py-1.5 text-[12px] font-bold transition-all ${
                  tab === 'visual'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-ink-2 hover:text-ink'
                }`}
              >
                Visual &amp; PDF
              </button>
            </div>
          </div>
        </div>

        {reportQ.isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Spinner />
          </div>
        ) : !rep ? (
          <div className="py-12 text-center text-ink-3">No report data found.</div>
        ) : tab === 'whatsapp' ? (
          /* WhatsApp Preview */
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[13px] text-ink-2">
              <span className="font-semibold text-ink">WhatsApp Ready-to-Send Text:</span>
              <span className="text-meta text-emerald-400">Formatted with bold tags &amp; emojis</span>
            </div>
            <div className="relative rounded-2xl border border-emerald-500/25 bg-surface-2/80 p-4 font-mono text-[12px] leading-relaxed text-ink shadow-inner whitespace-pre-wrap selection:bg-emerald-500/30">
              {rep.whatsappText}
            </div>
          </div>
        ) : (
          /* Visual Summary & Print View */
          <div className="space-y-4" id="printable-client-report">
            {/* Header info */}
            <div className="rounded-2xl border border-line/60 bg-gradient-to-r from-primary/10 to-indigo-500/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-[16px] font-bold text-ink">{rep.client} — Status Report</h3>
                  <div className="text-[12px] text-ink-2">
                    Period: {rep.period.toUpperCase()} · Generated on {new Date().toLocaleDateString([], { dateStyle: 'medium' })}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge t="blue">{rep.stats?.total || 0} Total Items</Badge>
                  <Button size="sm" variant="secondary" onClick={handlePrint} icon={<Printer size={13} />}>
                    Print / PDF
                  </Button>
                </div>
              </div>
            </div>

            {/* Stat counters */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: 'Scripting', val: rep.stats?.inScript || 0, icon: FileText, color: 'text-blue-400' },
                { label: 'Shooting', val: rep.stats?.inShoot || 0, icon: Camera, color: 'text-amber-400' },
                { label: 'Editing', val: rep.stats?.inEdit || 0, icon: Scissors, color: 'text-purple-400' },
                { label: 'Client Review', val: rep.stats?.pendingClient || 0, icon: Hourglass, color: 'text-rose-400' },
                { label: 'Scheduled', val: rep.stats?.scheduled || 0, icon: Calendar, color: 'text-cyan-400' },
                { label: 'Published', val: rep.stats?.published || 0, icon: Rocket, color: 'text-emerald-400' },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-line/60 bg-surface-2/50 p-2.5 text-center">
                  <div className={`mx-auto mb-1 flex h-6 w-6 items-center justify-center ${s.color}`}>
                    <s.icon size={15} />
                  </div>
                  <div className="text-[18px] font-bold text-ink tabular">{s.val}</div>
                  <div className="text-[11px] font-medium text-ink-3">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Items Content: Mobile Card View (smooth vertical touch scrolling) */}
            <div className="rounded-2xl border border-line/60 bg-surface overflow-hidden">
              <div className="px-4 py-2.5 border-b border-line bg-surface-2 flex items-center justify-between text-[12.5px] font-semibold text-ink">
                <span>Content Items ({rep.items?.length || 0})</span>
                <span className="text-meta text-ink-3">Showing all</span>
              </div>

              {/* Mobile stacked cards */}
              <ul className="divide-y divide-line/60 sm:hidden">
                {(rep.items || []).map((item: any) => (
                  <li key={item._id} className="p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-[14px] text-ink">{item.title}</div>
                        <div className="font-mono text-[11px] text-ink-3">{item.code}</div>
                      </div>
                      <Badge>{item.stage}</Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-2">
                      <span>🏢 {item.clientName}</span>
                      <span>👤 {item.owner || 'Unassigned'}</span>
                    </div>

                    {item.shoot && (
                      <div className="rounded-lg bg-surface-2/60 border border-line/50 p-2 text-[11.5px] text-ink-2 space-y-1">
                        <div className="flex items-center justify-between font-medium text-ink">
                          <span>🎥 {item.shoot.shooterName}</span>
                          {item.shoot.shootDate && (
                            <span className="text-meta text-ink-3">
                              {new Date(item.shoot.shootDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </div>
                        {item.shoot.remarks?.length > 0 && (
                          <div className="rounded bg-rose-500/10 border border-rose-500/20 px-2 py-1 text-rose-500 dark:text-rose-300 font-medium text-[11px]">
                            ⚠️ Remark: {item.shoot.remarks[item.shoot.remarks.length - 1].text}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto overscroll-x-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
                <table className="w-full text-left text-[12px]" style={{ minWidth: 620 }}>
                  <thead className="border-b border-line bg-surface-2 text-ink-2 font-bold">
                    <tr>
                      <th className="p-2.5">Code / Title</th>
                      <th className="p-2.5">Client</th>
                      <th className="p-2.5">Stage</th>
                      <th className="p-2.5">Owner</th>
                      <th className="p-2.5">Shoot / Remark</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {(rep.items || []).map((item: any) => (
                      <tr key={item._id} className="hover:bg-surface-2/60 transition-colors">
                        <td className="p-2.5 font-medium text-ink">
                          <div className="font-semibold">{item.title}</div>
                          <div className="font-mono text-[11px] text-ink-3">{item.code}</div>
                        </td>
                        <td className="p-2.5 text-ink-2">{item.clientName}</td>
                        <td className="p-2.5">
                          <Badge>{item.stage}</Badge>
                        </td>
                        <td className="p-2.5 text-ink">{item.owner}</td>
                        <td className="p-2.5 text-ink-2">
                          {item.shoot ? (
                            <div>
                              <span className="font-semibold text-ink">{item.shoot.shooterName}</span>
                              {item.shoot.shootDate && ` · ${new Date(item.shoot.shootDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}`}
                              {item.shoot.remarks?.length > 0 && (
                                <div className="text-[11px] text-rose-400 font-medium">
                                  Remark: {item.shoot.remarks[item.shoot.remarks.length - 1].text}
                                </div>
                              )}
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function escapeHtml(str: string) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getStageBadgeStyle(stage: string) {
  const s = String(stage || '').toUpperCase();
  if (['IDEA', 'SCRIPT', 'INTERNAL_REVIEW'].includes(s)) {
    return 'background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;';
  }
  if (s === 'SHOOTING') {
    return 'background: #fffbeb; color: #b45309; border: 1px solid #fde68a;';
  }
  if (['RAW_FOOTAGE', 'EDITING', 'SMM_REVIEW', 'FINAL_REVIEW'].includes(s)) {
    return 'background: #faf5ff; color: #7e22ce; border: 1px solid #e9d5ff;';
  }
  if (s === 'SCHEDULE') {
    return 'background: #ecfeff; color: #0e7490; border: 1px solid #a5f3fc;';
  }
  if (s === 'PUBLISHED') {
    return 'background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0;';
  }
  return 'background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1;';
}

function printOrSavePdf(rep: any) {
  if (!rep) return;

  const upcomingShoots = (rep.items || []).filter((i: any) => i.shoot && i.shoot.shootDate);
  const shootsSection = upcomingShoots.length > 0 ? `
    <div style="margin-bottom: 16px; border: 1px solid #fed7aa; background: #fff7ed; border-radius: 8px; padding: 10px 12px; page-break-inside: avoid; break-inside: avoid;">
      <div style="font-size: 11.5px; font-weight: 700; color: #9a3412; margin-bottom: 6px;">🎥 Scheduled Shoots in this Period (${upcomingShoots.length})</div>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;">
        ${upcomingShoots.slice(0, 8).map((item: any) => {
          const d = new Date(item.shoot.shootDate).toLocaleDateString([], { month: 'short', day: 'numeric', weekday: 'short' });
          return `
            <div style="font-size: 10.5px; color: #431407; padding: 4px 8px; border-left: 2px solid #f97316; background: rgba(255,255,255,0.7); border-radius: 4px;">
              <div><strong>${escapeHtml(item.title)}</strong> <span style="font-family: monospace; font-size: 9.5px; color: #78350f;">[${escapeHtml(item.code)}]</span></div>
              <div style="margin-top: 2px;">📅 ${d} ${item.shoot.shootTime ? `@ ${escapeHtml(item.shoot.shootTime)}` : ''} · Shooter: <strong>${escapeHtml(item.shoot.shooterName || 'Assigned')}</strong></div>
              ${item.shoot.location ? `<div>📍 ${escapeHtml(item.shoot.location)}</div>` : ''}
              ${item.shoot.remarks?.length ? `<div style="background: #fee2e2; border: 1px solid #fca5a5; color: #991b1b; font-size: 9.5px; padding: 2px 4px; border-radius: 3px; margin-top: 2px;">⚠️ Remark: ${escapeHtml(item.shoot.remarks[item.shoot.remarks.length - 1].text || '')}</div>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  ` : '';

  const itemsHtml = (rep.items || []).map((item: any) => {
    const badgeStyle = getStageBadgeStyle(item.stage);
    return `
      <tr>
        <td style="padding: 7px 9px; border-bottom: 1px solid #e2e8f0; width: 30%;">
          <div style="font-weight: 600; color: #0f172a; font-size: 11px;">${escapeHtml(item.title)}</div>
          <div style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9.5px; color: #64748b; margin-top: 1px;">${escapeHtml(item.code)}</div>
        </td>
        <td style="padding: 7px 9px; border-bottom: 1px solid #e2e8f0; color: #334155; width: 18%; font-size: 10.5px;">${escapeHtml(item.clientName || 'General')}</td>
        <td style="padding: 7px 9px; border-bottom: 1px solid #e2e8f0; width: 15%;">
          <span style="display: inline-block; padding: 2px 7px; border-radius: 9999px; font-size: 9.5px; font-weight: 700; ${badgeStyle}">
            ${escapeHtml(item.stage || '—')}
          </span>
        </td>
        <td style="padding: 7px 9px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 500; width: 14%; font-size: 10.5px;">${escapeHtml(item.owner || 'Unassigned')}</td>
        <td style="padding: 7px 9px; border-bottom: 1px solid #e2e8f0; color: #334155; width: 23%; font-size: 10.5px;">
          ${item.shoot ? `
            <div><strong>🎥 ${escapeHtml(item.shoot.shooterName || 'Shooter')}</strong>${item.shoot.shootDate ? ` · ${new Date(item.shoot.shootDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : ''}</div>
            ${item.shoot.remarks?.length ? `<div style="color: #b91c1c; font-size: 9.5px; margin-top: 2px; font-weight: 600; background: #fef2f2; border: 1px solid #fecaca; padding: 1px 4px; border-radius: 3px;">⚠️ ${escapeHtml(item.shoot.remarks[item.shoot.remarks.length - 1].text || '')}</div>` : ''}
          ` : item.pendingApproval ? `
            <div style="color: #be123c; font-weight: 600;">⏳ Waiting for Client (${escapeHtml(item.pendingApproval.version || 'Review')})</div>
          ` : '—'}
        </td>
      </tr>
    `;
  }).join('');

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(rep.client || 'Client')} - Status Report</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        @page {
          size: A4 portrait;
          margin: 10mm 10mm 10mm 10mm;
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
          padding: 12px 14px;
          font-size: 11px;
          line-height: 1.45;
          background: #ffffff;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2.5px solid #2563eb;
          padding-bottom: 12px;
          margin-bottom: 14px;
        }
        .title {
          font-size: 19px;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: -0.2px;
        }
        .brand-sub {
          font-size: 10px;
          font-weight: 700;
          color: #2563eb;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 2px;
        }
        .sub {
          font-size: 11px;
          color: #64748b;
          margin-top: 3px;
        }
        .badge {
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          color: #1d4ed8;
          padding: 5px 12px;
          border-radius: 9999px;
          font-weight: 700;
          font-size: 11.5px;
          white-space: nowrap;
        }
        .kpis {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 7px;
          margin-bottom: 14px;
        }
        .kpi {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 7px 4px;
          text-align: center;
          background: #f8fafc;
        }
        .kpi.script { border-color: #bfdbfe; background: #eff6ff; }
        .kpi.script .kpi-val { color: #1d4ed8; }
        .kpi.shoot { border-color: #fde68a; background: #fffbeb; }
        .kpi.shoot .kpi-val { color: #b45309; }
        .kpi.edit { border-color: #e9d5ff; background: #faf5ff; }
        .kpi.edit .kpi-val { color: #7e22ce; }
        .kpi.review { border-color: #fecdd3; background: #fff1f2; }
        .kpi.review .kpi-val { color: #be123c; }
        .kpi.sched { border-color: #a5f3fc; background: #ecfeff; }
        .kpi.sched .kpi-val { color: #0e7490; }
        .kpi.pub { border-color: #a7f3d0; background: #ecfdf5; }
        .kpi.pub .kpi-val { color: #047857; }

        .kpi-val {
          font-size: 18px;
          font-weight: 800;
          line-height: 1.1;
        }
        .kpi-lbl {
          font-size: 9.5px;
          color: #475569;
          font-weight: 700;
          text-transform: uppercase;
          margin-top: 2px;
          letter-spacing: 0.3px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          margin-bottom: 16px;
        }
        thead {
          display: table-header-group;
        }
        th {
          background: #f1f5f9;
          padding: 7px 9px;
          border-bottom: 2px solid #cbd5e1;
          font-size: 10px;
          text-transform: uppercase;
          color: #334155;
          font-weight: 700;
          letter-spacing: 0.4px;
        }
        tr {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        tr:nth-child(even) td {
          background-color: #f8fafc;
        }
        .footer {
          border-top: 1px solid #e2e8f0;
          padding-top: 8px;
          margin-top: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: #94a3b8;
          font-size: 9.5px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="brand-sub">SMM PRO · PRODUCTION &amp; CLIENT REPORT</div>
          <div class="title">${escapeHtml(rep.client || 'All Clients')} — Status Report</div>
          <div class="sub">Period: <strong>${escapeHtml(rep.period?.toUpperCase() || '')}</strong> · Generated on ${new Date().toLocaleDateString([], { dateStyle: 'full' })} at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
        <div class="badge">${rep.stats?.total || 0} Total Items</div>
      </div>

      <div class="kpis">
        <div class="kpi script"><div class="kpi-val">${rep.stats?.inScript || 0}</div><div class="kpi-lbl">Scripting</div></div>
        <div class="kpi shoot"><div class="kpi-val">${rep.stats?.inShoot || 0}</div><div class="kpi-lbl">Shooting</div></div>
        <div class="kpi edit"><div class="kpi-val">${rep.stats?.inEdit || 0}</div><div class="kpi-lbl">Editing</div></div>
        <div class="kpi review"><div class="kpi-val">${rep.stats?.pendingClient || 0}</div><div class="kpi-lbl">Client Review</div></div>
        <div class="kpi sched"><div class="kpi-val">${rep.stats?.scheduled || 0}</div><div class="kpi-lbl">Scheduled</div></div>
        <div class="kpi pub"><div class="kpi-val">${rep.stats?.published || 0}</div><div class="kpi-lbl">Published</div></div>
      </div>

      ${shootsSection}

      <table>
        <thead>
          <tr>
            <th>Content / Code</th>
            <th>Client</th>
            <th>Stage</th>
            <th>Owner</th>
            <th>Shoot / Remarks</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml || '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #94a3b8;">No content items found for this report period.</td></tr>'}
        </tbody>
      </table>

      <div class="footer">
        <div>BULLETPROOF SCRIPT MANAGEMENT SYSTEM · CONFIDENTIAL</div>
        <div>Page automatically formatted for A4 PDF export</div>
      </div>
    </body>
    </html>
  `;

  // 1. Primary: Print cleanly via hidden iframe (bypasses popup blockers and isolates print styles)
  try {
    let iframe = document.getElementById('report-print-frame') as HTMLIFrameElement;
    if (iframe) iframe.remove();

    iframe = document.createElement('iframe');
    iframe.id = 'report-print-frame';
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
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          window.print();
        }
      }, 350);
      return;
    }
  } catch (err) {
    console.error('Iframe print failed', err);
  }

  // 2. Secondary fallback: popup window
  try {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 300);
      return;
    }
  } catch {}

  // 3. Last fallback: current window print
  window.print();
}

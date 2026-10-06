import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Printer, Check, Sparkles, Calendar, FileText, Camera, Scissors, Rocket, Hourglass, ExternalLink } from 'lucide-react';
import { get } from '@/lib/api';
import { Badge, Button, Modal, Select, Spinner } from '@/components/ui';
import { toast } from '@/store/ui';

export function ClientReportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [clientId, setClientId] = useState<string>('');
  const [period, setPeriod] = useState<string>('week');
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'whatsapp' | 'visual'>('whatsapp');

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
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
            <Sparkles size={16} />
          </span>
          <span className="text-[15px] sm:text-[16px]">Daily &amp; Weekly Status Report</span>
        </div>
      }
      wide
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="text-meta text-ink-3">
            {rep?.stats?.total ?? 0} content pieces in this report period
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={onClose}>Close</Button>
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

function printOrSavePdf(rep: any) {
  if (!rep) return;
  const itemsHtml = (rep.items || []).map((item: any) => `
    <tr>
      <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">
        <div style="font-weight: 600; color: #0f172a;">${escapeHtml(item.title)}</div>
        <div style="font-family: monospace; font-size: 11px; color: #64748b;">${escapeHtml(item.code)}</div>
      </td>
      <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #334155;">${escapeHtml(item.clientName || '—')}</td>
      <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">
        <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; background: #e0e7ff; color: #3730a3;">${escapeHtml(item.stage || '')}</span>
      </td>
      <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 500;">${escapeHtml(item.owner || '—')}</td>
      <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #334155; font-size: 11.5px;">
        ${item.shoot ? `
          <div><strong>${escapeHtml(item.shoot.shooterName || '')}</strong>${item.shoot.shootDate ? ` · ${new Date(item.shoot.shootDate).toLocaleDateString()}` : ''}</div>
          ${item.shoot.remarks?.length ? `<div style="color: #b91c1c; font-size: 10.5px; margin-top: 2px; font-weight: 600;">⚠️ Remark: ${escapeHtml(item.shoot.remarks[item.shoot.remarks.length - 1].text || '')}</div>` : ''}
        ` : '—'}
      </td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(rep.client || 'Client')} - Status Report</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        @page { size: A4; margin: 10mm 10mm 10mm 10mm; }
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 0; padding: 24px; font-size: 12px; line-height: 1.4; background: #ffffff; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 16px; }
        .title { font-size: 20px; font-weight: 800; color: #0f172a; }
        .sub { font-size: 12px; color: #64748b; margin-top: 4px; }
        .badge { background: #2563eb; color: #fff; padding: 4px 12px; border-radius: 9999px; font-weight: 700; font-size: 12px; }
        .kpis { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 18px; }
        .kpi { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px; text-align: center; background: #f8fafc; }
        .kpi-val { font-size: 18px; font-weight: 700; color: #0f172a; }
        .kpi-lbl { font-size: 10.5px; color: #64748b; font-weight: 600; text-transform: uppercase; margin-top: 2px; }
        table { width: 100%; border-collapse: collapse; text-align: left; margin-bottom: 20px; }
        th { background: #f1f5f9; padding: 8px 10px; border-bottom: 2px solid #cbd5e1; font-size: 11px; text-transform: uppercase; color: #475569; font-weight: 700; }
        tr { page-break-inside: avoid; }
        .footer { border-top: 1px solid #e2e8f0; padding-top: 10px; text-align: center; color: #94a3b8; font-size: 11px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="title">${escapeHtml(rep.client || 'All Clients')} — Status Report</div>
          <div class="sub">Period: ${escapeHtml(rep.period?.toUpperCase() || '')} · Generated on ${new Date().toLocaleDateString([], { dateStyle: 'full' })}</div>
        </div>
        <div class="badge">${rep.stats?.total || 0} Total Items</div>
      </div>

      <div class="kpis">
        <div class="kpi"><div class="kpi-val">${rep.stats?.inScript || 0}</div><div class="kpi-lbl">Scripting</div></div>
        <div class="kpi"><div class="kpi-val">${rep.stats?.inShoot || 0}</div><div class="kpi-lbl">Shooting</div></div>
        <div class="kpi"><div class="kpi-val">${rep.stats?.inEdit || 0}</div><div class="kpi-lbl">Editing</div></div>
        <div class="kpi"><div class="kpi-val">${rep.stats?.pendingClient || 0}</div><div class="kpi-lbl">Client Review</div></div>
        <div class="kpi"><div class="kpi-val">${rep.stats?.scheduled || 0}</div><div class="kpi-lbl">Scheduled</div></div>
        <div class="kpi"><div class="kpi-val">${rep.stats?.published || 0}</div><div class="kpi-lbl">Published</div></div>
      </div>

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
          ${itemsHtml}
        </tbody>
      </table>

      <div class="footer">
        Generated by SMM Pro Management System · Confidential
      </div>
    </body>
    </html>
  `;

  // 1. Try opening popup window with clean document ready for print/Save as PDF
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

  // 2. Fallback: print directly in current window
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'visible';
  setTimeout(() => {
    window.print();
    setTimeout(() => {
      document.body.style.overflow = prevOverflow;
    }, 1000);
  }, 100);
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Printer, Check, Share2, Sparkles, Building2, Calendar, FileText, Camera, Scissors, Rocket, Hourglass } from 'lucide-react';
import { get } from '@/lib/api';
import { Badge, Button, Card, Modal, Select, Spinner } from '@/components/ui';
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
    window.print();
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
          <span>Daily &amp; Weekly Status Report Generator</span>
        </div>
      }
      wide
      footer={
        <div className="flex w-full items-center justify-between">
          <div className="text-meta text-ink-3">
            {rep?.stats?.total ?? 0} content pieces in this report period
          </div>
          <div className="flex gap-2">
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
          <div className="space-y-4 print:p-0">
            {/* Header info */}
            <div className="rounded-2xl border border-line/60 bg-gradient-to-r from-primary/10 to-indigo-500/10 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[16px] font-bold text-ink">{rep.client} — Status Report</h3>
                  <div className="text-[12px] text-ink-2">
                    Period: {rep.period.toUpperCase()} · Generated on {new Date().toLocaleDateString()}
                  </div>
                </div>
                <Badge t="blue">{rep.stats?.total || 0} Total Items</Badge>
              </div>
            </div>

            {/* Stat counters */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-6">
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

            {/* Items table */}
            <div className="overflow-hidden rounded-2xl border border-line/60 bg-surface">
              <table className="w-full text-left text-[12px]">
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
                  {rep.items.slice(0, 15).map((item: any) => (
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
                              <div className="text-[11px] text-rose-300 font-medium">
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
        )}
      </div>
    </Modal>
  );
}

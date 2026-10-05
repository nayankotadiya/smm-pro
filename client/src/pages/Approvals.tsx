import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { Copy, History, ShieldCheck, CheckCircle2, AlertTriangle, MessageSquare, Send, Check, CheckCheck, Clock } from 'lucide-react';
import { get, post } from '@/lib/api';
import { useCan, useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { Async, Badge, Button, Card, DateRangePicker, Empty, Modal, PageHeader, Progress, Table, Tabs } from '@/components/ui';
import { useClientReviewActions, ClientTracking } from '@/features/ContentTabs';
import { ago, fmtDateTime, label } from '@/lib/format';

type T = 'internal' | 'daily-gate' | 'client' | 'final' | 'changes' | 'whatsapp' | 'history';

export default function Approvals() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as T) || 'internal';
  const can = useCan();
  const me = useAuth((s) => s.user)!;
  const act = useClientReviewActions();
  const qc = useQueryClient();
  const [hist, setHist] = useState<any>(null);
  const [signOffModal, setSignOffModal] = useState(false);
  const [signOffNotes, setSignOffNotes] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Primary approvals query
  const dateParams: any = {};
  if (dateFrom) dateParams.from = dateFrom;
  if (dateTo) dateParams.to = dateTo;

  const q = useQuery({
    queryKey: ['approvals', tab, dateParams],
    queryFn: () => get('/approvals', { tab: tab === 'daily-gate' || tab === 'whatsapp' ? 'all' : tab, ...dateParams }),
    enabled: tab !== 'daily-gate' && tab !== 'whatsapp',
  });

  // Daily Review Gate query
  const dailyGateQ = useQuery({
    queryKey: ['daily-review-gate'],
    queryFn: () => get('/approvals/daily-gate'),
    enabled: tab === 'daily-gate',
  });

  // WhatsApp logs query
  const whatsAppQ = useQuery({
    queryKey: ['whatsapp-logs'],
    queryFn: () => get('/approvals/whatsapp-logs'),
    enabled: tab === 'whatsapp',
  });

  const signOffMut = useMutation({
    mutationFn: () => post('/approvals/daily-gate/signoff', { notes: signOffNotes }),
    onSuccess: () => {
      toast.success('Successfully signed off on 9 AM Daily Review Gate');
      setSignOffModal(false);
      qc.invalidateQueries({ queryKey: ['daily-review-gate'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Could not sign off'),
  });

  const c = q.data?.counts;

  return (
    <>
      <PageHeader
        title="Approval Center"
        sub="Enterprise review gates, client sign-offs, and WhatsApp delivery tracking."
        actions={
          tab === 'daily-gate' && can('approvals.review') ? (
            <Button
              variant="primary"
              icon={<ShieldCheck size={16} />}
              onClick={() => setSignOffModal(true)}
            >
              Sign Off 9 AM Gate
            </Button>
          ) : undefined
        }
      />

      <Tabs
        value={tab}
        onChange={(k) => setSp({ tab: k }, { replace: true })}
        tabs={[
          { key: 'internal', label: 'Internal Review', count: c?.internal },
          { key: 'daily-gate', label: '9 AM Daily Review Gate' },
          { key: 'client', label: 'Client Review', count: c?.client },
          { key: 'final', label: 'Final Review', count: c?.final },
          { key: 'changes', label: 'Changes Requested', count: c?.changes },
          { key: 'whatsapp', label: 'WhatsApp History' },
          { key: 'history', label: 'History' },
        ]}
      />

      {tab !== 'daily-gate' && tab !== 'whatsapp' && tab !== 'history' && (
        <div className="mb-4">
          <DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
        </div>
      )}

      {/* 9 AM Daily Review Gate Tab */}
      {tab === 'daily-gate' && (
        <div className="space-y-4">
          <Card>
            <Async q={dailyGateQ}>
              {(d: any) => (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
                    <div>
                      <div className="flex items-center gap-2 text-[16px] font-bold text-ink">
                        <ShieldCheck size={18} className="text-primary-ink" />
                        <span>Daily Review Gate — {d.date}</span>
                      </div>
                      <p className="mt-1 text-meta text-ink-2">
                        All content items awaiting manager and lead review before daily handoff.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {d.access?.status === 'COMPLETED' ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-meta font-bold text-success-ink">
                          <CheckCircle2 size={15} /> Signed off by you
                        </span>
                      ) : can('approvals.review') ? (
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<ShieldCheck size={14} />}
                          onClick={() => setSignOffModal(true)}
                        >
                          Sign Off Gate
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {/* Summary KPI Grid */}
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <div className="rounded-xl border border-line bg-surface-2/60 p-3">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-ink-3">Total Internal</div>
                      <div className="mt-1 text-[22px] font-bold text-ink tabular">{d.summary?.totalInternal || 0}</div>
                    </div>
                    <div className="rounded-xl border border-line bg-surface-2/60 p-3">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-ink-3">Scripts</div>
                      <div className="mt-1 text-[22px] font-bold text-primary-ink tabular">{d.summary?.pendingScripts || 0}</div>
                    </div>
                    <div className="rounded-xl border border-line bg-surface-2/60 p-3">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-ink-3">SMM Reviews</div>
                      <div className="mt-1 text-[22px] font-bold text-amber-600 dark:text-amber-400 tabular">{d.summary?.pendingSmm || 0}</div>
                    </div>
                    <div className="rounded-xl border border-line bg-surface-2/60 p-3">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-ink-3">Final Reviews</div>
                      <div className="mt-1 text-[22px] font-bold text-purple-600 dark:text-purple-400 tabular">{d.summary?.pendingFinal || 0}</div>
                    </div>
                    <div className="rounded-xl border border-line bg-surface-2/60 p-3">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-ink-3">Waiting Client</div>
                      <div className="mt-1 text-[22px] font-bold text-cyan-600 dark:text-cyan-400 tabular">{d.summary?.waitingClient || 0}</div>
                    </div>
                  </div>

                  {/* Items waiting in gate */}
                  <div className="mt-6">
                    <h3 className="mb-3 text-[14px] font-bold text-ink">Items Awaiting Decision</h3>
                    {!d.items?.internal?.length ? (
                      <div className="rounded-xl border border-line p-6 text-center text-meta text-ink-3">
                        No pending internal reviews in today's gate. All clear.
                      </div>
                    ) : (
                      <Table head={['Content', 'Client', 'Stage', 'Reviewer', 'Waiting Since', 'Action']}>
                        {d.items.internal.map((a: any) => (
                          <tr key={a._id} className="hover:bg-surface-2/60 transition-colors">
                            <td className="td font-semibold text-ink">
                              <Link to={`/content/${a.contentId?._id}?tab=reviews`} className="hover:text-primary-ink">
                                {a.contentId?.title}
                              </Link>
                              <div className="font-mono text-meta font-normal text-ink-3">{a.contentId?.contentId} · {a.version}</div>
                            </td>
                            <td className="td text-ink-2">{a.contentId?.clientId?.name || '—'}</td>
                            <td className="td"><Badge status={a.type} /></td>
                            <td className="td text-ink-2">{a.reviewerId?.name || 'Assigned Reviewer'}</td>
                            <td className="td text-meta text-ink-3">{ago(a.sentAt || a.createdAt)}</td>
                            <td className="td">
                              <Link to={`/content/${a.contentId?._id}?tab=${a.type === 'INTERNAL_SCRIPT' ? 'script' : 'editing'}`}>
                                <Button size="sm" variant="primary">Review Now</Button>
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </Table>
                    )}
                  </div>
                </div>
              )}
            </Async>
          </Card>
        </div>
      )}

      {/* WhatsApp Delivery & History Tab */}
      {tab === 'whatsapp' && (
        <Card pad={false}>
          <Async q={whatsAppQ}>
            {(logs: any[]) =>
              !logs?.length ? (
                <Empty
                  title="No WhatsApp notification logs yet"
                  hint="Outgoing approval links and delivery tracking sent via AiSensy will appear here."
                />
              ) : (
                <Table head={['Sent Time', 'Client / Recipient', 'Phone', 'Type', 'Content', 'Status', 'Message ID']}>
                  {logs.map((l: any) => (
                    <tr key={l._id} className="hover:bg-surface-2/60 transition-colors">
                      <td className="td whitespace-nowrap text-meta font-medium text-ink-2">
                        {fmtDateTime(l.sentAt || l.createdAt)}
                      </td>
                      <td className="td font-medium text-ink">
                        {l.clientId?.name || l.recipientName || 'Client'}
                        {l.recipientName && l.clientId?.name && (
                          <div className="text-meta text-ink-3">{l.recipientName}</div>
                        )}
                      </td>
                      <td className="td font-mono text-meta text-ink-2">{l.recipientPhone}</td>
                      <td className="td"><Badge status={l.type} /></td>
                      <td className="td">
                        {l.contentId ? (
                          <Link to={`/content/${l.contentId._id}?tab=reviews`} className="font-semibold text-ink hover:text-primary-ink">
                            {l.contentId.title}
                          </Link>
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </td>
                      <td className="td">
                        <span
                          className={clsx(
                            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-meta font-bold',
                            l.status === 'DELIVERED' || l.status === 'READ'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : l.status === 'SENT'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          )}
                        >
                          {l.status === 'READ' ? <CheckCheck size={14} className="text-blue-600" /> : l.status === 'DELIVERED' ? <CheckCheck size={14} /> : l.status === 'SENT' ? <Check size={14} /> : <AlertTriangle size={14} />}
                          {l.status}
                        </span>
                      </td>
                      <td className="td font-mono text-[11px] text-ink-3 truncate max-w-[120px]">
                        {l.externalMessageId || '—'}
                      </td>
                    </tr>
                  ))}
                </Table>
              )
            }
          </Async>
        </Card>
      )}

      {/* Standard Approval Tabs */}
      {tab !== 'daily-gate' && tab !== 'whatsapp' && (
        <Card pad={false}>
          <Async q={q}>
            {(d: any) =>
              !d.items.length ? (
                <Empty
                  title={tab === 'history' ? 'No completed reviews yet' : 'Nothing waiting here'}
                  hint={tab === 'client' ? 'Reviews sent to clients are tracked here until they decide.' : undefined}
                />
              ) : (
                <>
                  <ul className="divide-y divide-line lg:hidden">
                    {d.items.map((a: any) => (
                      <li key={a._id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <Link to={`/content/${a.contentId?._id}?tab=reviews`} className="min-w-0">
                            <div className="truncate font-medium">{a.contentId?.title}</div>
                            <div className="text-meta text-ink-2">
                              {a.contentId?.clientId?.name} · {a.version} · {label(a.type)}
                            </div>
                          </Link>
                          <Badge status={a.status} />
                        </div>
                        <div className="mt-1 text-meta text-ink-2">
                          {a.reviewerId?.name ? `Reviewer ${a.reviewerId.name} · ` : ''}
                          Sent {ago(a.sentAt || a.createdAt)}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Link
                            to={`/content/${a.contentId?._id}?tab=${
                              a.type === 'INTERNAL_SCRIPT'
                                ? 'script'
                                : ['SMM', 'FINAL'].includes(a.type)
                                ? 'editing'
                                : 'reviews'
                            }`}
                          >
                            <Button size="sm" variant="primary">
                              Open
                            </Button>
                          </Link>
                          <Actions a={a} act={act} can={can} tab={tab} onHist={() => setHist(a)} />
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="hidden lg:block">
                    <Table head={['Content', 'Client', 'Version', 'Reviewer', 'Sent', 'Status', 'Progress', '']} minWidth={980}>
                      {d.items.map((a: any) => (
                        <tr key={a._id} className="group hover:bg-surface-2 transition-colors">
                          <td className="td">
                            <Link
                              to={`/content/${a.contentId?._id}?tab=reviews`}
                              className="font-semibold text-ink group-hover:text-primary-ink transition-colors"
                            >
                              {a.contentId?.title}
                            </Link>
                            <div className="font-mono text-meta font-medium text-ink-3">
                              {a.contentId?.contentId} · {label(a.type)}
                            </div>
                          </td>
                          <td className="td font-medium text-ink-2">{a.contentId?.clientId?.name}</td>
                          <td className="td font-semibold text-ink whitespace-nowrap">{a.version}</td>
                          <td className="td font-medium text-ink">
                            {['CLIENT_SCRIPT', 'CLIENT_FINAL'].includes(a.type) ? (
                              <span>
                                {a.recipientName || 'Client'}
                                <div className="text-meta font-normal text-ink-2">{label(a.source)}</div>
                              </span>
                            ) : (
                              a.reviewerId?.name || '—'
                            )}
                          </td>
                          <td className="td whitespace-nowrap text-meta font-medium text-ink-2">
                            {fmtDateTime(a.sentAt || a.createdAt)}
                          </td>
                          <td className="td">
                            <Badge status={a.status} />
                          </td>
                          <td className="td">
                            <div className="flex w-24 items-center gap-2">
                              <Progress value={a.contentId?.progress || 0} />
                              <span className="text-meta font-semibold tabular text-ink-2">
                                {a.contentId?.progress}%
                              </span>
                            </div>
                          </td>
                          <td className="td">
                            <div className="flex justify-end gap-1.5">
                              <Link
                                to={`/content/${a.contentId?._id}?tab=${
                                  a.type === 'INTERNAL_SCRIPT'
                                    ? 'script'
                                    : ['SMM', 'FINAL'].includes(a.type)
                                    ? 'editing'
                                    : 'reviews'
                                }`}
                              >
                                <Button size="sm" variant="primary">
                                  Open
                                </Button>
                              </Link>
                              <Actions a={a} act={act} can={can} tab={tab} onHist={() => setHist(a)} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </Table>
                  </div>
                </>
              )
            }
          </Async>
        </Card>
      )}

      {/* History Modal */}
      <Modal open={!!hist} onClose={() => setHist(null)} title={hist ? `${hist.contentId?.title} — ${hist.version}` : ''}>
        {hist && (
          <>
            {['CLIENT_SCRIPT', 'CLIENT_FINAL'].includes(hist.type) && (
              <div className="mb-4">
                <ClientTracking a={hist} />
              </div>
            )}
            <ol className="relative space-y-3 border-l border-line pl-4">
              {hist.history.map((h: any, i: number) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-ink-3 ring-2 ring-surface" />
                  <div className="font-medium">{label(h.status)}</div>
                  <div className="text-meta text-ink-2">
                    {fmtDateTime(h.at)}
                    {h.by?.name ? ` · ${h.by.name}` : h.source ? ` · ${label(h.source)}` : ''}
                  </div>
                  {h.note && <div className="text-[13px] text-ink-2">{h.note}</div>}
                </li>
              ))}
            </ol>
          </>
        )}
      </Modal>

      {/* Sign Off Daily Review Gate Modal */}
      <Modal
        open={signOffModal}
        onClose={() => setSignOffModal(false)}
        title="Sign Off 9 AM Daily Review Gate"
      >
        <div className="space-y-4">
          <p className="text-[13.5px] text-ink-2">
            Confirm that you have reviewed the pending scripts, shooting checklists, editing versions, and client approvals for today.
          </p>

          <div>
            <label className="label">Review Sign-Off Notes (Optional)</label>
            <textarea
              rows={3}
              value={signOffNotes}
              onChange={(e) => setSignOffNotes(e.target.value)}
              placeholder="e.g. Cleared all V2 edits. Handed off Diwali reel to SMM."
              className="input w-full"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => setSignOffModal(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={signOffMut.isPending}
              icon={<ShieldCheck size={16} />}
              onClick={() => signOffMut.mutate()}
            >
              Confirm Sign-Off
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function Actions({
  a,
  act,
  can,
  tab,
  onHist,
}: {
  a: any;
  act: ReturnType<typeof useClientReviewActions>;
  can: (p: string) => boolean;
  tab: T;
  onHist: () => void;
}) {
  const client = ['CLIENT_SCRIPT', 'CLIENT_FINAL'].includes(a.type) && tab === 'client';
  return (
    <>
      {client && can('approvals.send') && (
        <>
          <Button
            size="sm"
            loading={act.resend.isPending && act.resend.variables === a._id}
            onClick={() => act.resend.mutate(a._id)}
          >
            Resend
          </Button>
          <Button size="sm" icon={<Copy size={14} />} onClick={() => act.copyLink(a._id)}>
            Copy link
          </Button>
        </>
      )}
      <Button size="sm" icon={<History size={14} />} onClick={onHist}>
        History
      </Button>
    </>
  );
}

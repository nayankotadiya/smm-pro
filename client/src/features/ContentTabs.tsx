import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Plus, Trash2, Send, Check, RotateCcw, Copy, Film, Camera as CameraIcon, CalendarClock, ExternalLink, Play, GitCompare, MapPin, Clock, Lock, UserCheck, Calendar, Sparkles } from 'lucide-react';
import { get, post, patch, del, errMsg } from '@/lib/api';
import { useAuth, useCan } from '@/store/auth';
import { toast } from '@/store/ui';
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, Table, Textarea } from '@/components/ui';
import { FileCard, MediaButtons, MediaThumb, UploadButton, VideoReview, useMediaActions, fileIcon } from '@/components/Media';
import { ago, fmtDate, fmtDateTime, fmtSize, fmtTs, label, toLocalInput } from '@/lib/format';
import { useTeam } from '@/hooks/useData';
import { ScriptDiffModal } from './ScriptDiffModal';
import { AiScriptModal } from '@/components/AiScriptModal';

const useInv = () => { const qc = useQueryClient(); return () => { ['content-detail', 'content', 'approvals', 'dashboard', 'tasks', 'scripts'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); }; };
const err = (e: unknown) => toast.error(errMsg(e));

// ---------------------------------------------------------------- Script
function getScriptText(cur: any): string {
  if (!cur) return '';
  if (cur.body) return cur.body;
  if (cur.dialogue) return cur.dialogue;
  const parts: string[] = [];
  if (cur.hook) parts.push(`Hook:\n${cur.hook}`);
  if (cur.scenes?.length) {
    cur.scenes.forEach((s: any, i: number) => {
      const sp: string[] = [];
      if (s.title) sp.push(`--- ${s.title} ---`);
      else sp.push(`--- Scene ${i + 1} ---`);
      if (s.dialogue) sp.push(s.dialogue);
      if (s.visual) sp.push(`[Visual: ${s.visual}]`);
      parts.push(sp.join('\n'));
    });
  }
  if (cur.cta) parts.push(`CTA: ${cur.cta}`);
  return parts.join('\n\n');
}

export function ScriptTab({ d }: { d: any }) {
  const can = useCan(); const inv = useInv(); const me = useAuth((s) => s.user)!;
  const versions: any[] = d.versions; const latest = versions[0];
  const [sel, setSel] = useState<number>(latest?.version || 0);
  const [diffOpen, setDiffOpen] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  useEffect(() => { setSel(latest?.version || 0); }, [latest?.version]);
  const cur = versions.find((v) => v.version === sel) || latest;
  const editable = can('scripts.write') && (!latest || (cur?.version === latest.version && latest.status === 'DRAFT'));
  const [scriptText, setScriptText] = useState('');
  const [changes, setChanges] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setScriptText(getScriptText(cur));
    setChanges(cur?.changes || '');
    setDirty(false);
  }, [cur?._id, cur?.updatedAt]);

  const save = useMutation({
    mutationFn: (forceNew: boolean) => post(`/scripts/${d.script._id}/version`, { dialogue: scriptText, body: scriptText, changes, forceNew }),
    onSuccess: (r) => { toast.success(`Script ${r.label} saved.`); setDirty(false); inv(); },
    onError: err,
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (dirty) await post(`/scripts/${d.script._id}/version`, { dialogue: scriptText, body: scriptText, changes });
      return post(`/scripts/${d.script._id}/submit`);
    },
    onSuccess: () => { toast.success('Script submitted for review.'); inv(); },
    onError: err,
  });

  const pending = d.approvals.find((a: any) => a.type === 'INTERNAL_SCRIPT' && a.status === 'PENDING');
  const canReview = pending && (can('scripts.review') || can('approvals.review') || pending.reviewerId?._id === me._id);
  const ro = !editable;

  const wordCount = useMemo(() => {
    const trimmed = scriptText.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [scriptText]);

  const charCount = scriptText.length;
  const estSeconds = Math.round(wordCount / 2.5);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
      <div className="space-y-4">
        {canReview && <ReviewBar approval={pending} title={`${pending.version} is waiting for your review`} />}
        {cur?.status === 'CHANGES_REQUESTED' && cur.reviewNote && <div className="rounded border border-warning/30 bg-warning-soft p-3 text-[13px]"><b>Changes requested by {cur.reviewedBy?.name}:</b> {cur.reviewNote}</div>}
        <Card title={<span className="flex items-center gap-2">{cur ? `Script ${cur.label}` : 'New script'}{cur && <Badge status={cur.status} />}{ro && cur && <span className="text-meta font-normal text-ink-3">Read only</span>}</span>}
          action={can('scripts.write') && <div className="flex flex-wrap items-center gap-2">
            {editable && (
              <Button
                size="sm"
                variant="ghost"
                className="bg-purple-500/10 text-purple-600 dark:text-purple-300 hover:bg-purple-500/20 border border-purple-500/30 font-semibold"
                icon={<Sparkles size={14} className="text-purple-500 animate-pulse" />}
                onClick={() => setAiModalOpen(true)}
              >
                ✨ AI Ideas (Optional)
              </Button>
            )}
            {editable && <Button size="sm" onClick={() => save.mutate(false)} loading={save.isPending} disabled={!dirty && !!latest}>Save draft</Button>}
            {editable && <Button size="sm" variant="primary" icon={<Send size={14} />} onClick={() => submit.mutate()} loading={submit.isPending} disabled={!scriptText.trim()}>Submit for review</Button>}
            {latest && latest.status !== 'DRAFT' && latest.status !== 'SUBMITTED' && cur?.version === latest.version && <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => save.mutate(true)} loading={save.isPending}>Create V{latest.version + 1}</Button>}
          </div>}>
          <div className="space-y-4">
            <div>
              <Textarea
                rows={16}
                value={scriptText}
                disabled={ro}
                onChange={(e) => {
                  setScriptText(e.target.value);
                  setDirty(true);
                }}
                placeholder="Write your complete script here... (dialogue, voiceover, hooks, cues, and notes)"
                className="min-h-[380px] w-full resize-y font-normal text-[14.5px] leading-relaxed"
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-meta text-ink-3">
                <div className="flex items-center gap-2.5">
                  <span>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
                  <span>·</span>
                  <span>{charCount} characters</span>
                  <span>·</span>
                  <span>~{estSeconds}s voiceover {estSeconds >= 60 ? `(${Math.floor(estSeconds / 60)}m ${estSeconds % 60}s)` : ''}</span>
                </div>
                {dirty && <span className="font-semibold text-warning-ink">● Unsaved changes</span>}
              </div>
            </div>

            {editable && latest && latest.version > 1 && (
              <div className="border-t border-line/60 pt-3">
                <Field label="What changed in this version (optional)" hint="Notes to let reviewers quickly see what you updated">
                  <Input
                    value={changes}
                    onChange={(e) => {
                      setChanges(e.target.value);
                      setDirty(true);
                    }}
                    placeholder="e.g. Revised intro hook, trimmed dialogue"
                  />
                </Field>
              </div>
            )}
          </div>
        </Card>
      </div>
      <Card
        title="Versions"
        pad={false}
        action={
          versions.length > 1 && (
            <Button
              size="sm"
              variant="ghost"
              icon={<GitCompare size={14} className="text-primary-ink" />}
              onClick={() => setDiffOpen(true)}
            >
              Compare
            </Button>
          )
        }
      >
        {!versions.length ? <Empty title="No versions yet" hint="Earlier versions are always kept." /> : <ul className="divide-y divide-line">{versions.map((x) => (
          <li key={x._id}><button onClick={() => setSel(x.version)} className={clsx('block w-full px-4 py-2.5 text-left transition-colors duration-150', sel === x.version ? 'bg-primary-soft' : 'hover:bg-surface-2')}>
            <div className="flex items-center justify-between"><span className="font-semibold text-ink">{x.label}{x.approvalState === 'CLIENT_APPROVED' && ' · Final'}</span><Badge status={x.status} /></div>
            <div className="text-meta font-medium text-ink-2">{x.createdBy?.name} · {fmtDateTime(x.createdAt)}</div>{x.changes && <div className="mt-0.5 text-meta text-ink-2">{x.changes}</div>}
          </button></li>))}</ul>}
      </Card>
      <ScriptDiffModal
        open={diffOpen}
        onClose={() => setDiffOpen(false)}
        versions={versions}
      />
      <AiScriptModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        content={d.content}
        currentScriptText={scriptText}
        onInsertScript={(text) => {
          setScriptText(text);
          setDirty(true);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- Review actions (internal)
export function ReviewBar({ approval, title, mediaId }: { approval: any; title: string; mediaId?: string }) {
  const inv = useInv(); const [open, setOpen] = useState(false); const [note, setNote] = useState(''); const [comments, setComments] = useState<any[]>([]);
  const m = useMutation({ mutationFn: (b: any) => post(`/approvals/${approval._id}/review`, b), onSuccess: (_r, b) => { toast.success(b.decision === 'APPROVE' ? 'Approved.' : 'Changes request created.'); setOpen(false); setNote(''); setComments([]); inv(); }, onError: err });
  return (
    <div className="animate-rise rounded-2xl border border-primary/40 bg-gradient-to-r from-primary/20 via-purple-500/15 to-pink-500/10 p-4 shadow-[0_8px_32px_rgba(139,92,246,0.22)] backdrop-blur-2xl sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-[15px] font-bold text-ink">{title}</div><div className="text-meta font-medium text-ink-2">Submitted {ago(approval.sentAt || approval.createdAt)}{approval.createdBy?.name ? ` by ${approval.createdBy.name}` : ''}</div></div>
        <div className="flex gap-2.5"><Button icon={<RotateCcw size={15} />} onClick={() => setOpen(true)}>Request changes</Button><Button variant="primary" icon={<Check size={15} />} loading={m.isPending && !open} onClick={() => m.mutate({ decision: 'APPROVE' })}>Approve</Button></div></div>
      <Modal open={open} onClose={() => setOpen(false)} title={`Request changes — ${approval.version}`} wide={!!mediaId} footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={m.isPending} disabled={!note.trim() && !comments.length} onClick={() => m.mutate({ decision: 'CHANGES', note: note.trim() || undefined, comments })}>Send change request</Button></>}>
        {mediaId && <div className="mb-4"><VideoReview mediaId={mediaId} pending={comments} onPendingChange={setComments} /></div>}
        <Field label={mediaId ? 'Overall note (optional if you added timestamp comments)' : 'What needs to change?'} hint="A revision task is created and assigned automatically."><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} autoFocus={!mediaId} /></Field>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------- Shooting
const CHECK: [string, string][] = [['locationConfirmed', 'Location confirmed'], ['talentConfirmed', 'Talent confirmed'], ['productReady', 'Product ready'], ['equipmentReady', 'Equipment ready'], ['shotListReady', 'Shot list ready'], ['rawUploaded', 'Raw footage uploaded']];
export function ShootingTab({ d }: { d: any }) {
  const inv = useInv();
  const a = useMediaActions();
  const c = d.content;
  const s = d.shoot;
  const me = useAuth((s) => s.user);
  const team = useTeam();
  const reached = d.stages.indexOf(c.stage) >= d.stages.indexOf('SHOOTING');

  const canManageShoot = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TEAM_LEAD', 'SMM'].includes(me?.role || '');
  const isShooter = me?.role === 'SHOOTER';

  const teamList = team.data || [];
  const shootersList = teamList.filter((u: any) => u.role === 'SHOOTER');
  const shooterChoices = shootersList.length ? shootersList : teamList;

  const [v, setV] = useState<any>({});
  useEffect(() => {
    setV({
      shooterId: s?.shooterId?._id || s?.shooterId || c.assignedShooter?._id || c.assignedShooter || '',
      shootDate: s?.shootDate ? toLocalInput(s.shootDate).slice(0, 10) : '',
      shootTime: s?.shootTime || '',
      location: s?.location || '',
      talent: s?.talent || '',
      product: s?.product || '',
      props: s?.props || '',
      shotList: s?.shotList || '',
      instructions: s?.instructions || '',
      beforeShootRemarks: s?.beforeShootRemarks || '',
      afterShootRemarks: s?.afterShootRemarks || '',
    });
  }, [s?._id, s?.updatedAt, c.assignedShooter]);

  const save = useMutation({
    mutationFn: (b: any) => patch(`/content/${c._id}/shoot`, b),
    onSuccess: () => {
      inv();
      toast.success('Shoot plan saved & shooter notified!');
    },
    onError: err,
  });

  const delShoot = useMutation({
    mutationFn: () => del(`/content/${c._id}/shoot`),
    onSuccess: () => {
      inv();
      toast.success('Shoot details removed.');
    },
    onError: err,
  });

  const saveChecklist = useMutation({
    mutationFn: (chk: any) => patch(`/content/${c._id}/shoot`, { checklist: chk }),
    onSuccess: () => inv(),
    onError: err,
  });

  const raws = d.media.filter((m: any) => m.category === 'RAW');
  if (!reached) {
    return (
      <Card>
        <Empty
          icon={<CameraIcon size={22} />}
          title="Shooting starts after the script is approved"
          hint="Manager or SMM will schedule the shoot date, time, location & shooter once the script is approved."
        />
      </Card>
    );
  }

  const set = (k: string) => (e: any) => setV((x: any) => ({ ...x, [k]: e.target.value }));
  const isScheduled = !!(s?.shootDate || s?.location);
  const currentShooterName = c.assignedShooter?.name || s?.shooterId?.name || 'Unassigned';

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        {canManageShoot ? (
          /* Manager / SMM Shoot Scheduler Mode */
          <Card
            title={
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <CameraIcon size={18} className="text-primary" />
                  Shoot Plan & Call Sheet
                  <Badge status={s?.status || (s?.shootDate ? 'SCHEDULED' : 'PENDING')} />
                </span>
                <span className="text-[11.5px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                  <UserCheck size={12} /> Manager / SMM Mode
                </span>
              </div>
            }
            action={
              <div className="flex items-center gap-2">
                {(me?.role === 'SUPER_ADMIN' || me?.role === 'MANAGER') && s && (
                  <Button
                    size="sm"
                    variant="danger"
                    loading={delShoot.isPending}
                    onClick={() => {
                      if (window.confirm('Delete and reset shoot details?')) {
                        delShoot.mutate();
                      }
                    }}
                  >
                    Delete Shoot
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="primary"
                  loading={save.isPending}
                  onClick={() =>
                    save.mutate({
                      ...v,
                      shootDate: v.shootDate ? new Date(v.shootDate).toISOString() : null,
                    })
                  }
                >
                  Save & Schedule Shoot
                </Button>
              </div>
            }
          >
            <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3 text-[12.5px] text-primary-ink flex items-center gap-2">
              <span>👑 <b>Manager / SMM:</b> Assign the shooter, shoot date, time, location & instructions below. Shooters cannot alter or set these details themselves.</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Assigned Shooter" hint="Manager/SMM selects who shoots this piece">
                  <select
                    value={v.shooterId || ''}
                    onChange={set('shooterId')}
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-semibold text-ink focus:border-primary focus:outline-hidden"
                  >
                    <option value="">-- Choose Shooter --</option>
                    {shooterChoices.map((u: any) => (
                      <option key={u._id} value={u._id}>
                        {u.name} ({u.role}{u.title ? ` · ${u.title}` : ''})
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Shoot date"><Input type="date" value={v.shootDate || ''} onChange={set('shootDate')} /></Field>
              <Field label="Shoot time"><Input type="time" value={v.shootTime || ''} onChange={set('shootTime')} /></Field>
              <div className="sm:col-span-2">
                <Field label="Shoot Location" hint="Specific studio, address, or client premises">
                  <Input value={v.location || ''} onChange={set('location')} placeholder="e.g. Studio A, Bodakdev / Client Showroom" />
                </Field>
              </div>
              <Field label="Talent / Models"><Input value={v.talent || ''} onChange={set('talent')} placeholder="e.g. 2 Female models, Voiceover artist" /></Field>
              <Field label="Product"><Input value={v.product || ''} onChange={set('product')} placeholder="e.g. Diamond ring sample, 3 necklace variants" /></Field>
              <div className="sm:col-span-2">
                <Field label="Props"><Input value={v.props || ''} onChange={set('props')} placeholder="e.g. Velvet display stands, LED ring light" /></Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Shot list"><Textarea rows={4} value={v.shotList || ''} onChange={set('shotList')} placeholder="e.g. 1. Macro close-up of ring (10s)&#10;2. Model wearing necklace (15s)..." /></Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Creative Instructions"><Textarea rows={3} value={v.instructions || ''} onChange={set('instructions')} placeholder="e.g. Shoot in 4K 60fps, 9:16 vertical only, warm lighting..." /></Field>
              </div>
              <div className="sm:col-span-2 rounded-xl border border-line/60 bg-surface-2/40 p-3 space-y-3">
                <Field label="⚡ Pre-Shoot Notes" hint="Prep requirements, doubts, or notes before heading to shoot">
                  <Textarea rows={2} value={v.beforeShootRemarks || ''} onChange={set('beforeShootRemarks')} placeholder="e.g. Ensure gimbal battery charged, client wants 9:16 vertical only..." />
                </Field>
                <Field label="🎬 Post-Shoot Notes" hint="What was covered, lighting/audio notes, retake requirements">
                  <Textarea rows={2} value={v.afterShootRemarks || ''} onChange={set('afterShootRemarks')} placeholder="e.g. Completed 4 scenes, lighting was good, client was happy..." />
                </Field>
              </div>
            </div>
          </Card>
        ) : (
          /* Shooter View-Only Call Sheet */
          <Card
            title={
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <CameraIcon size={18} className="text-primary" />
                  Official Shoot Call Sheet
                  <Badge status={s?.status || (isScheduled ? 'SCHEDULED' : 'PENDING')} />
                </span>
                <span className="text-[11.5px] font-semibold text-slate-500 dark:text-slate-400 bg-surface-2 px-2.5 py-0.5 rounded-full border border-line/60 flex items-center gap-1">
                  <Lock size={12} /> Shooter (View Only)
                </span>
              </div>
            }
          >
            {!isScheduled ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-[14px]">
                  <Clock size={16} className="text-amber-600 dark:text-amber-400" />
                  Shoot Schedule Pending
                </div>
                <p className="text-[12.5px] leading-relaxed opacity-95">
                  Script has been approved! Your <b>Manager or SMM</b> will assign the shoot date, time, location, and instructions for you. You will be notified automatically once confirmed.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {/* Date & Time */}
                  <div className="rounded-xl border border-line/70 bg-surface-2/40 p-3.5 space-y-1">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <CalendarClock size={14} className="text-primary" />
                      Shoot Date & Time
                    </div>
                    <div className="text-[15px] font-bold text-ink">
                      {s?.shootDate ? fmtDate(s.shootDate) : 'Date TBD'}
                      {s?.shootTime ? ` @ ${s.shootTime}` : ''}
                    </div>
                  </div>

                  {/* Location with Google Maps shortcut */}
                  <div className="rounded-xl border border-line/70 bg-surface-2/40 p-3.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <MapPin size={14} className="text-rose-500" />
                        Shoot Location
                      </div>
                      {s?.location && (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.location)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1"
                        >
                          Open Maps <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                    <div className="text-[14px] font-semibold text-ink">
                      {s?.location || 'Location not specified'}
                    </div>
                  </div>

                  {/* Talent */}
                  <div className="rounded-xl border border-line/70 bg-surface-2/40 p-3.5 space-y-1">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Talent / Models
                    </div>
                    <div className="text-[13.5px] font-medium text-ink">
                      {s?.talent || 'None specified'}
                    </div>
                  </div>

                  {/* Product */}
                  <div className="rounded-xl border border-line/70 bg-surface-2/40 p-3.5 space-y-1">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Product
                    </div>
                    <div className="text-[13.5px] font-medium text-ink">
                      {s?.product || 'None specified'}
                    </div>
                  </div>

                  {/* Props */}
                  {s?.props && (
                    <div className="sm:col-span-2 rounded-xl border border-line/70 bg-surface-2/40 p-3.5 space-y-1">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Props
                      </div>
                      <div className="text-[13.5px] font-medium text-ink">
                        {s.props}
                      </div>
                    </div>
                  )}

                  {/* Shot List */}
                  {s?.shotList && (
                    <div className="sm:col-span-2 rounded-xl border border-line/70 bg-surface-2/40 p-3.5 space-y-1.5">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Shot List
                      </div>
                      <pre className="whitespace-pre-wrap font-sans text-[13px] text-ink leading-relaxed">
                        {s.shotList}
                      </pre>
                    </div>
                  )}

                  {/* Creative Instructions */}
                  {s?.instructions && (
                    <div className="sm:col-span-2 rounded-xl border border-line/70 bg-surface-2/40 p-3.5 space-y-1.5">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Creative Instructions
                      </div>
                      <pre className="whitespace-pre-wrap font-sans text-[13px] text-ink leading-relaxed">
                        {s.instructions}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Security / Role Notice */}
                <div className="rounded-xl border border-line/60 bg-surface-2/30 p-3 text-[12px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <Lock size={14} className="shrink-0 text-slate-400" />
                  <span>Shoot date, time, and location are assigned exclusively by Manager & SMM. Shooters cannot alter these. To request changes, coordinate with your manager in Chat.</span>
                </div>
              </div>
            )}
          </Card>
        )}

        <Card title="Raw footage" action={<UploadButton label="Upload raw video" category="RAW" contentId={c._id} accept="video/*" camera icon={<Film size={15} />} />}>
          {!raws.length ? <Empty title="No raw footage yet" hint="Uploading notifies the editor, creates the editing task and moves the content forward." /> : <VersionList items={raws} a={a} />}
        </Card>
        <Card title="Reference files" action={<UploadButton label="Add reference" category="REFERENCE" contentId={c._id} variant="secondary" />}>
          {!d.media.some((m: any) => m.category === 'REFERENCE') ? <p className="text-ink-3">No reference files.</p> : <div className="grid gap-3 md:grid-cols-2">{d.media.filter((m: any) => m.category === 'REFERENCE').map((m: any) => <FileCard key={m._id} m={m} a={a} />)}</div>}
        </Card>
      </div>
      <div className="space-y-5">
        <Card title="Checklist">
          <ul className="space-y-2.5">
            {CHECK.map(([k, l]) => (
              <li key={k}>
                <label className="flex min-h-[28px] items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded accent-primary"
                    checked={!!s?.checklist?.[k]}
                    disabled={k === 'rawUploaded' || saveChecklist.isPending}
                    onChange={(e) => saveChecklist.mutate({ [k]: e.target.checked })}
                  />
                  <span className={s?.checklist?.[k] ? 'text-ink-2 line-through' : 'text-ink font-medium text-[13px]'}>
                    {l}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-line pt-3 text-[13px]">
            <div className="text-ink-2">Assigned Shooter</div>
            <div className="font-semibold text-ink flex items-center gap-1.5 mt-0.5">
              <CameraIcon size={14} className="text-primary" />
              {currentShooterName}
            </div>
          </div>
        </Card>
        <ShooterRemarkBox contentId={c._id} shoot={s} onSaved={inv} />
      </div>
      {a.modal}
    </div>
  );
}

/** Shooter remark / complaint box with BEFORE & AFTER shoot separation */
function ShooterRemarkBox({ contentId, shoot, onSaved }: { contentId: string; shoot: any; onSaved: () => void }) {
  const [stage, setStage] = useState<'BEFORE' | 'AFTER'>('BEFORE');
  const [text, setText] = useState('');
  const save = useMutation({
    mutationFn: () => post(`/content/${contentId}/shoot/remark`, { text: text.trim(), stage }),
    onSuccess: () => {
      toast.success(`${stage === 'BEFORE' ? 'Pre-shoot' : 'Post-shoot'} remark recorded.`);
      setText('');
      onSaved();
    },
    onError: err,
  });
  const remarks: any[] = shoot?.remarks || [];
  const beforeList = remarks.filter((r: any) => r.stage !== 'AFTER');
  const afterList = remarks.filter((r: any) => r.stage === 'AFTER');
  const activeList = stage === 'BEFORE' ? beforeList : afterList;

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          Shooter Remarks
          {remarks.length > 0 && <span className="rounded-full bg-surface-3 px-2 py-0.5 text-meta font-bold tabular">{remarks.length}</span>}
        </span>
      }
      pad={false}
    >
      {/* Before / After Shoot Switcher Tabs */}
      <div className="flex border-b border-line/60 bg-surface-2/30 p-1.5 gap-1.5">
        <button
          type="button"
          onClick={() => setStage('BEFORE')}
          className={clsx(
            'flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12.5px] font-bold transition-all duration-150',
            stage === 'BEFORE'
              ? 'bg-surface text-primary-ink shadow-xs ring-1 ring-line/70'
              : 'text-ink-2 hover:text-ink'
          )}
        >
          <span>⚡ Before Shoot</span>
          {beforeList.length > 0 && (
            <span className={clsx('rounded-full px-1.5 text-[10.5px] font-bold', stage === 'BEFORE' ? 'bg-primary-soft text-primary-ink' : 'bg-surface-3 text-ink-2')}>
              {beforeList.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setStage('AFTER')}
          className={clsx(
            'flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12.5px] font-bold transition-all duration-150',
            stage === 'AFTER'
              ? 'bg-surface text-emerald-600 dark:text-emerald-400 shadow-xs ring-1 ring-line/70'
              : 'text-ink-2 hover:text-ink'
          )}
        >
          <span>🎬 After Shoot</span>
          {afterList.length > 0 && (
            <span className={clsx('rounded-full px-1.5 text-[10.5px] font-bold', stage === 'AFTER' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-surface-3 text-ink-2')}>
              {afterList.length}
            </span>
          )}
        </button>
      </div>

      <div className="p-4 space-y-3.5">
        {/* Remarks List for current phase */}
        {activeList.length > 0 ? (
          <ul className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
            {[...activeList].reverse().map((r: any) => (
              <li key={r._id} className="rounded-xl border border-line/60 bg-surface-2/50 px-3.5 py-2.5 text-[13px]">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={clsx(
                    'rounded px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide uppercase',
                    r.stage === 'AFTER'
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                      : 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300'
                  )}>
                    {r.stage === 'AFTER' ? 'After Shoot' : 'Before Shoot'}
                  </span>
                  <span className="text-meta font-medium text-ink-3 tabular">{ago(r.at)}</span>
                </div>
                <div className="font-medium text-ink whitespace-pre-wrap">{r.text}</div>
                <div className="mt-1 text-meta font-semibold text-ink-3">By {r.byName}</div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed border-line/80 p-3.5 text-center text-meta text-ink-3">
            No {stage === 'BEFORE' ? 'before-shoot' : 'after-shoot'} remarks recorded yet.
          </div>
        )}

        {/* Input form */}
        <div className="border-t border-line/50 pt-3 space-y-2">
          <Field
            label={`Add ${stage === 'BEFORE' ? 'Before-Shoot' : 'After-Shoot'} Remark`}
            hint={stage === 'BEFORE' ? 'Pre-shoot issues, prep notes, or doubts.' : 'Post-shoot feedback, footage details, or complaints.'}
          >
            <Textarea
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={stage === 'BEFORE' ? 'e.g. Client requested extra lighting, props to be brought by team...' : 'e.g. Completed 4 reels, client arrived 30 mins late, battery died once...'}
            />
          </Field>
          <Button
            variant="primary"
            size="sm"
            className="w-full"
            loading={save.isPending}
            disabled={!text.trim()}
            onClick={() => save.mutate()}
          >
            Submit {stage === 'BEFORE' ? 'Before-Shoot' : 'After-Shoot'} Remark
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function VersionList({ items, a }: { items: any[]; a: ReturnType<typeof useMediaActions> }) {
  const sorted = [...items].sort((x, y) => (y.versionNumber || 0) - (x.versionNumber || 0));
  const [latest, ...prev] = sorted;
  const Row = ({ m, top }: { m: any; top?: boolean }) => (
    <div className={clsx('animate-rise overflow-hidden rounded-2xl border transition-[border-color,box-shadow] duration-200', top ? 'border-primary/40 bg-primary-soft/20 shadow-xs' : 'border-line hover:border-line-strong hover:shadow-xs')}>
      {/* Thumbnail */}
      <MediaThumb m={m} size="sm" />
      {/* Meta row */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold text-ink text-[13px]">{m.fileName}</span>
            {top && <Badge t="blue">Latest</Badge>}
            <Badge status={m.status} />
          </div>
          <div className="text-meta font-medium text-ink-2">V{m.versionNumber} · {m.uploadedBy?.name} · {fmtDateTime(m.uploadedAt || m.createdAt)} · {fmtSize(m.size)}</div>
        </div>
        <MediaButtons m={m} a={a} />
      </div>
    </div>
  );
  return (
    <div className="space-y-3">
      <Row m={latest} top />
      {prev.length > 0 && (
        <>
          <div className="pt-1 text-meta font-medium text-ink-2">Previous versions</div>
          {prev.map((m) => <Row key={m._id} m={m} />)}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Editing
export function EditingTab({ d }: { d: any }) {
  const inv = useInv(); const a = useMediaActions(); const can = useCan(); const me = useAuth((s) => s.user)!; const c = d.content;
  const reached = d.stages.indexOf(c.stage) >= d.stages.indexOf('RAW_FOOTAGE');
  const edits = d.media.filter((m: any) => m.category === 'EDIT'); const finals = d.media.filter((m: any) => m.category === 'FINAL'); const thumbs = d.media.filter((m: any) => m.category === 'THUMBNAIL');
  const start = useMutation({ mutationFn: () => post(`/content/${c._id}/start-editing`), onSuccess: () => { toast.success('Editing started.'); inv(); }, onError: err });
  const smm = d.approvals.find((x: any) => x.type === 'SMM' && x.status === 'PENDING'); const fin = d.approvals.find((x: any) => x.type === 'FINAL' && x.status === 'PENDING');
  const canSmm = smm && (can('approvals.review') || smm.reviewerId?._id === me._id); const canFin = fin && (can('approvals.review') || fin.reviewerId?._id === me._id) && me.role !== 'SMM';
  const latest = [...finals, ...edits].sort((x, y) => +new Date(y.createdAt) - +new Date(x.createdAt))[0];
  const open = d.feedback.filter((f: any) => !f.resolved && f.mediaId);
  if (!reached) return <Card><Empty icon={<Film size={22} />} title="Editing starts once raw footage is uploaded" /></Card>;
  return (
    <div className="space-y-5">
      {canSmm && <ReviewBar approval={smm} title={`SMM review required — ${smm.version}`} mediaId={smm.mediaId} />}
      {canFin && <ReviewBar approval={fin} title={`Final review required — ${fin.version}`} mediaId={fin.mediaId} />}
      {c.stage === 'RAW_FOOTAGE' && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4"><div><div className="font-semibold text-ink">Raw footage is ready</div><div className="text-meta text-ink-2">Start editing to let the team know this is in progress.</div></div><Button variant="primary" loading={start.isPending} onClick={() => start.mutate()}>Start editing</Button></div>}
      {latest && <Card title="Review latest version"><VideoReview mediaId={latest._id} /></Card>}
      {open.length > 0 && <Card title={`Open feedback (${open.length})`} pad={false}><ul className="divide-y divide-line">{open.map((f: any) => <li key={f._id} className="flex items-start justify-between gap-3 px-4 py-2.5"><div><div className="flex items-center gap-2 text-meta text-ink-2">{f.timestampSec != null && <span className="rounded bg-inverse px-1.5 py-0.5 font-medium tabular text-inverse-ink">{fmtTs(f.timestampSec)}</span>}{f.version} · {f.authorName}{f.authorType === 'CLIENT' && <Badge t="amber">Client</Badge>}</div><div className="mt-0.5 font-medium text-ink">{f.comment}</div></div><Button size="sm" onClick={() => patch(`/media/feedback/${f._id}`, { resolved: true }).then(inv).catch(err)}>Resolve</Button></li>)}</ul></Card>}
      <Card title="Edit versions" action={<UploadButton label="Upload edit" category="EDIT" contentId={c._id} accept="video/*" icon={<Film size={15} />} />}>{!edits.length ? <Empty title="No edits uploaded yet" hint="Each upload becomes a new version and goes to SMM review automatically." /> : <VersionList items={edits} a={a} />}</Card>
      <Card title="Final video" action={<UploadButton label="Upload final" category="FINAL" contentId={c._id} accept="video/*" variant="secondary" icon={<Film size={15} />} />}>{!finals.length ? <p className="text-ink-3">The final export goes here once the edit is approved.</p> : <VersionList items={finals} a={a} />}</Card>
      <Card title="Thumbnail" action={<UploadButton label="Upload thumbnail" category="THUMBNAIL" contentId={c._id} accept="image/*" variant="secondary" />}>{!thumbs.length ? <p className="text-ink-3">No thumbnail yet.</p> : <VersionList items={thumbs} a={a} />}</Card>
      {a.modal}
    </div>
  );
}

// ---------------------------------------------------------------- Reviews
const OPEN_CLIENT = ['DRAFT', 'SENT', 'DELIVERED', 'OPENED', 'WAITING_FOR_CLIENT'];
export function useClientReviewActions() {
  const inv = useInv();
  const normalizeUrl = (raw: string) => {
    if (!raw) return raw;
    try {
      const u = new URL(raw, window.location.origin);
      return `${window.location.origin}${u.pathname}${u.search}`;
    } catch {
      return raw;
    }
  };
  const copy = async (url: string) => {
    const finalUrl = normalizeUrl(url);
    try { await navigator.clipboard.writeText(finalUrl); toast.success('Review link copied.'); } catch { window.prompt('Copy this link', finalUrl); }
  };
  const send = useMutation({ mutationFn: (b: any) => post('/approvals/send', b), onSuccess: (r) => { toast.success(r.approval.source === 'AISENSY' ? 'Client review sent on WhatsApp.' : 'Review link created. Share it with the client.'); if (r.approval.source !== 'AISENSY') void copy(r.url); inv(); }, onError: err });
  const resend = useMutation({ mutationFn: (id: string) => post(`/approvals/${id}/resend`), onSuccess: (r) => { toast.success('New review link sent. The old link no longer works.'); if (r.approval.source !== 'AISENSY') void copy(r.url); inv(); }, onError: err });
  const cancel = useMutation({ mutationFn: (id: string) => post(`/approvals/${id}/cancel`), onSuccess: () => { toast.success('Review cancelled.'); inv(); }, onError: err });
  const copyLink = (id: string) => get(`/approvals/${id}/link`).then((r) => copy(r.url)).catch(err);
  return { send, resend, cancel, copyLink };
}
export function ClientTracking({ a }: { a: any }) {
  const steps: [string, any][] = [['Sent', a.sentAt], ['Delivered', a.deliveredAt], ['Opened', a.openedAt], [a.status === 'CHANGES_REQUESTED' ? 'Changes requested' : 'Approved', a.decidedAt]];
  return <ol className="grid grid-cols-4 gap-2">{steps.map(([l, at]) => <li key={l} className={clsx('rounded border px-2 py-1.5 transition-colors duration-500', at ? 'border-primary/30 bg-primary-soft/50' : 'border-line')}><div className="text-meta text-ink-2">{l}</div><div className="text-[13px] font-semibold tabular text-ink">{at ? fmtDateTime(at) : '—'}</div></li>)}</ol>;
}
export function ReviewsTab({ d }: { d: any }) {
  const can = useCan(); const me = useAuth((s) => s.user)!; const c = d.content; const act = useClientReviewActions();
  const [sendOpen, setSendOpen] = useState<null | 'SCRIPT' | 'FINAL'>(null);
  const kind: 'SCRIPT' | 'FINAL' | null = c.stage === 'CLIENT_REVIEW' ? 'SCRIPT' : c.stage === 'CLIENT_FINAL_APPROVAL' ? 'FINAL' : null;
  const openClient = d.approvals.find((a: any) => ['CLIENT_SCRIPT', 'CLIENT_FINAL'].includes(a.type) && OPEN_CLIENT.includes(a.status));
  const pendings = d.approvals.filter((a: any) => a.status === 'PENDING' && (can('approvals.review') || can('scripts.review') || a.reviewerId?._id === me._id));
  const groups = useMemo(() => { const g: Record<string, any[]> = { Script: [], Edit: [], 'Client review': [] }; d.approvals.forEach((a: any) => { (a.type === 'INTERNAL_SCRIPT' ? g.Script : ['SMM', 'FINAL'].includes(a.type) ? g.Edit : g['Client review']).push(a); }); return g; }, [d.approvals]);
  return (
    <div className="space-y-5">
      {pendings.map((a: any) => <ReviewBar key={a._id} approval={a} title={`${label(a.type)} — ${a.version}`} mediaId={a.mediaId} />)}
      {kind && !openClient && can('approvals.send') && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary-soft p-4"><div><div className="font-semibold text-ink">Ready for client {kind === 'SCRIPT' ? 'script review' : 'final approval'}</div><div className="text-meta text-ink-2">Creates a secure one-time link and sends it to the client on WhatsApp.</div></div><Button variant="primary" icon={<Send size={15} />} onClick={() => setSendOpen(kind)}>Send for client review</Button></div>}
      {openClient && <Card title={<span className="flex items-center gap-2">Client review — {openClient.version}<Badge status={openClient.status} /></span>} action={can('approvals.send') && <div className="flex flex-wrap gap-1.5"><Button size="sm" icon={<Copy size={14} />} onClick={() => act.copyLink(openClient._id)}>Copy link</Button><Button size="sm" loading={act.resend.isPending} onClick={() => act.resend.mutate(openClient._id)}>Resend</Button><Button size="sm" variant="danger" onClick={() => confirm('Cancel this client review? The link will stop working.') && act.cancel.mutate(openClient._id)}>Cancel</Button></div>}>
        <ClientTracking a={openClient} />
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-ink-2"><span>Source: <b className="text-ink">{label(openClient.source)}</b></span><span>To: <b className="text-ink">{openClient.recipientName}{openClient.recipientPhone ? ` · ${openClient.recipientPhone}` : ''}</b></span><span>Expires: <b className="text-ink">{fmtDateTime(openClient.expiresAt)}</b></span></div>
        {openClient.sendError && <p className="mt-2 rounded bg-warning-soft px-3 py-2 text-[13px] text-warning-ink">WhatsApp message was not sent ({openClient.sendError}). Copy the link and share it manually.</p>}
        <p className="mt-3 text-meta text-ink-3">If the client replies on WhatsApp instead of using the link, record it from the client's Communication tab and choose Mark Approved or Create Change Request.</p>
      </Card>}
      <Card title="Approval history">
        {!d.approvals.length ? <Empty title="No reviews yet" /> : <div className="grid gap-5 md:grid-cols-3">{Object.entries(groups).map(([g, list]) => (
          <div key={g}><div className="mb-2 text-meta font-semibold uppercase tracking-wide text-ink-2">{g}</div>
            {!list.length ? <p className="text-meta text-ink-3">Nothing yet</p> : <ol className="relative space-y-3 border-l border-line pl-4">{list.flatMap((a: any) => [{ head: true, a }, ...a.history.map((h: any) => ({ h, a }))]).map((x: any, i: number) => x.head ? <li key={`h${i}`} className="pt-1 text-[13px] font-semibold text-ink">{x.a.version}{x.a.type === 'SMM' ? ' · SMM' : x.a.type === 'FINAL' ? ' · Final' : ''}</li> : (
              <li key={i} className="relative"><span className={clsx('absolute -left-[21px] top-1.5 h-2 w-2 rounded-full ring-2 ring-surface', x.h.status === 'APPROVED' ? 'bg-success' : x.h.status === 'CHANGES_REQUESTED' ? 'bg-danger' : 'bg-ink-3')} /><div className="text-[13px] font-semibold text-ink">{label(x.h.status)}</div><div className="text-meta text-ink-2">{fmtDateTime(x.h.at)}{x.h.by?.name ? ` · ${x.h.by.name}` : x.h.source === 'LINK' ? ' · Client' : x.h.source ? ` · ${label(x.h.source)}` : ''}</div>{x.h.note && <div className="text-meta font-medium text-ink">{x.h.note}</div>}</li>))}</ol>}
          </div>))}</div>}
      </Card>
      <Card title="Feedback" pad={false}>{!d.feedback.length ? <Empty title="No feedback recorded" /> : <ul className="divide-y divide-line">{d.feedback.map((f: any) => <li key={f._id} className="px-4 py-2.5"><div className="flex flex-wrap items-center gap-2 text-meta text-ink-2">{f.timestampSec != null && <span className="rounded bg-inverse px-1.5 py-0.5 font-medium tabular text-inverse-ink">{fmtTs(f.timestampSec)}</span>}<span>{f.version}</span><span>{f.authorName}</span>{f.authorType === 'CLIENT' && <Badge t="amber">Client</Badge>}<span>{ago(f.createdAt)}</span>{f.resolved && <Badge t="green">Resolved</Badge>}</div><div className="mt-0.5">{f.comment}</div></li>)}</ul>}</Card>
      <SendClientReview open={!!sendOpen} kind={sendOpen || 'FINAL'} d={d} onClose={() => setSendOpen(null)} send={act.send} />
    </div>
  );
}
function SendClientReview({ open, onClose, kind, d, send }: { open: boolean; onClose: () => void; kind: 'SCRIPT' | 'FINAL'; d: any; send: any }) {
  const cl = d.content.clientId; const [phone, setPhone] = useState(''); const [name, setName] = useState(''); const [wa, setWa] = useState(true);
  useEffect(() => { if (open) { setPhone(cl?.phone || ''); setName(cl?.contactPerson || cl?.name || ''); setWa(true); } }, [open]); // eslint-disable-line
  return (
    <Modal open={open} onClose={onClose} title="Send for client review" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={send.isPending} onClick={() => send.mutate({ contentId: d.content._id, kind, phone: phone || undefined, recipientName: name || undefined, sendWhatsApp: wa }, { onSuccess: onClose })}>Send</Button></>}>
      <div className="space-y-3">
        <p className="text-ink-2">The client receives a secure link showing only <b className="text-ink">{d.content.title}</b> ({kind === 'SCRIPT' ? 'script' : 'video'}). No login is needed and the link stops working after their decision.</p>
        <Field label="Contact name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="WhatsApp number" hint="With country code, e.g. 919876543210"><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></Field>
        <label className="flex items-center gap-2"><input type="checkbox" checked={wa} onChange={(e) => setWa(e.target.checked)} /> Send on WhatsApp via AiSensy</label>
        <p className="text-meta text-ink-3">If WhatsApp is not connected or sending fails, the link is copied so you can share it yourself.</p>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Files
const FILE_GROUPS: [string, string[]][] = [['Raw footage', ['RAW']], ['Edit versions', ['EDIT']], ['Final', ['FINAL']], ['Thumbnails & images', ['THUMBNAIL', 'IMAGE']], ['Documents & references', ['DOCUMENT', 'REFERENCE', 'AUDIO', 'BRAND_ASSET']], ['Shared in chat', ['CHAT']]];
export function FilesTab({ d }: { d: any }) {
  const a = useMediaActions(); const [cat, setCat] = useState('DOCUMENT');
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2"><Select value={cat} onChange={(e) => setCat(e.target.value)} className="!w-auto" aria-label="File type">{['DOCUMENT', 'REFERENCE', 'IMAGE', 'AUDIO'].map((x) => <option key={x} value={x}>{label(x)}</option>)}</Select><UploadButton label="Upload file" category={cat} contentId={d.content._id} camera={cat === 'IMAGE'} />{d.content.driveFolderId && <a className="link ml-auto flex items-center gap-1 text-[13px]" target="_blank" rel="noopener noreferrer" href={`https://drive.google.com/drive/folders/${d.content.driveFolderId}`}>Open Drive folder<ExternalLink size={13} /></a>}</div>
      {!d.media.length && <Card><Empty title="No files yet" hint="Files are named and filed in Google Drive automatically." /></Card>}
      {FILE_GROUPS.map(([title, cats]) => { const items = d.media.filter((m: any) => cats.includes(m.category)); if (!items.length) return null; const versioned = ['RAW', 'EDIT', 'FINAL'].includes(cats[0]);
        return <Card key={title} title={`${title} (${items.length})`}>{versioned ? <VersionList items={items} a={a} /> : <div className="grid gap-3 md:grid-cols-2">{items.map((m: any) => <FileCard key={m._id} m={m} a={a} />)}</div>}</Card>; })}
      {a.modal}
    </div>
  );
}

// ---------------------------------------------------------------- Schedule
export function ScheduleTab({ d }: { d: any }) {
  const inv = useInv(); const can = useCan(); const c = d.content; const post0 = d.posts.find((p: any) => p.status === 'SCHEDULED');
  const [v, setV] = useState({ scheduledAt: '', caption: '', hashtags: '' }); const [url, setUrl] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  useEffect(() => { setV({ scheduledAt: toLocalInput(post0?.scheduledAt || c.scheduledAt), caption: c.caption || '', hashtags: c.hashtags || '' }); }, [c._id, c.updatedAt]); // eslint-disable-line
  const sched = useMutation({ mutationFn: () => post(`/content/${c._id}/schedule`, { ...v, scheduledAt: new Date(v.scheduledAt).toISOString() }), onSuccess: () => { toast.success('Post scheduled.'); inv(); }, onError: err });
  const meta = useMutation({ mutationFn: () => patch(`/content/${c._id}`, { caption: v.caption, hashtags: v.hashtags }), onSuccess: () => { toast.success('Caption saved.'); inv(); }, onError: err });
  const pub = useMutation({ mutationFn: (b: any) => post(`/content/${c._id}/publish`, b), onSuccess: (_r, b) => { toast.success(b.failed ? 'Marked as failed.' : 'Marked as published.'); inv(); }, onError: err });
  const ready = ['SCHEDULE', 'PUBLISHED'].includes(c.stage); const w = can('content.write');
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card
        title="Caption and hashtags"
        action={
          w && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="bg-purple-500/10 text-purple-600 dark:text-purple-300 hover:bg-purple-500/20 border border-purple-500/30 font-semibold"
                icon={<Sparkles size={13} className="text-purple-500" />}
                loading={aiLoading}
                onClick={async () => {
                  setAiLoading(true);
                  try {
                    const res = await post<any>('/ai/generate-caption', {
                      title: c.title,
                      script: d.script?.dialogue || d.script?.body,
                      niche: c.clientId?.industry || c.clientId?.name,
                    });
                    setV((prev) => ({
                      ...prev,
                      caption: res.caption || prev.caption,
                      hashtags: (res.hashtags || []).join(' ') || prev.hashtags,
                    }));
                    toast.success('AI caption & hashtags generated!');
                  } catch (e) {
                    toast.error(errMsg(e));
                  } finally {
                    setAiLoading(false);
                  }
                }}
              >
                ✨ AI Caption (Optional)
              </Button>
              <Button size="sm" onClick={() => meta.mutate()} loading={meta.isPending}>Save</Button>
            </div>
          )
        }
      >
        <div className="space-y-3"><Field label="Caption"><Textarea rows={5} value={v.caption} disabled={!w} onChange={(e) => setV({ ...v, caption: e.target.value })} /></Field><Field label="Hashtags"><Textarea rows={2} value={v.hashtags} disabled={!w} onChange={(e) => setV({ ...v, hashtags: e.target.value })} placeholder="#diwali #jewellery" /></Field></div>
      </Card>
      <div className="space-y-5">
        <Card title={<span className="flex items-center gap-2"><CalendarClock size={16} className="text-ink-2" />Schedule</span>}>
          {c.stage === 'PUBLISHED' ? <div><Badge status="PUBLISHED" /><p className="mt-2">Published {fmtDateTime(c.publishedAt)}</p>{c.publishedUrl && <a href={c.publishedUrl} target="_blank" rel="noopener noreferrer" className="link mt-1 inline-flex items-center gap-1">Open post<ExternalLink size={13} /></a>}</div>
            : !ready ? <Empty title="Not ready to schedule" hint="Scheduling opens after the client's final approval." />
            : <div className="space-y-3"><Field label="Publish date and time"><Input type="datetime-local" value={v.scheduledAt} disabled={!w} onChange={(e) => setV({ ...v, scheduledAt: e.target.value })} /></Field>{w && <Button variant="primary" disabled={!v.scheduledAt} loading={sched.isPending} onClick={() => sched.mutate()}>{post0 ? 'Reschedule' : 'Schedule post'}</Button>}
              {post0 && <p className="text-meta text-ink-2">Scheduled for {fmtDateTime(post0.scheduledAt)}. You will be notified when it is due.</p>}</div>}
        </Card>
        {c.stage === 'SCHEDULE' && w && <Card title="Confirm publishing"><div className="space-y-3"><Field label="Live post URL" hint="Publish on the platform, then paste the link here."><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.instagram.com/reel/..." inputMode="url" /></Field><div className="flex flex-wrap gap-2"><Button variant="primary" loading={pub.isPending} onClick={() => pub.mutate({ publishedUrl: url.trim() })}>Mark as published</Button><Button variant="danger" onClick={() => { const r = prompt('What went wrong?'); if (r) pub.mutate({ failed: true, error: r }); }}>Publishing failed</Button></div></div></Card>}
        {d.posts.length > 0 && <Card title="History" pad={false}><Table head={['When', 'Platform', 'Status']} minWidth={320}>{d.posts.map((p: any) => <tr key={p._id}><td className="td whitespace-nowrap">{fmtDateTime(p.scheduledAt)}</td><td className="td">{label(p.platform)}</td><td className="td"><Badge status={p.status} />{p.status === 'FAILED' && p.error && <span className="ml-2 text-meta text-ink-2">{p.error}</span>}</td></tr>)}</Table></Card>}
      </div>
    </div>
  );
}
export { Play, Link };

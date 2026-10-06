import { useEffect, useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Input, Modal, Select, Textarea, Badge } from './ui';
import { post, patch, errMsg } from '@/lib/api';
import { toast } from '@/store/ui';
import { useClients, useTeam, useContentOptions } from '@/hooks/useData';
import { roleLabel, toLocalInput, fmtSize } from '@/lib/format';
import { useAuth, useCan } from '@/store/auth';
import { startUpload } from '@/lib/upload';
import { Zap, Upload, Film, X } from 'lucide-react';

const contentSchema = z.object({ title: z.string().min(2, 'Give the content a title'), clientId: z.string().min(1, 'Choose a client'), type: z.string(), platform: z.string(), priority: z.string(), deadline: z.string().optional(), description: z.string().optional() });
export function ContentFormModal({ open, onClose, clientId }: { open: boolean; onClose: () => void; clientId?: string }) {
  const clients = useClients(); const qc = useQueryClient(); const nav = useNavigate();
  const f = useForm<z.infer<typeof contentSchema>>({ resolver: zodResolver(contentSchema), defaultValues: { title: '', clientId: clientId || '', type: 'REEL', platform: 'INSTAGRAM', priority: 'MEDIUM' } });
  useEffect(() => { if (open) f.reset({ title: '', clientId: clientId || '', type: 'REEL', platform: 'INSTAGRAM', priority: 'MEDIUM', deadline: '', description: '' }); }, [open]); // eslint-disable-line
  const m = useMutation({ mutationFn: (v: any) => post('/content', { ...v, deadline: v.deadline ? new Date(v.deadline).toISOString() : null }), onSuccess: (c) => { toast.success(`${c.contentId} created.`); qc.invalidateQueries({ queryKey: ['content'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); onClose(); nav(`/content/${c._id}`); }, onError: (e) => toast.error(errMsg(e)) });
  const e = f.formState.errors;
  return (
    <Modal open={open} onClose={onClose} title="New content" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={m.isPending} onClick={f.handleSubmit((v) => m.mutate(v))}>Create content</Button></>}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={f.handleSubmit((v) => m.mutate(v))}>
        <div className="sm:col-span-2"><Field label="Title" error={e.title?.message}><Input {...f.register('title')} placeholder="Diwali Collection Reel" autoFocus /></Field></div>
        <div className="sm:col-span-2"><Field label="Client" error={e.clientId?.message} hint="The client's default team is assigned automatically."><Select {...f.register('clientId')}><option value="">Select client</option>{(clients.data || []).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</Select></Field></div>
        <Field label="Type"><Select {...f.register('type')}>{['REEL', 'POST', 'CAROUSEL', 'STORY', 'VIDEO', 'SHORT', 'AD'].map((t) => <option key={t} value={t}>{roleLabel(t)}</option>)}</Select></Field>
        <Field label="Platform"><Select {...f.register('platform')}>{['INSTAGRAM', 'FACEBOOK', 'YOUTUBE', 'LINKEDIN', 'X', 'MULTI'].map((t) => <option key={t} value={t}>{roleLabel(t)}</option>)}</Select></Field>
        <Field label="Priority"><Select {...f.register('priority')}>{['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((t) => <option key={t} value={t}>{roleLabel(t)}</option>)}</Select></Field>
        <Field label="Deadline"><Input type="datetime-local" {...f.register('deadline')} /></Field>
        <div className="sm:col-span-2"><Field label="Idea / brief"><Textarea {...f.register('description')} placeholder="What is this content about?" /></Field></div>
      </form>
    </Modal>
  );
}

export function TaskFormModal({ open, onClose, contentId, clientId, task }: { open: boolean; onClose: () => void; contentId?: string; clientId?: string; task?: any }) {
  const team = useTeam(); const contents = useContentOptions(); const clients = useClients(); const qc = useQueryClient(); const can = useCan(); const me = useAuth((s) => s.user);
  const init = () => ({ title: task?.title || '', description: task?.description || '', assignedTo: task?.assignedTo?._id || task?.assignedTo || me?._id || '', contentId: task?.contentId?._id || contentId || '', clientId: task?.clientId?._id || clientId || '', priority: task?.priority || 'MEDIUM', dueAt: toLocalInput(task?.dueAt) });
  const [v, setV] = useState(init);
  useEffect(() => { if (open) setV(init()); }, [open, task?._id]); // eslint-disable-line
  const m = useMutation({
    mutationFn: () => { const b = { ...v, assignedTo: v.assignedTo || null, contentId: v.contentId || null, clientId: v.clientId || null, dueAt: v.dueAt ? new Date(v.dueAt).toISOString() : null }; return task ? patch(`/tasks/${task._id}`, b) : post('/tasks', b); },
    onSuccess: () => { toast.success(task ? 'Task updated.' : 'Task created.'); qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); qc.invalidateQueries({ queryKey: ['content-detail'] }); onClose(); }, onError: (e) => toast.error(errMsg(e)),
  });
  const set = (k: string) => (e: any) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Modal open={open} onClose={onClose} title={task ? 'Edit task' : 'New task'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!v.title.trim()} loading={m.isPending} onClick={() => m.mutate()}>{task ? 'Save' : 'Create task'}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="Title"><Input value={v.title} onChange={set('title')} autoFocus /></Field></div>
        <div className="sm:col-span-2"><Field label="Description"><Textarea value={v.description} onChange={set('description')} /></Field></div>
        <Field label="Assigned to"><Select value={v.assignedTo} onChange={set('assignedTo')} disabled={!can('tasks.manage')}><option value="">Unassigned</option>{(team.data || []).map((u) => <option key={u._id} value={u._id}>{u.name} — {roleLabel(u.role)}</option>)}</Select></Field>
        <Field label="Priority"><Select value={v.priority} onChange={set('priority')}>{['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((t) => <option key={t} value={t}>{roleLabel(t)}</option>)}</Select></Field>
        <Field label="Content"><Select value={v.contentId} onChange={set('contentId')}><option value="">None</option>{(contents.data || []).map((c) => <option key={c._id} value={c._id}>{c.contentId} · {c.title}</option>)}</Select></Field>
        <Field label="Client"><Select value={v.clientId} onChange={set('clientId')}><option value="">None</option>{(clients.data || []).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</Select></Field>
        <div className="sm:col-span-2"><Field label="Due date and time"><Input type="datetime-local" value={v.dueAt} onChange={set('dueAt')} /></Field></div>
      </div>
    </Modal>
  );
}

export function ReminderFormModal({ open, onClose, preset }: { open: boolean; onClose: () => void; preset?: { title?: string; contentId?: string; clientId?: string; type?: string; messageId?: string } }) {
  const qc = useQueryClient(); const contents = useContentOptions(); const clients = useClients(); const team = useTeam(); const can = useCan(); const me = useAuth((s) => s.user);
  const tomorrow3 = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(15, 0, 0, 0); return toLocalInput(d); };
  const init = () => ({ title: preset?.title || '', description: '', type: preset?.type || 'PERSONAL', remindAt: tomorrow3(), repeat: 'NONE', priority: 'MEDIUM', contentId: preset?.contentId || '', clientId: preset?.clientId || '', userId: me?._id || '' });
  const [v, setV] = useState(init);
  useEffect(() => { if (open) setV(init()); }, [open]); // eslint-disable-line
  const m = useMutation({
    mutationFn: () => preset?.messageId ? post(`/chat/message/${preset.messageId}/reminder`, { remindAt: new Date(v.remindAt).toISOString(), title: v.title || undefined }) : post('/reminders', { ...v, contentId: v.contentId || null, clientId: v.clientId || null, remindAt: new Date(v.remindAt).toISOString() }),
    onSuccess: () => { toast.success('Reminder created.'); qc.invalidateQueries({ queryKey: ['reminders'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); onClose(); }, onError: (e) => toast.error(errMsg(e)),
  });
  const set = (k: string) => (e: any) => setV((s) => ({ ...s, [k]: e.target.value }));
  const quick = (h: number, at?: number) => { const d = new Date(); if (at != null) { d.setDate(d.getDate() + 1); d.setHours(at, 0, 0, 0); } else d.setTime(d.getTime() + h * 3600e3); setV((s) => ({ ...s, remindAt: toLocalInput(d) })); };
  return (
    <Modal open={open} onClose={onClose} title="New reminder" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!v.remindAt || (!v.title.trim() && !preset?.messageId)} loading={m.isPending} onClick={() => m.mutate()}>Create reminder</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="Title"><Input value={v.title} onChange={set('title')} placeholder="Follow up with client" autoFocus /></Field></div>
        <div className="sm:col-span-2"><Field label="When"><Input type="datetime-local" value={v.remindAt} onChange={set('remindAt')} /></Field>
          <div className="mt-2 flex flex-wrap gap-1.5"><Button size="sm" onClick={() => quick(1)}>In 1 hour</Button><Button size="sm" onClick={() => quick(0, 11)}>Tomorrow 11 AM</Button><Button size="sm" onClick={() => quick(0, 15)}>Tomorrow 3 PM</Button></div></div>
        {!preset?.messageId && <>
          <Field label="Type"><Select value={v.type} onChange={set('type')}>{['PERSONAL', 'TASK', 'CONTENT', 'CLIENT_FOLLOWUP', 'MEETING', 'APPROVAL'].map((t) => <option key={t} value={t}>{roleLabel(t)}</option>)}</Select></Field>
          <Field label="Repeat"><Select value={v.repeat} onChange={set('repeat')}>{['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'].map((t) => <option key={t} value={t}>{roleLabel(t)}</option>)}</Select></Field>
          <Field label="Priority"><Select value={v.priority} onChange={set('priority')}>{['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((t) => <option key={t} value={t}>{roleLabel(t)}</option>)}</Select></Field>
          {can('tasks.manage') && <Field label="For"><Select value={v.userId} onChange={set('userId')}>{(team.data || []).map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}</Select></Field>}
          <Field label="Content"><Select value={v.contentId} onChange={set('contentId')}><option value="">None</option>{(contents.data || []).map((c) => <option key={c._id} value={c._id}>{c.contentId} · {c.title}</option>)}</Select></Field>
          <Field label="Client"><Select value={v.clientId} onChange={set('clientId')}><option value="">None</option>{(clients.data || []).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</Select></Field>
          <div className="sm:col-span-2"><Field label="Notes"><Textarea value={v.description} onChange={set('description')} rows={2} /></Field></div>
        </>}
      </div>
    </Modal>
  );
}

/** Confirm with a required reason (blocking, requesting changes…) */
export function ReasonModal({ open, onClose, title, label: lbl, cta, onSubmit, loading, danger }: { open: boolean; onClose: () => void; title: string; label: string; cta: string; onSubmit: (reason: string) => void; loading?: boolean; danger?: boolean }) {
  const [r, setR] = useState('');
  useEffect(() => { if (open) setR(''); }, [open]);
  return <Modal open={open} onClose={onClose} title={title} footer={<><Button onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} disabled={r.trim().length < 3} loading={loading} onClick={() => onSubmit(r.trim())}>{cta}</Button></>}><Field label={lbl}><Textarea value={r} onChange={(e) => setR(e.target.value)} autoFocus rows={4} /></Field></Modal>;
}

export function FastTrackVideoModal({ open, onClose, clientId }: { open: boolean; onClose: () => void; clientId?: string }) {
  const clients = useClients();
  const team = useTeam();
  const qc = useQueryClient();
  const nav = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selClient, setSelClient] = useState(clientId || '');
  const [title, setTitle] = useState('');
  const [editorId, setEditorId] = useState('');
  const [type, setType] = useState('REEL');
  const [platform, setPlatform] = useState('INSTAGRAM');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setSelClient(clientId || '');
      setTitle('');
      setEditorId('');
      setType('REEL');
      setPlatform('INSTAGRAM');
      setNotes('');
      setFile(null);
      setIsDragging(false);
      setSubmitting(false);
    }
  }, [open, clientId]);

  // When client changes, auto-suggest default editor if available
  useEffect(() => {
    if (selClient) {
      const c = (clients.data || []).find((x) => x._id === selClient);
      if (c?.defaultTeam?.editor) {
        setEditorId(c.defaultTeam.editor);
      }
    }
  }, [selClient, clients.data]);

  const handleFile = (f: File) => {
    setFile(f);
    if (!title.trim()) {
      const clean = f.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[-_.]+/g, ' ')
        .trim();
      if (clean) {
        setTitle(clean.charAt(0).toUpperCase() + clean.slice(1));
      }
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) handleFile(dropped);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selClient) {
      toast.error('Please select a client');
      return;
    }
    if (!file) {
      toast.error('Please select or drop a video file');
      return;
    }

    setSubmitting(true);
    try {
      const finalTitle = title.trim() || file.name.replace(/\.[^/.]+$/, '').replace(/[-_.]+/g, ' ').trim() || 'Client Raw Video';
      const desc = notes.trim()
        ? `[Client-Shot Raw Footage]: ${notes.trim()}`
        : '[Client-Shot Raw Footage] Uploaded directly for editing.';

      // 1. Create content item
      const content = await post('/content', {
        title: finalTitle,
        clientId: selClient,
        type,
        platform,
        priority: 'HIGH',
        assignedEditor: editorId || undefined,
        description: desc,
      });

      // 2. Start RAW upload - automatically advances stage to RAW_FOOTAGE, sets editor as owner, and notifies editor
      toast.success(`${content.contentId} created! Uploading raw footage...`);
      await startUpload({
        file,
        category: 'RAW',
        contentId: content._id,
        clientId: selClient,
        silent: false,
      });

      qc.invalidateQueries({ queryKey: ['content'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['editing'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });

      onClose();
      nav(`/content/${content._id}?tab=editing`);
      toast.success(`⚡ Fast-tracked to editor! ${content.contentId} is ready for editing.`);
    } catch (err: any) {
      toast.error(errMsg(err, 'Failed to fast-track video'));
    } finally {
      setSubmitting(false);
    }
  };

  const clientObj = (clients.data || []).find((c) => c._id === selClient);

  return (
    <Modal
      open={open}
      onClose={submitting ? () => {} : onClose}
      title={
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
            <Zap size={16} />
          </span>
          <span>Fast-Track Client Video</span>
        </div>
      }
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button
            variant="primary"
            loading={submitting}
            disabled={!selClient || !file || submitting}
            onClick={handleSubmit}
            icon={<Zap size={15} className="text-amber-300 fill-amber-300/30" />}
          >
            {submitting ? 'Uploading & Assigning...' : '⚡ Upload & Send to Editor'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Info banner */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 text-[13px] text-ink-2">
          <div className="font-semibold text-ink flex items-center gap-1.5 mb-1">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            1-Click Client-Shot Workflow
          </div>
          Client has already shot the footage? Skip scripting &amp; shooting entirely. This drops the raw video straight into <strong className="text-ink">RAW FOOTAGE</strong> stage and alerts the assigned editor immediately.
        </div>

        {/* Video Dropzone */}
        {!file ? (
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`group cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-all duration-200 ${
              isDragging
                ? 'border-primary bg-primary-soft/30 scale-[1.01]'
                : 'border-line/80 bg-surface-2/40 hover:border-primary/50 hover:bg-surface-2/70'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,.mp4,.mov,.m4v,.mkv,.webm,.avi"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-3 text-ink-2 group-hover:scale-110 group-hover:bg-primary-soft group-hover:text-primary-ink transition-all">
              <Upload size={22} />
            </div>
            <div className="mt-3 text-[14px] font-semibold text-ink">
              Drop raw client video here or <span className="text-primary-ink underline underline-offset-2">browse</span>
            </div>
            <p className="mt-1 text-[12px] text-ink-3">
              Supports MP4, MOV, MKV, WebM, M4V (up to 5GB)
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-xl border border-line bg-surface-2/80 p-3.5 backdrop-blur-md">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-ink">
                <Film size={20} />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-ink">{file.name}</div>
                <div className="flex items-center gap-2 text-[12px] text-ink-3">
                  <span>{fmtSize(file.size)}</span>
                  <span>•</span>
                  <Badge t="green" dot>Ready to upload</Badge>
                </div>
              </div>
            </div>
            {!submitting && (
              <Button size="sm" variant="ghost" onClick={() => setFile(null)} icon={<X size={14} />}>
                Change
              </Button>
            )}
          </div>
        )}

        {/* Client & Editor row */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Client *" hint={clientObj ? `Selected: ${clientObj.name}` : undefined}>
            <Select value={selClient} onChange={(e) => setSelClient(e.target.value)} disabled={submitting}>
              <option value="">Select client</option>
              {(clients.data || []).map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Assigned Editor" hint={clientObj?.defaultTeam?.editor ? 'Defaults to client assigned editor' : undefined}>
            <Select value={editorId} onChange={(e) => setEditorId(e.target.value)} disabled={submitting}>
              <option value="">Auto (Client default editor)</option>
              {(team.data || []).map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name} — {roleLabel(u.role)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Title */}
        <Field label="Title" hint="Auto-generated from video name, or customize it">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Founder Interview Reel"
            disabled={submitting}
          />
        </Field>

        {/* Type & Platform */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value)} disabled={submitting}>
              {['REEL', 'POST', 'CAROUSEL', 'STORY', 'VIDEO', 'SHORT', 'AD'].map((t) => (
                <option key={t} value={t}>{roleLabel(t)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Platform">
            <Select value={platform} onChange={(e) => setPlatform(e.target.value)} disabled={submitting}>
              {['INSTAGRAM', 'FACEBOOK', 'YOUTUBE', 'LINKEDIN', 'X', 'MULTI'].map((t) => (
                <option key={t} value={t}>{roleLabel(t)}</option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Notes for editor */}
        <Field label="Instructions for Editor (Optional)">
          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Cut awkward pauses, add bold captions, fast-paced transitions & trending audio..."
            disabled={submitting}
          />
        </Field>
      </div>
    </Modal>
  );
}


import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Input, Modal, Select, Textarea } from './ui';
import { post, patch, errMsg } from '@/lib/api';
import { toast } from '@/store/ui';
import { useClients, useTeam, useContentOptions } from '@/hooks/useData';
import { roleLabel, toLocalInput } from '@/lib/format';
import { useAuth, useCan } from '@/store/auth';

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

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowLeft, Plus, Users, Clapperboard, Building2, Search, MessageSquarePlus, MoreVertical, CheckCheck, Check, ExternalLink } from 'lucide-react';
import { get, post, errMsg } from '@/lib/api';
import { useAuth, useCan } from '@/store/auth';
import { toast, useUI } from '@/store/ui';
import { Avatar, Button, Empty, Field, Input, Modal, PresenceDot, Spinner, IconButton } from '@/components/ui';
import { ChatThread, roomTitle, RoomSub } from '@/features/ChatThread';
import { useTeam } from '@/hooks/useData';
import { ago, roleLabel } from '@/lib/format';

export default function Chat() {
  const { roomId } = useParams();
  const nav = useNavigate();
  const me = useAuth((s) => s.user)!;
  const [tab, setTab] = useState<'ALL' | 'DIRECT' | 'TEAM' | 'CONTENT' | 'CLIENT'>('ALL');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState('');

  const typing = useUI((s) => s.typing);
  const rooms = useQuery({ queryKey: ['chat-rooms'], queryFn: () => get<any[]>('/chat/rooms') });
  const list = useMemo(() => (rooms.data || []).filter((r) => (tab === 'ALL' || r.type === tab) && (!f || roomTitle(r, me._id).toLowerCase().includes(f.toLowerCase()))), [rooms.data, tab, f, me._id]);
  const cur = (rooms.data || []).find((r) => r._id === roomId);

  return (
    <div className="flex h-full overflow-hidden bg-canvas">
      {/* ── Left Sidebar (Conversations list) ── */}
      <aside className={clsx(
        'flex w-full flex-col border-r border-line bg-surface md:w-[380px] lg:w-[410px] md:shrink-0 transition-all duration-200',
        roomId && 'hidden md:flex'
      )}>
        {/* Top Header */}
        <div className="flex h-[60px] items-center justify-between border-b border-line bg-surface-2/60 px-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar name={me.name} size={40} />
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-surface" />
            </div>
            <h1 className="text-[17px] font-bold text-ink">Chats</h1>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setOpen(true)}
              aria-label="New chat"
              title="New conversation"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-2 hover:bg-surface-3 hover:text-primary transition-colors"
            >
              <MessageSquarePlus size={20} />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="border-b border-line bg-surface px-3 py-2">
          <div className="flex items-center gap-2.5 rounded-xl bg-surface-2 px-3 py-1.5 transition-colors focus-within:ring-1 focus-within:ring-primary focus-within:bg-surface">
            <Search size={16} className="text-ink-3 shrink-0" />
            <input
              type="text"
              placeholder="Search or start new chat..."
              value={f}
              onChange={(e) => setF(e.target.value)}
              className="w-full bg-transparent text-[13.5px] text-ink placeholder-ink-3 focus:outline-none"
            />
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex gap-1.5 border-b border-line bg-surface px-3 py-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {(['ALL', 'DIRECT', 'TEAM', 'CONTENT', 'CLIENT'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                'whitespace-nowrap rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-all duration-150',
                tab === t
                  ? 'bg-primary/10 text-primary-ink font-bold border border-primary/25 shadow-xs'
                  : 'bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink'
              )}
            >
              {t === 'ALL' ? 'All' : t === 'CLIENT' ? 'Clients' : roleLabel(t)}
            </button>
          ))}
        </div>

        {/* Chat List */}
        <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-line/60">
          {rooms.isLoading ? (
            <div className="flex justify-center p-8"><Spinner /></div>
          ) : !list.length ? (
            <Empty title="No conversations" hint="Start a direct chat, or open a content item to use its chat." />
          ) : (
            list.map((r) => {
              const other = r.type === 'DIRECT' ? r.participants?.find((p: any) => String(p?._id || p) !== me._id) : null;
              const otherId = String(other?._id || other || '');
              const active = r._id === roomId;
              const hasUnread = r.unread > 0;
              const typingInRoom = Object.values(typing || {}).find(
                (t) => t.roomId === r._id && t.userId !== me._id
              );
              return (
                <button
                  key={r._id}
                  onClick={() => nav(`/chat/${r._id}`)}
                  className={clsx(
                    'relative flex w-full items-center gap-3.5 px-4 py-3 text-left transition-colors duration-150',
                    active
                      ? 'bg-primary/10 dark:bg-primary/15'
                      : 'hover:bg-surface-2'
                  )}
                >
                  {/* Active indicator */}
                  {active && (
                    <span className="absolute inset-y-0 left-0 w-1 bg-primary rounded-r" aria-hidden />
                  )}

                  {/* Circular Avatar */}
                  <div className="relative shrink-0">
                    {other ? (
                      <>
                        <Avatar name={other.name || 'User'} size={48} />
                        <PresenceDot userId={otherId} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white dark:ring-[#111b21]" />
                      </>
                    ) : r.type === 'CONTENT' ? (
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-500 to-teal-600 text-white shadow-sm">
                        <Clapperboard size={22} />
                      </span>
                    ) : r.type === 'CLIENT' ? (
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-sm">
                        <Building2 size={22} />
                      </span>
                    ) : (
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-tr from-violet-500 to-purple-600 text-white shadow-sm">
                        <Users size={22} />
                      </span>
                    )}
                  </div>

                  {/* Contact Info + Last Message */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={clsx('truncate text-[15.5px]', hasUnread ? 'font-bold text-[#111b21] dark:text-[#e9edef]' : 'font-medium text-[#111b21] dark:text-[#e9edef]')}>
                        {roomTitle(r, me._id)}
                      </span>
                      <span className={clsx('shrink-0 text-[11.5px] tabular', hasUnread ? 'font-semibold text-[#00a884] dark:text-[#25d366]' : 'text-[#667781] dark:text-[#8696a0]')}>
                        {r.lastMessageAt ? ago(r.lastMessageAt) : ''}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      {typingInRoom ? (
                        <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#00a884] dark:text-[#25d366] animate-pulse">
                          <span>{r.type === 'DIRECT' ? 'typing...' : `${typingInRoom.name.split(' ')[0]} is typing...`}</span>
                        </span>
                      ) : (
                        <span className={clsx('truncate text-[13.5px]', hasUnread ? 'font-medium text-[#111b21] dark:text-[#e9edef]' : 'text-[#667781] dark:text-[#8696a0]')}>
                          {r.lastMessagePreview || 'No messages yet'}
                        </span>
                      )}
                      {hasUnread && (
                        <span className="shrink-0 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#25d366] px-1.5 text-[11px] font-bold text-white tabular shadow-xs">
                          {r.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ── Active Conversation (WhatsApp Web chat view) ── */}
      <section key={roomId || 'none'} className={clsx('min-w-0 flex-1 flex-col h-full', roomId ? 'flex' : 'hidden md:flex')}>
        {roomId ? (
          <>
            {/* WhatsApp Chat Header */}
            <header className="flex h-[60px] items-center justify-between border-b border-line bg-surface-2/60 px-3 sm:px-4 z-10 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  aria-label="Back to conversations"
                  className="md:hidden flex h-9 w-9 items-center justify-center rounded-xl text-ink-2 hover:bg-surface-3"
                  onClick={() => nav('/chat')}
                >
                  <ArrowLeft size={20} />
                </button>
                <div className="relative shrink-0">
                  {cur && (
                    cur.type === 'DIRECT' ? (
                      <Avatar name={roomTitle(cur, me._id)} size={40} />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-500 to-teal-600 text-white shadow-xs">
                        {cur.type === 'CONTENT' ? <Clapperboard size={18} /> : cur.type === 'CLIENT' ? <Building2 size={18} /> : <Users size={18} />}
                      </span>
                    )
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[15.5px] font-bold text-ink">
                    {cur ? roomTitle(cur, me._id) : 'Chat'}
                  </div>
                  <div className="truncate text-[12px] text-ink-2">
                    {cur && <RoomSub r={cur} meId={me._id} />}
                  </div>
                </div>
              </div>

              {/* Chat header action buttons */}
              <div className="flex items-center gap-2 text-ink-2">
                {cur?.type === 'CONTENT' && cur.contentId && (
                  <Link
                    to={`/content/${cur.contentId._id || cur.contentId}`}
                    className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink hover:border-primary hover:text-primary-ink transition-colors shadow-xs"
                  >
                    View Content <ExternalLink size={12} />
                  </Link>
                )}
                <button
                  aria-label="Search in conversation"
                  title="Search messages"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('toggle-chat-search'));
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-2 hover:bg-surface-3 transition-colors"
                >
                  <Search size={18} />
                </button>
              </div>
            </header>

            {/* Chat Messages + Composer with Wallpaper */}
            <div className="min-h-0 flex-1 overflow-hidden">
              <ChatThread key={roomId} roomId={roomId} />
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center bg-canvas p-6 text-center">
            <div className="max-w-sm rounded-2xl bg-surface p-8 shadow-card border border-line">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#d9fdd3] dark:bg-[#005c4b]/30 text-[#00a884]">
                <MessageSquarePlus size={32} />
              </div>
              <h2 className="text-[20px] font-bold text-[#111b21] dark:text-[#e9edef]">SMM Pro Web for Chat</h2>
              <p className="mt-2 text-[13.5px] text-[#667781] dark:text-[#8696a0]">
                Send and receive messages with your team, clients, and creators. Select a conversation to start chatting.
              </p>
            </div>
          </div>
        )}
      </section>

      <NewChat open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function NewChat({ open, onClose }: { open: boolean; onClose: () => void }) {
  const team = useTeam();
  const me = useAuth((s) => s.user)!;
  const can = useCan();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'DIRECT' | 'TEAM'>('DIRECT');
  const [name, setName] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const go = async (body: any) => {
    setBusy(true);
    try {
      const r = await post('/chat/rooms', body);
      qc.invalidateQueries({ queryKey: ['chat-rooms'] });
      onClose();
      setName('');
      setSel([]);
      nav(`/chat/${r._id}`);
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy(false);
  };

  const people = (team.data || []).filter((u) => u._id !== me._id);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New conversation"
      footer={
        mode === 'TEAM' ? (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={busy} disabled={!name.trim() || !sel.length} onClick={() => go({ type: 'TEAM', name, participants: sel })}>
              Create team chat
            </Button>
          </>
        ) : undefined
      }
    >
      {can('tasks.manage') && (
        <div className="mb-3 flex gap-1">
          {(['DIRECT', 'TEAM'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={clsx('rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors', mode === m ? 'bg-[#d9fdd3] dark:bg-[#005c4b]/50 text-[#00a884] font-semibold' : 'text-ink-2 hover:bg-surface-2')}
            >
              {m === 'DIRECT' ? 'Direct chat' : 'Team chat'}
            </button>
          ))}
        </div>
      )}
      {mode === 'TEAM' && (
        <div className="mb-3">
          <Field label="Team chat name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Editing team" />
          </Field>
        </div>
      )}
      <ul className="divide-y divide-line rounded-xl border border-line overflow-hidden">
        {people.map((u) => (
          <li key={u._id}>
            <button
              disabled={busy}
              onClick={() => (mode === 'DIRECT' ? go({ type: 'DIRECT', userId: u._id }) : setSel((s) => (s.includes(u._id) ? s.filter((x) => x !== u._id) : [...s, u._id])))}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2 transition-colors"
            >
              {mode === 'TEAM' && <input type="checkbox" readOnly checked={sel.includes(u._id)} />}
              <span className="relative">
                <Avatar name={u.name} size={38} />
                <PresenceDot userId={u._id} className="absolute -bottom-0.5 -right-0.5" />
              </span>
              <span>
                <span className="block font-semibold text-ink">{u.name}</span>
                <span className="block text-meta text-ink-2">{roleLabel(u.role)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

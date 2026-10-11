import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Send, User, Sparkles, MessageSquare, ShieldCheck, CheckCheck, Clock, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Card, Button, Spinner } from '@/components/Ui';
import clsx from 'clsx';

interface ChatMessage {
  _id: string;
  message: string;
  kind?: string;
  senderType: 'AGENCY' | 'CLIENT';
  senderName: string;
  senderRole?: string;
  isMe: boolean;
  isClient: boolean;
  createdAt: string;
}

interface TeamMember {
  name: string;
  role: string;
  email?: string;
}

export function ChatPage() {
  const { user, brand } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [roomName, setRoomName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const loadChat = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) {
        const infoRes = await api.get('/chat');
        setTeam(infoRes.data.team || []);
        setRoomName(infoRes.data.roomName || '');
      }
      const msgsRes = await api.get('/chat/messages');
      setMessages((prev) => {
        if (JSON.stringify(prev) !== JSON.stringify(msgsRes.data)) {
          setTimeout(() => scrollToBottom(true), 100);
          return msgsRes.data;
        }
        return prev;
      });
    } catch (err) {
      console.error('[load chat]', err);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [scrollToBottom]);

  useEffect(() => {
    loadChat(true);
    const interval = setInterval(() => {
      loadChat(false);
    }, 4000);
    return () => clearInterval(interval);
  }, [loadChat]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const content = text.trim();
    if (!content || sending) return;

    setSending(true);
    setText('');

    // Optimistic message
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      _id: tempId,
      message: content,
      senderType: 'CLIENT',
      senderName: user?.name || 'You',
      senderRole: 'Client',
      isMe: true,
      isClient: true,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => scrollToBottom(true), 50);

    try {
      const res = await api.post('/chat/messages', { message: content });
      setMessages((prev) => prev.map((m) => (m._id === tempId ? res.data : m)));
    } catch (err) {
      console.error('[send message failed]', err);
      // Remove optimistic on failure
      setMessages((prev) => prev.filter((m) => m._id !== tempId));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const sendQuickPrompt = (prompt: string) => {
    setText(prompt);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] max-h-[820px] rounded-2xl border border-line bg-surface/90 shadow-card overflow-hidden">
      {/* Chat Header */}
      <div className="px-4 py-3.5 border-b border-line bg-surface-2/60 backdrop-blur-md flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-xs">
            <MessageSquare size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-ink truncate">
                {roomName || 'Dedicated Agency Team'}
              </h1>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Workspace
              </span>
            </div>
            <p className="text-xs text-ink-3 truncate">
              Direct communication with {brand?.businessName || brand?.name || 'Bulletproof'} creative leads
            </p>
          </div>
        </div>

        {/* Security badge & refresh */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-ink-3">
            <ShieldCheck size={14} className="text-emerald-500" /> 256-Bit Encrypted
          </span>
          <button
            onClick={() => loadChat(false)}
            title="Refresh messages"
            className="p-2 rounded-xl text-ink-3 hover:text-ink hover:bg-surface border border-line/50 transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Assigned Team Members Bar (If available) */}
      {team.length > 0 && (
        <div className="px-4 py-2 border-b border-line/60 bg-surface/50 flex items-center gap-2 overflow-x-auto text-xs shrink-0 no-scrollbar">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-3 shrink-0">
            Assigned Leads:
          </span>
          {team.map((t, idx) => (
            <div
              key={idx}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-2 border border-line text-[11px] text-ink font-semibold shrink-0 shadow-xs"
            >
              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-primary-soft text-[9px] text-primary-ink font-bold">
                {t.name.charAt(0)}
              </div>
              <span>{t.name}</span>
              <span className="text-[10px] font-normal text-ink-3">({t.role})</span>
            </div>
          ))}
        </div>
      )}

      {/* Messages Feed */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-canvas/30">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner size={28} />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 py-12">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary mb-3 shadow-xs">
              <Sparkles size={24} />
            </div>
            <h2 className="text-base font-bold text-ink">Welcome to your Agency Chat</h2>
            <p className="text-xs text-ink-3 max-w-sm mt-1 mb-6">
              Ask questions, discuss scripts, request rush edits, or share spontaneous ideas directly with your creative leads.
            </p>
            <div className="flex flex-wrap justify-center gap-2 max-w-md">
              <button
                onClick={() => sendQuickPrompt('Hi team, what is the status of our upcoming Reel?')}
                className="px-3 py-1.5 rounded-xl bg-surface border border-line text-xs text-ink-2 hover:text-ink hover:border-primary/40 transition-colors shadow-xs"
              >
                📅 Upcoming Reel status?
              </button>
              <button
                onClick={() => sendQuickPrompt('Can we schedule our next shoot for next Tuesday?')}
                className="px-3 py-1.5 rounded-xl bg-surface border border-line text-xs text-ink-2 hover:text-ink hover:border-primary/40 transition-colors shadow-xs"
              >
                🎬 Next shoot date?
              </button>
              <button
                onClick={() => sendQuickPrompt('I have an idea for our festival promotion campaign.')}
                className="px-3 py-1.5 rounded-xl bg-surface border border-line text-xs text-ink-2 hover:text-ink hover:border-primary/40 transition-colors shadow-xs"
              >
                ✨ Campaign idea
              </button>
            </div>
          </div>
        ) : (
          messages.map((m) => {
            const isMe = m.isMe;

            return (
              <div
                key={m._id}
                className={clsx('flex flex-col', isMe ? 'items-end' : 'items-start')}
              >
                {/* Sender label */}
                <span className="text-[10px] font-semibold text-ink-3 mb-1 px-1">
                  {isMe ? 'You' : `${m.senderName} • ${m.senderRole || 'Agency'}`}
                </span>

                {/* Bubble */}
                <div
                  className={clsx(
                    'max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 shadow-xs text-sm leading-relaxed whitespace-pre-wrap break-words',
                    isMe
                      ? 'bg-primary text-white rounded-br-xs'
                      : 'bg-surface border border-line text-ink rounded-bl-xs'
                  )}
                >
                  {m.message}

                  {/* Timestamp & check */}
                  <div
                    className={clsx(
                      'flex items-center justify-end gap-1 text-[10px] mt-1',
                      isMe ? 'text-white/75' : 'text-ink-3'
                    )}
                  >
                    <span>
                      {new Date(m.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {isMe && <CheckCheck size={13} className="text-white/90" />}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts Bar (When messages exist) */}
      {messages.length > 0 && (
        <div className="px-3 py-1.5 border-t border-line/40 bg-surface flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
          <span className="text-[10px] font-bold text-ink-3 shrink-0 uppercase tracking-wider">
            Quick:
          </span>
          <button
            onClick={() => sendQuickPrompt('Approved! Please proceed with final scheduling.')}
            className="px-2.5 py-1 rounded-lg bg-surface-2 hover:bg-surface-3 text-[11px] text-ink-2 hover:text-ink shrink-0 border border-line/60 transition-colors"
          >
            ✅ Proceed with scheduling
          </button>
          <button
            onClick={() => sendQuickPrompt('When will the revised cut be ready for review?')}
            className="px-2.5 py-1 rounded-lg bg-surface-2 hover:bg-surface-3 text-[11px] text-ink-2 hover:text-ink shrink-0 border border-line/60 transition-colors"
          >
            🕒 Revision timeline?
          </button>
          <button
            onClick={() => sendQuickPrompt('Thank you team, love the work!')}
            className="px-2.5 py-1 rounded-lg bg-surface-2 hover:bg-surface-3 text-[11px] text-ink-2 hover:text-ink shrink-0 border border-line/60 transition-colors"
          >
            🙌 Thank you!
          </button>
        </div>
      )}

      {/* Chat Input Box */}
      <form
        onSubmit={handleSend}
        className="p-3 border-t border-line bg-surface flex items-end gap-2 shrink-0"
      >
        <div className="flex-1 relative">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Type a message to your agency team... (Enter to send)"
            className="w-full resize-none rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-primary/20 max-h-28"
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          size="md"
          loading={sending}
          disabled={!text.trim()}
          icon={<Send size={16} />}
          className="shrink-0 h-10 w-10 !p-0 rounded-xl"
        />
      </form>
    </div>
  );
}

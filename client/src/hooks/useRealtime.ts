import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { useAuth } from '@/store/auth';
import { useUI, toast } from '@/store/ui';
import { get } from '@/lib/api';
import { showDeviceNotification } from '@/lib/notifications';

/** One place that turns server events into cache invalidations and system device notifications, so every screen and device stays in sync. */
export function useRealtime() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const uid = useAuth((s) => s.user?._id);
  useEffect(() => {
    if (!uid) return;
    const s = connectSocket();
    const inv = (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    const loadPresence = () => get('/dashboard/team-presence').then((list: any[]) => useUI.getState().setAllPresence(Object.fromEntries(list.map((p) => [p.userId, { status: p.status, lastActive: p.lastActive, currentActivity: p.currentActivity }])))).catch(() => undefined);
    loadPresence();
    const pres = (d: any) => { useUI.getState().setPresence(d.userId, { status: d.status, lastActive: d.lastActive, currentActivity: d.currentActivity }); };
    const handlers: Record<string, (d: any) => void> = {
      connect: () => { loadPresence(); qc.invalidateQueries(); },
      user_online: pres, user_away: pres, user_offline: pres,
      'notification:new': (n) => {
        inv('notifications');
        const onChat = n.category === 'CHAT' && (window.location.pathname.startsWith('/chat') || new URLSearchParams(window.location.search).get('tab') === 'chat');
        const prefs = useAuth.getState().user?.notificationPrefs;
        if (!onChat && prefs?.inApp !== false) {
          useUI.getState().toast('info', `${n.title}${n.message ? ` — ${n.message}` : ''}`, n.link ? { label: 'Open', run: () => nav(n.link) } : undefined);
        }
        // Dispatch to system notification panel (Windows, macOS, Android, iOS)
        if (!onChat) {
          showDeviceNotification({
            title: n.title,
            message: n.message,
            link: n.link,
            tag: String(n._id || 'smm-notify'),
            category: n.category,
          });
        }
      },
      'notification:read': () => inv('notifications'),
      'content:updated': () => inv('content', 'dashboard', 'clients', 'calendar'),
      'workflow:updated': (c) => { inv('content-detail'); qc.invalidateQueries({ queryKey: ['content-detail', c._id] }); },
      'task:assigned': (t: any) => {
        inv('tasks', 'dashboard');
        showDeviceNotification({
          title: '📋 New Task Assigned',
          message: t?.title || 'You have been assigned to a task',
          link: '/tasks',
          tag: `task-${t?._id || Date.now()}`,
        });
      },
      'task:updated': () => inv('tasks', 'dashboard', 'content-detail'),
      'task:completed': () => inv('tasks', 'dashboard', 'content-detail'),
      'approval:new': (a: any) => {
        inv('approvals', 'dashboard', 'content-detail');
        showDeviceNotification({
          title: '🛡️ New Approval Required',
          message: a?.title || 'A new review requires your approval',
          link: '/approvals',
          tag: `approval-${a?._id || Date.now()}`,
        });
      },
      'approval:updated': () => inv('approvals', 'dashboard', 'content-detail'),
      'file:uploaded': () => inv('media', 'dashboard', 'content-detail'),
      'file:updated': () => inv('media'),
      'reminder:new': () => inv('reminders', 'dashboard'),
      'reminder:triggered': (r: any) => {
        inv('reminders', 'dashboard');
        showDeviceNotification({
          title: '⏰ Reminder Due',
          message: r?.title || 'You have a scheduled reminder due now',
          link: '/reminders',
          tag: `reminder-${r?._id || Date.now()}`,
        });
      },
      'automation:executed': () => inv('automations', 'dashboard'),
      'automation:failed': () => inv('automations', 'dashboard'),
      'activity:new': () => inv('activity'),
      'chat:room_activity': () => inv('chat-rooms', 'chat-unread'),
      'chat:unread_changed': () => inv('chat-rooms', 'chat-unread'),
      'script:updated': () => inv('scripts', 'content-detail'),
      'client:updated': () => inv('clients'),
    };
    Object.entries(handlers).forEach(([e, h]) => s.on(e, h));
    const on = () => useUI.getState().setConn({ online: true }); const off = () => useUI.getState().setConn({ online: false });
    window.addEventListener('online', on); window.addEventListener('offline', off);
    const swNav = (e: MessageEvent) => { if (e.data?.type === 'navigate' && e.data.url) nav(e.data.url); };
    navigator.serviceWorker?.addEventListener('message', swNav);
    return () => { Object.entries(handlers).forEach(([e, h]) => s.off(e, h)); window.removeEventListener('online', on); window.removeEventListener('offline', off); navigator.serviceWorker?.removeEventListener('message', swNav); };
  }, [uid, qc, nav]);
  useEffect(() => { if (!uid) disconnectSocket(); }, [uid]);
}
export { toast };

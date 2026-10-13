import { create } from 'zustand';
import { api } from '@/lib/api';
import { getPortalSocket } from '@/lib/socket';
import { showLocalNotification } from '@/lib/push';

export interface ToastItem {
  id: string;
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning';
}

export interface NotificationItem {
  _id: string;
  title: string;
  message: string;
  type: string;
  actionUrl?: string;
  read: boolean;
  createdAt: string;
  meta?: any;
}

interface NotificationState {
  pendingApprovals: number;
  unreadChat: number;
  notifications: NotificationItem[];
  unreadNotifications: number;
  loadingNotifications: boolean;
  toasts: ToastItem[];
  initRealtime: () => void;
  fetchCounts: () => Promise<void>;
  fetchNotifications: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  addToast: (t: Omit<ToastItem, 'id'>) => void;
  removeToast: (id: string) => void;
  clearUnreadChat: () => void;
}

export const useNotifications = create<NotificationState>((set, get) => ({
  pendingApprovals: 0,
  unreadChat: 0,
  notifications: [],
  unreadNotifications: 0,
  loadingNotifications: false,
  toasts: [],

  addToast: (t) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newToast: ToastItem = { ...t, id };
    set((state) => ({ toasts: [...state.toasts, newToast] }));
    setTimeout(() => {
      get().removeToast(id);
    }, 5000);
  },

  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },

  clearUnreadChat: () => {
    set({ unreadChat: 0 });
  },

  fetchCounts: async () => {
    try {
      const res = await api.get('/dashboard');
      const count = res.data?.pendingApprovals?.length || 0;
      set({ pendingApprovals: count });
    } catch {
      // Ignore initial background fetch error
    }
  },

  fetchNotifications: async () => {
    set({ loadingNotifications: true });
    try {
      const res = await api.get('/notifications');
      set({
        notifications: res.data?.notifications || [],
        unreadNotifications: res.data?.unreadCount || 0,
      });
    } catch {
      // Ignore initial background fetch error
    } finally {
      set({ loadingNotifications: false });
    }
  },

  markNotificationRead: async (id: string) => {
    try {
      set((state) => ({
        notifications: state.notifications.map((n) => (n._id === id ? { ...n, read: true } : n)),
        unreadNotifications: Math.max(0, state.unreadNotifications - 1),
      }));
      await api.patch(`/notifications/${id}/read`);
    } catch (err) {
      console.warn('[markNotificationRead]', err);
    }
  },

  markAllNotificationsRead: async () => {
    try {
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
        unreadNotifications: 0,
      }));
      await api.post('/notifications/mark-all-read');
    } catch (err) {
      console.warn('[markAllNotificationsRead]', err);
    }
  },

  initRealtime: () => {
    get().fetchCounts();
    get().fetchNotifications();

    const socket = getPortalSocket();
    if (!socket) return;

    socket.off('message:new');
    socket.off('approval:updated');
    socket.off('approval:new');
    socket.off('notification:new');

    socket.on('notification:new', (notif: NotificationItem) => {
      set((state) => ({
        notifications: [notif, ...state.notifications],
        unreadNotifications: state.unreadNotifications + 1,
      }));

      get().addToast({
        title: notif.title || 'New Notification',
        message: notif.message,
        type: 'info',
      });

      if (document.hidden) {
        void showLocalNotification(notif.title || 'Bulletproof Portal', {
          body: notif.message,
          tag: `notif-${notif._id || Date.now()}`,
          data: { url: notif.actionUrl || '/' },
        });
      }
    });

    socket.on('message:new', (msg: any) => {
      // If agency sent the message
      if (msg.senderType === 'AGENCY' || msg.senderId) {
        const isChatOpen = window.location.pathname.startsWith('/chat');
        if (!isChatOpen) {
          set((state) => ({ unreadChat: state.unreadChat + 1 }));
          const title = `Message from ${msg.senderId?.name || msg.senderName || 'Agency Lead'}`;
          const body = msg.message || 'Sent a new message';

          get().addToast({
            title,
            message: body,
            type: 'info',
          });

          // Show background OS/browser notification if user is on another tab or app is minimized
          if (document.hidden) {
            void showLocalNotification(title, {
              body,
              tag: `chat-${msg._id || Date.now()}`,
              data: { url: '/chat' },
            });
          }
        }
      }
    });

    const handleApprovalEvent = (data: any) => {
      get().fetchCounts();
      get().fetchNotifications();
      const needsAction = ['PENDING', 'SENT', 'WAITING_FOR_CLIENT'].includes(data.status);
      if (needsAction) {
        const title = 'Sign-off Needed';
        const body = 'A new creative script or cut has been submitted for your sign-off.';

        get().addToast({
          title,
          message: body,
          type: 'warning',
        });

        // Show background OS/browser notification if user is on another tab or app is minimized
        if (document.hidden) {
          void showLocalNotification(title, {
            body,
            tag: `approval-${data._id || Date.now()}`,
            data: { url: `/approvals/${data._id || ''}` },
          });
        }
      }
    };

    socket.on('approval:updated', handleApprovalEvent);
    socket.on('approval:new', handleApprovalEvent);
  },
}));

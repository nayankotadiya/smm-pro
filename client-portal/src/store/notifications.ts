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

interface NotificationState {
  pendingApprovals: number;
  unreadChat: number;
  toasts: ToastItem[];
  initRealtime: () => void;
  fetchCounts: () => Promise<void>;
  addToast: (t: Omit<ToastItem, 'id'>) => void;
  removeToast: (id: string) => void;
  clearUnreadChat: () => void;
}

export const useNotifications = create<NotificationState>((set, get) => ({
  pendingApprovals: 0,
  unreadChat: 0,
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
    } catch (err) {
      // Ignore initial background fetch error
    }
  },

  initRealtime: () => {
    get().fetchCounts();

    const socket = getPortalSocket();
    if (!socket) return;

    socket.off('message:new');
    socket.off('approval:updated');
    socket.off('approval:new');

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

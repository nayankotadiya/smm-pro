import { create } from 'zustand';
import { api } from '@/lib/api';
import { getPortalSocket } from '@/lib/socket';

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

    socket.on('message:new', (msg: any) => {
      // If agency sent the message
      if (msg.senderType === 'AGENCY' || msg.senderId) {
        const isChatOpen = window.location.pathname.startsWith('/chat');
        if (!isChatOpen) {
          set((state) => ({ unreadChat: state.unreadChat + 1 }));
          get().addToast({
            title: `Message from ${msg.senderId?.name || msg.senderName || 'Agency Lead'}`,
            message: msg.message || 'Sent a new message',
            type: 'info',
          });
        }
      }
    });

    socket.on('approval:updated', (data: any) => {
      get().fetchCounts();
      if (data.status === 'PENDING' || data.status === 'SENT') {
        get().addToast({
          title: 'Sign-off Needed',
          message: 'A new creative script or cut has been submitted for your sign-off.',
          type: 'warning',
        });
      }
    });
  },
}));

import { create } from 'zustand';
import { api } from '@/lib/api';
import { ClientUser, BrandInfo } from '@/lib/types';

interface AuthState {
  token: string | null;
  user: ClientUser | null;
  brand: BrandInfo | null;
  ready: boolean;
  login: (token: string, user: ClientUser, remember?: boolean) => void;
  logout: () => void;
  fetchProfile: () => Promise<void>;
  toggle2FA: () => Promise<boolean>;
}

export const useAuth = create<AuthState>((set) => ({
  token: localStorage.getItem('smm_client_token'),
  user: null,
  brand: null,
  ready: false,

  login: (token: string, user: ClientUser, remember = true) => {
    localStorage.setItem('smm_client_token', token);
    localStorage.setItem('smm_remember_me', remember ? 'true' : 'false');
    set({ token, user, ready: true });
  },

  logout: () => {
    localStorage.removeItem('smm_client_token');
    set({ token: null, user: null, brand: null, ready: true });
  },

  fetchProfile: async () => {
    const token = localStorage.getItem('smm_client_token');
    if (!token) {
      set({ ready: true, user: null, brand: null });
      return;
    }
    try {
      const res = await api.get('/auth/me');
      set({
        user: res.data.user,
        brand: res.data.client,
        ready: true,
      });
    } catch {
      localStorage.removeItem('smm_client_token');
      set({ token: null, user: null, brand: null, ready: true });
    }
  },

  toggle2FA: async () => {
    const res = await api.post('/auth/2fa/toggle');
    const enabled = !!res.data.twoFactorEnabled;
    set((state) => ({
      user: state.user ? { ...state.user, twoFactorEnabled: enabled } : null,
    }));
    return enabled;
  },
}));

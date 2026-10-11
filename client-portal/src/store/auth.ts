import { create } from 'zustand';
import { api } from '@/lib/api';
import { ClientUser, BrandInfo } from '@/lib/types';

interface AuthState {
  token: string | null;
  user: ClientUser | null;
  brand: BrandInfo | null;
  ready: boolean;
  login: (token: string, user: ClientUser) => void;
  logout: () => void;
  fetchProfile: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  token: localStorage.getItem('smm_client_token'),
  user: null,
  brand: null,
  ready: false,

  login: (token: string, user: ClientUser) => {
    localStorage.setItem('smm_client_token', token);
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
}));

import { create } from 'zustand';

export interface Me { _id: string; name: string; email: string; role: string; title?: string; phone?: string; mfaEnabled?: boolean; permissions: string[]; notificationPrefs?: any }
interface AuthState { token: string | null; user: Me | null; ready: boolean; setSession: (t: string, u: Me, refreshToken?: string) => void; setUser: (u: Me) => void; clear: () => void; setReady: () => void }
const savedToken = typeof window !== 'undefined' ? localStorage.getItem('smm_token') : null;
let savedUser: Me | null = null;
try {
  const raw = typeof window !== 'undefined' ? localStorage.getItem('smm_user') : null;
  if (raw) savedUser = JSON.parse(raw);
} catch {}

export const useAuth = create<AuthState>((set) => ({
  token: savedToken,
  user: savedUser,
  ready: Boolean(savedToken && savedUser),
  setSession: (token, user, refreshToken) => {
    try {
      localStorage.setItem('smm_token', token);
      localStorage.setItem('smm_user', JSON.stringify(user));
      if (refreshToken) localStorage.setItem('smm_rt', refreshToken);
    } catch {}
    set({ token, user, ready: true });
  },
  setUser: (user) => {
    try { localStorage.setItem('smm_user', JSON.stringify(user)); } catch {}
    set({ user });
  },
  clear: () => {
    try {
      localStorage.removeItem('smm_token');
      localStorage.removeItem('smm_user');
      localStorage.removeItem('smm_rt');
    } catch {}
    set({ token: null, user: null, ready: true });
  },
  setReady: () => set({ ready: true }),
}));
export const can = (p: string) => { const u = useAuth.getState().user; return !!u && (u.role === 'SUPER_ADMIN' || u.permissions.includes(p)); };
export function useCan() { const u = useAuth((s) => s.user); return (p: string) => !!u && (u.role === 'SUPER_ADMIN' || u.permissions.includes(p)); }

import { create } from 'zustand';

export interface Me { _id: string; name: string; email: string; role: string; title?: string; phone?: string; mfaEnabled?: boolean; permissions: string[]; notificationPrefs?: any }
interface AuthState { token: string | null; user: Me | null; ready: boolean; setSession: (t: string, u: Me) => void; setUser: (u: Me) => void; clear: () => void; setReady: () => void }
/** Access token lives in memory only; the refresh token is an httpOnly cookie the page can't read. */
export const useAuth = create<AuthState>((set) => ({
  token: null, user: null, ready: false,
  setSession: (token, user) => set({ token, user }),
  setUser: (user) => set({ user }),
  clear: () => set({ token: null, user: null }),
  setReady: () => set({ ready: true }),
}));
export const can = (p: string) => { const u = useAuth.getState().user; return !!u && (u.role === 'SUPER_ADMIN' || u.permissions.includes(p)); };
export function useCan() { const u = useAuth((s) => s.user); return (p: string) => !!u && (u.role === 'SUPER_ADMIN' || u.permissions.includes(p)); }

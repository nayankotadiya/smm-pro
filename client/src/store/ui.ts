import { create } from 'zustand';

export interface Toast { id: number; kind: 'success' | 'error' | 'info'; text: string; action?: { label: string; run: () => void }; leaving?: boolean }
export interface Upload { id: string; fileName: string; progress: number; status: 'uploading' | 'processing' | 'done' | 'error' | 'cancelled'; error?: string; cancel?: () => void; retry?: () => void }
export interface PresenceInfo { status: 'ONLINE' | 'AWAY' | 'DND' | 'OFFLINE'; lastActive?: string; currentActivity?: string }

interface UI {
  toasts: Toast[]; toast: (kind: Toast['kind'], text: string, action?: Toast['action']) => void; dismiss: (id: number) => void;
  uploads: Upload[]; setUpload: (u: Upload) => void; removeUpload: (id: string) => void;
  online: boolean; socketUp: boolean; setConn: (p: Partial<Pick<UI, 'online' | 'socketUp'>>) => void;
  presence: Record<string, PresenceInfo>; setPresence: (id: string, p: PresenceInfo) => void; setAllPresence: (m: Record<string, PresenceInfo>) => void;
  sidebar: boolean; setSidebar: (v: boolean) => void;
}
let n = 0;
export const useUI = create<UI>((set, get) => ({
  toasts: [],
  toast: (kind, text, action) => { const id = ++n; set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text, action }] })); setTimeout(() => get().dismiss(id), kind === 'error' ? 7000 : 4000); },
  // two-step so the toast can animate out before it is removed
  dismiss: (id) => { if (!get().toasts.some((t) => t.id === id && !t.leaving)) return; set((s) => ({ toasts: s.toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)) })); setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 220); },
  uploads: [],
  setUpload: (u) => set((s) => ({ uploads: s.uploads.some((x) => x.id === u.id) ? s.uploads.map((x) => (x.id === u.id ? u : x)) : [...s.uploads, u] })),
  removeUpload: (id) => set((s) => ({ uploads: s.uploads.filter((x) => x.id !== id) })),
  online: typeof navigator === 'undefined' ? true : navigator.onLine, socketUp: false,
  setConn: (p) => set(p),
  presence: {}, setPresence: (id, p) => set((s) => ({ presence: { ...s.presence, [id]: p } })), setAllPresence: (presence) => set({ presence }),
  sidebar: false, setSidebar: (sidebar) => set({ sidebar }),
}));
export const toast = { success: (t: string) => useUI.getState().toast('success', t), error: (t: string, action?: Toast['action']) => useUI.getState().toast('error', t, action), info: (t: string) => useUI.getState().toast('info', t) };

import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';
const KEY = 'smmpro.theme';
const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const read = (): ThemeMode => { try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch { return 'system'; } };
const resolve = (m: ThemeMode): 'light' | 'dark' => (m === 'system' ? (mq?.matches ? 'dark' : 'light') : m);

/** Writes the theme to <html data-theme>, keeps the browser chrome colour in sync, and cross-fades the change. */
function apply(resolved: 'light' | 'dark', animate: boolean) {
  const el = document.documentElement;
  if (animate) { el.classList.add('theme-switching'); window.setTimeout(() => el.classList.remove('theme-switching'), 340); }
  el.dataset.theme = resolved;
  if (resolved === 'dark') {
    el.classList.add('dark');
  } else {
    el.classList.remove('dark');
  }
  try { localStorage.setItem('smm_theme', resolved); } catch {}
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#111723' : '#FFFFFF');
}

interface ThemeState { mode: ThemeMode; resolved: 'light' | 'dark'; setMode: (m: ThemeMode) => void; toggle: () => void }
export const useTheme = create<ThemeState>((set, get) => ({
  mode: read(), resolved: resolve(read()),
  setMode: (mode) => { try { mode === 'system' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, mode); } catch { /* private mode: theme still applies for this visit */ } const resolved = resolve(mode); apply(resolved, true); set({ mode, resolved }); },
  toggle: () => get().setMode(get().resolved === 'dark' ? 'light' : 'dark'),
}));
// follow the device when the person has chosen "System"
mq?.addEventListener('change', () => { const s = useTheme.getState(); if (s.mode === 'system') { const resolved = resolve('system'); apply(resolved, true); useTheme.setState({ resolved }); } });
if (typeof document !== 'undefined') apply(useTheme.getState().resolved, false);

import axios, { AxiosError } from 'axios';
import { useAuth } from '@/store/auth';

/** Same backend for web, PWA and any future Capacitor/Tauri shell: set VITE_API_URL when the API is on another origin. */
export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';
/** Host reached directly for WebSockets and media streams (they authenticate by token, not cookie). Defaults to the API URL. */
export const DIRECT_URL = (import.meta.env.VITE_DIRECT_API_URL as string | undefined)?.replace(/\/$/, '') || API_URL;
export const api = axios.create({ baseURL: `${API_URL}/api`, withCredentials: true, headers: { 'X-Requested-With': 'smm-pro' } });

api.interceptors.request.use((cfg) => {
  const t = useAuth.getState().token;
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

let refreshing: Promise<string | null> | null = null;
export function refreshSession(): Promise<string | null> {
  const currentToken = useAuth.getState().token;
  const storedRt = typeof window !== 'undefined' ? localStorage.getItem('smm_rt') : null;
  refreshing ??= axios.post(`${API_URL}/api/auth/refresh`, { refreshToken: storedRt || undefined }, { withCredentials: true, headers: { 'X-Requested-With': 'smm-pro' } })
    .then((r) => {
      useAuth.getState().setSession(r.data.accessToken, r.data.user, r.data.refreshToken);
      return r.data.accessToken as string;
    })
    .catch((e: AxiosError) => {
      if (e.response?.status === 401 || e.response?.status === 403) {
        if (!currentToken) useAuth.getState().clear();
      }
      return null;
    })
    .finally(() => { refreshing = null; });
  return refreshing;
}

api.interceptors.response.use((r) => r, async (error: AxiosError<any>) => {
  const cfg: any = error.config;
  if (error.response?.status === 401 && cfg && !cfg._retry && !String(cfg.url).startsWith('/auth/')) {
    cfg._retry = true;
    const t = await refreshSession();
    if (t) { cfg.headers.Authorization = `Bearer ${t}`; return api(cfg); }
  }
  return Promise.reject(error);
});

export function errMsg(e: unknown, fallback = 'Something went wrong. Please retry.') {
  const ax = e as AxiosError<any>;
  if (ax?.response?.data?.error?.message) return ax.response.data.error.message as string;
  if (ax?.code === 'ERR_NETWORK') return 'Cannot reach the server. Check your connection.';
  return fallback;
}
export const get = <T = any>(url: string, params?: any) => api.get<T>(url, { params }).then((r) => r.data);
export const post = <T = any>(url: string, body?: any) => api.post<T>(url, body).then((r) => r.data);
export const patch = <T = any>(url: string, body?: any) => api.patch<T>(url, body).then((r) => r.data);
export const del = <T = any>(url: string) => api.delete<T>(url).then((r) => r.data);

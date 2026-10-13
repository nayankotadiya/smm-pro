import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || '';
export const DIRECT_URL = import.meta.env.VITE_DIRECT_API_URL
  || API_URL
  || (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? ''
    : 'https://smm-pro-api.onrender.com');

export const api = axios.create({
  baseURL: `${API_URL}/api/portal`,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('smm_client_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('smm_client_token');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

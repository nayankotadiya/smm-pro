import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';
import './store/theme';
import { registerSW } from './pwa';

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: (n, e: any) => n < 2 && !(e?.response?.status >= 400 && e?.response?.status < 500), refetchOnWindowFocus: true }, mutations: { retry: 0 } } });
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><QueryClientProvider client={qc}><BrowserRouter><App /></BrowserRouter></QueryClientProvider></React.StrictMode>,
);
registerSW();

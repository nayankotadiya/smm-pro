import { io, Socket } from 'socket.io-client';
import { API_URL, DIRECT_URL } from './api';

let socket: Socket | null = null;

export function getPortalSocket(): Socket | null {
  const token = localStorage.getItem('smm_client_token');
  if (!token) {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    return null;
  }

  if (socket) {
    if ((socket.auth as any)?.token !== token) {
      socket.auth = { token };
      if (socket.connected) {
        socket.disconnect();
      }
      socket.connect();
    } else if (!socket.connected) {
      socket.connect();
    }
    return socket;
  }

  // Connect to direct backend host for WebSockets (Vercel serverless rewrites do not support WebSocket proxying)
  const socketUrl = DIRECT_URL || (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? window.location.origin : 'https://smm-pro-api.onrender.com');

  socket = io(socketUrl, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 15,
    reconnectionDelay: 1500,
  });

  socket.on('connect', () => {
    console.log('[portal socket] Connected to realtime gateway');
  });

  socket.on('disconnect', (reason) => {
    console.log('[portal socket] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.warn('[portal socket] Connection error:', err.message);
  });

  return socket;
}

export function disconnectPortalSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

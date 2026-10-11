import { io, Socket } from 'socket.io-client';
import { API_URL } from './api';

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

  if (socket && socket.connected) {
    return socket;
  }

  if (!socket) {
    // When API_URL is empty (proxied on localhost:5174 or same origin), connect to current host
    const socketUrl = API_URL || window.location.origin;

    socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
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
  }

  return socket;
}

export function disconnectPortalSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

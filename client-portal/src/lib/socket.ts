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

  // When API_URL is empty (proxied on localhost:5174 or same origin), connect to current host
  const socketUrl = API_URL || window.location.origin;

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

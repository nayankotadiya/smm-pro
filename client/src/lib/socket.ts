import { io, Socket } from 'socket.io-client';
import { DIRECT_URL, refreshSession } from './api';
import { useAuth } from '@/store/auth';
import { useUI } from '@/store/ui';

let socket: Socket | null = null;
let activity = '';
let lastInput = Date.now();

export function getSocket() { return socket; }
export function setActivity(a: string) { if (a !== activity) { activity = a; socket?.emit('presence:heartbeat', { active: true, activity }); } }

export function connectSocket() {
  if (socket) return socket;
  socket = io(DIRECT_URL || window.location.origin, { auth: (cb) => cb({ token: useAuth.getState().token }), transports: ['websocket', 'polling'], reconnectionDelayMax: 10000 });
  socket.on('connect', () => { useUI.getState().setConn({ socketUp: true }); socket!.emit('presence:heartbeat', { active: true, activity }); });
  socket.on('disconnect', () => useUI.getState().setConn({ socketUp: false }));
  socket.on('connect_error', async (e) => { if (e.message === 'unauthorized') { const t = await refreshSession(); if (t) socket?.connect(); } });
  const mark = () => { lastInput = Date.now(); };
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach((ev) => window.addEventListener(ev, mark, { passive: true }));
  // heartbeat: tells the server whether the person is actually active (drives ONLINE vs AWAY)
  window.setInterval(() => { if (socket?.connected) socket.emit('presence:heartbeat', { active: document.visibilityState === 'visible' && Date.now() - lastInput < 60_000, activity }); }, 30_000);
  return socket;
}
export function disconnectSocket() { socket?.disconnect(); socket = null; }

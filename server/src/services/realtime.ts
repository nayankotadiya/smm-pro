import type { Server } from 'socket.io';
let io: Server | null = null;
export const setIO = (s: Server) => { io = s; };
export const getIO = () => io;
export const emitToUser = (userId: any, event: string, data: any) => io?.to(`user:${String(userId)}`).emit(event, data);
export const emitToUsers = (ids: any[], event: string, data: any) => { const u = [...new Set(ids.filter(Boolean).map(String))]; if (u.length) io?.to(u.map((i) => `user:${i}`)).emit(event, data); };
export const emitToRoom = (room: string, event: string, data: any) => io?.to(room).emit(event, data);
export const emitOrg = (event: string, data: any) => io?.to('org').emit(event, data);

import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { env, isAllowedOrigin } from '../config/env';
import { userFromToken } from '../middleware/auth';
import { setIO } from '../services/realtime';
import { Presence, ChatRoom, Message, Content } from '../models';
import { visibilityFilter } from '../services/content';

const AWAY_AFTER_MS = 5 * 60_000;
/** Upserts can race when one person connects from two tabs at once; the loser gets E11000 and simply retries as an update. */
async function upsertPresence(userId: string, patch: any) {
  for (let i = 0; ; i++) {
    try { return await Presence.findOneAndUpdate({ userId }, patch, { upsert: true, new: true }); }
    catch (e: any) { if (e?.code !== 11000 || i >= 3) throw e; }
  }
}
async function setPresence(userId: string, patch: any, io: Server) {
  const p = await upsertPresence(userId, patch);
  const status = p!.socketIds.length === 0 ? 'OFFLINE' : p!.manualStatus === 'DND' ? 'DND' : p!.lastActive && Date.now() - p!.lastActive.getTime() > AWAY_AFTER_MS ? 'AWAY' : 'ONLINE';
  if (status === 'OFFLINE' && !p!.lastSeen) {
    p!.lastSeen = p!.lastActive || new Date();
  }
  if (status !== p!.status) { p!.status = status as any; await p!.save(); }
  const evt = status === 'OFFLINE' ? 'user_offline' : status === 'AWAY' ? 'user_away' : 'user_online';
  io.to('org').emit(evt, { userId, status, lastSeen: p!.lastSeen, lastActive: p!.lastActive, currentActivity: p!.currentActivity });
}

export function initSockets(server: HttpServer) {
  const io = new Server(server, {
    cors: {
      origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
      credentials: true,
    },
    pingInterval: 20000,
    pingTimeout: 20000,
  });
  setIO(io);
  io.use(async (socket, next) => {
    try { (socket.data as any).user = await userFromToken(String(socket.handshake.auth?.token || '')); next(); }
    catch { next(new Error('unauthorized')); }
  });
  io.on('connection', (socket) => {
    const user = (socket.data as any).user;
    const uid = user._id;
    socket.join(`user:${uid}`); socket.join('org');
    // every handler is guarded: a failed DB call must never take the process down
    const on = (ev: string, fn: (...a: any[]) => any) => socket.on(ev, (...a: any[]) => { Promise.resolve().then(() => fn(...a)).catch((e) => console.error(`[socket] ${ev}`, e?.message || e)); });

    on('presence:heartbeat', async (d: { active?: boolean; activity?: string }) => {
      const patch: any = { lastSeen: new Date() };
      if (d?.active) patch.lastActive = new Date();
      if (d?.activity !== undefined) patch.currentActivity = String(d.activity).slice(0, 80);
      await setPresence(uid, patch, io);
    });
    on('presence:set', async (d: { status: 'DND' | 'ONLINE' }) => setPresence(uid, { manualStatus: d?.status === 'DND' ? 'DND' : null, lastActive: new Date() }, io));

    on('chat:join', async (roomId: string, ack?: (ok: boolean) => void) => {
      const ok = !!(await ChatRoom.exists({ _id: roomId, participants: uid }));
      if (ok) socket.join(`chat:${roomId}`);
      ack?.(ok);
    });
    on('chat:leave', (roomId: string) => socket.leave(`chat:${roomId}`));
    on('message:typing', async (d: { roomId: string; typing: boolean }) => {
      if (!d?.roomId) return;
      const rm = await ChatRoom.findById(d.roomId).select('participants').lean();
      if (rm?.participants && rm.participants.map(String).includes(String(uid))) {
        socket.to(`chat:${d.roomId}`).emit('message:typing', { roomId: d.roomId, userId: uid, name: user.name, typing: !!d.typing });
        for (const p of rm.participants) {
          if (String(p) !== String(uid)) {
            io.to(`user:${p}`).emit('message:typing', { roomId: d.roomId, userId: uid, name: user.name, typing: !!d.typing });
          }
        }
      }
    });
    on('message:delivered', async (d: { roomId: string }) => {
      if (!socket.rooms.has(`chat:${d.roomId}`)) {
        const ok = !!(await ChatRoom.exists({ _id: d.roomId, participants: uid }));
        if (ok) socket.join(`chat:${d.roomId}`);
        else return;
      }
      await Message.updateMany({ roomId: d.roomId, senderId: { $ne: uid }, deliveredTo: { $ne: uid } }, { $addToSet: { deliveredTo: uid } });
      io.to(`chat:${d.roomId}`).emit('message:delivered', { roomId: d.roomId, userId: uid });
      const rm = await ChatRoom.findById(d.roomId).select('participants').lean();
      if (rm?.participants) {
        for (const p of rm.participants) {
          if (String(p) !== String(uid)) io.to(`user:${p}`).emit('message:delivered', { roomId: d.roomId, userId: uid });
        }
      }
    });
    on('message:read', async (d: { roomId: string }) => {
      if (!socket.rooms.has(`chat:${d.roomId}`)) {
        const ok = !!(await ChatRoom.exists({ _id: d.roomId, participants: uid }));
        if (ok) socket.join(`chat:${d.roomId}`);
        else return;
      }
      await Message.updateMany({ roomId: d.roomId, readBy: { $ne: uid } }, { $addToSet: { readBy: uid, deliveredTo: uid } });
      io.to(`chat:${d.roomId}`).emit('message:read', { roomId: d.roomId, userId: uid });
      const rm = await ChatRoom.findById(d.roomId).select('participants').lean();
      if (rm?.participants) {
        for (const p of rm.participants) {
          if (String(p) !== String(uid)) io.to(`user:${p}`).emit('message:read', { roomId: d.roomId, userId: uid });
        }
      }
      io.to(`user:${uid}`).emit('chat:unread_changed', { roomId: d.roomId });
    });
    on('content:watch', async (contentId: string) => {
      if (await Content.exists({ $and: [{ _id: contentId }, visibilityFilter(user)] })) socket.join(`content:${contentId}`);
    });
    on('content:unwatch', (contentId: string) => socket.leave(`content:${contentId}`));

    on('disconnect', async () => {
      await ready.catch(() => undefined); // never race the connect bookkeeping
      await Presence.updateOne({ userId: uid }, { $pull: { socketIds: socket.id }, lastSeen: new Date() });
      await setPresence(uid, {}, io);
    });

    // Handlers above are registered synchronously so no early client event is dropped; presence bookkeeping follows.
    const ready = (async () => {
      await upsertPresence(uid, { $addToSet: { socketIds: socket.id }, lastSeen: new Date(), lastActive: new Date() });
      await setPresence(uid, {}, io);
    })();
    ready.catch((e) => console.error('[presence]', e));
  });
  // periodic sweep flips inactive users to AWAY
  const sweep = setInterval(async () => {
    try {
      const stale = await Presence.find({ status: 'ONLINE', lastActive: { $lt: new Date(Date.now() - AWAY_AFTER_MS) } });
      for (const p of stale) await setPresence(String(p.userId), {}, io);
    } catch (e: any) { console.error('[presence sweep]', e?.message); }
  }, 60_000);
  sweep.unref();
  io.engine.on('close', () => clearInterval(sweep));
  return io;
}

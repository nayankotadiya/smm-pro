import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createApp } from '../app';
import { User, RoleModel, Client } from '../models';
import { DEFAULT_ROLE_PERMISSIONS, ROLES } from '../config/constants';
import { seedAutomations, startAutomationEngine } from '../services/automation';
import { bus } from '../services/events';

let mongod: MongoMemoryServer | undefined;
export const app = createApp();
export const users: Record<string, { id: string; token: string }> = {};
let engine = false;

export async function boot() {
  if (process.env.TEST_MONGO_URI) { await mongoose.connect(process.env.TEST_MONGO_URI); await mongoose.connection.dropDatabase(); }
  else { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); }
  for (const k of ROLES) await RoleModel.create({ key: k, permissions: DEFAULT_ROLE_PERMISSIONS[k] });
  await seedAutomations();
  if (!engine) { startAutomationEngine(); engine = true; }
  const hash = await bcrypt.hash('Password@1', 4);
  const team = [['nayan', 'SUPER_ADMIN'], ['ishita', 'MANAGER'], ['rahul', 'EDITOR'], ['harsh', 'SHOOTER'], ['pooja', 'SCRIPT_WRITER'], ['aman', 'SMM'], ['other', 'EDITOR']] as const;
  for (const [n, role] of team) {
    const u = await User.create({ name: n[0].toUpperCase() + n.slice(1), email: `${n}@t.local`, role, passwordHash: hash });
    const r = await request(app).post('/api/auth/login').send({ email: `${n}@t.local`, password: 'Password@1' });
    users[n] = { id: String(u._id), token: r.body.accessToken };
  }
}
export async function shutdown() { bus.removeAllListeners(); engine = false; await mongoose.disconnect(); await mongod?.stop(); }
export const as = (who: string) => ({
  get: (u: string) => request(app).get(u).set('Authorization', `Bearer ${users[who].token}`),
  post: (u: string, b?: any) => request(app).post(u).set('Authorization', `Bearer ${users[who].token}`).send(b || {}),
  patch: (u: string, b?: any) => request(app).patch(u).set('Authorization', `Bearer ${users[who].token}`).send(b || {}),
  del: (u: string) => request(app).delete(u).set('Authorization', `Bearer ${users[who].token}`),
});
/** automations run async off the event bus */
export const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));
export async function makeClient() {
  const r = await as('nayan').post('/api/clients', { name: 'Zemora Jewels', phone: '9876543210', contactPerson: 'Meera', defaultTeam: { writer: users.pooja.id, shooter: users.harsh.id, editor: users.rahul.id, smm: users.aman.id, reviewer: users.ishita.id } });
  return r.body;
}
/** A tiny but valid MP4 header so magic-byte sniffing accepts it as video */
export function fakeMp4() {
  const p = path.join(os.tmpdir(), `t_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);
  const ftyp = Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0, 0, 0, 0, 0x6d, 0x70, 0x34, 0x32, 0x69, 0x73, 0x6f, 0x6d]);
  fs.writeFileSync(p, Buffer.concat([ftyp, Buffer.alloc(4096, 1)]));
  return p;
}
export async function uploadVideo(who: string, contentId: string, category: string) {
  const file = fakeMp4();
  const init = await as(who).post('/api/media/upload', { contentId, category, fileName: 'clip.mp4', mimeType: 'video/mp4', size: fs.statSync(file).size });
  if (init.status !== 201) return init;
  const up = await request(app).post(init.body.uploadUrl).set('Authorization', `Bearer ${users[who].token}`).attach('file', file);
  fs.unlinkSync(file);
  return up;
}
export { Client };

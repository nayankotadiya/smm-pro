/**
 * Seeds roles, automations, the team, clients and sample content.
 * Everything is created through the same services the app uses, so IDs, chat rooms,
 * progress and activity are real. Safe to re-run (skips what already exists).
 *   npm run seed            -> seed
 *   npm run seed -- --reset -> wipe the database first (never run in production)
 */
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDb } from './config/db';
import { env } from './config/env';
import { User, RoleModel, Client, Content, Campaign } from './models';
import { DEFAULT_ROLE_PERMISSIONS, ROLES, Role } from './config/constants';
import { seedAutomations, startAutomationEngine } from './services/automation';
import { createContent } from './services/content';
import { saveVersion, submitScript } from './services/scripts';
import { ensureClientRoom } from './services/chat';
import { permissionsFor } from './middleware/auth';

const PASSWORD = process.env.SEED_PASSWORD || 'Password123!';
const TEAM: { name: string; email: string; role: Role; title: string }[] = [
  { name: 'Nayan', email: 'nayan@smmpro.local', role: 'SUPER_ADMIN', title: 'Admin' },
  { name: 'Hasti', email: 'hasti@smmpro.local', role: 'MANAGER', title: 'Manager' },
  { name: 'Siddharth', email: 'siddharth@smmpro.local', role: 'SCRIPT_WRITER', title: 'Script Writer' },
  { name: 'Bhargav', email: 'bhargav@smmpro.local', role: 'SHOOTER', title: 'Shooter' },
  { name: 'Tapesh', email: 'tapesh@smmpro.local', role: 'EDITOR', title: 'Video Editor' },
  { name: 'Isha', email: 'isha@smmpro.local', role: 'SMM', title: 'Social Media Manager' },
  { name: 'Dharmi', email: 'dharmi@smmpro.local', role: 'SMM', title: 'Social Media Manager' },
];
const CLIENTS = [
  { name: 'Zemora Jewels', category: 'Jewellery', brandTone: 'Elegant, festive' },
  { name: 'Leafiber', category: 'Sustainable products', brandTone: 'Clean, informative' },
  { name: 'Jasumati', category: 'Fashion', brandTone: 'Warm, traditional' },
  { name: 'Kukus91', category: 'Food', brandTone: 'Playful' },
  { name: 'Kukus69', category: 'Food', brandTone: 'Playful' },
];
const CONTENT = [
  { title: 'Diwali Collection Reel', client: 'Zemora Jewels', days: 5, priority: 'HIGH', script: 'submit' },
  { title: 'New Arrival Reel', client: 'Zemora Jewels', days: 9, priority: 'MEDIUM', script: 'draft' },
  { title: 'Festival Look Reel', client: 'Jasumati', days: 7, priority: 'MEDIUM', script: 'draft' },
  { title: 'Product Benefits Reel', client: 'Leafiber', days: 10, priority: 'MEDIUM' },
  { title: 'Customer Testimonial', client: 'Kukus91', days: 12, priority: 'LOW' },
  { title: 'Offer Reel', client: 'Kukus69', days: 3, priority: 'URGENT' },
];

async function main() {
  await connectDb();
  if (process.argv.includes('--reset')) {
    if (env.isProd) throw new Error('Refusing to reset a production database');
    await mongoose.connection.dropDatabase(); console.log('database reset');
  }
  for (const k of ROLES) await RoleModel.updateOne({ key: k }, { $setOnInsert: { key: k, label: k.replace(/_/g, ' '), permissions: DEFAULT_ROLE_PERMISSIONS[k] } }, { upsert: true });
  await seedAutomations();
  startAutomationEngine();
  const hash = await bcrypt.hash(PASSWORD, 12);
  const U: Record<string, any> = {};
  for (const t of TEAM) U[t.name] = (await User.findOne({ email: t.email })) || (await User.create({ ...t, passwordHash: hash }));
  const admin = { _id: String(U.Nayan._id), name: 'Nayan', email: U.Nayan.email, role: 'SUPER_ADMIN' as Role, permissions: await permissionsFor('SUPER_ADMIN') };
  const writer = { _id: String(U.Siddharth._id), name: 'Siddharth', email: U.Siddharth.email, role: 'SCRIPT_WRITER' as Role, permissions: await permissionsFor('SCRIPT_WRITER') };

  const C: Record<string, any> = {};
  for (const [i, c] of CLIENTS.entries()) {
    C[c.name] = (await Client.findOne({ name: c.name })) || (await Client.create({ ...c, businessName: c.name, status: 'ACTIVE', createdBy: U.Nayan._id, assignedTeam: [U[i % 2 ? 'Dharmi' : 'Isha']._id, U.Siddharth._id, U.Bhargav._id, U.Tapesh._id, U.Hasti._id], defaultTeam: { writer: U.Siddharth._id, shooter: U.Bhargav._id, editor: U.Tapesh._id, smm: U.Dharmi._id, reviewer: U.Hasti._id } }));
    await ensureClientRoom(C[c.name]);
  }
  const camp = (await Campaign.findOne({ name: 'Diwali 2026' })) || (await Campaign.create({ name: 'Diwali 2026', clientId: C['Zemora Jewels']._id, createdBy: U.Nayan._id }));

  for (const c of CONTENT) {
    if (await Content.exists({ title: c.title })) continue;
    const doc: any = await createContent({ title: c.title, clientId: String(C[c.client]._id), campaignId: c.client === 'Zemora Jewels' ? camp._id : undefined, type: c.title.includes('Testimonial') ? 'VIDEO' : 'REEL', platform: 'INSTAGRAM', priority: c.priority, deadline: new Date(Date.now() + c.days * 864e5) }, admin);
    if (c.script) {
      await saveVersion(String(doc.scriptId), { hook: `Opening hook for ${c.title}`, scenes: [{ title: 'Scene 1', dialogue: 'Introduce the product.', visual: 'Close-up product shot' }, { title: 'Scene 2', dialogue: 'Show it in use.', visual: 'Lifestyle shot' }], cta: 'Shop now — link in bio', duration: '30s', music: 'Upbeat festive' }, writer);
      if (c.script === 'submit') await submitScript(String(doc.scriptId), writer);
    }
    console.log('content', doc.contentId, c.title);
  }
  await new Promise((r) => setTimeout(r, 1500)); // let automations finish
  console.log(`\nSeed complete. Sign in with any of:\n${TEAM.map((t) => `  ${t.email}  (${t.role})`).join('\n')}\nPassword: ${PASSWORD}\nChange these passwords immediately.`);
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

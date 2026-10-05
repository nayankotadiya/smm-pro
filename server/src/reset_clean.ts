/**
 * Completely wipes all dummy/test content, tasks, approvals, media, chats, clients,
 * uploaded test files, and operational logs, leaving a 100% clean slate with zero dummy data.
 *
 * Re-seeds system roles, permissions, and automations.
 * Sets up production-ready team accounts.
 */
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDb } from './config/db';
import { env } from './config/env';
import {
  User,
  RoleModel,
  Client,
  Content,
  Script,
  ScriptVersion,
  Shoot,
  Approval,
  Task,
  Media,
  ChatRoom,
  Message,
  ChatActionMessage,
  ActivityLog,
  Reminder,
  DailyReviewAccess,
  WhatsAppNotificationLog,
  Feedback,
  Campaign,
  Notification,
  AutomationRun,
  ScheduledPost,
  Counter,
  CommunicationLog,
  Review,
  PushSubscription,
  DriveFile,
  DriveFolder,
  RefreshToken,
  Presence,
  WebhookEvent,
} from './models';
import { DEFAULT_ROLE_PERMISSIONS, ROLES, Role } from './config/constants';
import { seedAutomations } from './services/automation';

const PASSWORD = process.env.ADMIN_PASSWORD || process.env.SEED_PASSWORD || 'Password123!';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'nayan@smmpro.local').toLowerCase();

const TEAM: { name: string; email: string; role: Role; title: string }[] = [
  { name: 'Nayan', email: ADMIN_EMAIL, role: 'SUPER_ADMIN', title: 'Admin' },
  { name: 'Hasti', email: 'hasti@smmpro.local', role: 'MANAGER', title: 'Manager' },
  { name: 'Siddharth', email: 'siddharth@smmpro.local', role: 'SCRIPT_WRITER', title: 'Script Writer' },
  { name: 'Bhargav', email: 'bhargav@smmpro.local', role: 'SHOOTER', title: 'Shooter' },
  { name: 'Tapesh', email: 'tapesh@smmpro.local', role: 'EDITOR', title: 'Video Editor' },
  { name: 'Isha', email: 'isha@smmpro.local', role: 'SMM', title: 'Social Media Manager' },
  { name: 'Dharmi', email: 'dharmi@smmpro.local', role: 'SMM', title: 'Social Media Manager' },
];

async function cleanUploadsDirectory() {
  const uploadsDir = path.resolve(__dirname, '../uploads');
  if (fs.existsSync(uploadsDir)) {
    const files = fs.readdirSync(uploadsDir);
    let removedCount = 0;
    for (const file of files) {
      if (file === '.gitkeep') continue;
      const fullPath = path.join(uploadsDir, file);
      try {
        if (fs.statSync(fullPath).isFile()) {
          fs.unlinkSync(fullPath);
          removedCount++;
        }
      } catch (err) {
        console.warn(`Could not delete file ${file}:`, err);
      }
    }
    console.log(`Cleaned uploads directory: ${removedCount} dummy media files removed.`);
  }
}

async function main() {
  await connectDb();
  console.log('========================================================');
  console.log('       SMM PRO: PURGING ALL DUMMY DATA FOR LIVE PROD    ');
  console.log('========================================================');

  // 1. Wipe all operational collections
  await Promise.all([
    Content.deleteMany({}),
    Script.deleteMany({}),
    ScriptVersion.deleteMany({}),
    Counter.deleteMany({}),
    ScheduledPost.deleteMany({}),
    Shoot.deleteMany({}),
    Approval.deleteMany({}),
    Task.deleteMany({}),
    Media.deleteMany({}),
    DriveFile.deleteMany({}),
    DriveFolder.deleteMany({}),
    ChatRoom.deleteMany({}),
    Message.deleteMany({}),
    ChatActionMessage.deleteMany({}),
    ActivityLog.deleteMany({}),
    Reminder.deleteMany({}),
    DailyReviewAccess.deleteMany({}),
    WhatsAppNotificationLog.deleteMany({}),
    Feedback.deleteMany({}),
    Campaign.deleteMany({}),
    Client.deleteMany({}),
    CommunicationLog.deleteMany({}),
    Review.deleteMany({}),
    Notification.deleteMany({}),
    PushSubscription.deleteMany({}),
    AutomationRun.deleteMany({}),
    WebhookEvent.deleteMany({}),
    RefreshToken.deleteMany({}),
    Presence.deleteMany({}),
    User.deleteMany({}),
  ]);
  console.log('✓ All database operational collections wiped to 0 records.');

  // 2. Wipe dummy uploaded files
  await cleanUploadsDirectory();

  // 3. Re-seed Roles and Permissions
  for (const k of ROLES) {
    await RoleModel.updateOne(
      { key: k },
      { $set: { key: k, label: k.replace(/_/g, ' '), permissions: DEFAULT_ROLE_PERMISSIONS[k] } },
      { upsert: true }
    );
  }
  console.log(`✓ System roles (${ROLES.length}) and permissions initialized.`);

  // 4. Re-seed Automations
  await seedAutomations();
  console.log('✓ System automation rules initialized.');

  // 5. Create clean accounts
  const hash = await bcrypt.hash(PASSWORD, 12);
  for (const t of TEAM) {
    await User.create({
      name: t.name,
      email: t.email,
      role: t.role,
      title: t.title,
      passwordHash: hash,
      active: true,
    });
  }

  console.log('\n========================================================');
  console.log('✓ DATABASE RESET TO 100% CLEAN PRODUCTION STATE');
  console.log('Zero dummy clients, zero dummy contents, zero dummy tasks.');
  console.log('Active Team Accounts initialized:');
  TEAM.forEach((t) => {
    console.log(`  - ${t.name.padEnd(10)} [${t.role.padEnd(14)}] : ${t.email}`);
  });
  console.log('\nInitial password for all accounts: ' + PASSWORD);
  console.log('IMPORTANT: Change passwords immediately upon first login!');
  console.log('To create an admin with a custom email/password directly:');
  console.log('  npm run create-admin -- "Admin Name" admin@agency.com "YourPassword"');
  console.log('========================================================\n');

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('Reset error:', e);
  process.exit(1);
});

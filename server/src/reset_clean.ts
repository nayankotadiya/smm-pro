/**
 * Completely wipes all dummy/test content, tasks, approvals, media, chats, clients,
 * uploaded test files, and operational logs, leaving a 100% clean slate with zero dummy data.
 *
 * PRESERVES ALL USERS, PASSWORDS, ROLES, AND PUSH SUBSCRIPTIONS.
 */
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { connectDb } from './config/db';
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
  DriveFile,
  DriveFolder,
  WebhookEvent,
} from './models';
import { DEFAULT_ROLE_PERMISSIONS, ROLES } from './config/constants';
import { seedAutomations } from './services/automation';

export async function cleanUploadsDirectory() {
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

/**
 * Purges all demo data from database while strictly preserving all Users,
 * Roles, and Push Subscriptions.
 */
export async function purgeDemoData() {
  // Wipe all demo operational collections
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
    AutomationRun.deleteMany({}),
    WebhookEvent.deleteMany({}),
  ]);

  // Clean physical upload artifacts
  await cleanUploadsDirectory();

  // Ensure system roles & permissions are updated
  for (const k of ROLES) {
    await RoleModel.updateOne(
      { key: k },
      { $set: { key: k, label: k.replace(/_/g, ' '), permissions: DEFAULT_ROLE_PERMISSIONS[k] } },
      { upsert: true }
    );
  }

  // Ensure system automations are active
  await seedAutomations();
}

async function main() {
  await connectDb();
  console.log('========================================================');
  console.log('       SMM PRO: PURGING ALL DUMMY DATA FOR LIVE PROD    ');
  console.log('========================================================');

  await purgeDemoData();
  console.log('✓ All dummy clients, contents, scripts, shoots, chats, tasks wiped to 0.');
  console.log('✓ Users, team accounts, passwords, and push subscriptions PRESERVED intact.');

  const userCount = await User.countDocuments();
  console.log(`✓ Active users preserved in database: ${userCount}`);

  console.log('========================================================\n');
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((e) => {
    console.error('Reset error:', e);
    process.exit(1);
  });
}

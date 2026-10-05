import { Schema, model } from 'mongoose';
import { ObjectId, ts } from './common';

const roomSchema = new Schema({
  type: { type: String, enum: ['DIRECT', 'TEAM', 'CONTENT', 'CLIENT'], required: true },
  name: String,
  participants: [{ type: ObjectId, ref: 'User', index: true }],
  clientId: { type: ObjectId, ref: 'Client' },
  contentId: { type: ObjectId, ref: 'Content', index: true },
  directKey: { type: String, unique: true, sparse: true },
  lastMessageAt: Date,
  lastMessagePreview: String,
  pinned: [{ type: ObjectId, ref: 'Message' }],
  createdBy: { type: ObjectId, ref: 'User' },
}, ts);
export const ChatRoom = model('ChatRoom', roomSchema);

const messageSchema = new Schema({
  roomId: { type: ObjectId, ref: 'ChatRoom', required: true, index: true },
  senderId: { type: ObjectId, ref: 'User' },
  kind: { type: String, enum: ['USER', 'SYSTEM'], default: 'USER' },
  message: String,
  system: { event: String, title: String, lines: [String], mediaId: { type: ObjectId, ref: 'Media' }, link: String },
  attachments: [{ type: ObjectId, ref: 'Media' }],
  replyTo: { type: ObjectId, ref: 'Message' },
  mentions: [{ type: ObjectId, ref: 'User' }],
  reactions: [{ userId: { type: ObjectId, ref: 'User' }, key: String, _id: false }],
  deliveredTo: [{ type: ObjectId, ref: 'User' }],
  readBy: [{ type: ObjectId, ref: 'User' }],
  editedAt: Date,
  deletedAt: Date,
}, ts);
messageSchema.index({ roomId: 1, createdAt: -1 });
export const Message = model('Message', messageSchema);

const notificationSchema = new Schema({
  userId: { type: ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, required: true },
  category: { type: String, required: true, index: true },
  title: { type: String, required: true },
  message: String,
  link: String,
  entityType: String, entityId: String,
  contentId: { type: ObjectId, ref: 'Content' },
  read: { type: Boolean, default: false, index: true },
  readAt: Date,
  critical: { type: Boolean, default: false },
  delivery: {
    push: { type: String, enum: ['NONE', 'QUEUED', 'SENT', 'FAILED', 'NO_SUBSCRIPTION'], default: 'NONE' },
    email: { type: String, enum: ['NONE', 'QUEUED', 'SENT', 'FAILED'], default: 'NONE' },
  },
}, ts);
notificationSchema.index({ userId: 1, createdAt: -1 });
export const Notification = model('Notification', notificationSchema);

const subSchema = new Schema({
  userId: { type: ObjectId, ref: 'User', required: true, index: true },
  endpoint: { type: String, required: true, unique: true },
  keys: { p256dh: String, auth: String },
  deviceType: String, platform: String, browser: String,
  lastUsedAt: Date, failures: { type: Number, default: 0 },
}, ts);
export const PushSubscription = model('PushSubscription', subSchema);

const automationSchema = new Schema({
  name: { type: String, required: true },
  key: { type: String, unique: true, sparse: true },
  trigger: { type: String, required: true, index: true },
  conditions: { type: Schema.Types.Mixed, default: {} },
  actions: [{ type: { type: String, required: true }, params: Schema.Types.Mixed, _id: false }],
  active: { type: Boolean, default: true },
  system: { type: Boolean, default: false },
  lastRunAt: Date,
  lastResult: { type: String, enum: ['SUCCESS', 'FAILED', 'SKIPPED', null], default: null },
  lastError: String,
  runCount: { type: Number, default: 0 },
  failCount: { type: Number, default: 0 },
}, ts);
export const Automation = model('Automation', automationSchema);

const automationRunSchema = new Schema({
  automationId: { type: ObjectId, ref: 'Automation', index: true },
  automationName: String,
  trigger: String,
  contentId: { type: ObjectId, ref: 'Content' },
  actions: [String],
  result: { type: String, enum: ['SUCCESS', 'FAILED', 'SKIPPED'] },
  error: String,
  durationMs: Number,
}, ts);
automationRunSchema.index({ createdAt: -1 });
export const AutomationRun = model('AutomationRun', automationRunSchema);

const activitySchema = new Schema({
  actorId: { type: ObjectId, ref: 'User' },
  actorType: { type: String, enum: ['USER', 'SYSTEM', 'AUTOMATION', 'CLIENT', 'INTEGRATION'], default: 'USER' },
  actorName: String,
  action: { type: String, required: true, index: true },
  message: String,
  entityType: String, entityId: String,
  contentId: { type: ObjectId, ref: 'Content', index: true },
  clientId: { type: ObjectId, ref: 'Client', index: true },
  ip: String,
  meta: Schema.Types.Mixed,
}, ts);
activitySchema.index({ createdAt: -1 });
export const ActivityLog = model('ActivityLog', activitySchema);

const webhookSchema = new Schema({
  provider: String,
  externalId: { type: String, unique: true },
  eventType: String,
  payload: Schema.Types.Mixed,
  processedAt: Date,
  error: String,
}, ts);
export const WebhookEvent = model('WebhookEvent', webhookSchema);

const integrationSchema = new Schema({
  key: { type: String, unique: true }, // drive, aisensy, push, email
  status: { type: String, enum: ['CONNECTED', 'NOT_CONFIGURED', 'ERROR'], default: 'NOT_CONFIGURED' },
  lastCheckAt: Date, lastError: String, meta: Schema.Types.Mixed,
}, ts);
export const Integration = model('Integration', integrationSchema);

const chatActionMessageSchema = new Schema({
  roomId: { type: ObjectId, ref: 'ChatRoom', required: true, index: true },
  messageId: { type: ObjectId, ref: 'Message' },
  contentId: { type: ObjectId, ref: 'Content', index: true },
  clientId: { type: ObjectId, ref: 'Client', index: true },
  actionType: {
    type: String,
    enum: [
      'APPROVE_SCRIPT', 'REQUEST_SCRIPT_CHANGES', 'SUBMIT_FOR_REVIEW',
      'ASSIGN_SHOOTER', 'UPLOAD_RAW', 'UPLOAD_EDIT',
      'SMM_REVIEW', 'FINAL_REVIEW', 'SEND_CLIENT_REVIEW',
      'MARK_APPROVED', 'CREATE_CHANGE_REQUEST',
      'CREATE_TASK', 'CREATE_REMINDER'
    ],
    required: true,
  },
  title: { type: String, required: true },
  description: String,
  status: { type: String, enum: ['PENDING', 'EXECUTED', 'EXPIRED', 'CANCELLED'], default: 'PENDING', index: true },
  payload: Schema.Types.Mixed,
  allowedRoles: [String],
  targetUserId: { type: ObjectId, ref: 'User' },
  executedBy: { type: ObjectId, ref: 'User' },
  executedAt: Date,
  expiresAt: Date,
  resultSummary: String,
}, ts);
export const ChatActionMessage = model('ChatActionMessage', chatActionMessageSchema);

const whatsAppNotificationLogSchema = new Schema({
  provider: { type: String, default: 'AISENSY' },
  externalMessageId: { type: String, index: true, sparse: true },
  recipientPhone: { type: String, required: true },
  recipientName: String,
  clientId: { type: ObjectId, ref: 'Client', index: true },
  contentId: { type: ObjectId, ref: 'Content', index: true },
  approvalId: { type: ObjectId, ref: 'Approval', index: true },
  dailyAccessId: { type: ObjectId, ref: 'DailyReviewAccess' },
  type: {
    type: String,
    enum: ['CLIENT_APPROVAL', 'REVIEW_REMINDER', 'DAILY_GATE_FALLBACK', 'STATUS_ALERT', 'GENERAL'],
    default: 'CLIENT_APPROVAL',
  },
  templateName: String,
  parameters: [String],
  status: {
    type: String,
    enum: ['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'REPLIED'],
    default: 'QUEUED',
    index: true,
  },
  sentAt: Date,
  deliveredAt: Date,
  readAt: Date,
  buttonClicked: String,
  responsePayload: Schema.Types.Mixed,
  error: String,
}, ts);
export const WhatsAppNotificationLog = model('WhatsAppNotificationLog', whatsAppNotificationLogSchema);

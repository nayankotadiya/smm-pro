import { Schema, model } from 'mongoose';
import { ObjectId, ts, softDelete } from './common';

const taskSchema = new Schema({
  title: { type: String, required: true },
  description: String,
  clientId: { type: ObjectId, ref: 'Client', index: true },
  contentId: { type: ObjectId, ref: 'Content', index: true },
  assignedTo: { type: ObjectId, ref: 'User', index: true },
  createdBy: { type: ObjectId, ref: 'User' },
  source: { type: String, enum: ['MANUAL', 'AUTOMATIC', 'CHAT'], default: 'MANUAL' },
  kind: { type: String, default: 'GENERAL' }, // SCRIPT_REVISION, SHOOT, EDIT, SMM_REVIEW, FINAL_REVIEW, SCHEDULE, REVISION ...
  priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'], default: 'MEDIUM' },
  dueAt: Date,
  status: { type: String, enum: ['TODO', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'OVERDUE', 'BLOCKED'], default: 'TODO', index: true },
  blockedReason: String, blockedSince: Date,
  completedAt: Date,
  sourceMessageId: { type: ObjectId, ref: 'Message' },
  automationId: { type: ObjectId, ref: 'Automation' },
  overdueNotifiedAt: Date,
}, ts);
taskSchema.index({ assignedTo: 1, status: 1, dueAt: 1 });
taskSchema.index({ status: 1, dueAt: 1 });
taskSchema.index({ clientId: 1, status: 1 });
softDelete(taskSchema);
export const Task = model('Task', taskSchema);

const reminderSchema = new Schema({
  title: { type: String, required: true },
  description: String,
  type: { type: String, enum: ['TASK', 'CONTENT', 'CLIENT_FOLLOWUP', 'MEETING', 'APPROVAL', 'PERSONAL'], default: 'PERSONAL' },
  userId: { type: ObjectId, ref: 'User', required: true, index: true },
  participants: [{ type: ObjectId, ref: 'User' }],
  createdBy: { type: ObjectId, ref: 'User' },
  clientId: { type: ObjectId, ref: 'Client' }, contentId: { type: ObjectId, ref: 'Content' },
  taskId: { type: ObjectId, ref: 'Task' }, messageId: { type: ObjectId, ref: 'Message' }, approvalId: { type: ObjectId, ref: 'Approval' },
  remindAt: { type: Date, required: true, index: true },
  nextFireAt: { type: Date, index: true }, // when the scheduler should next notify; null once a one-off has fired
  repeat: { type: String, enum: ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'], default: 'NONE' },
  priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'], default: 'MEDIUM' },
  channels: { inApp: { type: Boolean, default: true }, push: { type: Boolean, default: true }, email: { type: Boolean, default: false } },
  completed: { type: Boolean, default: false },
  lastTriggeredAt: Date,
  source: { type: String, enum: ['MANUAL', 'AUTOMATIC', 'CHAT'], default: 'MANUAL' },
}, ts);
reminderSchema.pre('save', function (next) { if (this.isModified('remindAt') || this.isNew) this.nextFireAt = this.remindAt; next(); });
reminderSchema.index({ completed: 1, nextFireAt: 1 });
reminderSchema.index({ userId: 1, completed: 1, remindAt: 1 });
export const Reminder = model('Reminder', reminderSchema);

const approvalEvent = new Schema({ status: String, at: { type: Date, default: Date.now }, by: { type: ObjectId, ref: 'User' }, note: String, source: String }, { _id: false });
const approvalSchema = new Schema({
  contentId: { type: ObjectId, ref: 'Content', required: true, index: true },
  clientId: { type: ObjectId, ref: 'Client', index: true },
  type: { type: String, enum: ['INTERNAL_SCRIPT', 'CLIENT_SCRIPT', 'SMM', 'FINAL', 'CLIENT_FINAL'], required: true },
  version: String,
  scriptVersionId: { type: ObjectId, ref: 'ScriptVersion' },
  mediaId: { type: ObjectId, ref: 'Media' },
  status: { type: String, enum: ['DRAFT', 'SENT', 'DELIVERED', 'OPENED', 'WAITING_FOR_CLIENT', 'PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'EXPIRED', 'CANCELLED'], default: 'DRAFT', index: true },
  reviewerId: { type: ObjectId, ref: 'User' },
  tokenHash: { type: String, index: true, sparse: true, select: false },
  tokenEnc: { type: String, select: false }, // encrypted copy so staff can re-copy the active link; cleared once decided
  expiresAt: Date,
  sentAt: Date, deliveredAt: Date, openedAt: Date, decidedAt: Date, approvedAt: Date,
  source: { type: String, enum: ['INTERNAL', 'AISENSY', 'LINK', 'MANUAL'], default: 'INTERNAL' },
  recipientPhone: String, recipientName: String,
  externalMessageId: String,
  sendError: String,
  feedbackCount: { type: Number, default: 0 },
  history: [approvalEvent],
  followUpReminderAt: Date,
  createdBy: { type: ObjectId, ref: 'User' },
}, ts);
approvalSchema.index({ type: 1, status: 1, sentAt: 1 });
approvalSchema.index({ status: 1, expiresAt: 1 });
approvalSchema.index({ clientId: 1, type: 1, status: 1 });
// the token hash must never leave the server, even on freshly created docs (select:false only affects queries)
approvalSchema.set('toJSON', { transform: (_d, r: any) => { delete r.tokenHash; delete r.tokenEnc; return r; } });
export const Approval = model('Approval', approvalSchema);

const feedbackSchema = new Schema({
  contentId: { type: ObjectId, ref: 'Content', index: true },
  approvalId: { type: ObjectId, ref: 'Approval', index: true },
  mediaId: { type: ObjectId, ref: 'Media', index: true },
  version: String,
  timestampSec: Number,
  comment: { type: String, required: true },
  authorType: { type: String, enum: ['USER', 'CLIENT'], default: 'USER' },
  authorId: { type: ObjectId, ref: 'User' },
  authorName: String,
  resolved: { type: Boolean, default: false },
  taskId: { type: ObjectId, ref: 'Task' },
}, ts);
export const Feedback = model('Feedback', feedbackSchema);

const reviewChecklistItem = new Schema({
  item: { type: String, required: true },
  checked: { type: Boolean, default: false },
  checkedBy: { type: ObjectId, ref: 'User' },
  checkedAt: Date,
}, { _id: false });

const reviewSchema = new Schema({
  contentId: { type: ObjectId, ref: 'Content', required: true, index: true },
  clientId: { type: ObjectId, ref: 'Client', index: true },
  stage: { type: String, enum: ['SCRIPT', 'SHOOT', 'EDIT', 'SMM', 'FINAL', 'CLIENT'], required: true },
  type: { type: String, enum: ['INTERNAL', 'CLIENT'], default: 'INTERNAL' },
  status: { type: String, enum: ['PENDING', 'IN_REVIEW', 'APPROVED', 'CHANGES_REQUESTED', 'CANCELLED'], default: 'PENDING', index: true },
  reviewerId: { type: ObjectId, ref: 'User', index: true },
  assignedRole: String,
  version: String,
  scriptVersionId: { type: ObjectId, ref: 'ScriptVersion' },
  mediaId: { type: ObjectId, ref: 'Media' },
  decision: { type: String, enum: ['APPROVE', 'CHANGES', null], default: null },
  decidedAt: Date,
  decidedBy: { type: ObjectId, ref: 'User' },
  notes: String,
  checklist: [reviewChecklistItem],
  dailyGateDate: String,
  history: [approvalEvent],
  createdBy: { type: ObjectId, ref: 'User' },
}, ts);
export const Review = model('Review', reviewSchema);

const dailyReviewAccessSchema = new Schema({
  date: { type: String, required: true, index: true },
  reviewerId: { type: ObjectId, ref: 'User', required: true, index: true },
  reviewerRole: String,
  token: { type: String, select: false },
  tokenHash: { type: String, index: true, sparse: true, select: false },
  status: { type: String, enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED'], default: 'PENDING', index: true },
  contentsReviewed: [{
    contentId: { type: ObjectId, ref: 'Content' },
    stage: String,
    decision: String,
    reviewedAt: Date,
    notes: String,
    _id: false,
  }],
  totalPending: { type: Number, default: 0 },
  totalApproved: { type: Number, default: 0 },
  totalChanges: { type: Number, default: 0 },
  openedAt: Date,
  completedAt: Date,
  notes: String,
  fallbackSentViaWhatsApp: { type: Boolean, default: false },
  whatsAppMessageId: String,
}, ts);
export const DailyReviewAccess = model('DailyReviewAccess', dailyReviewAccessSchema);

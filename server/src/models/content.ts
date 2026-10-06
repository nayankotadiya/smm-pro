import { Schema, model } from 'mongoose';
import { ObjectId, ts, softDelete } from './common';
import { STAGES } from '../config/constants';

const contentSchema = new Schema({
  contentId: { type: String, unique: true, required: true }, // REEL-2026-001
  title: { type: String, required: true, trim: true },
  clientId: { type: ObjectId, ref: 'Client', required: true, index: true },
  campaignId: { type: ObjectId, ref: 'Campaign' },
  type: { type: String, enum: ['REEL', 'POST', 'CAROUSEL', 'STORY', 'VIDEO', 'SHORT', 'AD'], default: 'REEL' },
  platform: { type: String, enum: ['INSTAGRAM', 'FACEBOOK', 'YOUTUBE', 'LINKEDIN', 'X', 'MULTI'], default: 'INSTAGRAM' },
  stage: { type: String, enum: STAGES, default: 'IDEA', index: true },
  status: { type: String, enum: ['ACTIVE', 'BLOCKED', 'CHANGES_REQUESTED', 'COMPLETED', 'CANCELLED'], default: 'ACTIVE', index: true },
  progress: { type: Number, default: 0 },
  priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'], default: 'MEDIUM' },
  deadline: Date,
  description: String,
  caption: String, hashtags: String,
  currentOwner: { type: ObjectId, ref: 'User' },
  nextOwner: { type: ObjectId, ref: 'User' },
  assignedWriter: { type: ObjectId, ref: 'User' },
  assignedShooter: { type: ObjectId, ref: 'User' },
  assignedEditor: { type: ObjectId, ref: 'User' },
  assignedSMM: { type: ObjectId, ref: 'User' },
  assignedReviewer: { type: ObjectId, ref: 'User' },
  scriptId: { type: ObjectId, ref: 'Script' },
  currentScriptVersion: { type: Number, default: 0 },
  currentVideoVersion: String,
  latestMediaId: { type: ObjectId, ref: 'Media' },
  driveFolderId: String,
  driveSubfolders: { type: Map, of: String },
  lastAction: { text: String, at: Date, by: { type: ObjectId, ref: 'User' } },
  nextAction: String,
  blocked: { reason: String, since: Date, by: { type: ObjectId, ref: 'User' }, nextAction: String },
  scheduledAt: Date,
  publishedAt: Date,
  publishedUrl: String,
  stageHistory: [{ stage: String, enteredAt: Date, by: { type: ObjectId, ref: 'User' } }],
  deadlineAlerts: { h24: Date, h2: Date, overdue: Date },
  createdBy: { type: ObjectId, ref: 'User' },
}, ts);
contentSchema.index({ status: 1, deadline: 1 });
contentSchema.index({ clientId: 1, status: 1 });
contentSchema.index({ stage: 1, updatedAt: -1 });
contentSchema.index({ currentOwner: 1, status: 1 });
softDelete(contentSchema);
export const Content = model('Content', contentSchema);

const counterSchema = new Schema({ key: { type: String, unique: true }, seq: Number });
export const Counter = model('Counter', counterSchema);

const scriptSchema = new Schema({
  contentId: { type: ObjectId, ref: 'Content', required: true, unique: true },
  clientId: { type: ObjectId, ref: 'Client', index: true },
  currentVersion: { type: Number, default: 0 },
  status: { type: String, enum: ['DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'CLIENT_REVIEW', 'FINAL'], default: 'DRAFT' },
  writerId: { type: ObjectId, ref: 'User' },
}, ts);
export const Script = model('Script', scriptSchema);

const sceneSchema = new Schema({ title: String, dialogue: String, visual: String, broll: String }, { _id: false });
const scriptVersionSchema = new Schema({
  scriptId: { type: ObjectId, ref: 'Script', required: true, index: true },
  contentId: { type: ObjectId, ref: 'Content', index: true },
  version: { type: Number, required: true },
  label: String, // V1, V2, Final
  hook: String, scenes: [sceneSchema], dialogue: String, body: String, visualDirection: String, broll: String,
  cta: String, captionNotes: String, music: String, duration: String,
  changes: String,
  status: { type: String, enum: ['DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED'], default: 'DRAFT' },
  approvalState: { type: String, default: 'NONE' },
  reviewNote: String, reviewedBy: { type: ObjectId, ref: 'User' }, reviewedAt: Date,
  createdBy: { type: ObjectId, ref: 'User' },
}, ts);
scriptVersionSchema.index({ scriptId: 1, version: 1 }, { unique: true });
export const ScriptVersion = model('ScriptVersion', scriptVersionSchema);

const remarkSchema = new Schema({ text: { type: String, required: true }, by: { type: ObjectId, ref: 'User' }, byName: String, stage: { type: String, enum: ['BEFORE', 'AFTER'], default: 'BEFORE' }, at: { type: Date, default: Date.now } }, { _id: true });
const shootSchema = new Schema({
  contentId: { type: ObjectId, ref: 'Content', required: true, index: true },
  clientId: { type: ObjectId, ref: 'Client' },
  shootDate: Date, shootTime: String, location: String,
  shooterId: { type: ObjectId, ref: 'User' },
  talent: String, product: String, props: String, shotList: String, instructions: String,
  referenceMediaIds: [{ type: ObjectId, ref: 'Media' }],
  status: { type: String, enum: ['PENDING', 'SCHEDULED', 'IN_PROGRESS', 'RAW_UPLOADED', 'COMPLETED'], default: 'PENDING' },
  checklist: {
    locationConfirmed: { type: Boolean, default: false }, talentConfirmed: { type: Boolean, default: false },
    productReady: { type: Boolean, default: false }, equipmentReady: { type: Boolean, default: false },
    shotListReady: { type: Boolean, default: false }, rawUploaded: { type: Boolean, default: false },
  },
  remarks: [remarkSchema], // shooter remarks / complaints (BEFORE & AFTER)
  beforeShootRemarks: String,
  afterShootRemarks: String,
}, ts);
export const Shoot = model('Shoot', shootSchema);

const scheduledPostSchema = new Schema({
  contentId: { type: ObjectId, ref: 'Content', required: true, index: true },
  clientId: { type: ObjectId, ref: 'Client' },
  platform: String, scheduledAt: Date, caption: String, hashtags: String,
  status: { type: String, enum: ['SCHEDULED', 'PUBLISHED', 'FAILED', 'CANCELLED'], default: 'SCHEDULED' },
  publishedUrl: String, error: String, createdBy: { type: ObjectId, ref: 'User' },
}, ts);
export const ScheduledPost = model('ScheduledPost', scheduledPostSchema);

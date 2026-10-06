import { Schema, model } from 'mongoose';
import { ObjectId, ts, softDelete } from './common';

const clientSchema = new Schema({
  name: { type: String, required: true, trim: true },
  businessName: String, contactPerson: String, phone: String, email: String, website: String,
  instagram: String, instagramPassword: String, facebook: String, facebookPassword: String, youtube: String, location: String, category: String,
  description: String, products: String, services: String, usp: String, targetAudience: String,
  goals: String, expectations: String, marketTrend: String, sellingPurpose: String, brandTone: String,
  brandColors: [String], fonts: [String], logoMediaId: { type: ObjectId, ref: 'Media' }, brandGuidelines: String,
  assignedTeam: [{ type: ObjectId, ref: 'User' }],
  defaultTeam: {
    writer: { type: ObjectId, ref: 'User' }, shooter: { type: ObjectId, ref: 'User' }, editor: { type: ObjectId, ref: 'User' },
    smm: { type: ObjectId, ref: 'User' }, reviewer: { type: ObjectId, ref: 'User' },
  },
  status: { type: String, enum: ['ACTIVE', 'PAUSED', 'ONBOARDING', 'ARCHIVED'], default: 'ACTIVE' },
  driveFolderId: String,
  driveSubfolders: { type: Map, of: String },
  createdBy: { type: ObjectId, ref: 'User' },
}, ts);
clientSchema.index({ status: 1, name: 1 });
clientSchema.index({ assignedTeam: 1 });
softDelete(clientSchema);
export const Client = model('Client', clientSchema);

const campaignSchema = new Schema({
  name: { type: String, required: true }, clientId: { type: ObjectId, ref: 'Client', required: true, index: true },
  description: String, startDate: Date, endDate: Date,
  status: { type: String, enum: ['PLANNED', 'ACTIVE', 'COMPLETED'], default: 'ACTIVE' },
  driveFolderId: String, createdBy: { type: ObjectId, ref: 'User' },
}, ts);
softDelete(campaignSchema);
export const Campaign = model('Campaign', campaignSchema);

const commSchema = new Schema({
  clientId: { type: ObjectId, ref: 'Client', required: true, index: true },
  contentId: { type: ObjectId, ref: 'Content' },
  employeeId: { type: ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['WHATSAPP', 'PHONE', 'EMAIL', 'MEETING', 'INSTAGRAM_DM', 'OTHER'], required: true },
  direction: { type: String, enum: ['INBOUND', 'OUTBOUND'], default: 'OUTBOUND' },
  occurredAt: { type: Date, default: Date.now },
  summary: { type: String, required: true },
  actionRequired: String,
  nextFollowUp: Date,
  attachmentMediaId: { type: ObjectId, ref: 'Media' },
  source: { type: String, enum: ['MANUAL', 'AISENSY'], default: 'MANUAL' },
  externalId: String,
  resolution: { type: String, enum: [null, 'MARKED_APPROVED', 'CHANGE_REQUEST_CREATED'], default: null },
}, ts);
export const CommunicationLog = model('CommunicationLog', commSchema);

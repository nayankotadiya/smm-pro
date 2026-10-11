import { Schema, model } from 'mongoose';
import { ObjectId, ts, softDelete } from './common';

const clientUserSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  clientId: { type: ObjectId, ref: 'Client', required: true, index: true },
  passwordHash: { type: String, select: false },
  role: { type: String, enum: ['CLIENT_ADMIN', 'CLIENT_MEMBER'], default: 'CLIENT_ADMIN' },
  active: { type: Boolean, default: true },
  avatarUrl: String,
  title: String,
  lastLoginAt: Date,
  otpCodeHash: { type: String, select: false },
  otpExpiresAt: { type: Date, select: false },
  otpAttempts: { type: Number, default: 0, select: false },
  magicTokenHash: { type: String, select: false },
  magicTokenExpiresAt: { type: Date, select: false },
  notificationPrefs: {
    whatsapp: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
  },
}, ts);

clientUserSchema.index({ clientId: 1, active: 1 });
clientUserSchema.index({ phone: 1 });
softDelete(clientUserSchema);

clientUserSchema.set('toJSON', {
  transform: (_d, r: any) => {
    delete r.passwordHash;
    delete r.otpCodeHash;
    delete r.otpExpiresAt;
    delete r.otpAttempts;
    delete r.magicTokenHash;
    delete r.magicTokenExpiresAt;
    return r;
  },
});

export const ClientUser = model('ClientUser', clientUserSchema);

const clientBriefSchema = new Schema({
  clientId: { type: ObjectId, ref: 'Client', required: true, index: true },
  submittedBy: { type: ObjectId, ref: 'ClientUser' },
  title: { type: String, required: true, trim: true },
  objective: String,
  contentType: { type: String, enum: ['REEL', 'POST', 'CAROUSEL', 'STORY', 'VIDEO', 'SHORT', 'AD'], default: 'REEL' },
  targetPlatform: { type: String, enum: ['INSTAGRAM', 'FACEBOOK', 'YOUTUBE', 'LINKEDIN', 'X', 'MULTI'], default: 'INSTAGRAM' },
  preferredDates: [Date],
  referenceUrls: [String],
  notes: String,
  status: { type: String, enum: ['SUBMITTED', 'IN_REVIEW', 'ACCEPTED', 'DECLINED'], default: 'SUBMITTED', index: true },
  contentId: { type: ObjectId, ref: 'Content' },
  agencyFeedback: String,
  attachments: [{
    name: String,
    url: String,
    size: Number,
    mimeType: String,
  }],
}, ts);

clientBriefSchema.index({ clientId: 1, status: 1 });
softDelete(clientBriefSchema);

export const ClientBrief = model('ClientBrief', clientBriefSchema);

const portalConfigSchema = new Schema({
  key: { type: String, default: 'global', unique: true },
  authMethod: {
    type: String,
    enum: ['PASSWORD_ONLY', 'OTP_ONLY', 'HYBRID'],
    default: 'PASSWORD_ONLY',
  },
  magicLinkEnabled: { type: Boolean, default: true },
  portalUrl: { type: String, default: 'http://localhost:5174' },
  updatedBy: { type: ObjectId, ref: 'User' },
}, ts);

export const PortalConfig = model('PortalConfig', portalConfigSchema);

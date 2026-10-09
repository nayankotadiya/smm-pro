import { Schema, model, InferSchemaType } from 'mongoose';
import { ObjectId, ts, softDelete } from './common';
import { ROLES, NOTIFICATION_CATEGORIES } from '../config/constants';

const prefCats = Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c, { type: Boolean, default: true }]));

const userSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: String,
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ROLES, required: true },
  title: String,
  avatarUrl: { type: String, default: null },
  active: { type: Boolean, default: true },
  coverUserId: { type: ObjectId, ref: 'User', default: null }, // covering for someone
  notificationPrefs: {
    inApp: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    email: { type: Boolean, default: false },
    whatsapp: { type: Boolean, default: false },
    categories: prefCats,
  },
  resetTokenHash: { type: String, select: false },
  resetTokenExpires: { type: Date, select: false },
  lastLoginAt: Date,
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil: Date,
  mfaEnabled: { type: Boolean, default: false },
  mfaSecret: { type: String, select: false },
  mfaBackupCodes: { type: [String], select: false },
}, ts);
userSchema.index({ active: 1, role: 1 });
softDelete(userSchema);
userSchema.set('toJSON', {
  transform: (_d, r: any) => {
    delete r.passwordHash;
    delete r.resetTokenHash;
    delete r.resetTokenExpires;
    delete r.mfaSecret;
    delete r.mfaBackupCodes;
    return r;
  },
});
export const User = model('User', userSchema);
export type UserDoc = InferSchemaType<typeof userSchema> & { _id: any };

const roleSchema = new Schema({
  key: { type: String, enum: ROLES, unique: true, required: true },
  label: String,
  permissions: [String],
}, ts);
export const RoleModel = model('Role', roleSchema);

const refreshSchema = new Schema({
  userId: { type: ObjectId, ref: 'User', index: true },
  tokenHash: { type: String, unique: true },
  family: { type: String, index: true },
  expiresAt: Date,
  revokedAt: Date,
  replacedBy: String,
  userAgent: String,
  ip: String,
}, ts);
refreshSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshSchema.index({ userId: 1, revokedAt: 1, expiresAt: 1 });
refreshSchema.index({ family: 1, revokedAt: 1 });
export const RefreshToken = model('RefreshToken', refreshSchema);

const presenceSchema = new Schema({
  userId: { type: ObjectId, ref: 'User', unique: true },
  status: { type: String, enum: ['ONLINE', 'AWAY', 'DND', 'OFFLINE'], default: 'OFFLINE' },
  manualStatus: { type: String, enum: ['DND', null], default: null },
  socketIds: [String],
  lastSeen: Date,
  lastActive: Date,
  currentActivity: String,
});
export const Presence = model('Presence', presenceSchema);

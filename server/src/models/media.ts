import { Schema, model } from 'mongoose';
import { ObjectId, ts, softDelete } from './common';
import { MEDIA_CATEGORIES } from '../config/constants';

const mediaSchema = new Schema({
  contentId: { type: ObjectId, ref: 'Content', index: true },
  clientId: { type: ObjectId, ref: 'Client', index: true },
  storage: { type: String, enum: ['DRIVE', 'LOCAL'], required: true },
  driveFileId: String,
  driveFolderId: String,
  localPath: { type: String, select: false },
  fileName: { type: String, required: true },
  originalName: String,
  mimeType: String,
  size: Number,
  category: { type: String, enum: MEDIA_CATEGORIES, required: true },
  versionNumber: Number,
  version: String, // RAW_V1, EDIT_V2
  stage: String,
  uploadedBy: { type: ObjectId, ref: 'User' },
  uploadedAt: Date,
  status: { type: String, enum: ['UPLOADING', 'READY', 'FAILED', 'SUPERSEDED', 'APPROVED', 'REVIEW_REQUIRED'], default: 'UPLOADING', index: true },
  error: String,
  downloads: { type: Number, default: 0 },
  webViewLink: String,
}, ts);
mediaSchema.index({ contentId: 1, category: 1, versionNumber: -1 });
mediaSchema.index({ status: 1, createdAt: 1 });
softDelete(mediaSchema);
mediaSchema.set('toJSON', { transform: (_d, r: any) => { delete r.localPath; return r; } });
export const Media = model('Media', mediaSchema);

const driveFolderSchema = new Schema({
  key: { type: String, unique: true }, // e.g. root, client:<id>, client:<id>:03_Scripts, content:<id>
  driveId: String, name: String, parentDriveId: String,
}, ts);
export const DriveFolder = model('DriveFolder', driveFolderSchema);

const driveFileSchema = new Schema({
  driveId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  mimeType: String,
  size: Number,
  webViewLink: String,
  webContentLink: String,
  thumbnailLink: String,
  parents: [String],
  contentId: { type: ObjectId, ref: 'Content', index: true },
  clientId: { type: ObjectId, ref: 'Client', index: true },
  mediaId: { type: ObjectId, ref: 'Media', index: true },
  category: { type: String, enum: MEDIA_CATEGORIES },
  version: String,
  md5Checksum: String,
  syncedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['ACTIVE', 'TRASHED'], default: 'ACTIVE' },
}, ts);
export const DriveFile = model('DriveFile', driveFileSchema);

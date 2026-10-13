import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { Readable } from 'stream';
import { Media } from '../models';
import { localPathFor } from './storage';

let bucketInstance: mongoose.mongo.GridFSBucket | null = null;

export function getGridFSBucket(): mongoose.mongo.GridFSBucket {
  if (!mongoose.connection.db) {
    throw new Error('Database not connected: cannot initialize GridFSBucket');
  }
  if (!bucketInstance) {
    bucketInstance = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'mediaFiles',
    });
  }
  return bucketInstance;
}

export const MAX_GRIDFS_MB = Number(process.env.MAX_GRIDFS_MB || 15);
export const MAX_GRIDFS_BYTES = MAX_GRIDFS_MB * 1024 * 1024;

export interface GridFSUploadOptions {
  contentType?: string;
  metadata?: Record<string, any>;
}

/**
 * Saves a local file into MongoDB GridFS so it persists permanently
 * across container restarts and redeployments.
 * Skips files larger than MAX_GRIDFS_MB (default 15MB) to protect the 512MB MongoDB Atlas free tier!
 */
export async function saveFileToGridFS(
  localFilePath: string,
  filename: string,
  options: GridFSUploadOptions = {}
): Promise<mongoose.Types.ObjectId | null> {
  if (fs.existsSync(localFilePath) && fs.statSync(localFilePath).size > MAX_GRIDFS_BYTES) {
    const mb = (fs.statSync(localFilePath).size / (1024 * 1024)).toFixed(1);
    console.log(`[GridFS] File ${filename} (${mb} MB) exceeds ${MAX_GRIDFS_MB} MB Atlas safety cap. Skipping GridFS to preserve MongoDB 512 MB quota.`);
    return null;
  }

  const bucket = getGridFSBucket();
  const cleanFilename = filename.replace(/[^\w.-]/g, '_');
  const uploadStream = bucket.openUploadStream(cleanFilename, {
    contentType: options.contentType || 'application/octet-stream',
    metadata: options.metadata || {},
  });

  return new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(localFilePath);
    readStream.on('error', (err) => {
      uploadStream.destroy(err);
      reject(err);
    });
    uploadStream.on('error', reject);
    uploadStream.on('finish', () => {
      resolve(uploadStream.id as mongoose.Types.ObjectId);
    });
    readStream.pipe(uploadStream);
  });
}

/**
 * Saves an in-memory buffer into MongoDB GridFS.
 */
export async function saveBufferToGridFS(
  buffer: Buffer,
  filename: string,
  options: GridFSUploadOptions = {}
): Promise<mongoose.Types.ObjectId | null> {
  if (buffer.length > MAX_GRIDFS_BYTES) {
    return null;
  }
  const bucket = getGridFSBucket();
  const cleanFilename = filename.replace(/[^\w.-]/g, '_');
  const uploadStream = bucket.openUploadStream(cleanFilename, {
    contentType: options.contentType || 'application/octet-stream',
    metadata: options.metadata || {},
  });

  return new Promise((resolve, reject) => {
    uploadStream.on('error', reject);
    uploadStream.on('finish', () => {
      resolve(uploadStream.id as mongoose.Types.ObjectId);
    });
    uploadStream.end(buffer);
  });
}

/**
 * Finds a GridFS file entry by its GridFS ObjectId or associated Media ObjectId.
 */
export async function findGridFSFile(
  gridFsId?: string | mongoose.Types.ObjectId,
  mediaId?: string | mongoose.Types.ObjectId
): Promise<any | null> {
  try {
    const bucket = getGridFSBucket();
    if (gridFsId) {
      const oid = typeof gridFsId === 'string' ? new mongoose.Types.ObjectId(gridFsId) : gridFsId;
      const files = await bucket.find({ _id: oid }).limit(1).toArray();
      if (files && files.length > 0) return files[0];
    }
    if (mediaId) {
      const mid = typeof mediaId === 'string' ? new mongoose.Types.ObjectId(mediaId) : mediaId;
      const files = await bucket.find({ 'metadata.mediaId': mid }).limit(1).toArray();
      if (files && files.length > 0) return files[0];
    }
  } catch (err: any) {
    console.warn('[GridFS] findGridFSFile error:', err?.message || err);
  }
  return null;
}

/**
 * Opens a download stream from GridFS with optional range support.
 */
export function openGridFSDownloadStream(
  gridFsId: mongoose.Types.ObjectId | string,
  range?: { start?: number; end?: number }
): mongoose.mongo.GridFSBucketReadStream {
  const bucket = getGridFSBucket();
  const oid = typeof gridFsId === 'string' ? new mongoose.Types.ObjectId(gridFsId) : gridFsId;

  if (range && (range.start !== undefined || range.end !== undefined)) {
    const opts: any = {};
    if (range.start !== undefined) opts.start = range.start;
    if (range.end !== undefined) opts.end = range.end;
    return bucket.openDownloadStream(oid, opts);
  }

  return bucket.openDownloadStream(oid);
}

/**
 * Asynchronously re-caches a GridFS file to the local filesystem
 * so subsequent reads/seeks are fast and served from disk.
 */
export async function reCacheGridFSToLocal(
  gridFsId: mongoose.Types.ObjectId | string,
  targetPath: string,
  mediaDoc?: any
): Promise<void> {
  try {
    if (fs.existsSync(targetPath)) return;
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const bucket = getGridFSBucket();
    const oid = typeof gridFsId === 'string' ? new mongoose.Types.ObjectId(gridFsId) : gridFsId;
    const downloadStream = bucket.openDownloadStream(oid);
    const writeStream = fs.createWriteStream(targetPath);

    downloadStream.pipe(writeStream);
    writeStream.on('finish', async () => {
      try {
        if (mediaDoc && mediaDoc._id) {
          await Media.updateOne({ _id: mediaDoc._id }, { localPath: targetPath });
        }
      } catch {}
    });
    writeStream.on('error', () => {
      try { if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath); } catch {}
    });
  } catch (err: any) {
    console.warn('[GridFS] reCacheGridFSToLocal warning:', err?.message || err);
  }
}

/**
 * Migration helper run on startup:
 * Automatically finds any existing Media files that have a localPath on disk
 * but haven't been backed up to GridFS yet, and backs them up into GridFS.
 */
export async function migrateExistingLocalFilesToGridFS(): Promise<number> {
  try {
    const candidates = await Media.find({
      gridFsId: { $exists: false },
      status: { $nin: ['FAILED', 'UPLOADING'] },
    }).select('+localPath').limit(200);

    let count = 0;
    for (const m of candidates) {
      const p = (m as any).localPath;
      if (p && fs.existsSync(p)) {
        try {
          const gridFsId = await saveFileToGridFS(p, m.fileName, {
            contentType: m.mimeType || undefined,
            metadata: { mediaId: m._id, contentId: m.contentId, clientId: m.clientId },
          });
          if (gridFsId) {
            await Media.updateOne({ _id: m._id }, { gridFsId });
            count++;
          }
        } catch (e: any) {
          console.warn(`[GridFS Migration] Error backing up ${m.fileName}:`, e?.message || e);
        }
      }
    }
    if (count > 0) {
      console.log(`[GridFS Migration] Successfully backed up ${count} local media files to MongoDB GridFS.`);
    }
    return count;
  } catch (err: any) {
    console.warn('[GridFS Migration] Error during local file migration:', err?.message || err);
    return 0;
  }
}

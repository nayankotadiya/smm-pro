import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { connectDb, closeDb } from '../config/db';

const BACKUP_DIR = path.resolve(process.cwd(), 'backups');
const RETENTION_COUNT = Number(process.env.BACKUP_RETENTION_COUNT || 14);

async function runBackup() {
  console.log('[backup] Starting database backup...');
  const startTime = Date.now();
  await connectDb();

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUP_DIR, `backup-${timestamp}.json.gz`);
  const metaFile = path.join(BACKUP_DIR, `backup-${timestamp}.meta.json`);

  const collections = await mongoose.connection.db!.listCollections().toArray();
  const backupData: Record<string, any[]> = {};
  const stats: Record<string, number> = {};

  for (const coll of collections) {
    if (coll.name.startsWith('system.')) continue;
    const docs = await mongoose.connection.db!.collection(coll.name).find({}).toArray();
    backupData[coll.name] = docs;
    stats[coll.name] = docs.length;
    console.log(`[backup] Exported ${coll.name}: ${docs.length} documents`);
  }

  const rawJson = JSON.stringify(backupData);
  const compressed = zlib.gzipSync(rawJson);
  fs.writeFileSync(backupFile, compressed);

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  const sizeMb = (compressed.length / 1024 / 1024).toFixed(2);

  const metadata = {
    timestamp: new Date().toISOString(),
    database: mongoose.connection.name,
    file: path.basename(backupFile),
    sizeBytes: compressed.length,
    sizeMb,
    durationSec,
    collectionStats: stats,
    totalCollections: Object.keys(stats).length,
    totalDocuments: Object.values(stats).reduce((a, b) => a + b, 0),
  };

  fs.writeFileSync(metaFile, JSON.stringify(metadata, null, 2));
  console.log(`[backup] SUCCESS: Saved ${backupFile} (${sizeMb} MB in ${durationSec}s)`);

  // Retention cleanup
  cleanOldBackups();
  await closeDb();
}

function cleanOldBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('backup-') && f.endsWith('.json.gz'))
      .map((f) => ({
        name: f,
        path: path.join(BACKUP_DIR, f),
        time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time);

    if (files.length > RETENTION_COUNT) {
      const toDelete = files.slice(RETENTION_COUNT);
      for (const item of toDelete) {
        fs.unlinkSync(item.path);
        const metaPath = item.path.replace(/\.json\.gz$/, '.meta.json');
        if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
        console.log(`[backup] Purged old backup: ${item.name}`);
      }
    }
  } catch (err: any) {
    console.warn('[backup] Cleanup warning:', err.message);
  }
}

runBackup().catch((e) => {
  console.error('[backup] FAILED:', e);
  process.exit(1);
});

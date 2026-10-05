import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import mongoose from 'mongoose';
import { connectDb, closeDb } from '../config/db';

const BACKUP_DIR = path.resolve(process.cwd(), 'backups');

async function runRestore() {
  const targetArg = process.argv[2];
  let targetPath: string;

  if (targetArg) {
    targetPath = path.isAbsolute(targetArg) ? targetArg : path.resolve(process.cwd(), targetArg);
  } else {
    // Pick latest backup in backups directory
    if (!fs.existsSync(BACKUP_DIR)) {
      throw new Error(`Backup directory not found at ${BACKUP_DIR}`);
    }
    const files = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('backup-') && f.endsWith('.json.gz'))
      .map((f) => ({
        name: f,
        path: path.join(BACKUP_DIR, f),
        time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time);

    if (!files.length) {
      throw new Error(`No backup files found in ${BACKUP_DIR}`);
    }
    targetPath = files[0].path;
  }

  console.log(`[restore] Restoring from: ${targetPath}`);
  const startTime = Date.now();
  const compressed = fs.readFileSync(targetPath);
  const decompressed = zlib.gunzipSync(compressed).toString('utf-8');
  const data: Record<string, any[]> = JSON.parse(decompressed);

  await connectDb();
  console.log(`[restore] Connected to database: ${mongoose.connection.name}`);

  let totalRestored = 0;
  for (const [collName, docs] of Object.entries(data)) {
    if (!Array.isArray(docs) || docs.length === 0) continue;
    const collection = mongoose.connection.db!.collection(collName);
    
    // Clear existing collection records if requested or safe
    await collection.deleteMany({});
    
    // Insert in chunks of 500
    for (let i = 0; i < docs.length; i += 500) {
      const chunk = docs.slice(i, i + 500);
      await collection.insertMany(chunk);
    }

    console.log(`[restore] Restored collection ${collName}: ${docs.length} documents`);
    totalRestored += docs.length;
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[restore] SUCCESS: Restored ${totalRestored} documents across ${Object.keys(data).length} collections in ${durationSec}s`);
  await closeDb();
}

runRestore().catch((e) => {
  console.error('[restore] FAILED:', e);
  process.exit(1);
});

import { env } from '../config/env';
import { runAllChecks } from './checks';

/** Uses BullMQ repeatable jobs when REDIS_URL is set (multi-instance safe); otherwise an in-process interval. */
export async function startScheduler() {
  if (env.redisUrl) {
    const { Queue, Worker } = await import('bullmq');
    const IORedis = (await import('ioredis')).default;
    const connection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
    const q = new Queue('smm-maintenance', { connection });
    await q.upsertJobScheduler('checks-every-minute', { every: 60_000 }, { name: 'checks' });
    new Worker('smm-maintenance', async () => runAllChecks(), { connection, concurrency: 1 });
    console.log('[jobs] BullMQ scheduler started');
  } else {
    setInterval(() => void runAllChecks(), 60_000);
    setTimeout(() => void runAllChecks(), 5_000);
    console.log('[jobs] in-process scheduler started (set REDIS_URL for BullMQ)');
  }
}

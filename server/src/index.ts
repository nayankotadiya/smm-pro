import http from 'http';
import { env } from './config/env';
import { connectDb } from './config/db';
import { createApp } from './app';
import { initSockets } from './sockets';
import { startAutomationEngine, seedAutomations } from './services/automation';
import { startScheduler } from './jobs/scheduler';
import { Presence } from './models';

async function main() {
  await connectDb();
  await Presence.updateMany({}, { socketIds: [], status: 'OFFLINE' }); // sockets don't survive a restart
  await seedAutomations();
  const app = createApp();
  const server = http.createServer(app);
  const io = initSockets(server);
  if (env.redisUrl) {
    // Redis adapter lets several API instances share rooms/presence
    try {
      const { createAdapter } = await import('@socket.io/redis-adapter' as any);
      const IORedis = (await import('ioredis')).default;
      const pub = new IORedis(env.redisUrl); io.adapter(createAdapter(pub, pub.duplicate()));
    } catch { console.warn('[socket] redis adapter not installed; running single-instance'); }
  }
  startAutomationEngine();
  await startScheduler();
  server.listen(env.port, () => {
    console.log(`[api] SMM PRO server listening on http://localhost:${env.port}`);
  });
  const stop = async () => {
    console.log('[smm-pro] Shutting down gracefully...');
    server.close(async () => {
      await import('./config/db').then((m) => m.closeDb()).catch(() => {});
      process.exit(0);
    });
    setTimeout(() => {
      console.warn('[smm-pro] Forced shutdown after timeout');
      process.exit(1);
    }, 10000).unref();
  };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
// Last line of defence: log and keep serving rather than dropping every connected user
process.on('unhandledRejection', (e: any) => console.error('[unhandledRejection]', e?.stack || e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e.stack || e));
main().catch((e) => { console.error(e); process.exit(1); });

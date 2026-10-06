import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { env, isAllowedOrigin } from './config/env';
import { requireAuth } from './middleware/auth';
import { errorHandler } from './middleware/error';
import { ah } from './utils/async';
import { AppError } from './utils/errors';
import { safeEqual } from './utils/crypto';
import { handleAisensyWebhook } from './services/webhooks';
import auth from './routes/auth';
import clients from './routes/clients';
import content from './routes/content';
import scripts from './routes/scripts';
import tasks from './routes/tasks';
import approvals from './routes/approvals';
import publicRoutes from './routes/public';
import media from './routes/media';
import drive from './routes/drive';
import chat from './routes/chat';
import notifications, { push } from './routes/notifications';
import { pushConfigured, getVapidPublicKey } from './integrations/push';
import reminders from './routes/reminders';
import automations from './routes/automations';
import dashboard from './routes/dashboard';
import misc from './routes/misc';
import ai from './routes/ai';

/** Removes keys that look like Mongo operators or paths from untrusted JSON (defence in depth; zod schemas are the first line) */
function stripOperators(v: any): void {
  if (!v || typeof v !== 'object') return;
  for (const k of Object.keys(v)) { if (k.startsWith('$') || k.includes('.')) delete v[k]; else stripOperators(v[k]); }
}

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.set('query parser', 'simple'); // ?a[$ne]=x stays a literal key instead of becoming a Mongo operator
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));
  app.use(cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) callback(null, true);
      else callback(null, false);
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
  }));
  app.use(compression({ filter: (req, res) => (/\/(stream|download|video|thumbnail)$/.test(req.path) ? false : compression.filter(req, res)) }));
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use((req, _res, next) => { stripOperators(req.body); next(); });

  // Liveness check (process alive)
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'UP', time: new Date().toISOString(), uptime: Math.floor(process.uptime()) });
  });

  // Readiness check (database and critical dependencies ready for traffic)
  app.get('/api/ready', async (_req, res) => {
    const { isDbConnected } = await import('./config/db');
    const dbOk = isDbConnected();
    if (!dbOk) {
      return res.status(503).json({ status: 'DEGRADED', db: 'DISCONNECTED', time: new Date().toISOString() });
    }
    res.json({ status: 'READY', db: 'CONNECTED', time: new Date().toISOString() });
  });

  // Webhook: verified by shared secret (AiSensy lets you set the full callback URL)
  app.post('/api/integrations/aisensy/webhook', rateLimit({ windowMs: 60_000, max: 600 }), ah(async (req, res) => {
    if (env.aisensy.webhookSecret) {
      const got = String(req.query.secret || req.get('x-webhook-secret') || '');
      if (!safeEqual(got, env.aisensy.webhookSecret)) throw new AppError(401, 'Invalid webhook signature', 'UNAUTHORIZED');
    } else if (env.isProd) throw new AppError(503, 'Webhook secret is not configured', 'NOT_CONFIGURED');
    res.json(await handleAisensyWebhook(req.body));
  }));

  app.use('/api/auth', auth);
  app.use('/api/public', publicRoutes);
  app.use('/api/media', media); // handles its own auth (signed stream links)
  // Public push config (VAPID key) so devices/service workers can subscribe without 401 race condition
  app.get('/api/push/config', (_req, res) => {
    res.json({ enabled: pushConfigured(), publicKey: getVapidPublicKey() });
  });

  const api = express.Router();
  api.use(requireAuth);
  // keyed by user, not IP: a whole office usually shares one public address
  api.use(rateLimit({ windowMs: 60_000, max: 900, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => req.user?._id || req.ip || 'anon', message: { error: { code: 'RATE_LIMIT', message: 'Too many requests. Please slow down.' } } }));
  api.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  api.use('/clients', clients);
  api.use('/content', content);
  api.use('/scripts', scripts);
  api.use('/tasks', tasks);
  api.use('/approvals', approvals);
  api.use('/drive', drive);
  api.use('/chat', chat);
  api.use('/notifications', notifications);
  api.use('/push', push);
  api.use('/reminders', reminders);
  api.use('/automations', automations);
  api.use('/dashboard', dashboard);
  api.use('/ai', ai);
  api.use('/', misc);
  app.use('/api', api);

  app.use('/api', (_req, _res, next) => next(new AppError(404, 'Endpoint not found', 'NOT_FOUND')));
  app.use(errorHandler);
  return app;
}

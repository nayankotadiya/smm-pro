import { env } from '../config/env';

export type LogLevel = 'info' | 'warn' | 'error' | 'audit';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'currentpassword',
  'newpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'jwtsecret',
  'jwtrefreshsecret',
  'authorization',
  'cookie',
  'apikey',
  'mfasecret',
  'mfabackupcodes',
]);

function redact(obj: any, depth = 0): any {
  if (depth > 6 || obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((item) => redact(item, depth + 1));

  const clean: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      clean[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      clean[key] = redact(val, depth + 1);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

function formatLog(level: LogLevel, message: string, meta?: any) {
  const timestamp = new Date().toISOString();
  const safeMeta = meta ? redact(meta) : undefined;

  if (env.isProd) {
    const payload: Record<string, any> = { timestamp, level, message };
    if (safeMeta) payload.meta = safeMeta;
    return JSON.stringify(payload);
  }

  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  const metaStr = safeMeta && Object.keys(safeMeta).length ? ` ${JSON.stringify(safeMeta)}` : '';
  return `${prefix} ${message}${metaStr}`;
}

export const logger = {
  info: (message: string, meta?: any) => {
    console.log(formatLog('info', message, meta));
  },
  warn: (message: string, meta?: any) => {
    console.warn(formatLog('warn', message, meta));
  },
  error: (message: string, error?: any, meta?: any) => {
    const errMeta: Record<string, any> = { ...(meta || {}) };
    if (error instanceof Error) {
      errMeta.errorName = error.name;
      errMeta.errorMessage = error.message;
      if (!env.isProd || errMeta.includeStack) {
        errMeta.stack = error.stack;
      }
    } else if (error) {
      errMeta.error = error;
    }
    console.error(formatLog('error', message, errMeta));
  },
  audit: (action: string, actorId: string, message: string, meta?: any) => {
    console.log(formatLog('audit', `[AUDIT] ${action}: ${message}`, { actorId, action, ...meta }));
  },
};

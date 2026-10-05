import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const req = (k: string, fallback?: string) => {
  const v = process.env[k] ?? fallback;
  if (v === undefined) throw new Error(`Missing env ${k}`);
  return v;
};

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 4000),
  appUrl: process.env.APP_URL || 'http://localhost:5173',
  appOrigins: (process.env.APP_URL || 'http://localhost:5173').split(',').map((x) => x.trim().replace(/\/$/, '')),
  cookieSameSite: (process.env.COOKIE_SAMESITE || 'lax') as 'lax' | 'none' | 'strict',
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  publicApprovalUrl: (process.env.PUBLIC_APPROVAL_URL || `${(process.env.APP_URL || 'http://localhost:5173').split(',')[0].trim().replace(/\/$/, '')}/approval`).replace(/\/$/, ''),
  mongoUri: process.env.MONGODB_URI || '',
  jwtSecret: req('JWT_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'dev-access-secret'),
  jwtRefreshSecret: req('JWT_REFRESH_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'dev-refresh-secret'),
  approvalTtlHours: Number(process.env.APPROVAL_TOKEN_TTL_HOURS || 168),
  google: {
    serviceAccountB64: process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 || '',
    sharedDriveId: process.env.GOOGLE_SHARED_DRIVE_ID || '',
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN || '',
    rootFolderName: process.env.DRIVE_ROOT_FOLDER_NAME || 'SMM PRO',
  },
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 4096),
  aisensy: {
    apiKey: process.env.AISENSY_API_KEY || '',
    baseUrl: process.env.AISENSY_BASE_URL || 'https://backend.aisensy.com/campaign/t1/api/v2',
    campaignName: process.env.AISENSY_CAMPAIGN_NAME || '',
    templateName: process.env.AISENSY_TEMPLATE_NAME || '',
    webhookSecret: process.env.AISENSY_WEBHOOK_SECRET || '',
    useUrlButton: process.env.AISENSY_USE_URL_BUTTON === 'true',
  },
  redisUrl: process.env.REDIS_URL || '',
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  },
  email: {
    host: process.env.EMAIL_HOST || '',
    port: Number(process.env.EMAIL_PORT || 587),
    user: process.env.EMAIL_USER || '',
    password: process.env.EMAIL_PASSWORD || '',
    from: process.env.EMAIL_FROM || 'SMM PRO <no-reply@example.com>',
  },
};

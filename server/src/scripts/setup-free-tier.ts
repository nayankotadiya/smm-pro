import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import webPush from 'web-push';

function generateRandomKey(bytes = 48): string {
  return crypto.randomBytes(bytes).toString('base64');
}

function main() {
  console.log('=====================================================');
  console.log('🚀 SMM PRO - ZERO-COST ($0) PRODUCTION SETUP GENERATOR');
  console.log('=====================================================\n');

  // 1. Generate cryptographic keys
  const jwtSecret = generateRandomKey(48);
  const jwtRefreshSecret = generateRandomKey(48);
  const vapidKeys = webPush.generateVAPIDKeys();

  const rootDir = path.resolve(__dirname, '../../..');
  const serverDir = path.resolve(__dirname, '../..');
  const clientDir = path.resolve(rootDir, 'client');

  // 2. Prepare backend .env.production template
  const backendEnvContent = `# =================================================================
# SMM PRO - 100% ZERO-COST ($0) PRODUCTION BACKEND CONFIGURATION
# Generated automatically by setup:free
# =================================================================

# ---------- CORE (Render / Free Node.js Tier) ----------
NODE_ENV=production
PORT=4000

# Set this to your frontend URL (e.g. on Vercel: https://smm-pro.vercel.app)
# If using custom domain, put that here (e.g. https://app.yourdomain.com)
APP_URL=https://YOUR-FRONTEND.vercel.app
PUBLIC_APPROVAL_URL=https://YOUR-FRONTEND.vercel.app/approval

# Set to 'none' if frontend & backend are on different domains (e.g. vercel.app and onrender.com)
# Set to 'lax' if using Vercel reverse proxy rewrites (/api -> onrender.com) or same custom domain
COOKIE_SAMESITE=none
COOKIE_DOMAIN=
APP_TIMEZONE=Asia/Kolkata
APPROVAL_TOKEN_TTL_HOURS=168

# ---------- DATABASE (MongoDB Atlas 100% Free Forever M0) ----------
# Register at mongodb.com -> Create Free M0 Cluster -> Get connection string
MONGODB_URI=mongodb+srv://<USER>:<PASSWORD>@cluster0.abcde.mongodb.net/smmpro?retryWrites=true&w=majority
DB_MAX_POOL_SIZE=10
DB_MIN_POOL_SIZE=2

# ---------- AUTOMATIC HIGH-ENTROPY CRYPTO SECRETS ----------
JWT_SECRET=${jwtSecret}
JWT_REFRESH_SECRET=${jwtRefreshSecret}

# ---------- MEDIA STORAGE (Google Drive 15GB Free Personal / Shared Drive) ----------
# 100% Free: Use a personal Google account (15GB free) or Shared Drive
GOOGLE_SERVICE_ACCOUNT_JSON_BASE64=
GOOGLE_SHARED_DRIVE_ID=
DRIVE_ROOT_FOLDER_NAME=SMM PRO
MAX_UPLOAD_MB=2048

# ---------- PUSH NOTIFICATIONS (Web Push - 100% Free Browser Standards) ----------
VAPID_PUBLIC_KEY=${vapidKeys.publicKey}
VAPID_PRIVATE_KEY=${vapidKeys.privateKey}
VAPID_SUBJECT=mailto:admin@example.com

# ---------- BACKGROUND SCHEDULER ($0 Built-in Scheduler) ----------
# Keep REDIS_URL empty to use the zero-cost in-process scheduler!
REDIS_URL=

# ---------- FREE EMAIL NOTIFICATIONS (Gmail App Password or Brevo Free) ----------
# Gmail option: Host=smtp.gmail.com, Port=587, User=your-email@gmail.com, Password=16-char-app-password
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASSWORD=
EMAIL_FROM="SMM PRO <no-reply@example.com>"

# ---------- WHATSAPP NOTIFICATIONS (AiSensy - Optional) ----------
AISENSY_API_KEY=
AISENSY_BASE_URL=https://backend.aisensy.com/campaign/t1/api/v2
AISENSY_CAMPAIGN_NAME=
AISENSY_TEMPLATE_NAME=
AISENSY_PHONE_NUMBER_ID=
AISENSY_USE_URL_BUTTON=false
AISENSY_WEBHOOK_SECRET=
`;

  // 3. Prepare client .env.production template
  const clientEnvContent = `# =================================================================
# SMM PRO - 100% ZERO-COST ($0) FRONTEND CONNECTION CONFIGURATION
# Generated automatically by setup:free
# =================================================================

# The public URL of your Render backend web service
# Example: https://smm-pro-api.onrender.com
VITE_API_URL=https://YOUR-BACKEND.onrender.com

# Reached directly for WebSocket live updates and media streaming
VITE_DIRECT_API_URL=https://YOUR-BACKEND.onrender.com
`;

  // 4. Write files
  const freeTierBackendFile = path.resolve(rootDir, '.env.free-tier');
  fs.writeFileSync(freeTierBackendFile, backendEnvContent, 'utf-8');

  const clientEnvProdFile = path.resolve(clientDir, '.env.production');
  if (!fs.existsSync(clientEnvProdFile)) {
    fs.writeFileSync(clientEnvProdFile, clientEnvContent, 'utf-8');
  }

  const clientEnvProdExampleFile = path.resolve(clientDir, '.env.production.example');
  fs.writeFileSync(clientEnvProdExampleFile, clientEnvContent, 'utf-8');

  console.log('✅ Generated backend 0-cost template: .env.free-tier');
  console.log('✅ Generated frontend connection files: client/.env.production.example & client/.env.production');
  console.log('\n--- 🔑 GENERATED PRODUCTION SECRETS ---');
  console.log('JWT_SECRET:');
  console.log(jwtSecret);
  console.log('\nJWT_REFRESH_SECRET:');
  console.log(jwtRefreshSecret);
  console.log('\nVAPID_PUBLIC_KEY:');
  console.log(vapidKeys.publicKey);
  console.log('\nVAPID_PRIVATE_KEY:');
  console.log(vapidKeys.privateKey);

  console.log('\n=====================================================');
  console.log('📋 NEXT 3 STEPS TO COMPLETE $0 DEPLOYMENT:');
  console.log('=====================================================');
  console.log('1. Database: Create a free M0 cluster on https://cloud.mongodb.com and copy the connection string.');
  console.log('2. Backend: Deploy to Render.com as a Free Web Service:');
  console.log('   - Build command: npm ci --workspace server --include-workspace-root && npm run build --workspace server');
  console.log('   - Start command: npm run start --workspace server');
  console.log('   - Health Check:  /api/health');
  console.log('   - Add the environment variables from .env.free-tier into Render Dashboard.');
  console.log('3. Frontend: Deploy client/ folder to Vercel (https://vercel.com):');
  console.log('   - Set Environment Variable: VITE_API_URL=https://YOUR-BACKEND.onrender.com');
  console.log('   - Set Environment Variable: VITE_DIRECT_API_URL=https://YOUR-BACKEND.onrender.com');
  console.log('=====================================================\n');
}

main();

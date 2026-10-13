# 🛡️ BULLETPROOF SMM PRO — COMPLETE PRODUCTION SETUP & ARCHITECTURE MANUAL

> **Version**: 1.0.0 Production Ready  
> **Target Cost**: **$0.00 / month (100% Free Tier Architecture)**  
> **Last Updated**: October 2026

---

## 🌐 Live Production URLs

| Component | Platform | Live Production URL |
| :--- | :--- | :--- |
| **Backend API** | Render.com | [https://smm-pro-api.onrender.com](https://smm-pro-api.onrender.com) |
| **Agency Web App** | Vercel | [https://smm-pro-nayankotadiya.vercel.app](https://smm-pro-nayankotadiya.vercel.app) |
| **Client Portal (PWA)** | Vercel | [https://smm-client-portal.vercel.app](https://smm-client-portal.vercel.app) |
| **API Healthcheck** | Render.com | [https://smm-pro-api.onrender.com/api/health](https://smm-pro-api.onrender.com/api/health) |

---

## 🏗️ 100% $0 Free Tier Architecture

```
                                  +---------------------------------------+
                                  |         Global Clients / Users        |
                                  +---------------------------------------+
                                           |                      |
                    (Vercel Edge CDN)      v                      v     (Vercel Edge CDN)
                   +---------------------------+        +---------------------------+
                   |     Agency Web App        |        |    Client Portal PWA      |
                   |  (smm-pro-nayankotadiya)  |        |    (smm-client-portal)    |
                   +---------------------------+        +---------------------------+
                                           \                      /
                                            \   (HTTPS / WSS)    /
                                             v                  v
                               +----------------------------------------------+
                               |            Render.com Web Service            |
                               |             (Node.js 22 + Express)           |
                               |          https://smm-pro-api.onrender.com    |
                               +----------------------------------------------+
                                         /              |             \
                     (Data & Small Media)               |              \ (Large Videos >15MB)
                                       v                v               v
                +--------------------------+   +----------------+   +---------------------------+
                |    MongoDB Atlas M0      |   | Web Push VAPID |   |   Google Drive OAuth 2.0  |
                |  - Database Collections  |   | (FCM & Apple)  |   |  - Personal 15 GB Quota   |
                |  - GridFS (<15MB Media)  |   | - Android PWA  |   |  - Heavy Videos & Exports |
                |  - 512 MB Free Forever   |   | - iOS WebKit   |   |  - Automatic Folders      |
                +--------------------------+   +----------------+   +---------------------------+
```

| Layer | Service | Free Tier Allowance | Purpose & Safeguards |
| :--- | :--- | :--- | :--- |
| **Backend API** | [Render.com](https://render.com) | 750 free instance hours / month | Runs API, Socket.io websockets, and background tasks. |
| **Database** | [MongoDB Atlas](https://cloud.mongodb.com) | 512 MB Free M0 Cluster | Stores users, chats, scripts, approval workflows, and GridFS chunks. |
| **Chat Media Safeguard** | MongoDB GridFS | Built-in | Small photos, voice notes & documents (<15MB) persist permanently in Atlas GridFS. |
| **Heavy Video Storage** | Google Drive | 15 GB Free Personal Storage | Heavy videos (>15MB) stream directly to personal Google Drive via OAuth 2.0 without exhausting 512MB Atlas quota. |
| **Client Portal** | [Vercel](https://vercel.com) | Unlimited Bandwidth | Mobile-friendly PWA for client approvals, briefs & live chat. |
| **Agency CRM** | [Vercel](https://vercel.com) | Unlimited Bandwidth | Full dashboard for Editors, Shooters, Scriptwriters & Admins. |
| **Push Notifications** | Web Push (VAPID) | Unlimited ($0) | Real-time push notifications across Windows, macOS, Android, and iOS PWA. |

---

## 🔑 Complete Environment Variables Master Reference

### 1. Backend Server (`Render.com` & `smm-pro/.env`)

```env
# ---------- Core Server Settings ----------
NODE_ENV=production
PORT=4000
APP_URL=https://smm-pro-nayankotadiya.vercel.app
CLIENT_PORTAL_URL=https://smm-client-portal.vercel.app
PUBLIC_APPROVAL_URL=https://smm-pro-nayankotadiya.vercel.app/approval
COOKIE_SAMESITE=none
COOKIE_DOMAIN=

# ---------- MongoDB Atlas Connection ----------
# Replace with your actual Atlas cluster connection string
MONGODB_URI=mongodb+srv://smmuser:<password>@cluster0.xxxxx.mongodb.net/smmpro?retryWrites=true&w=majority

# ---------- Authentication Secrets ----------
JWT_SECRET=smm_pro_dev_jwt_secret_key_super_secure_2026
JWT_REFRESH_SECRET=smm_pro_dev_jwt_refresh_secret_key_super_secure_2026
APPROVAL_TOKEN_TTL_HOURS=168
APP_TIMEZONE=Asia/Kolkata

# ---------- Google Drive OAuth 2.0 (Personal 15 GB Free Storage) ----------
# (Found in your private smm-pro/.env and Render Environment)
GOOGLE_CLIENT_ID=496408398091-xxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_REFRESH_TOKEN=1//040Pxtxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_REDIRECT_URI=https://developers.google.com/oauthplayground
DRIVE_ROOT_FOLDER_NAME=SMM PRO
MAX_UPLOAD_MB=4096

# ---------- Web Push Notifications (VAPID RFC 8292) ----------
VAPID_PUBLIC_KEY=BM4oiMoCIfSAONuA_s5AEEKP4vvxl7dr0YMDPHV9arv8YNZ2S0mYm81ib04YYgH2J1vI4DvlQUQYDYqWAurIetk
VAPID_PRIVATE_KEY=your_vapid_private_key_here
VAPID_SUBJECT=mailto:bulletproofbrands137@gmail.com

# ---------- Optional WhatsApp Integration (AiSensy) ----------
AISENSY_API_KEY=
AISENSY_BASE_URL=https://backend.aisensy.com/campaign/t1/api/v2
AISENSY_CAMPAIGN_NAME=
AISENSY_TEMPLATE_NAME=
AISENSY_WEBHOOK_SECRET=
AISENSY_USE_URL_BUTTON=false

# ---------- Optional Email SMTP ----------
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASSWORD=
EMAIL_FROM="Bulletproof SMM PRO <no-reply@bulletproofbrands.com>"
```

---

### 2. Client Portal Frontend (`smm-pro/client-portal/.env.production` & Vercel)

```env
VITE_API_URL=https://smm-pro-api.onrender.com
VITE_DIRECT_API_URL=https://smm-pro-api.onrender.com
VITE_VAPID_PUBLIC_KEY=BM4oiMoCIfSAONuA_s5AEEKP4vvxl7dr0YMDPHV9arv8YNZ2S0mYm81ib04YYgH2J1vI4DvlQUQYDYqWAurIetk
```

---

### 3. Agency App Frontend (`smm-pro/client/.env.production` & Vercel)

```env
VITE_API_URL=https://smm-pro-api.onrender.com
VITE_DIRECT_API_URL=https://smm-pro-api.onrender.com
VITE_VAPID_PUBLIC_KEY=BM4oiMoCIfSAONuA_s5AEEKP4vvxl7dr0YMDPHV9arv8YNZ2S0mYm81ib04YYgH2J1vI4DvlQUQYDYqWAurIetk
```

---

## 🛠️ Step-by-Step Production Deployment Guide

### STEP 1: Deploy MongoDB Atlas (Free 512 MB M0)
1. Sign up at [cloud.mongodb.com](https://cloud.mongodb.com).
2. Click **Create Deployment** ➔ Choose **M0 (Free)** ➔ Select region (e.g., AWS Mumbai `ap-south-1` or Oregon `us-west-2`).
3. Under **Security**:
   - Create a database user (e.g., username `smmuser`, password: `<your-password>`).
   - Under **Network Access**, add IP: `0.0.0.0/0` (Allow from Anywhere, required because Render uses dynamic IP addresses).
4. Click **Connect** ➔ **Drivers** ➔ Copy connection URI:
   ```text
   mongodb+srv://smmuser:<password>@cluster0.xxxxx.mongodb.net/smmpro?retryWrites=true&w=majority
   ```

---

### STEP 2: Deploy Backend Web Service on Render.com
1. Log in to [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** ➔ **Web Service** ➔ Select GitHub Repository `nayankotadiya/smm-pro`.
3. Configure the settings:
   - **Name**: `smm-pro-api`
   - **Region**: Same region as your MongoDB cluster (e.g., Singapore or Oregon).
   - **Branch**: `main`
   - **Root Directory**: *(Leave blank)*
   - **Runtime**: `Node`
   - **Build Command**:
     ```bash
     npm ci --workspace server --include-workspace-root && npm run build --workspace server
     ```
   - **Start Command**:
     ```bash
     npm run start --workspace server
     ```
   - **Instance Type**: **Free**
   - **Health Check Path**: `/api/health`
4. Under **Environment Variables**, add the keys from the [Backend Server Reference](#1-backend-server-rendercom--smm-proenv) above.
5. Click **Deploy Web Service**.
6. When deployment finishes, verify that `https://smm-pro-api.onrender.com` returns:
   ```json
   { "status": "ONLINE", "system": "OPERATIONAL" }
   ```

---

### STEP 3: Connect Google Drive (Personal 15 GB Free Storage)
Because Google blocks Service Accounts with 0 MB quota from uploading to free personal Gmail accounts, SMM PRO uses **OAuth 2.0 User Delegation**:

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials?project=smm-pro-510718):
   - Navigate to **APIs & Services** ➔ **Credentials**.
   - Click **+ CREATE CREDENTIALS** ➔ **OAuth client ID**.
   - Application Type: **Web application**.
   - Under **Authorized redirect URIs**, add:
     ```text
     https://developers.google.com/oauthplayground
     ```
   - Click **CREATE** and copy your **Client ID** and **Client Secret**.
2. Under **Google Auth Platform** ➔ **Audience** (or OAuth Consent Screen):
   - Under **Test users**, click **+ ADD USERS** and add your Google email (`meetobserver137@gmail.com`).
3. In [OAuth 2.0 Playground](https://developers.google.com/oauthplayground):
   - Click the **Gear Icon (⚙️)** in top right.
   - Check **"Use your own OAuth credentials"** and paste Client ID and Secret.
   - On the left list, select **Drive API v3** ➔ `https://www.googleapis.com/auth/drive`.
   - Click **Authorize APIs** ➔ Log in and allow permissions.
   - Click **Exchange authorization code for tokens** ➔ Copy the **Refresh Token**.
4. Set these in Render Environment:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REFRESH_TOKEN`
   - `DRIVE_ROOT_FOLDER_NAME` = `SMM PRO`

All heavy videos will now upload directly into your personal Google Drive folder **`SMM PRO`**!

---

### STEP 4: Deploy Frontends on Vercel
Both frontend apps are built with Vite + React:

#### A. Client Portal (`https://smm-client-portal.vercel.app`)
1. In [Vercel Dashboard](https://vercel.com):
2. Click **Add New Project** ➔ Select repository `nayankotadiya/smm-pro`.
3. Configure settings:
   - **Root Directory**: `client-portal`
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Environment Variables:
   - `VITE_API_URL` = `https://smm-pro-api.onrender.com`
   - `VITE_DIRECT_API_URL` = `https://smm-pro-api.onrender.com`
   - `VITE_VAPID_PUBLIC_KEY` = `BM4oiMoCIfSAONuA_s5AEEKP4vvxl7dr0YMDPHV9arv8YNZ2S0mYm81ib04YYgH2J1vI4DvlQUQYDYqWAurIetk`
5. Click **Deploy**.

#### B. Agency CRM (`https://smm-pro-nayankotadiya.vercel.app`)
1. Click **Add New Project** ➔ Select repository `nayankotadiya/smm-pro`.
2. Configure settings:
   - **Root Directory**: `client`
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Environment Variables:
   - `VITE_API_URL` = `https://smm-pro-api.onrender.com`
   - `VITE_DIRECT_API_URL` = `https://smm-pro-api.onrender.com`
   - `VITE_VAPID_PUBLIC_KEY` = `BM4oiMoCIfSAONuA_s5AEEKP4vvxl7dr0YMDPHV9arv8YNZ2S0mYm81ib04YYgH2J1vI4DvlQUQYDYqWAurIetk`
4. Click **Deploy**.

---

## 💻 Local Development Walkthrough

### 1. Prerequisites
- Node.js version 20+ or 22+ LTS
- Git

### 2. Clone and Install
```bash
git clone https://github.com/nayankotadiya/smm-pro.git
cd smm-pro
npm install
```

### 3. Create Super Admin User
To initialize your database with an administrator account:
```bash
cd server
npm run create-admin
```
*(Prompts for email, password, and name, or automatically generates an admin).*

### 4. Run Development Servers
From the root directory:
```bash
# Starts Server (port 4000), Agency App (port 5173), and Client Portal (port 5174) concurrently
npm run dev
```

### 5. Test Google Drive Connection
```bash
cd server
npm run test:drive
```
Prints connection status and verifies folder accessibility.

---

## 💡 Key Architectural Solutions & Safeguards

### 1. Multi-Tier Media Streaming (`pipeMedia`)
Media never disappears, even when Render restarts or sleeps:
- **Tier 1 (Instant Local Cache)**: If the file exists on the local temporary disk, it streams with instant seeking via HTTP 206 Byte Ranges.
- **Tier 2 (Permanent MongoDB GridFS)**: If local disk wiped during Render sleep, the file streams from MongoDB Atlas GridFS and automatically re-caches itself in the background.
- **Tier 3 (Google Drive Storage)**: For heavy videos (>15 MB), streaming pulls directly from Google Drive.

### 2. MongoDB Atlas 512 MB Safeguard (`MAX_GRIDFS_MB = 15`)
- Files **< 15 MB** (photos, voice notes, PDFs, script documents) are stored in GridFS.
- Files **> 15 MB** (full-length reel cuts, raw 4K footage) bypass GridFS and stream straight to Google Drive.
- This prevents your 512 MB Atlas database from ever running out of quota!

### 3. Zero Duplicate Notifications
Notification deduplication prevents double-alerts:
- **Endpoint Deduplication**: Server filters out duplicate subscription endpoints so each browser receives only 1 push.
- **Active Focus Check**: If the user is currently viewing the app (`document.hasFocus()`), system OS popups are suppressed in favor of in-app toasts.
- **4.5s Client Cooldown**: Duplicate socket and push events sharing the same stable tag (e.g. `chat-${roomId}`) are collapsed into a single alert.

---

## 📞 Support & Contacts
- **Repository**: [nayankotadiya/smm-pro](https://github.com/nayankotadiya/smm-pro)
- **Support Email**: `bulletproofbrands137@gmail.com`

# SMM PRO — $0 Zero-Cost Production Backend & Connection Guide

This guide gives you everything you need to run **SMM PRO in production at 100% $0 cost** using industry-standard free tiers without paying for servers, Redis clusters, or databases.

---

## 🏗️ The $0 Production Stack Architecture

| Layer | $0 Service / Provider | Free Allowance | Why It Works |
| :--- | :--- | :--- | :--- |
| **Backend API** | [Render.com Free Web Service](https://render.com) | 750 free instance hrs/month | Runs full Node.js 22 + WebSockets + SSL |
| **Database** | [MongoDB Atlas Free M0](https://cloud.mongodb.com) | 512 MB Free Forever | Replica sets, transactions, TLS encryption |
| **Frontend App** | [Vercel](https://vercel.com) or [Cloudflare Pages](https://pages.cloudflare.com) | Unlimited bandwidth / free SSL | Instant global edge CDN |
| **Background Scheduler** | Built-in In-Process Engine | Unlimited ($0) | Runs BullMQ/in-process queues without Redis |
| **Media Storage** | Google Drive Personal / Shared Drive | 15 GB Free | Chunked streaming & direct previews |
| **Push Notifications** | Web Push (VAPID) | 100% Free Browser Standard | Zero third-party gateway charges |
| **Transactional Email** | Gmail SMTP (App Password) / Brevo | 500 emails/day (Gmail) or 300/day (Brevo) | Free password resets & notifications |

---

## ⚡ 1-Click Secret Generator

A custom generator script has been installed in the repository. Run this command anytime in your terminal:

```bash
npm run setup:free
```

This automatically:
1. Generates 48-byte cryptographically secure random `JWT_SECRET` and `JWT_REFRESH_SECRET`.
2. Generates standard RFC 8292 VAPID public and private keys for Web Push.
3. Automatically updates `.env.free-tier` and `client/.env.production`.

---

## 📁 Key Connection & Configuration Files

### 1. Backend Environment Configuration: [`.env.free-tier`](file:///.env.free-tier)
Contains all backend configuration variables pre-tuned for free tier operations (connection pool limits `maxPoolSize=10`, `minPoolSize=2`, `COOKIE_SAMESITE=none`).

### 2. Frontend Connection Configuration: [`client/.env.production`](file:///client/.env.production)
Contains the exact URL parameters needed for the client:
```env
VITE_API_URL=https://YOUR-BACKEND.onrender.com
VITE_DIRECT_API_URL=https://YOUR-BACKEND.onrender.com
```

### 3. Render 1-Click Blueprint: [`render.yaml`](file:///render.yaml)
Deploy directly on Render with a single click. Pre-configured with:
- `plan: free`
- Healthcheck endpoint: `/api/health`
- Auto-deploy on `git push`

### 4. Vercel Reverse Proxy Configuration: [`client/vercel.json`](file:///client/vercel.json)
Configured to forward `/api/*` seamlessly to your Render backend to eliminate cross-site cookie restrictions.

### 5. Self-Hosted Docker Compose: [`docker-compose.free.yml`](file:///docker-compose.free.yml)
For self-hosting on a free VPS (such as Oracle Cloud Free Tier) or a home server.

---

## 🚀 Step-by-Step $0 Deployment Walkthrough

### Step 1: Create Free MongoDB Database ($0)
1. Go to [cloud.mongodb.com](https://cloud.mongodb.com) and create a free account.
2. Click **Create Deployment** → Select **M0 (Shared)** → Region: Closest to your users (e.g. Mumbai, Singapore, Oregon).
3. Under **Security Quickstart**:
   - Create a database user (e.g. `smmuser` / strong password).
   - Under **IP Access List**, click **Add IP Address** → Choose **Allow Access from Anywhere (`0.0.0.0/0`)** (Render uses dynamic IP addresses).
4. Click **Connect** → **Drivers (Node.js)** → Copy your connection string:
   ```
   mongodb+srv://smmuser:<password>@cluster0.xxxxx.mongodb.net/smmpro?retryWrites=true&w=majority
   ```

---

### Step 2: Deploy Backend to Render ($0)
1. Push your repository to GitHub or GitLab.
2. Sign in to [Render.com](https://render.com) (free account).
3. Click **New +** → **Web Service** → Select your repository.
4. Fill in the settings:
   - **Name**: `smm-pro-api`
   - **Region**: Same region as your MongoDB cluster (e.g. Oregon or Singapore)
   - **Branch**: `main`
   - **Root Directory**: (Leave blank or `.`)
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
5. Click **Advanced** → **Add Environment Variable**:
   - Copy the values from your generated [`.env.free-tier`](file:///.env.free-tier):
     - `NODE_ENV` = `production`
     - `PORT` = `4000`
     - `MONGODB_URI` = `mongodb+srv://...` (your Atlas URI)
     - `JWT_SECRET` = (generated secret)
     - `JWT_REFRESH_SECRET` = (generated secret)
     - `APP_URL` = `https://your-frontend.vercel.app`
     - `PUBLIC_APPROVAL_URL` = `https://your-frontend.vercel.app/approval`
     - `COOKIE_SAMESITE` = `none`
     - `VAPID_PUBLIC_KEY` = (generated key)
     - `VAPID_PRIVATE_KEY` = (generated key)
6. Click **Create Web Service**. Render will build and deploy your API with free HTTPS (e.g. `https://smm-pro-api.onrender.com`).

---

### Step 3: Deploy Frontend to Vercel ($0)
1. Go to [vercel.com](https://vercel.com) and import your Git repository.
2. Set **Root Directory** to `client`.
3. Set **Framework Preset** to `Vite`.
4. In **Environment Variables**, add:
   - `VITE_API_URL` = `https://smm-pro-api.onrender.com`
   - `VITE_DIRECT_API_URL` = `https://smm-pro-api.onrender.com`
5. Click **Deploy**. Vercel will give you a free production domain (e.g. `https://smm-pro.vercel.app`).
6. *Important*: Go back to your Render Dashboard → Environment Variables and verify that `APP_URL` matches your actual Vercel domain!

---

### Step 4: Keep Render Free Tier Awake 24/7 ($0 Cold-Start Fix)
Render's free tier spins down if no requests are received for 15 minutes. To keep it 100% awake with 0 cold starts:
1. Go to [UptimeRobot.com](https://uptimerobot.com) (free account, 50 monitors free forever).
2. Click **Add New Monitor**:
   - **Monitor Type**: `HTTP(s)`
   - **Friendly Name**: `SMM PRO API Keepalive`
   - **URL**: `https://smm-pro-api.onrender.com/api/health`
   - **Monitoring Interval**: `Every 10 minutes`
3. Click **Create Monitor**.
*Now your backend will never sleep, providing instantaneous responses 24/7 for $0!*

---

### Step 5: Initialize the First Super Admin
Run this one command locally or via Render SSH shell to create your initial super administrator account:

```bash
npm run create-admin -- --email=admin@yourcompany.com --name="Super Admin" --password="YourSuperSecurePassword123!"
```

You are now 100% live with zero hosting or database costs!

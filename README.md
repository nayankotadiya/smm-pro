# SMM PRO

Internal operating system for a social media content production company: clients, content workflow, scripts, shooting, editing, approvals, files, chat, tasks, reminders, automations, calendar and reports.

**Internal only.** There is no client login, client role or client portal. Clients are records. The only thing a client ever sees is a one-time review link (`/approval/<token>`) sent on WhatsApp.

## What is in this repository

```
smm-pro/
├── server/            Node + Express + TypeScript API, Socket.IO, jobs
│   └── src/
│       ├── config/        env, constants (stages, roles, permissions), db
│       ├── models/        Mongoose models
│       ├── middleware/    auth (JWT), RBAC, error handling
│       ├── services/      business logic: workflow, approvals, media, automation, chat, notify…
│       ├── integrations/  Google Drive, AiSensy, Web Push, email
│       ├── routes/        thin HTTP layer (validation + call a service)
│       ├── sockets/       presence, chat rooms, live content
│       ├── jobs/          reminders, deadlines, approval follow-ups, cleanup
│       ├── tests/         42 automated tests incl. the full client → published flow
│       └── seed.ts
├── client/            React + Vite + TypeScript + Tailwind PWA
│   ├── public/            manifest, service worker, icons
│   └── src/               pages, features, components, hooks, store, lib, pwa
├── .env.example
├── render.yaml        optional backend deploy
└── server/Dockerfile
```

## Run it locally

Requirements: Node 20+, a MongoDB database (Atlas free tier is fine).

```bash
npm install
cp .env.example .env            # set MONGODB_URI, JWT_SECRET, JWT_REFRESH_SECRET at minimum
npm run seed                    # creates roles, automations, team, clients and sample content
npm run dev                     # API on :4000, app on :5173
```

Open http://localhost:5173 and sign in with a seeded account, for example `nayan@smmpro.local` (Super Admin) or `rahul@smmpro.local` (Editor). The seed prints the password (`ChangeMe@123` unless you set `SEED_PASSWORD`). **Change every password before real use** (Settings → Users).

Without any integration keys the app is fully usable for testing:

| Integration | Without keys | With keys |
|---|---|---|
| Google Drive | Files are stored on the API server's disk (testing only) | Files upload from the browser straight to Drive |
| AiSensy | Review link is created and copied for manual sharing | Link is sent on WhatsApp, delivery is tracked |
| Web Push | In-app notifications only | Push to installed PWA / browser |
| Email | Admin resets passwords in Settings | Password reset and email notifications |
| Redis | In-process scheduler (one API instance) | BullMQ jobs + Socket.IO Redis adapter (many instances) |

Nothing is faked: every screen reads real database state, and Settings → Integrations shows exactly what is and is not connected.

### Tests

```bash
npm test                                   # uses mongodb-memory-server
TEST_MONGO_URI=mongodb://… npm test        # or run against any MongoDB-compatible database
```

`server/src/tests/e2e.test.ts` runs the exact acceptance flow: create client → content → script → submit → internal changes → V2 → approve → client link → open → client approves → shoot task → raw upload → editor task → edit V1 → SMM requests changes with timestamp → edit V2 → SMM approves → final review → final video → client link → approve → scheduling task → schedule → publish, asserting stage, progress, owner, tasks, notifications, chat events, activity and automation runs at each step.

## Connecting the integrations

### 1. Google Drive (primary media storage)

1. In Google Cloud, create a project, enable the **Google Drive API**, and create a **service account**. Download its JSON key.
2. In Google Drive, create a **Shared Drive** (for example "SMM PRO Media") and add the service account's email as **Content manager**. Using a Shared Drive means files belong to the company, not to one person's account.
3. Set on the server:
   - `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` = `base64 -w0 key.json`
   - `GOOGLE_SHARED_DRIVE_ID` = the ID in the Shared Drive URL
4. Restart. Folders are created automatically: `SMM PRO/Clients/<Client>/01_Brand_Assets … 10_Other`, and per content `REEL-2026-001_Title/01_Script … 06_Final`.

Large videos never pass through the API server. The API validates the request, names the file (`REEL-2026-001_EDIT_V2.mp4`), opens a **resumable upload session**, and the browser sends the bytes directly to Drive with real progress, cancel and retry. The API then verifies the file exists in the right folder, checks its first bytes really are video, and runs the workflow.

Nothing in Drive is made public. Preview and download go through the API, which checks permissions and streams the file (with range requests, so video seeking works). (A personal OAuth refresh token is supported as a fallback via `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN`, but is not recommended.)

### 2. AiSensy (WhatsApp)

1. Create and get approved a WhatsApp template with four variables, for example:
   `Hi {{1}}, "{{2}}" ({{3}}) is ready for your review. Open: {{4}}`
2. Create an **API Campaign** in AiSensy using that template.
3. Set `AISENSY_API_KEY`, `AISENSY_CAMPAIGN_NAME`, and a long random `AISENSY_WEBHOOK_SECRET`.
4. In AiSensy's webhook settings, set the URL to `https://<api-host>/api/integrations/aisensy/webhook?secret=<AISENSY_WEBHOOK_SECRET>` and subscribe to message status and incoming message topics.
5. Verify from Settings → Integrations → "Send test".

Behaviour worth knowing:

- A WhatsApp reply such as "Approved" is **never** treated as approval. It is saved in the client's Communication tab, the team is notified, and an employee chooses **Mark approved** or **Create change request**. That decision is recorded under their name.
- "Opened" is recorded only when the review page is actually viewed in a browser (a POST from the page), so WhatsApp's link preview cannot mark a link as opened. A WhatsApp "read" receipt is logged in the history but is not treated as "opened".
- Webhooks are idempotent: each event is stored by its external ID and processed once.

### 3. Web Push

```bash
npx web-push generate-vapid-keys
```
Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Each person then enables push per device in Settings → Notifications (the app never asks for permission on its own).

Platform notes, which the app also explains in Settings:

- Android (Chrome), Windows and macOS (Chrome, Edge, Firefox, Safari 16+): supported in the browser and in the installed app.
- iPhone and iPad: push only works after the app is added to the Home Screen (iOS 16.4+). The app detects this and shows the steps instead of a button that would not work.
- A push is stored as `SENT` when the push service accepts it. The app never claims the device displayed it.

### 4. Redis (optional until you scale)

Set `REDIS_URL` to move the scheduler to BullMQ and let several API instances share Socket.IO rooms. With one instance, the in-process scheduler runs the same checks every minute.

## Deploying

**Recommended layout:** `app.yourcompany.com` (frontend) and `api.yourcompany.com` (backend).

- **Database:** MongoDB Atlas. Allow the backend's IP.
- **Backend:** Railway, Render (`render.yaml`), a VPS or any container host (`server/Dockerfile`). It must support WebSockets and long-lived connections, so do not put the API on serverless functions.
  - Build: `npm ci --workspace server --include-workspace-root && npm run build --workspace server`
  - Start: `npm run start --workspace server`
  - Set `NODE_ENV=production`, `APP_URL=https://app.yourcompany.com`, `PUBLIC_APPROVAL_URL=https://app.yourcompany.com/approval`, and the rest of `.env.example`.
- **Frontend:** Vercel or any static host. Root directory `client`, build `npm run build`, output `dist`.
  - Edit `client/vercel.json` and replace `YOUR-API-HOST`. This proxies `/api` through the app's own domain, so the sign-in cookie is first-party in every browser.
  - Set `VITE_DIRECT_API_URL=https://api.yourcompany.com` so WebSockets and video streams go straight to the backend.

Why this matters: the session uses a short-lived access token held in memory plus an httpOnly refresh cookie. If the app and API sit on unrelated domains (for example `*.vercel.app` and `*.railway.app`), Safari blocks that cookie and people get signed out on every reload. Same-site hosting or the `/api` proxy avoids it.

**First production start:** create your own admin, with no sample data:

```bash
npm run create-admin -- "Nayan" nayan@yourcompany.com "a-strong-password"
```

Then sign in and add the team in Settings → Users. (`npm run seed` is for trying the app out; it adds the sample team, clients and content.)

## How the system works

**Content ID is the hub.** Every content item gets an ID like `REEL-2026-001`. Drive folders, file names, tasks, chat, approvals, notifications, schedule and activity all reference it.

**The workflow is server-authoritative.** People do one thing (submit, upload, approve) and the server does the rest:

```
Idea → Script → Internal Review → Client Review → Shooting → Raw Footage
     → Editing → SMM Review → Final Review → Client Final Approval → Schedule → Published
```

For each step the server updates stage, progress (calculated from the stage, never typed in), current owner, next owner, last action and next action; writes the activity log; posts a system card in the content chat; and emits a domain event. Changes are pushed to every open screen over Socket.IO.

**Automations are real rules.** `services/automation.ts` subscribes to domain events and runs WHEN/THEN rules stored in the database (create task, notify, create reminder). The defaults cover the whole workflow. Admins can pause them, add new ones, and see each run with its result in Automation.

**Approvals.**
- Internal (script, SMM, final): decided in the app by the reviewer. Requesting changes creates the revision task automatically.
- Client: a 256-bit random token, stored only as a SHA-256 hash (plus an encrypted copy so staff can re-copy an *active* link). The link is tied to one approval, one content item and one version, expires (`APPROVAL_TOKEN_TTL_HOURS`), and cannot be used again after a decision. Resending rotates the token.

**Roles and permissions.** Ten roles, no client role. Permissions are stored per role and editable in Settings → Roles. People without "see all content" only see content they are assigned to; that rule is applied in the queries, not just in the UI.

**Security.** bcrypt passwords, access JWT (15 min) + rotating refresh tokens with reuse detection, CSRF header check on cookie endpoints, Helmet, strict CORS, rate limits, zod validation on every route, upload type/size checks with content sniffing, signed 5-minute URLs for media, audit log with IP for admins, and secrets only in server environment variables.

## Notes on the data model

The spec listed 25 collections. Three were merged because separate collections would only duplicate data:

- `contentIdeas` → a content item in the `IDEA` stage.
- `editingVersions` and `driveFiles` → `media` (one record per file, with category `RAW | EDIT | FINAL | …`, version number and Drive IDs).

Everything else maps one-to-one. Deletes are soft (`deletedAt`) for users, clients, campaigns, content, tasks and media.

## Publishing to social platforms

Posting directly to Instagram or YouTube needs each platform's app review. For now the SMM schedules the post in SMM PRO, is notified when it is due, publishes on the platform, and confirms with the live URL (or marks it failed, which surfaces under "Needs your attention"). The `scheduledPosts` collection and the scheduler job are the place to add API publishing later.

## Native apps later

The web app is the product: responsive, installable, with push. To wrap it:

- **Android / iOS:** add Capacitor in `client/`, point it at the built `dist`, set `VITE_API_URL` and `VITE_DIRECT_API_URL` to the backend, and swap `src/pwa/index.ts` push registration for `@capacitor/push-notifications` (store the device token in `notificationSubscriptions` with a `deviceType`).
- **Desktop:** Tauri or Electron loading the same build.

All business logic lives in the API, so nothing is duplicated.

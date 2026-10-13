import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { ah } from '../utils/async';
import { AppError, badRequest, notFound, forbidden } from '../utils/errors';
import { randomToken, sha256 } from '../utils/crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ClientUser, Client, Content, Approval, Script, ScriptVersion, Media, ClientBrief, Feedback, PortalConfig, ChatRoom, Message, Notification, PushSubscription } from '../models';
import { requirePortalAuth, signPortalAccess, userFromPortalToken, signPortal2FATemp, verifyPortal2FATemp } from '../middleware/clientAuth';
import { requireAuth } from '../middleware/auth';
import { clientDecision } from '../services/approvals';
import { pipeMedia, inferMimeType, safeMoveFile } from '../services/media';
import { saveFileToGridFS } from '../services/gridfs';
import { ensureClientRoom, ensureContentRoom, broadcastMessage, postSystemEvent } from '../services/chat';
import { nextContentCode, applyStage, setLastAction, broadcastContent } from '../services/content';
import { ensureContentFolders, LOCAL_DIR, localPathFor } from '../services/storage';
import { logActivity } from '../services/activity';
import { emitDomain } from '../services/events';
import { emitOrg, emitToRoom, emitToUser } from '../services/realtime';
import { aisensyConfigured, sendTemplate } from '../integrations/aisensy';
import { sendEmail } from '../integrations/email';
import { logger } from '../utils/logger';
import { notify, managerIds } from '../services/notify';
import { pushConfigured, sendPush, getVapidPublicKey } from '../integrations/push';

const r = Router();

const CHAT_UPLOAD_TMP = path.join(LOCAL_DIR, 'tmp');
try { fs.mkdirSync(CHAT_UPLOAD_TMP, { recursive: true }); } catch {}
const portalUpload = multer({
  dest: CHAT_UPLOAD_TMP,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit for chat attachments
});

const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Too many login attempts. Please try again in 15 minutes.' } },
});

// ----------------------------------------------------
// Public Authentication Endpoints & Configuration
// ----------------------------------------------------

/** Public Portal Auth Configuration */
r.get('/auth/config', ah(async (_req, res) => {
  let cfg = await PortalConfig.findOne({ key: 'global' }).lean();
  if (!cfg) {
    const created = await PortalConfig.create({
      key: 'global',
      authMethod: 'PASSWORD_ONLY',
      magicLinkEnabled: true,
      portalUrl: process.env.CLIENT_PORTAL_URL || 'http://localhost:5174',
    });
    cfg = created.toObject();
  }
  res.json({
    authMethod: cfg?.authMethod || 'PASSWORD_ONLY',
    magicLinkEnabled: Boolean(cfg?.magicLinkEnabled),
    defaultMethod: 'password',
    portalUrl: cfg?.portalUrl || 'http://localhost:5174',
  });
}));

/** Public: Get Web Push VAPID configuration for client devices */
r.get('/push/config', (_req, res) => {
  res.json({ enabled: pushConfigured(), publicKey: getVapidPublicKey() });
});

/** Super Admin: Get Portal Settings */
r.get('/config', requireAuth, ah(async (req, res) => {
  let cfg = await PortalConfig.findOne({ key: 'global' }).lean();
  if (!cfg) {
    const created = await PortalConfig.create({
      key: 'global',
      authMethod: 'PASSWORD_ONLY',
      magicLinkEnabled: true,
      portalUrl: process.env.CLIENT_PORTAL_URL || 'http://localhost:5174',
    });
    cfg = created.toObject();
  }
  res.json(cfg);
}));

/** Super Admin: Switch Portal Login Methods */
r.put('/config', requireAuth, ah(async (req, res) => {
  if (req.user!.role !== 'SUPER_ADMIN' && req.user!.role !== 'ADMIN') {
    throw forbidden('Only an Administrator can change client portal login methods');
  }
  const body = z.object({
    authMethod: z.enum(['PASSWORD_ONLY', 'OTP_ONLY', 'HYBRID']).optional(),
    magicLinkEnabled: z.boolean().optional(),
    portalUrl: z.string().optional(),
  }).parse(req.body);

  const cfg = await PortalConfig.findOneAndUpdate(
    { key: 'global' },
    { ...body, updatedBy: req.user!._id },
    { upsert: true, new: true }
  );
  res.json(cfg);
}));
r.patch('/config', requireAuth, ah(async (req, res) => {
  if (req.user!.role !== 'SUPER_ADMIN' && req.user!.role !== 'ADMIN') {
    throw forbidden('Only an Administrator can change client portal login methods');
  }
  const body = z.object({
    authMethod: z.enum(['PASSWORD_ONLY', 'OTP_ONLY', 'HYBRID']).optional(),
    magicLinkEnabled: z.boolean().optional(),
    portalUrl: z.string().optional(),
  }).parse(req.body);

  const cfg = await PortalConfig.findOneAndUpdate(
    { key: 'global' },
    { ...body, updatedBy: req.user!._id },
    { upsert: true, new: true }
  );
  res.json(cfg);
}));

function maskEmail(email: string) {
  const [name, domain] = email.split('@');
  if (!domain) return email;
  const maskedName = name.length <= 2 ? name[0] + '*' : name[0] + '*'.repeat(Math.max(1, name.length - 2)) + name[name.length - 1];
  return `${maskedName}@${domain}`;
}

/** Email & Password Login with Keep Signed In & 2FA */
r.post('/auth/login', authLimiter, ah(async (req, res) => {
  const cfg = await PortalConfig.findOne({ key: 'global' });
  if (cfg && cfg.authMethod === 'OTP_ONLY') {
    throw new AppError(400, 'Password login is disabled by agency administrator. Please use WhatsApp OTP to log in.', 'AUTH_METHOD_DISABLED');
  }

  const { email, password, remember } = z.object({
    email: z.string().email(),
    password: z.string().min(1),
    remember: z.boolean().optional().default(true),
  }).parse(req.body);

  const user = await ClientUser.findOne({ email: email.toLowerCase() }).select('+passwordHash +twoFactorCodeHash +twoFactorExpiresAt +twoFactorAttempts');
  if (!user || !user.active) {
    throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  }

  if (!user.passwordHash) {
    throw new AppError(400, 'Password is not set for this account. Please use WhatsApp OTP to log in.', 'NO_PASSWORD');
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  }

  const client = await Client.findById(user.clientId).select('name businessName status');
  if (!client || client.status === 'ARCHIVED') {
    throw new AppError(403, 'Client account is suspended or archived', 'ACCOUNT_SUSPENDED');
  }

  // If Two-Factor Authentication is enabled on this client account
  if (user.twoFactorEnabled) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    user.twoFactorCodeHash = sha256(code);
    user.twoFactorExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    user.twoFactorAttempts = 0;
    await user.save();

    // Dispatch 2FA verification email
    const subject = `${code} is your Bulletproof Portal 2FA Verification Code`;
    const emailBody = `Hello ${user.name},\n\nYour Two-Factor Authentication security code is:\n\n${code}\n\nThis code will expire in 10 minutes.\nIf you did not request this login, please contact your account manager immediately.`;
    await sendEmail(user.email, subject, emailBody);

    // If phone exists & AiSensy configured, dispatch to WhatsApp as well
    if (user.phone && aisensyConfigured()) {
      try {
        await sendTemplate({
          campaignName: 'client_portal_otp',
          phone: user.phone,
          userName: user.name,
          params: [user.name, code, '10 minutes'],
        });
      } catch (err: any) {
        logger.warn('Failed to send WhatsApp 2FA OTP', { error: err.message });
      }
    }

    logger.info(`[2FA Security] Generated 2FA verification code for ${user.email}: ${code}`);

    const tempToken = signPortal2FATemp({ _id: user._id, clientId: user.clientId, role: user.role });
    return res.json({
      requires2FA: true,
      tempToken,
      method: user.twoFactorMethod || 'EMAIL',
      destination: maskEmail(user.email),
      message: `A 6-digit verification code has been sent to ${maskEmail(user.email)}.`,
    });
  }

  user.lastLoginAt = new Date();
  user.rememberMe = remember;
  await user.save();

  const token = signPortalAccess({ _id: user._id, clientId: user.clientId, role: user.role }, remember);
  res.json({
    token,
    user: {
      _id: String(user._id),
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      twoFactorEnabled: false,
      client: {
        _id: String(client._id),
        name: client.businessName || client.name,
      },
    },
  });
}));

/** Verify 2FA Code to Complete Login */
r.post('/auth/2fa/verify', authLimiter, ah(async (req, res) => {
  const { tempToken, code, remember } = z.object({
    tempToken: z.string(),
    code: z.string().length(6),
    remember: z.boolean().optional().default(true),
  }).parse(req.body);

  const payload = verifyPortal2FATemp(tempToken);
  const user = await ClientUser.findById(payload.sub).select('+twoFactorCodeHash +twoFactorExpiresAt +twoFactorAttempts');
  if (!user || !user.active) {
    throw new AppError(401, 'User account is inactive or not found', 'UNAUTHORIZED');
  }

  if (!user.twoFactorCodeHash || !user.twoFactorExpiresAt) {
    throw new AppError(400, 'Invalid or expired 2FA session. Please log in again.', 'INVALID_2FA');
  }

  if (user.twoFactorExpiresAt < new Date()) {
    throw new AppError(400, 'This verification code has expired. Please request a new code.', '2FA_EXPIRED');
  }

  if ((user.twoFactorAttempts || 0) >= 5) {
    throw new AppError(429, 'Too many invalid verification attempts. Please log in again.', '2FA_LOCKED');
  }

  if (sha256(code) !== user.twoFactorCodeHash) {
    user.twoFactorAttempts = (user.twoFactorAttempts || 0) + 1;
    await user.save();
    throw new AppError(400, 'Incorrect verification code. Please try again.', 'INVALID_2FA');
  }

  // Clear 2FA Challenge on successful verification
  user.twoFactorCodeHash = undefined;
  user.twoFactorExpiresAt = undefined;
  user.twoFactorAttempts = 0;
  user.lastLoginAt = new Date();
  user.rememberMe = remember;
  await user.save();

  const client = await Client.findById(user.clientId).select('name businessName status');
  const token = signPortalAccess({ _id: user._id, clientId: user.clientId, role: user.role }, remember);

  res.json({
    token,
    user: {
      _id: String(user._id),
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      twoFactorEnabled: true,
      client: {
        _id: String(client?._id),
        name: client?.businessName || client?.name,
      },
    },
  });
}));

/** Resend 2FA Verification Code */
r.post('/auth/2fa/resend', authLimiter, ah(async (req, res) => {
  const { tempToken } = z.object({ tempToken: z.string() }).parse(req.body);
  const payload = verifyPortal2FATemp(tempToken);

  const user = await ClientUser.findById(payload.sub).select('+twoFactorCodeHash +twoFactorExpiresAt +twoFactorAttempts');
  if (!user || !user.active) {
    throw new AppError(401, 'Account inactive or not found', 'UNAUTHORIZED');
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  user.twoFactorCodeHash = sha256(code);
  user.twoFactorExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  user.twoFactorAttempts = 0;
  await user.save();

  // Dispatch email
  await sendEmail(
    user.email,
    `${code} is your Bulletproof Portal 2FA Verification Code`,
    `Hello ${user.name},\n\nYour fresh Two-Factor Authentication security code is:\n\n${code}\n\nThis code will expire in 10 minutes.`
  );

  if (user.phone && aisensyConfigured()) {
    try {
      await sendTemplate({
        campaignName: 'client_portal_otp',
        phone: user.phone,
        userName: user.name,
        params: [user.name, code, '10 minutes'],
      });
    } catch {}
  }

  logger.info(`[2FA Resend] Sent fresh code for ${user.email}: ${code}`);
  res.json({ ok: true, message: `New code sent to ${maskEmail(user.email)}.` });
}));

/** Send WhatsApp OTP (6 digits) */
r.post('/auth/otp/send', authLimiter, ah(async (req, res) => {
  const cfg = await PortalConfig.findOne({ key: 'global' });
  if (cfg && cfg.authMethod === 'PASSWORD_ONLY') {
    throw new AppError(400, 'WhatsApp OTP login is disabled by agency administrator. Please sign in with Email & Password.', 'AUTH_METHOD_DISABLED');
  }

  const { phone } = z.object({ phone: z.string().min(8) }).parse(req.body);
  const cleanPhone = phone.replace(/[^\d+]/g, '');

  const user = await ClientUser.findOne({
    $or: [{ phone: cleanPhone }, { phone: cleanPhone.replace(/^\+/, '') }],
    active: true,
  });

  if (!user) {
    throw new AppError(404, 'No active client account found with this phone number. Please contact your account manager.', 'USER_NOT_FOUND');
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  user.otpCodeHash = sha256(code);
  user.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  user.otpAttempts = 0;
  await user.save();

  if (aisensyConfigured()) {
    try {
      await sendTemplate({
        campaignName: 'client_portal_otp',
        phone: cleanPhone,
        userName: user.name,
        params: [user.name, code, '10 minutes'],
      });
    } catch (err: any) {
      logger.error('Failed to send WhatsApp OTP via AiSensy', { error: err.message, phone: cleanPhone });
    }
  }

  logger.info(`[Client Portal OTP] Generated OTP for ${cleanPhone}: ${code}`);
  res.json({
    ok: true,
    message: 'Verification code sent to your WhatsApp number.',
  });
}));

/** Verify WhatsApp OTP */
r.post('/auth/otp/verify', authLimiter, ah(async (req, res) => {
  const { phone, code, remember } = z.object({
    phone: z.string().min(8),
    code: z.string().length(6),
    remember: z.boolean().optional().default(true),
  }).parse(req.body);

  const cleanPhone = phone.replace(/[^\d+]/g, '');
  const user = await ClientUser.findOne({
    $or: [{ phone: cleanPhone }, { phone: cleanPhone.replace(/^\+/, '') }],
    active: true,
  }).select('+otpCodeHash +otpExpiresAt +otpAttempts');

  if (!user || !user.otpCodeHash || !user.otpExpiresAt) {
    throw new AppError(400, 'Invalid or expired OTP request. Please request a new code.', 'INVALID_OTP');
  }

  if (user.otpExpiresAt < new Date()) {
    throw new AppError(400, 'This verification code has expired. Please request a new code.', 'OTP_EXPIRED');
  }

  if ((user.otpAttempts || 0) >= 5) {
    throw new AppError(429, 'Too many invalid attempts. Please request a new code.', 'OTP_LOCKED');
  }

  if (sha256(code) !== user.otpCodeHash) {
    user.otpAttempts = (user.otpAttempts || 0) + 1;
    await user.save();
    throw new AppError(400, 'Incorrect verification code. Please try again.', 'INVALID_OTP');
  }

  // Clear OTP
  user.otpCodeHash = undefined;
  user.otpExpiresAt = undefined;
  user.otpAttempts = 0;
  user.lastLoginAt = new Date();
  user.rememberMe = remember;
  await user.save();

  const client = await Client.findById(user.clientId).select('name businessName status');
  const token = signPortalAccess({ _id: user._id, clientId: user.clientId, role: user.role }, remember);

  res.json({
    token,
    user: {
      _id: String(user._id),
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      twoFactorEnabled: !!user.twoFactorEnabled,
      client: {
        _id: String(client?._id),
        name: client?.businessName || client?.name,
      },
    },
  });
}));

/** Request 1-Click Magic Link */
r.post('/auth/magic/request', authLimiter, ah(async (req, res) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  const user = await ClientUser.findOne({ email: email.toLowerCase(), active: true });

  if (user) {
    const rawToken = randomToken(32);
    user.magicTokenHash = sha256(rawToken);
    user.magicTokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    await user.save();

    const portalBaseUrl = process.env.CLIENT_PORTAL_URL || 'http://localhost:5174';
    const magicLink = `${portalBaseUrl}/auth/magic?token=${rawToken}`;

    const emailBody = `Hello ${user.name},\n\nUse this secure link to sign in to your Brand Portal:\n${magicLink}\n\nThis link will expire in 30 minutes.\nIf you did not request this, please ignore this email.`;
    await sendEmail(user.email, 'Sign in to your Client Portal', emailBody);

    logger.info(`[Magic Link] Generated for ${user.email}: ${magicLink}`);
  }

  res.json({ ok: true, message: 'If an account exists with that email, a sign-in link has been sent.' });
}));

/** Verify Magic Link Token */
r.get('/auth/magic/verify/:token', authLimiter, ah(async (req, res) => {
  const { token } = req.params;
  const user = await ClientUser.findOne({
    magicTokenHash: sha256(token),
    active: true,
  }).select('+magicTokenExpiresAt');

  if (!user || !user.magicTokenExpiresAt || user.magicTokenExpiresAt < new Date()) {
    throw new AppError(400, 'This sign-in link is invalid or has expired.', 'INVALID_MAGIC_LINK');
  }

  user.magicTokenHash = undefined;
  user.magicTokenExpiresAt = undefined;
  user.lastLoginAt = new Date();
  await user.save();

  const client = await Client.findById(user.clientId).select('name businessName status');
  const jwtToken = signPortalAccess({ _id: user._id, clientId: user.clientId, role: user.role });

  res.json({
    token: jwtToken,
    user: {
      _id: String(user._id),
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      client: {
        _id: String(client?._id),
        name: client?.businessName || client?.name,
      },
    },
  });
}));

// ----------------------------------------------------
// Authenticated Client Portal Endpoints
// (Strict Tenant Isolation via req.portalUser.clientId)
// ----------------------------------------------------
r.use(requirePortalAuth);

/** Get current profile and brand settings */
r.get('/auth/me', ah(async (req, res) => {
  const p = req.portalUser!;
  const client = await Client.findById(p.clientId)
    .populate('logoMediaId', 'fileName mimeType')
    .populate('defaultTeam.smm defaultTeam.writer', 'name email title')
    .lean();

  if (!client) throw notFound('Client');

  res.json({
    user: p,
    client: {
      _id: String(client._id),
      name: client.name,
      businessName: client.businessName || client.name,
      category: client.category,
      brandTone: client.brandTone,
      brandColors: client.brandColors || [],
      fonts: client.fonts || [],
      logoUrl: client.logoMediaId ? `/api/portal/assets/logo` : null,
      accountManager: client.defaultTeam?.smm ? {
        name: (client.defaultTeam.smm as any).name,
        title: 'Account Manager & SMM',
      } : null,
    },
  });
}));

/** Toggle Two-Factor Authentication for Client Portal Account */
r.post('/auth/2fa/toggle', ah(async (req, res) => {
  const user = await ClientUser.findById(req.portalUser!._id);
  if (!user) throw notFound('User');

  user.twoFactorEnabled = !user.twoFactorEnabled;
  await user.save();

  if (user.twoFactorEnabled) {
    void sendEmail(
      user.email,
      '2FA Enabled for your Bulletproof Client Portal Account',
      `Hello ${user.name},\n\nTwo-Factor Authentication (2FA) is now ACTIVE for your account. You will receive a verification code on each sign-in to keep your workspace secure.\n\nBulletproof Brands Security`
    ).catch(() => null);
  }

  res.json({
    ok: true,
    twoFactorEnabled: user.twoFactorEnabled,
    message: user.twoFactorEnabled
      ? 'Two-Factor Authentication enabled successfully!'
      : 'Two-Factor Authentication disabled.',
  });
}));

/** Client Portal Dashboard */
r.get('/dashboard', ah(async (req, res) => {
  const clientId = req.portalUser!.clientId;

  // 1. Pending Approvals
  const pendingApprovals = await Approval.find({
    clientId,
    type: { $in: ['CLIENT_SCRIPT', 'CLIENT_FINAL'] },
    status: { $in: ['SENT', 'DELIVERED', 'OPENED', 'WAITING_FOR_CLIENT', 'PENDING'] },
  })
    .sort({ createdAt: -1 })
    .populate({ path: 'contentId', select: 'contentId title type platform deadline scheduledAt' })
    .lean();

  // 2. Deliverables Progress (Current Month)
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const monthContent = await Content.find({
    clientId,
    createdAt: { $gte: startOfMonth, $lte: endOfMonth },
  }).select('stage status title scheduledAt publishedAt type').lean();

  const totalThisMonth = monthContent.length;
  const publishedCount = monthContent.filter((c) => c.stage === 'PUBLISHED').length;
  const scheduledCount = monthContent.filter((c) => c.stage === 'SCHEDULE').length;
  const inProductionCount = monthContent.filter((c) => !['PUBLISHED', 'SCHEDULE', 'CANCELLED'].includes(c.stage)).length;

  // 3. Next 5 Upcoming Scheduled Posts
  const upcomingPosts = await Content.find({
    clientId,
    stage: { $in: ['SCHEDULE', 'PUBLISHED'] },
    $or: [{ scheduledAt: { $gte: new Date(Date.now() - 24 * 3600 * 1000) } }, { publishedAt: { $exists: true } }],
  })
    .sort({ scheduledAt: 1, publishedAt: -1 })
    .limit(5)
    .select('contentId title type platform scheduledAt publishedAt caption')
    .lean();

  // 4. Recent Client Briefs & Content Requests
  const recentBriefs = await ClientBrief.find({ clientId })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate('contentId', 'contentId stage status progress title currentVideoVersion currentScriptVersion scheduledAt publishedAt')
    .populate('submittedBy', 'name email')
    .lean();

  const openRequestsCount = await ClientBrief.countDocuments({
    clientId,
    status: { $in: ['SUBMITTED', 'IN_REVIEW'] },
  });

  // 5. Client's Brand info
  const client = await Client.findById(clientId)
    .populate('defaultTeam.smm', 'name email title')
    .select('name businessName defaultTeam')
    .lean();

  res.json({
    pendingApprovals: pendingApprovals.map((a: any) => ({
      _id: String(a._id),
      type: a.type,
      version: a.version,
      status: a.status,
      title: a.contentId?.title || 'Untitled',
      contentId: a.contentId?.contentId,
      contentType: a.contentId?.type,
      deadline: a.contentId?.deadline,
      sentAt: a.sentAt || a.createdAt,
    })),
    stats: {
      totalThisMonth,
      publishedCount,
      scheduledCount,
      inProductionCount,
      pendingApprovalCount: pendingApprovals.length,
      openRequestsCount,
    },
    recentBriefs,
    upcomingPosts,
    accountManager: client?.defaultTeam?.smm ? {
      name: (client.defaultTeam.smm as any).name,
      title: 'Dedicated Account Manager',
    } : null,
  });
}));

/** Approvals List */
r.get('/approvals', ah(async (req, res) => {
  const clientId = req.portalUser!.clientId;
  const approvals = await Approval.find({
    clientId,
    type: { $in: ['CLIENT_SCRIPT', 'CLIENT_FINAL'] },
  })
    .sort({ createdAt: -1 })
    .populate({ path: 'contentId', select: 'contentId title type platform deadline' })
    .lean();

  res.json(approvals.map((a: any) => ({
    _id: String(a._id),
    title: a.contentId?.title,
    contentId: a.contentId?.contentId,
    type: a.type,
    version: a.version,
    status: a.status,
    decidedAt: a.decidedAt,
    feedbackCount: a.feedbackCount || 0,
    createdAt: a.createdAt,
  })));
}));

/** Single Approval Details (Script or Video) */
r.get('/approvals/:id', ah(async (req, res) => {
  const clientId = req.portalUser!.clientId;
  const a = await Approval.findOne({ _id: req.params.id, clientId });
  if (!a) throw notFound('Approval');

  const content = (await Content.findById(a.contentId).lean())!;
  const client = (await Client.findById(clientId).select('name businessName brandColors').lean())!;

  let script: any = null;
  if (a.scriptVersionId) {
    const v = await ScriptVersion.findById(a.scriptVersionId).lean();
    if (v) {
      script = {
        hook: v.hook,
        scenes: v.scenes,
        dialogue: v.dialogue,
        body: v.body || v.dialogue,
        cta: v.cta,
        captionNotes: v.captionNotes,
        duration: v.duration,
        music: v.music,
      };
    }
  }

  const media = a.mediaId ? await Media.findById(a.mediaId).select('mimeType fileName size webViewLink').lean() : null;
  const thumb = await Media.findOne({ contentId: a.contentId, category: 'THUMBNAIL' }).select('_id').lean();

  // Feedback list for this approval
  const feedbackList = await Feedback.find({ approvalId: a._id })
    .sort({ timestampSec: 1, createdAt: 1 })
    .select('comment timestampSec authorType authorName createdAt')
    .lean();

  res.json({
    _id: String(a._id),
    brand: client.businessName || client.name,
    title: content.title,
    contentId: content.contentId,
    version: a.version,
    type: a.type,
    status: a.status,
    decided: ['APPROVED', 'CHANGES_REQUESTED'].includes(a.status),
    caption: content.caption,
    hashtags: content.hashtags,
    description: content.description,
    script,
    hasVideo: !!media && (media.mimeType || '').startsWith('video/'),
    hasThumbnail: !!thumb,
    videoUrl: `/api/portal/approvals/${a._id}/video`,
    thumbnailUrl: thumb ? `/api/portal/approvals/${a._id}/thumbnail` : null,
    webViewLink: media?.webViewLink || null,
    fileName: media?.fileName || null,
    feedback: feedbackList,
    createdAt: a.createdAt,
    decidedAt: a.decidedAt,
  });
}));

/** Record Client Decision (Approve or Request Changes) */
r.post('/approvals/:id/decision', ah(async (req, res) => {
  const clientId = req.portalUser!.clientId;
  const a = await Approval.findOne({ _id: req.params.id, clientId });
  if (!a) throw notFound('Approval');

  const { decision, comments } = z.object({
    decision: z.enum(['APPROVE', 'CHANGES']),
    comments: z.array(z.object({
      timestampSec: z.number().min(0).max(86400).optional(),
      comment: z.string().min(1).max(2000),
    })).optional(),
  }).parse(req.body);

  const result = await clientDecision(a, decision, {
    name: req.portalUser!.name,
    comments: comments || [],
  }, { ip: req.ip });

  res.json({ ok: true, status: result.status });
}));

/** Stream Approval Video with Range Requests */
r.get('/approvals/:id/video', ah(async (req, res) => {
  const clientId = req.portalUser!.clientId;
  const a = await Approval.findOne({ _id: req.params.id, clientId });
  if (!a || !a.mediaId) throw notFound('Video file');

  const media = await Media.findById(a.mediaId).select('+localPath +gridFsId');
  if (!media) throw notFound('Media file');

  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  try {
    await pipeMedia(media, res, req.headers.range);
  } catch (err: any) {
    if (media.webViewLink) {
      return res.redirect(media.webViewLink);
    }
    throw err;
  }
}));

/** Stream Approval Thumbnail */
r.get('/approvals/:id/thumbnail', ah(async (req, res) => {
  const clientId = req.portalUser!.clientId;
  const a = await Approval.findOne({ _id: req.params.id, clientId });
  if (!a) throw notFound('Approval');

  const thumb = await Media.findOne({ contentId: a.contentId, category: 'THUMBNAIL' }).select('+localPath +gridFsId');
  if (!thumb) throw notFound('Thumbnail');

  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  await pipeMedia(thumb, res, req.headers.range);
}));

/** Client Content Library (All posts, status, captions) */
r.get('/content', ah(async (req, res) => {
  const clientId = req.portalUser!.clientId;
  const items = await Content.find({ clientId })
    .sort({ createdAt: -1 })
    .select('contentId title type platform stage status progress scheduledAt publishedAt caption hashtags deadline')
    .lean();

  // Map internal technical stages to client-friendly labels
  const stageMap: Record<string, string> = {
    IDEA: 'Scripting',
    SCRIPT: 'Scripting',
    INTERNAL_REVIEW: 'Agency Review',
    CLIENT_REVIEW: 'Needs Your Review',
    SHOOTING: 'Shooting',
    RAW_FOOTAGE: 'In Post-Production',
    EDITING: 'Editing',
    SMM_REVIEW: 'Agency Quality Check',
    FINAL_REVIEW: 'Agency Quality Check',
    CLIENT_FINAL_APPROVAL: 'Needs Final Approval',
    SCHEDULE: 'Ready to Publish',
    PUBLISHED: 'Published',
  };

  res.json(items.map((i: any) => ({
    _id: String(i._id),
    contentId: i.contentId,
    title: i.title,
    type: i.type,
    platform: i.platform,
    stage: i.stage,
    clientStatus: stageMap[i.stage] || 'In Progress',
    progress: i.progress,
    scheduledAt: i.scheduledAt,
    publishedAt: i.publishedAt,
    caption: i.caption,
    hashtags: i.hashtags,
  })));
}));

/** Content Calendar */
r.get('/calendar', ah(async (req, res) => {
  const clientId = req.portalUser!.clientId;
  const items = await Content.find({
    clientId,
    $or: [
      { scheduledAt: { $exists: true, $ne: null } },
      { publishedAt: { $exists: true, $ne: null } },
      { deadline: { $exists: true, $ne: null } },
    ],
  })
    .select('contentId title type platform stage scheduledAt publishedAt deadline')
    .lean();

  res.json(items.map((c: any) => ({
    id: String(c._id),
    title: c.title,
    contentId: c.contentId,
    type: c.type,
    platform: c.platform,
    stage: c.stage,
    date: c.publishedAt || c.scheduledAt || c.deadline,
    isPublished: c.stage === 'PUBLISHED',
    isScheduled: c.stage === 'SCHEDULE',
  })));
}));

/** Client Brand Assets & Completed Masters */
r.get('/assets', ah(async (req, res) => {
  const clientId = req.portalUser!.clientId;
  const client = await Client.findById(clientId).select('brandColors fonts logoMediaId website instagram').lean();
  
  // Completed masters
  const masters = await Media.find({
    clientId,
    status: 'APPROVED',
    category: { $in: ['FINAL_VIDEO', 'EXPORT', 'THUMBNAIL', 'GRAPHIC'] },
  })
    .sort({ createdAt: -1 })
    .select('fileName mimeType size category createdAt')
    .lean();

  res.json({
    brand: {
      colors: client?.brandColors || [],
      fonts: client?.fonts || [],
      website: client?.website,
      instagram: client?.instagram,
    },
    masters: masters.map((m: any) => ({
      _id: String(m._id),
      fileName: m.fileName,
      mimeType: m.mimeType,
      size: m.size,
      category: m.category,
      createdAt: m.createdAt,
    })),
  });
}));

/** Client Briefs / Requests */
r.get('/briefs', ah(async (req, res) => {
  const clientId = req.portalUser!.clientId;
  const briefs = await ClientBrief.find({ clientId })
    .sort({ createdAt: -1 })
    .populate('submittedBy', 'name email')
    .populate('contentId', 'contentId stage status progress title currentVideoVersion currentScriptVersion scheduledAt publishedAt')
    .lean();

  res.json(briefs);
}));

r.post('/briefs', ah(async (req, res) => {
  const clientId = req.portalUser!.clientId;
  const b = z.object({
    title: z.string().min(2).max(120),
    objective: z.string().max(1000).optional(),
    contentType: z.enum(['REEL', 'POST', 'CAROUSEL', 'STORY', 'VIDEO', 'SHORT', 'AD']).default('REEL'),
    targetPlatform: z.enum(['INSTAGRAM', 'FACEBOOK', 'YOUTUBE', 'LINKEDIN', 'X', 'MULTI']).default('INSTAGRAM'),
    notes: z.string().max(2000).optional(),
    referenceUrls: z.array(z.string().url()).optional(),
  }).parse(req.body);

  const client = await Client.findById(clientId);
  if (!client) throw notFound('Client');

  const dt = (client.defaultTeam || {}) as any;
  const code = await nextContentCode(b.contentType);

  // Compile formatted description with client inputs
  const descParts = [
    `Client Creative Request: ${b.title}`,
    b.objective ? `🎯 Objective / Goal:\n${b.objective}` : '',
    b.notes ? `📝 Client Notes & Directions:\n${b.notes}` : '',
    b.referenceUrls?.length ? `🔗 Reference URLs:\n${b.referenceUrls.join('\n')}` : '',
    `👤 Requested by: ${req.portalUser!.name} (${req.portalUser!.email})`,
  ].filter(Boolean);

  // Create tracked Content item in production workflow (Stage: IDEA)
  const content = new Content({
    contentId: code,
    title: b.title,
    clientId,
    type: b.contentType,
    platform: b.targetPlatform,
    stage: 'IDEA',
    status: 'ACTIVE',
    progress: 8,
    priority: 'HIGH',
    description: descParts.join('\n\n'),
    assignedWriter: dt.writer || null,
    assignedShooter: dt.shooter || null,
    assignedEditor: dt.editor || null,
    assignedSMM: dt.smm || null,
    assignedReviewer: dt.reviewer || null,
    currentOwner: dt.writer || dt.smm || null,
    nextOwner: dt.reviewer || null,
    nextAction: 'Review client brief and draft script outline',
    stageHistory: [{ stage: 'IDEA', enteredAt: new Date() }],
    createdBy: dt.smm || dt.writer || null,
  });

  applyStage(content, 'IDEA');
  await setLastAction(content, `Client requested creative brief: "${b.title}"`);
  await content.save();

  // Create initial Script document for writer
  const script = await Script.create({
    contentId: content._id,
    clientId: content.clientId,
    writerId: content.assignedWriter,
    status: 'DRAFT',
  });
  content.scriptId = script._id;
  await content.save();

  // Ensure content communication channels & storage
  await ensureContentRoom(content);
  ensureContentFolders(content).catch((e: any) => logger.warn('[drive] content folders', e?.message));

  // Create the ClientBrief linked directly to the newly spawned Content item
  const brief = await ClientBrief.create({
    clientId,
    submittedBy: req.portalUser!._id,
    contentId: content._id,
    status: 'IN_REVIEW',
    ...b,
  });

  // Post announcement to the client's shared workspace chat room
  try {
    const clientRoom = await ensureClientRoom(client);
    const announceMsg = await Message.create({
      roomId: clientRoom._id,
      senderClientUserId: req.portalUser!._id,
      kind: 'TEXT',
      message: `✨ New Content Request: "${b.title}" (${b.contentType} · ${b.targetPlatform})\n\nTracking Code: ${content.contentId}\nObjective: ${b.objective || 'Not specified'}`,
    });
    clientRoom.lastMessageAt = new Date();
    clientRoom.lastMessagePreview = `New Request: ${b.title}`;
    await clientRoom.save();
    await broadcastMessage(clientRoom, announceMsg);
  } catch (err: any) {
    logger.warn('[portal brief client chat announcement]', err?.message);
  }

  // Post system event in the content chat room
  try {
    await postSystemEvent(
      content._id,
      'CLIENT_BRIEF_SUBMITTED',
      `Client Creative Request: ${content.contentId}`,
      [
        `Title: ${b.title}`,
        `Requested by: ${req.portalUser!.name}`,
        b.objective ? `Objective: ${b.objective}` : '',
      ].filter(Boolean),
      { link: `/content/${content._id}` }
    );
  } catch (err: any) {
    logger.warn('[portal brief postSystemEvent]', err?.message);
  }

  // Log activity
  try {
    await logActivity({
      actorType: 'CLIENT',
      actorName: req.portalUser!.name,
      action: 'brief.created',
      message: `Client requested ${content.contentId} · "${b.title}"`,
      entityType: 'content',
      entityId: content._id,
      contentId: content._id,
      clientId,
    });
  } catch (err: any) {
    logger.warn('[portal brief logActivity]', err?.message);
  }

  // Emit domain events & realtime updates across agency and client portal
  try {
    emitDomain('content.created', { contentId: String(content._id) });
    await broadcastContent(content);
    emitOrg('brief:new', { brief, content });
    emitToRoom(`client:${clientId}`, 'brief:new', { brief, content });
  } catch (err: any) {
    logger.warn('[portal brief emit]', err?.message);
  }

  // Dispatch notifications to the client's assigned team & managers
  try {
    const teamTargets = [
      content.assignedWriter,
      content.assignedSMM,
      ...(client.assignedTeam || []),
      ...(await managerIds()),
    ].filter(Boolean);
    const uniqueTargets = [...new Set(teamTargets.map(String))];
    await notify(uniqueTargets, {
      type: 'client.brief',
      category: 'WORKFLOW',
      title: `New Content Request: ${client.businessName || client.name || 'Client'}`,
      message: `"${b.title}" (${content.contentId}) is in Idea stage and ready for script drafting.`,
      link: `/content/${content._id}`,
      entityType: 'content',
      entityId: String(content._id),
    });
  } catch (err: any) {
    logger.warn('[portal brief notification]', err?.message);
  }

  res.status(201).json({
    ...brief.toObject(),
    contentId: {
      _id: content._id,
      contentId: content.contentId,
      stage: content.stage,
      progress: content.progress,
      title: content.title,
    },
  });
}));

/** Client Portal Chat: Get or Ensure Room & Team Info */
r.get('/chat', ah(async (req, res) => {
  const clientId = req.portalUser!.clientId;
  const client = await Client.findById(clientId)
    .populate('defaultTeam.smm defaultTeam.writer defaultTeam.shooter defaultTeam.editor defaultTeam.reviewer', 'name email role')
    .lean();
  if (!client) throw notFound('Client');

  let room = await ChatRoom.findOne({ type: 'CLIENT', clientId });
  if (!room) {
    room = await ensureClientRoom(client);
  }

  // Get assigned team details
  const team: Array<{ name: string; role: string; email?: string }> = [];
  if (client.defaultTeam) {
    const roles: Array<keyof typeof client.defaultTeam> = ['smm', 'writer', 'editor', 'shooter', 'reviewer'];
    for (const rKey of roles) {
      const member = (client.defaultTeam as any)[rKey];
      if (member && member.name) {
        team.push({ name: member.name, role: member.role || rKey.toUpperCase(), email: member.email });
      }
    }
  }

  res.json({
    roomId: String(room._id),
    roomName: room.name || `${client.businessName || client.name} Workspace`,
    lastMessageAt: room.lastMessageAt,
    lastMessagePreview: room.lastMessagePreview,
    team,
  });
}));

/** Client Portal Chat: Get Messages & Auto-mark Seen by Client */
r.get('/chat/messages', ah(async (req, res) => {
  const clientId = req.portalUser!.clientId;
  const room = await ChatRoom.findOne({ type: 'CLIENT', clientId });
  if (!room) return res.json([]);

  const now = new Date();
  // Mark all unread agency messages in this room as seen by client
  const unreadUpdated = await Message.updateMany(
    { roomId: room._id, senderType: { $ne: 'CLIENT' }, clientReadAt: null },
    { $set: { clientReadAt: now, clientDeliveredAt: now, clientReadBy: req.portalUser!._id } }
  );

  if (unreadUpdated.modifiedCount > 0) {
    const payload = {
      roomId: String(room._id),
      clientId: String(clientId),
      clientName: req.portalUser!.name,
      readAt: now,
    };
    emitToRoom(`chat:${room._id}`, 'message:client_read', payload);
    for (const p of room.participants || []) {
      emitToUser(p, 'message:client_read', payload);
    }
  }

  const messages = await Message.find({ roomId: room._id, deletedAt: null })
    .sort({ createdAt: 1 })
    .limit(100)
    .populate('senderId', 'name role')
    .populate('senderClientUserId', 'name email')
    .populate('attachments', 'fileName originalName mimeType size category')
    .lean();

  const currentUserId = String(req.portalUser!._id);

  const formatted = messages.map((m: any) => {
    const isClient = m.senderType === 'CLIENT' || !!m.senderClientUserId;
    const isMe = isClient && String(m.senderClientUserId?._id || m.senderClientUserId) === currentUserId;

    return {
      _id: String(m._id),
      message: m.message,
      kind: m.kind,
      senderType: m.senderType || (isClient ? 'CLIENT' : 'AGENCY'),
      senderName: isClient ? (m.senderName || m.senderClientUserId?.name || 'Client') : (m.senderId?.name || m.senderName || 'Agency Team'),
      senderRole: isClient ? 'Client' : (m.senderId?.role || 'Agency Lead'),
      isMe,
      isClient,
      createdAt: m.createdAt,
      clientReadAt: m.clientReadAt || null,
      clientDeliveredAt: m.clientDeliveredAt || null,
      agencyRead: (m.readBy || []).length > 0,
      attachments: (m.attachments || []).map((att: any) => ({
        _id: String(att._id),
        fileName: att.fileName,
        originalName: att.originalName || att.fileName,
        mimeType: att.mimeType,
        size: att.size,
        category: att.category,
        url: `/api/portal/media/${att._id}/stream`,
        downloadUrl: `/api/portal/media/${att._id}/download`,
      })),
    };
  });

  res.json(formatted);
}));

/** Client Portal Chat: Explicitly mark messages as Read/Seen */
r.post('/chat/read', ah(async (req, res) => {
  const clientId = req.portalUser!.clientId;
  const room = await ChatRoom.findOne({ type: 'CLIENT', clientId });
  if (!room) return res.json({ ok: true });

  const now = new Date();
  const unreadUpdated = await Message.updateMany(
    { roomId: room._id, senderType: { $ne: 'CLIENT' }, clientReadAt: null },
    { $set: { clientReadAt: now, clientDeliveredAt: now, clientReadBy: req.portalUser!._id } }
  );

  if (unreadUpdated.modifiedCount > 0) {
    const payload = {
      roomId: String(room._id),
      clientId: String(clientId),
      clientName: req.portalUser!.name,
      readAt: now,
    };
    emitToRoom(`chat:${room._id}`, 'message:client_read', payload);
    for (const p of room.participants || []) {
      emitToUser(p, 'message:client_read', payload);
    }
  }

  res.json({ ok: true, marked: unreadUpdated.modifiedCount });
}));

/** Client Portal Chat: Upload Attachment (Photo, Video, Audio, Document) */
r.post('/chat/upload', portalUpload.single('file'), ah(async (req, res) => {
  if (!req.file) throw badRequest('No file provided');
  const clientId = req.portalUser!.clientId;
  const originalName = req.file.originalname || 'attachment';
  const mimeType = inferMimeType(originalName, req.file.mimetype || 'application/octet-stream');
  const dest = localPathFor(originalName);
  safeMoveFile(req.file.path, dest);

  let category: any = 'CHAT';
  if (mimeType.startsWith('image/')) category = 'IMAGE';
  else if (mimeType.startsWith('video/')) category = 'RAW';
  else if (mimeType.startsWith('audio/')) category = 'AUDIO';
  else category = 'DOCUMENT';

  let gridFsId: any = undefined;
  try {
    gridFsId = await saveFileToGridFS(dest, originalName, {
      contentType: mimeType,
      metadata: { clientId, category, source: 'PORTAL_CHAT' },
    });
  } catch (gridErr: any) {
    console.warn('[portal chat upload] GridFS save error:', gridErr?.message || gridErr);
  }

  const media = await Media.create({
    clientId,
    storage: 'LOCAL',
    localPath: dest,
    gridFsId,
    fileName: originalName,
    originalName,
    mimeType,
    size: req.file.size,
    category,
    status: 'READY',
    uploadedAt: new Date(),
  });

  res.status(201).json({
    _id: String(media._id),
    fileName: media.fileName,
    originalName: media.originalName,
    mimeType: media.mimeType,
    size: media.size,
    category: media.category,
    url: `/api/portal/media/${media._id}/stream`,
    downloadUrl: `/api/portal/media/${media._id}/download`,
  });
}));

/** Client Portal Chat: Send Message (With text and/or attachments) */
r.post('/chat/messages', ah(async (req, res) => {
  const clientId = req.portalUser!.clientId;
  const client = await Client.findById(clientId);
  if (!client) throw notFound('Client');

  let room = await ChatRoom.findOne({ type: 'CLIENT', clientId });
  if (!room) room = await ensureClientRoom(client);

  const b = z.object({
    message: z.string().max(4000).optional().default(''),
    attachments: z.array(z.string()).optional().default([]),
  }).parse(req.body);

  if (!b.message?.trim() && !b.attachments?.length) {
    throw badRequest('Please provide a message or attachment');
  }

  const senderName = req.portalUser!.name || client.contactPerson || client.name;
  const text = b.message?.trim() || '';

  const msg = await Message.create({
    roomId: room._id,
    senderType: 'CLIENT',
    senderClientUserId: req.portalUser!._id,
    senderName,
    kind: 'USER',
    message: text,
    attachments: b.attachments,
  });

  room.lastMessageAt = new Date();
  room.lastMessagePreview = `${senderName}: ${text || (b.attachments.length ? 'Sent an attachment' : '')}`.slice(0, 100);
  await room.save();

  // Broadcast to agency socket room & participants
  await broadcastMessage(room, msg);

  // Create notifications and emit live socket alerts for assigned agency members
  try {
    const notifTargets = room.participants || [];
    await notify(notifTargets, {
      type: 'client.message',
      category: 'CHAT',
      title: `Message from ${senderName} (${client.name})`,
      message: (text || 'Sent an attachment').slice(0, 100),
      link: `/clients/${client._id}?tab=chat`,
      entityType: 'client',
      entityId: String(client._id),
    });
  } catch (err: any) {
    logger.warn('[portal chat notification]', err?.message);
  }

  const populated = await Message.findById(msg._id).populate('attachments', 'fileName originalName mimeType size category').lean();

  res.status(201).json({
    _id: String(msg._id),
    message: msg.message,
    senderType: 'CLIENT',
    senderName,
    isMe: true,
    isClient: true,
    createdAt: msg.createdAt,
    attachments: ((populated as any)?.attachments || []).map((att: any) => ({
      _id: String(att._id),
      fileName: att.fileName,
      originalName: att.originalName || att.fileName,
      mimeType: att.mimeType,
      size: att.size,
      category: att.category,
      url: `/api/portal/media/${att._id}/stream`,
      downloadUrl: `/api/portal/media/${att._id}/download`,
    })),
  });
}));

/** Stream Media for Client Portal (Photos, Videos, Audio, Documents) */
r.get('/media/:id/stream', ah(async (req, res) => {
  let clientId = req.portalUser?.clientId;
  if (!clientId && req.query.token) {
    try {
      const user = await userFromPortalToken(String(req.query.token));
      clientId = user.clientId;
    } catch {}
  }
  if (!clientId) throw forbidden('Authentication required');

  const media = await Media.findById(req.params.id).select('+localPath +gridFsId');
  if (!media) throw notFound('Media file');

  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  try {
    await pipeMedia(media, res, req.headers.range);
  } catch (err: any) {
    if (media.webViewLink) return res.redirect(media.webViewLink);
    throw err;
  }
}));

/** Download Media File for Client Portal (Documents, ZIP, etc.) */
r.get('/media/:id/download', ah(async (req, res) => {
  let clientId = req.portalUser?.clientId;
  if (!clientId && req.query.token) {
    try {
      const user = await userFromPortalToken(String(req.query.token));
      clientId = user.clientId;
    } catch {}
  }
  if (!clientId) throw forbidden('Authentication required');

  const media = await Media.findById(req.params.id).select('+localPath +gridFsId');
  if (!media) throw notFound('Media file');

  const safeFileName = encodeURIComponent(media.fileName || 'download');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"; filename*=UTF-8''${safeFileName}`);
  try {
    await pipeMedia(media, res, req.headers.range);
  } catch (err: any) {
    if (media.webViewLink) return res.redirect(media.webViewLink);
    throw err;
  }
}));

/** Client Portal Notifications Feed */
r.get('/notifications', ah(async (req, res) => {
  const clientId = req.portalUser!.clientId;
  const notifications = await Notification.find({ clientId })
    .sort({ createdAt: -1 })
    .limit(40)
    .lean();

  const unreadCount = await Notification.countDocuments({ clientId, read: false });

  res.json({
    notifications: notifications.map((n) => ({
      _id: String(n._id),
      type: n.type,
      category: n.category,
      title: n.title,
      message: n.message,
      link: n.link,
      read: n.read,
      createdAt: n.createdAt,
    })),
    unreadCount,
  });
}));

/** Mark Single Client Notification as Read */
r.patch('/notifications/:id/read', ah(async (req, res) => {
  const clientId = req.portalUser!.clientId;
  await Notification.updateOne(
    { _id: req.params.id, clientId },
    { $set: { read: true, readAt: new Date() } }
  );
  res.json({ ok: true });
}));

/** Mark All Client Notifications as Read */
r.post('/notifications/mark-all-read', ah(async (req, res) => {
  const clientId = req.portalUser!.clientId;
  await Notification.updateMany(
    { clientId, read: false },
    { $set: { read: true, readAt: new Date() } }
  );
  res.json({ ok: true });
}));

// ----------------------------------------------------
// Client Portal Web Push Notifications
// ----------------------------------------------------

/** Get Web Push VAPID configuration for client devices */
r.get('/push/config', (_req, res) => {
  res.json({ enabled: pushConfigured(), publicKey: getVapidPublicKey() });
});

/** Subscribe client browser/device to Web Push notifications */
r.post('/push/subscribe', ah(async (req, res) => {
  const b = z.object({
    endpoint: z.string().url().max(1000),
    keys: z.object({ p256dh: z.string().max(300), auth: z.string().max(300) }),
    deviceType: z.string().max(30).optional(),
    platform: z.string().max(40).optional(),
    browser: z.string().max(40).optional(),
  }).parse(req.body);

  await PushSubscription.findOneAndUpdate(
    { endpoint: b.endpoint },
    {
      ...b,
      clientUserId: req.portalUser!._id,
      clientId: req.portalUser!.clientId,
      lastUsedAt: new Date(),
      failures: 0,
    },
    { upsert: true }
  );

  res.status(201).json({ ok: true });
}));

/** Unsubscribe client device */
r.post('/push/unsubscribe', ah(async (req, res) => {
  const { endpoint } = z.object({ endpoint: z.string() }).parse(req.body);
  await PushSubscription.deleteOne({ endpoint, clientId: req.portalUser!.clientId });
  res.json({ ok: true });
}));

/** Test Push Notification directly to verify it works in background/when closed */
r.post('/push/test', ah(async (req, res) => {
  const configured = pushConfigured();
  if (!configured) {
    return res.status(400).json({
      ok: false,
      configured: false,
      message: 'Push notifications are not configured on the server (missing VAPID keys).',
    });
  }

  const subs = await PushSubscription.find({
    $or: [
      { clientUserId: req.portalUser!._id },
      { clientId: req.portalUser!.clientId },
    ],
  });

  if (!subs.length) {
    return res.json({
      ok: false,
      message: 'No push subscription found for this browser. Please enable notifications first.',
      sentCount: 0,
    });
  }

  let sent = 0;
  for (const s of subs) {
    const status = await sendPush(s, {
      title: '⚡ Bulletproof Portal Alert',
      body: 'Real-time background notifications are active! You will receive alerts even when the tab is closed.',
      url: '/approvals',
      tag: 'test-' + Date.now(),
    });
    if (status === 'SENT') sent++;
  }

  res.json({
    ok: true,
    sentCount: sent,
    totalSubs: subs.length,
    message: sent > 0 ? 'Test notification sent successfully!' : 'Delivery attempted, check device permissions.',
  });
}));

export default r;

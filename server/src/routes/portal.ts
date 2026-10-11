import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { ah } from '../utils/async';
import { AppError, badRequest, notFound, forbidden } from '../utils/errors';
import { randomToken, sha256 } from '../utils/crypto';
import { ClientUser, Client, Content, Approval, ScriptVersion, Media, ClientBrief, Feedback, PortalConfig, ChatRoom, Message, Notification } from '../models';
import { requirePortalAuth, signPortalAccess } from '../middleware/clientAuth';
import { requireAuth } from '../middleware/auth';
import { clientDecision } from '../services/approvals';
import { pipeMedia } from '../services/media';
import { ensureClientRoom, broadcastMessage } from '../services/chat';
import { aisensyConfigured, sendTemplate } from '../integrations/aisensy';
import { sendEmail } from '../integrations/email';
import { logger } from '../utils/logger';

const r = Router();

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

/** Email & Password Login */
r.post('/auth/login', authLimiter, ah(async (req, res) => {
  const cfg = await PortalConfig.findOne({ key: 'global' });
  if (cfg && cfg.authMethod === 'OTP_ONLY') {
    throw new AppError(400, 'Password login is disabled by agency administrator. Please use WhatsApp OTP to log in.', 'AUTH_METHOD_DISABLED');
  }

  const { email, password } = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }).parse(req.body);

  const user = await ClientUser.findOne({ email: email.toLowerCase() }).select('+passwordHash');
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

  user.lastLoginAt = new Date();
  await user.save();

  const token = signPortalAccess({ _id: user._id, clientId: user.clientId, role: user.role });
  res.json({
    token,
    user: {
      _id: String(user._id),
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      client: {
        _id: String(client._id),
        name: client.businessName || client.name,
      },
    },
  });
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
  const { phone, code } = z.object({
    phone: z.string().min(8),
    code: z.string().length(6),
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
  await user.save();

  const client = await Client.findById(user.clientId).select('name businessName status');
  const token = signPortalAccess({ _id: user._id, clientId: user.clientId, role: user.role });

  res.json({
    token,
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

  // 4. Client's Brand info
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
    },
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

  const media = a.mediaId ? await Media.findById(a.mediaId).select('mimeType fileName size').lean() : null;
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

  const media = await Media.findById(a.mediaId).select('+localPath');
  if (!media) throw notFound('Media file');

  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  await pipeMedia(media, res, req.headers.range);
}));

/** Stream Approval Thumbnail */
r.get('/approvals/:id/thumbnail', ah(async (req, res) => {
  const clientId = req.portalUser!.clientId;
  const a = await Approval.findOne({ _id: req.params.id, clientId });
  if (!a) throw notFound('Approval');

  const thumb = await Media.findOne({ contentId: a.contentId, category: 'THUMBNAIL' }).select('+localPath');
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

  const brief = await ClientBrief.create({
    clientId,
    submittedBy: req.portalUser!._id,
    ...b,
  });

  res.status(201).json(brief);
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

/** Client Portal Chat: Get Messages */
r.get('/chat/messages', ah(async (req, res) => {
  const clientId = req.portalUser!.clientId;
  const room = await ChatRoom.findOne({ type: 'CLIENT', clientId });
  if (!room) return res.json([]);

  const messages = await Message.find({ roomId: room._id, deletedAt: null })
    .sort({ createdAt: 1 })
    .limit(100)
    .populate('senderId', 'name role')
    .populate('senderClientUserId', 'name email')
    .populate('attachments', 'fileName url mimeType size')
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
      attachments: m.attachments,
    };
  });

  res.json(formatted);
}));

/** Client Portal Chat: Send Message */
r.post('/chat/messages', ah(async (req, res) => {
  const clientId = req.portalUser!.clientId;
  const client = await Client.findById(clientId);
  if (!client) throw notFound('Client');

  let room = await ChatRoom.findOne({ type: 'CLIENT', clientId });
  if (!room) room = await ensureClientRoom(client);

  const { message } = z.object({
    message: z.string().min(1).max(3000),
  }).parse(req.body);

  const senderName = req.portalUser!.name || client.contactPerson || client.name;

  const msg = await Message.create({
    roomId: room._id,
    senderType: 'CLIENT',
    senderClientUserId: req.portalUser!._id,
    senderName,
    kind: 'USER',
    message: message.trim(),
  });

  room.lastMessageAt = new Date();
  room.lastMessagePreview = `${senderName}: ${message.trim().slice(0, 60)}`;
  await room.save();

  // Broadcast to agency socket room & participants
  await broadcastMessage(room, msg);

  // Create notifications for assigned agency members
  try {
    const notifTargets = room.participants || [];
    for (const uid of notifTargets) {
      await Notification.create({
        userId: uid,
        type: 'CLIENT_MESSAGE',
        category: 'CHAT',
        title: `Message from ${senderName} (${client.name})`,
        message: message.trim().slice(0, 100),
        link: `/clients/${client._id}?tab=chat`,
        entityType: 'client',
        entityId: String(client._id),
      });
    }
  } catch (err: any) {
    logger.warn('[portal chat notification]', err?.message);
  }

  res.status(201).json({
    _id: String(msg._id),
    message: msg.message,
    senderType: 'CLIENT',
    senderName,
    isMe: true,
    isClient: true,
    createdAt: msg.createdAt,
  });
}));

export default r;

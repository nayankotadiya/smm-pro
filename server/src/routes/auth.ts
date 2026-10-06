import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env';
import { User, RefreshToken } from '../models';
import { ah } from '../utils/async';
import { AppError } from '../utils/errors';
import { randomToken, sha256 } from '../utils/crypto';
import { requireAuth, signAccess, permissionsFor } from '../middleware/auth';
import { logActivity } from '../services/activity';
import { sendEmail } from '../integrations/email';
import { logger } from '../utils/logger';
import { generateTotpSecret, generateOtpAuthUri, verifyTotpCode, generateBackupCodes } from '../utils/totp';

const r = Router();
const COOKIE = 'smm_rt';
const cookieOpts = () => ({ httpOnly: true, secure: env.isProd || env.cookieSameSite === 'none', sameSite: env.cookieSameSite, domain: env.cookieDomain, path: '/api/auth', maxAge: 30 * 864e5 });
const clearOpts = () => { const { maxAge, ...rest } = cookieOpts(); return rest; };
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, max: process.env.NODE_ENV === 'test' ? 1000 : 20, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMIT', message: 'Too many attempts. Try again in a few minutes.' } } });
/** CSRF guard for cookie-authenticated endpoints: custom header cannot be set cross-site without CORS approval */
const csrf = (req: any, _res: any, next: any) => (req.get('X-Requested-With') === 'smm-pro' ? next() : next(new AppError(403, 'Invalid request', 'CSRF')));

async function issueRefresh(userId: any, family: string, req: any) {
  const token = randomToken(48);
  await RefreshToken.create({ userId, tokenHash: sha256(token), family, expiresAt: new Date(Date.now() + 30 * 864e5), userAgent: String(req.get('user-agent') || '').slice(0, 200), ip: req.ip });
  return token;
}
async function me(u: any) {
  return { _id: String(u._id), name: u.name, email: u.email, role: u.role, title: u.title, phone: u.phone, mfaEnabled: !!u.mfaEnabled, notificationPrefs: u.notificationPrefs, permissions: await permissionsFor(u.role) };
}

r.post('/login', loginLimiter, ah(async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const u = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash +mfaSecret +mfaBackupCodes');
  if (!u || !u.active) throw new AppError(401, 'Incorrect email or password', 'INVALID_CREDENTIALS');

  if (u.lockUntil && u.lockUntil > new Date()) {
    const minLeft = Math.max(1, Math.ceil((u.lockUntil.getTime() - Date.now()) / 60000));
    throw new AppError(429, `Account temporarily locked due to repeated failed logins. Please try again in ${minLeft} minute(s).`, 'ACCOUNT_LOCKED');
  }

  const match = await bcrypt.compare(password, u.passwordHash);
  if (!match) {
    u.failedLoginAttempts = (u.failedLoginAttempts || 0) + 1;
    if (u.failedLoginAttempts >= 5) {
      u.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
      logger.warn('Account temporarily locked after 5 failed login attempts', { email: u.email, ip: req.ip });
    }
    await u.save();
    throw new AppError(401, 'Incorrect email or password', 'INVALID_CREDENTIALS');
  }

  // Password matched -> reset failed attempts and lockout
  u.failedLoginAttempts = 0;
  u.lockUntil = undefined;

  // Check if 2FA is enabled
  if (u.mfaEnabled) {
    await u.save();
    const mfaToken = jwt.sign({ sub: String(u._id), typ: 'mfa_challenge' }, env.jwtSecret, { expiresIn: '5m' });
    return res.json({ mfaRequired: true, mfaToken });
  }

  u.lastLoginAt = new Date();
  await u.save();
  const rt = await issueRefresh(u._id, randomToken(12), req);
  res.cookie(COOKIE, rt, cookieOpts());
  await logActivity({ actorId: u._id, action: 'auth.login', message: `${u.name} signed in`, ip: req.ip });
  res.json({ accessToken: signAccess(u), refreshToken: rt, user: await me(u) });
}));

r.post('/mfa/verify-login', loginLimiter, ah(async (req, res) => {
  const { mfaToken, code } = z.object({ mfaToken: z.string().min(10), code: z.string().min(6).max(20) }).parse(req.body);
  let payload: any;
  try {
    payload = jwt.verify(mfaToken, env.jwtSecret);
    if (payload.typ !== 'mfa_challenge') throw new Error();
  } catch {
    throw new AppError(401, 'Authentication challenge expired. Please log in again.', 'MFA_EXPIRED');
  }

  const u = await User.findById(payload.sub).select('+mfaSecret +mfaBackupCodes');
  if (!u || !u.active || !u.mfaEnabled) throw new AppError(401, 'Account unavailable', 'UNAUTHORIZED');

  const cleanCode = code.trim().replace(/\s+/g, '');
  const isValidTotp = verifyTotpCode(u.mfaSecret || '', cleanCode);
  let isBackupCode = false;

  if (!isValidTotp && u.mfaBackupCodes && u.mfaBackupCodes.length > 0) {
    const hashed = sha256(cleanCode);
    const codeIdx = u.mfaBackupCodes.indexOf(hashed);
    if (codeIdx !== -1) {
      isBackupCode = true;
      u.mfaBackupCodes.splice(codeIdx, 1);
    }
  }

  if (!isValidTotp && !isBackupCode) {
    throw new AppError(401, 'Invalid verification code', 'INVALID_MFA_CODE');
  }

  u.lastLoginAt = new Date();
  await u.save();
  const rt = await issueRefresh(u._id, randomToken(12), req);
  res.cookie(COOKIE, rt, cookieOpts());
  await logActivity({
    actorId: u._id,
    action: isBackupCode ? 'auth.mfa_backup_login' : 'auth.login',
    message: `${u.name} signed in with ${isBackupCode ? 'MFA backup code' : '2FA'}`,
    ip: req.ip,
  });
  res.json({ accessToken: signAccess(u), refreshToken: rt, user: await me(u) });
}));

/** Refresh token rotation with reuse detection: a reused token revokes the whole family. */
r.post('/refresh', csrf, ah(async (req, res) => {
  const token = req.cookies?.[COOKIE] || req.body?.refreshToken;
  if (!token) throw new AppError(401, 'Not signed in', 'UNAUTHORIZED');
  const rec = await RefreshToken.findOne({ tokenHash: sha256(token) });
  if (!rec) { res.clearCookie(COOKIE, clearOpts()); throw new AppError(401, 'Session expired', 'UNAUTHORIZED'); }
  if (rec.revokedAt) {
    // 10s grace for concurrent tabs refreshing at once; otherwise treat as theft
    if (Date.now() - rec.revokedAt.getTime() > 10_000) await RefreshToken.updateMany({ family: rec.family, revokedAt: null }, { revokedAt: new Date() });
    res.clearCookie(COOKIE, clearOpts());
    throw new AppError(401, 'Session expired', 'UNAUTHORIZED');
  }
  if (rec.expiresAt! < new Date()) throw new AppError(401, 'Session expired', 'UNAUTHORIZED');
  const u = await User.findById(rec.userId);
  if (!u || !u.active) throw new AppError(401, 'Account unavailable', 'UNAUTHORIZED');
  const next = await issueRefresh(u._id, rec.family!, req);
  rec.revokedAt = new Date(); rec.replacedBy = sha256(next); await rec.save();
  res.cookie(COOKIE, next, cookieOpts());
  res.json({ accessToken: signAccess(u), refreshToken: next, user: await me(u) });
}));

r.post('/logout', csrf, ah(async (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (token) { const rec = await RefreshToken.findOne({ tokenHash: sha256(token) }); if (rec) await RefreshToken.updateMany({ family: rec.family, revokedAt: null }, { revokedAt: new Date() }); }
  res.clearCookie(COOKIE, clearOpts());
  res.json({ ok: true });
}));

r.post('/forgot-password', loginLimiter, ah(async (req, res) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  const u = await User.findOne({ email: email.toLowerCase() });
  if (u && u.active) {
    const token = randomToken(32);
    await User.updateOne({ _id: u._id }, { resetTokenHash: sha256(token), resetTokenExpires: new Date(Date.now() + 3600e3) });
    await sendEmail(u.email, 'Reset your SMM PRO password', `Use this link within 1 hour to set a new password:\n\n${env.appUrl}/reset-password?token=${token}\n\nIf you did not request this, ignore this email.`);
  }
  res.json({ ok: true }); // never reveal whether the account exists
}));

r.post('/reset-password', loginLimiter, ah(async (req, res) => {
  const { token, password } = z.object({ token: z.string().min(20), password: z.string().min(8).max(100) }).parse(req.body);
  const u = await User.findOne({ resetTokenHash: sha256(token), resetTokenExpires: { $gt: new Date() } }).select('+resetTokenHash +resetTokenExpires');
  if (!u) throw new AppError(400, 'This reset link is invalid or has expired', 'INVALID_TOKEN');
  await User.updateOne({ _id: u._id }, { passwordHash: await bcrypt.hash(password, 12), $unset: { resetTokenHash: 1, resetTokenExpires: 1 } });
  await RefreshToken.updateMany({ userId: u._id, revokedAt: null }, { revokedAt: new Date() });
  await logActivity({ actorId: u._id, action: 'auth.password_reset', message: `${u.name} reset their password`, ip: req.ip });
  res.json({ ok: true });
}));

r.get('/me', requireAuth, ah(async (req, res) => { res.json({ user: await me(await User.findById(req.user!._id)) }); }));

r.patch('/me', requireAuth, ah(async (req, res) => {
  const b = z.object({ name: z.string().min(1).max(80).optional(), email: z.string().email().optional(), phone: z.string().max(20).optional(), notificationPrefs: z.any().optional(), currentPassword: z.string().optional(), newPassword: z.string().min(8).max(100).optional() }).parse(req.body);
  const u = (await User.findById(req.user!._id).select('+passwordHash'))!;
  if (b.name) u.name = b.name;
  if (b.email && b.email.toLowerCase() !== u.email) {
    const exists = await User.findOne({ email: b.email.toLowerCase(), _id: { $ne: u._id } });
    if (exists) throw new AppError(400, 'Email is already in use by another user', 'EMAIL_IN_USE');
    u.email = b.email.toLowerCase();
  }
  if (b.phone !== undefined) u.phone = b.phone;
  if (b.notificationPrefs) u.set('notificationPrefs', { ...(u.toObject().notificationPrefs as any), ...b.notificationPrefs, categories: { ...((u.toObject().notificationPrefs as any)?.categories || {}), ...(b.notificationPrefs.categories || {}) } });
  if (b.newPassword) {
    if (!b.currentPassword || !(await bcrypt.compare(b.currentPassword, u.passwordHash))) throw new AppError(400, 'Current password is incorrect', 'BAD_PASSWORD');
    u.passwordHash = await bcrypt.hash(b.newPassword, 12);
  }
  await u.save();
  res.json({ user: await me(u) });
}));

// ----- 2FA / MFA Management -----
r.post('/mfa/setup', requireAuth, ah(async (req, res) => {
  const secret = generateTotpSecret();
  const otpAuthUri = generateOtpAuthUri('SMM PRO', req.user!.email, secret);
  res.json({ secret, otpAuthUri });
}));

r.post('/mfa/enable', requireAuth, ah(async (req, res) => {
  const { secret, code } = z.object({ secret: z.string().min(16), code: z.string().min(6).max(6) }).parse(req.body);
  if (!verifyTotpCode(secret, code)) {
    throw new AppError(400, 'Invalid verification code. Check the time on your device.', 'INVALID_TOTP');
  }
  const backup = generateBackupCodes(8);
  const u = (await User.findById(req.user!._id))!;
  u.mfaEnabled = true;
  u.set('mfaSecret', secret);
  u.set('mfaBackupCodes', backup.hashed);
  await u.save();
  await logActivity({ actorId: req.user!._id, action: 'auth.mfa_enabled', message: `${req.user!.name} enabled two-factor authentication`, ip: req.ip });
  res.json({ ok: true, backupCodes: backup.raw });
}));

r.post('/mfa/disable', requireAuth, ah(async (req, res) => {
  const { password } = z.object({ password: z.string().min(1) }).parse(req.body);
  const u = (await User.findById(req.user!._id).select('+passwordHash'))!;
  if (!(await bcrypt.compare(password, u.passwordHash))) {
    throw new AppError(400, 'Incorrect password', 'BAD_PASSWORD');
  }
  u.mfaEnabled = false;
  u.set('mfaSecret', undefined);
  u.set('mfaBackupCodes', []);
  await u.save();
  await logActivity({ actorId: req.user!._id, action: 'auth.mfa_disabled', message: `${req.user!.name} disabled two-factor authentication`, ip: req.ip });
  res.json({ ok: true });
}));

// ----- Active Sessions & Device Management -----
r.get('/sessions', requireAuth, ah(async (req, res) => {
  const currentToken = req.cookies?.[COOKIE];
  const currentHash = currentToken ? sha256(currentToken) : null;
  const sessions = await RefreshToken.find({
    userId: req.user!._id,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 }).lean();

  res.json(sessions.map((s) => ({
    _id: String(s._id),
    userAgent: s.userAgent || 'Unknown Device',
    ip: s.ip || 'Unknown IP',
    createdAt: (s as any).createdAt,
    expiresAt: s.expiresAt,
    current: currentHash ? s.tokenHash === currentHash : false,
  })));
}));

r.post('/sessions/:id/revoke', requireAuth, ah(async (req, res) => {
  const currentToken = req.cookies?.[COOKIE];
  const currentHash = currentToken ? sha256(currentToken) : null;
  const session = await RefreshToken.findOne({ _id: req.params.id, userId: req.user!._id });
  if (!session) throw new AppError(404, 'Session not found', 'NOT_FOUND');
  session.revokedAt = new Date();
  await session.save();
  if (currentHash && session.tokenHash === currentHash) {
    res.clearCookie(COOKIE, clearOpts());
  }
  res.json({ ok: true });
}));

r.post('/sessions/revoke-others', requireAuth, ah(async (req, res) => {
  const currentToken = req.cookies?.[COOKIE];
  const currentHash = currentToken ? sha256(currentToken) : null;
  const query: any = { userId: req.user!._id, revokedAt: null };
  if (currentHash) {
    query.tokenHash = { $ne: currentHash };
  }
  await RefreshToken.updateMany(query, { revokedAt: new Date() });
  res.json({ ok: true });
}));

r.post('/sessions/revoke-all', requireAuth, ah(async (req, res) => {
  await RefreshToken.updateMany({ userId: req.user!._id, revokedAt: null }, { revokedAt: new Date() });
  res.clearCookie(COOKIE, clearOpts());
  res.json({ ok: true });
}));

export default r;

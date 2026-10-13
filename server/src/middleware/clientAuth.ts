import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { ClientUser, Client } from '../models';
import { AppError } from '../utils/errors';

export interface PortalAuthUser {
  _id: string;
  clientId: string;
  clientName: string;
  name: string;
  email: string;
  phone?: string;
  role: 'CLIENT_ADMIN' | 'CLIENT_MEMBER';
  twoFactorEnabled?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      portalUser?: PortalAuthUser;
    }
  }
}

export function signPortalAccess(user: { _id: any; clientId: any; role: string }, remember = true) {
  return jwt.sign(
    {
      sub: String(user._id),
      cid: String(user.clientId),
      role: user.role,
      aud: 'smm-portal',
    },
    env.jwtSecret,
    { expiresIn: remember ? '90d' : '1d' } // 90 days for Keep Signed In, 1 day otherwise
  );
}

export function signPortal2FATemp(user: { _id: any; clientId: any; role: string }) {
  return jwt.sign(
    {
      sub: String(user._id),
      cid: String(user.clientId),
      role: user.role,
      stage: '2fa_pending',
      aud: 'smm-portal-2fa',
    },
    env.jwtSecret,
    { expiresIn: '10m' } // 10 minutes to verify 2FA
  );
}

export function verifyPortal2FATemp(token: string): { sub: string; cid: string; role: string } {
  try {
    return jwt.verify(token, env.jwtSecret, { audience: 'smm-portal-2fa' }) as any;
  } catch {
    throw new AppError(401, '2FA verification session has expired. Please sign in again.', '2FA_SESSION_EXPIRED');
  }
}

export async function userFromPortalToken(token: string): Promise<PortalAuthUser> {
  const p = jwt.verify(token, env.jwtSecret, { audience: 'smm-portal' }) as { sub: string; cid: string };
  const u = await ClientUser.findById(p.sub).lean();
  if (!u || !u.active) throw new AppError(401, 'Client account unavailable or inactive', 'UNAUTHORIZED');

  const c = await Client.findById(u.clientId).select('name businessName status').lean();
  if (!c || c.status === 'ARCHIVED') throw new AppError(403, 'Client account is archived or suspended', 'FORBIDDEN');

  return {
    _id: String(u._id),
    clientId: String(u.clientId),
    clientName: c.businessName || c.name,
    name: u.name,
    email: u.email,
    phone: u.phone || undefined,
    role: u.role as 'CLIENT_ADMIN' | 'CLIENT_MEMBER',
    twoFactorEnabled: !!u.twoFactorEnabled,
  };
}

export async function requirePortalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const h = req.headers.authorization;
    const token = h?.startsWith('Bearer ')
      ? h.slice(7)
      : (typeof req.query.token === 'string' ? req.query.token : null);
    if (!token) throw new AppError(401, 'Client authentication required', 'UNAUTHORIZED');
    req.portalUser = await userFromPortalToken(token);
    next();
  } catch (e: any) {
    next(e instanceof AppError ? e : new AppError(401, 'Session expired. Please log in again.', 'UNAUTHORIZED'));
  }
}

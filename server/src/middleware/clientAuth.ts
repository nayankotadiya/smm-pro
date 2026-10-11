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
    { expiresIn: remember ? '30d' : '7d' }
  );
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
  };
}

export async function requirePortalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) throw new AppError(401, 'Client authentication required', 'UNAUTHORIZED');
    req.portalUser = await userFromPortalToken(h.slice(7));
    next();
  } catch (e: any) {
    next(e instanceof AppError ? e : new AppError(401, 'Session expired. Please log in again.', 'UNAUTHORIZED'));
  }
}

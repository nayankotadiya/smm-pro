import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { User, RoleModel } from '../models';
import { AppError, forbidden } from '../utils/errors';
import { DEFAULT_ROLE_PERMISSIONS, Permission, Role } from '../config/constants';

export interface AuthUser { _id: string; name: string; email: string; role: Role; permissions: string[] }
declare global { namespace Express { interface Request { user?: AuthUser } } }

const permCache = new Map<string, { perms: string[]; at: number }>();
export async function permissionsFor(role: Role): Promise<string[]> {
  const c = permCache.get(role);
  if (c && Date.now() - c.at < 30_000) return c.perms;
  const r = await RoleModel.findOne({ key: role }).lean();
  const perms = r?.permissions?.length ? r.permissions : DEFAULT_ROLE_PERMISSIONS[role] || [];
  permCache.set(role, { perms, at: Date.now() });
  return perms;
}
export const clearPermCache = () => permCache.clear();

export function signAccess(u: { _id: any; role: string }) {
  return jwt.sign({ sub: String(u._id), role: u.role }, env.jwtSecret, { expiresIn: '15m' });
}
export async function userFromToken(token: string): Promise<AuthUser> {
  const p = jwt.verify(token, env.jwtSecret) as { sub: string };
  const u = await User.findById(p.sub).lean();
  if (!u || !u.active) throw new AppError(401, 'Account unavailable', 'UNAUTHORIZED');
  return { _id: String(u._id), name: u.name, email: u.email, role: u.role as Role, permissions: await permissionsFor(u.role as Role) };
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
    req.user = await userFromToken(h.slice(7));
    next();
  } catch (e: any) {
    next(e instanceof AppError ? e : new AppError(401, 'Session expired', 'UNAUTHORIZED'));
  }
}
export const can = (u: AuthUser | undefined, p: Permission) => !!u && (u.role === 'SUPER_ADMIN' || u.permissions.includes(p));
export const requirePerm = (...perms: Permission[]) => (req: Request, _res: Response, next: NextFunction) =>
  perms.some((p) => can(req.user, p)) ? next() : next(forbidden());

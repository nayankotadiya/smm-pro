import { Request, Response, NextFunction, RequestHandler } from 'express';
export const ah = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };

/** Concurrent upserts on a unique key can throw E11000 for the loser; retrying turns it into a plain update. */
export async function dupRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 0; ; i++) { try { return await fn(); } catch (e: any) { if (e?.code !== 11000 || i >= tries) throw e; } }
}

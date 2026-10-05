import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { randomToken } from '../utils/crypto';

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid input', details: err.flatten() } });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err?.name === 'CastError') {
    return res.status(400).json({ error: { code: 'BAD_ID', message: 'Invalid identifier' } });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: { code: 'DUPLICATE', message: 'A record with these details already exists' } });
  }
  if (err?.name === 'MulterError') {
    return res.status(400).json({ error: { code: 'UPLOAD', message: err.message } });
  }
  if (err?.name === 'MongoServerSelectionError' || err?.name === 'MongoNetworkError') {
    logger.error('Database connection outage', err, { path: req.path, method: req.method });
    return res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Database service is temporarily unavailable. Please retry shortly.' } });
  }

  const errorId = `err_${Date.now().toString(36)}_${randomToken(4)}`;
  logger.error(`Unhandled internal error [${errorId}]`, err, {
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: req.user?._id,
    errorId,
  });

  res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: 'Something went wrong. Please retry.',
      errorId,
    },
  });
}

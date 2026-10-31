import type { ErrorRequestHandler, RequestHandler, Request, Response, NextFunction } from 'express';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => { Promise.resolve(handler(req, res, next)).catch(next); };
}

export function callsignValue(value: unknown): string {
  if (typeof value !== 'string' || !/^[\p{L}\p{N} _-]{1,20}$/u.test(value.trim())) {
    throw new HttpError(400, 'Callsign must contain 1–20 letters, numbers, spaces, underscores or hyphens.');
  }
  return value.trim();
}

export function uuidValue(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new HttpError(400, 'Invalid flight ID.');
  }
  return value;
}

/** In-process abuse protection. Deployments with replicas should enforce this at the edge too. */
export function rateLimit(limit: number, windowMs = 60_000): RequestHandler {
  const clients = new Map<string, { count: number; until: number }>();
  return (req, res, next) => {
    const now = Date.now();
    if (clients.size > 10_000) {
      for (const [key, record] of clients) if (record.until <= now) clients.delete(key);
      if (clients.size > 10_000) { res.status(429).json({ error: 'Server is busy. Please try again shortly.' }); return; }
    }
    const key = req.ip || 'unknown';
    let record = clients.get(key);
    if (!record || record.until <= now) {
      record = { count: 0, until: now + windowMs };
      clients.set(key, record);
    }
    if (++record.count > limit) {
      res.setHeader('Retry-After', Math.ceil((record.until - now) / 1000));
      res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
      return;
    }
    next();
  };
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) { res.status(error.status).json({ error: error.message }); return; }
  if (error?.type === 'entity.too.large') { res.status(413).json({ error: 'Request body is too large.' }); return; }
  if (error instanceof SyntaxError) { res.status(400).json({ error: 'Request body must be valid JSON.' }); return; }
  // Never log SQL parameters, tokens, or connection strings.
  console.error('API operation failed:', typeof error?.code === 'string' ? error.code : 'internal');
  res.status(503).json({ error: 'The service is unavailable. Please try again later.' });
};

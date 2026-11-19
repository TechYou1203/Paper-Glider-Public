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

/**
 * In-process abuse protection. Deployments with replicas should enforce this at
 * the edge too.
 *
 * The map is bounded. When a busy window is full of *active* clients we evict
 * the oldest entries instead of rejecting every new IP: a single burst of
 * traffic must never make the game unavailable to new pilots.
 */
export function rateLimit(limit: number, windowMs = 60_000): RequestHandler {
  const MAX_CLIENTS = 20_000;
  const clients = new Map<string, { count: number; until: number }>();

  function makeRoom(now: number): void {
    for (const [key, record] of clients) {
      if (record.until <= now) clients.delete(key);
    }
    while (clients.size >= MAX_CLIENTS) {
      const oldest = clients.keys().next().value;
      if (oldest === undefined) break;
      clients.delete(oldest);
    }
  }

  return (req, res, next) => {
    const now = Date.now();
    if (clients.size >= MAX_CLIENTS) makeRoom(now);

    const key = req.ip || 'unknown';
    let record = clients.get(key);
    if (!record || record.until <= now) {
      record = { count: 0, until: now + windowMs };
      clients.set(key, record);
    } else {
      // Refresh insertion order so hot clients survive bounded-map eviction.
      clients.delete(key);
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
  if (error?.type === 'entity.parse.failed') { res.status(400).json({ error: 'Request body must be valid JSON.' }); return; }
  // Never log SQL parameters, tokens, or connection strings.
  console.error('API operation failed:', typeof error?.code === 'string' ? error.code : 'internal');
  res.status(503).json({ error: 'The service is unavailable. Please try again later.' });
};

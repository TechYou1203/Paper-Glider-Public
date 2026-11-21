import type { ErrorRequestHandler, RequestHandler, Request, Response, NextFunction } from 'express';
import { isSecureRequest } from './session.js';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/**
 * MTA-STS policy served from /.well-known/mta-sts.txt. Keep this in sync with
 * public/.well-known/mta-sts.txt (Vercel serves the static copy; Express serves
 * this route when it owns the frontend).
 *
 * Start in testing mode so a mismatch can be observed before enforcing. Once
 * the DNS TXT record and MX entries are correct, switch to mode: enforce.
 */
export const MTA_STS_POLICY = 'version: STSv1\nmode: testing\nmax_age: 86400\n';

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' https://apis.google.com https://www.google.com https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.googleusercontent.com https://*.gstatic.com https://www.google.com",
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com https://*.google.com",
  "frame-src 'self' https://accounts.google.com https://*.firebaseapp.com https://www.google.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self' blob:",
  "upgrade-insecure-requests",
].join('; ');

/**
 * Security headers for every API and static response. The hosting config
 * (vercel.json) mirrors these so Vercel's static CDN gets the same treatment.
 */
export const securityHeaders: RequestHandler = (req, res, next) => {
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Download-Options', 'noopen');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Origin-Agent-Cluster', '?1');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), display-capture=(), fullscreen=(self), screen-wake-lock=()'
  );

  if (isSecureRequest(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }

  next();
};

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

import type { Request, Response } from 'express';

/**
 * Pilot sessions are carried in an HttpOnly cookie. The raw token is never
 * exposed to browser JavaScript, so an XSS bug cannot read it from storage.
 */
export const SESSION_COOKIE_NAME = 'pg_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function isSecureRequest(req: Request): boolean {
  if (req.secure) return true;
  const forwarded = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return proto?.split(',')[0]?.trim() === 'https';
}

function cookieAttributes(req: Request): string {
  const host = (req.headers.host || '').split(':')[0].toLowerCase();
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  const secure = isSecureRequest(req) || (process.env.NODE_ENV === 'production' && !isLocal);
  return ['Path=/', 'HttpOnly', 'SameSite=Lax', ...(secure ? ['Secure'] : [])].join('; ');
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;

    let value = part.slice(separator + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      value = decodeURIComponent(value);
    } catch {
      // Keep the raw value if a proxy sent a malformed escape sequence.
    }
    return value || null;
  }

  return null;
}

/**
 * Accept a legacy bearer token for migration, but prefer the HttpOnly cookie.
 */
export function readSessionToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  return readCookie(req, SESSION_COOKIE_NAME);
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  if (!token) return;
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; ${cookieAttributes(req)}; Max-Age=${SESSION_MAX_AGE_SECONDS}`
  );
}

export function clearSessionCookie(req: Request, res: Response): void {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; ${cookieAttributes(req)}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  );
}

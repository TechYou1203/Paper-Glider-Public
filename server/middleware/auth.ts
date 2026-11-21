import { Request, Response, NextFunction } from 'express';
import { sql } from '../db.js';
import { clearSessionCookie, readSessionToken } from '../session.js';

export interface AuthenticatedRequest extends Request {
  player?: {
    id: string;
    callsign: string;
    equippedSkin: string;
    paperclips: number;
    unlockedSkins: string[];
    soundEnabled: boolean;
    firebaseUid?: string | null;
    email?: string | null;
    authProvider?: string | null;
    isGuest: boolean;
  };
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = readSessionToken(req);

  if (!token) {
    res.status(401).json({ error: 'Missing or invalid session' });
    return;
  }

  try {
    const rows = await sql`
      SELECT id, callsign, equipped_skin, paperclips, unlocked_skins, sound_enabled, firebase_uid, email, auth_provider
      FROM players
      WHERE guest_token = ${token}
    `;

    if (rows.length === 0) {
      clearSessionCookie(req, res);
      res.status(401).json({ error: 'Invalid session' });
      return;
    }

    const player = rows[0];
    req.player = {
      id: player.id,
      callsign: player.callsign,
      equippedSkin: player.equipped_skin,
      paperclips: player.paperclips,
      unlockedSkins: player.unlocked_skins,
      soundEnabled: player.sound_enabled,
      firebaseUid: player.firebase_uid || null,
      email: player.email || null,
      authProvider: player.auth_provider || 'guest',
      isGuest: !player.firebase_uid && !player.email,
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = readSessionToken(req);

  if (!token) {
    next();
    return;
  }

  try {
    const rows = await sql`
      SELECT id, callsign, equipped_skin, paperclips, unlocked_skins, sound_enabled, firebase_uid, email, auth_provider
      FROM players
      WHERE guest_token = ${token}
    `;

    if (rows.length > 0) {
      const player = rows[0];
      req.player = {
        id: player.id,
        callsign: player.callsign,
        equippedSkin: player.equipped_skin,
        paperclips: player.paperclips,
        unlockedSkins: player.unlocked_skins,
        soundEnabled: player.sound_enabled,
        firebaseUid: player.firebase_uid || null,
        email: player.email || null,
        authProvider: player.auth_provider || 'guest',
        isGuest: !player.firebase_uid && !player.email,
      };
    } else {
      clearSessionCookie(req, res);
    }
  } catch (error) {
    console.error('Optional auth middleware error:', error);
  }

  next();
}

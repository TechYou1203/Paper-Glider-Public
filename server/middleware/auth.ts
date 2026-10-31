import { Request, Response, NextFunction } from 'express';
import { sql } from '../db.js';

export interface AuthenticatedRequest extends Request {
  player?: {
    id: string;
    callsign: string;
    equippedSkin: string;
    paperclips: number;
    unlockedSkins: string[];
    soundEnabled: boolean;
  };
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const rows = await sql`
      SELECT id, callsign, equipped_skin, paperclips, unlocked_skins, sound_enabled
      FROM players
      WHERE guest_token = ${token}
    `;

    if (rows.length === 0) {
      res.status(401).json({ error: 'Invalid token' });
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
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.slice(7);

  try {
    const rows = await sql`
      SELECT id, callsign, equipped_skin, paperclips, unlocked_skins, sound_enabled
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
      };
    }
  } catch (error) {
    console.error('Optional auth middleware error:', error);
  }

  next();
}

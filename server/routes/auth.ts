import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { sql } from '../db.js';

const router = Router();

// POST /api/auth/guest — Create a new guest player
router.post('/guest', async (req: Request, res: Response) => {
  try {
    const { callsign } = req.body || {};
    const playerCallsign =
      callsign || `Pilot${Math.floor(100 + Math.random() * 900)}`;
    const guestToken = crypto.randomUUID();

    const rows = await sql`
      INSERT INTO players (guest_token, callsign)
      VALUES (${guestToken}, ${playerCallsign})
      RETURNING id, callsign, equipped_skin, paperclips, unlocked_skins, sound_enabled
    `;

    const player = rows[0];

    res.status(201).json({
      token: guestToken,
      player: {
        id: player.id,
        callsign: player.callsign,
        equippedSkin: player.equipped_skin,
        paperclips: player.paperclips,
        unlockedSkins: player.unlocked_skins,
        soundEnabled: player.sound_enabled,
      },
    });
  } catch (error) {
    console.error('Guest auth error:', error);
    res.status(500).json({ error: 'Failed to create guest account' });
  }
});

// POST /api/auth/login — Log in with an existing guest token
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { token } = req.body || {};

    if (!token) {
      res.status(400).json({ error: 'Token is required' });
      return;
    }

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

    res.json({
      player: {
        id: player.id,
        callsign: player.callsign,
        equippedSkin: player.equipped_skin,
        paperclips: player.paperclips,
        unlockedSkins: player.unlocked_skins,
        soundEnabled: player.sound_enabled,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

export default router;

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

// POST /api/auth/sync-pilot — Link or get Neon player for a Firebase pilot
router.post('/sync-pilot', async (req: Request, res: Response) => {
  try {
    const { firebaseUid, callsign } = req.body || {};
    if (!firebaseUid || !callsign) {
      res.status(400).json({ error: 'firebaseUid and callsign are required' });
      return;
    }

    // 1. Look for existing record by firebase_uid
    let rows = await sql`
      SELECT id, guest_token, callsign, equipped_skin, paperclips, unlocked_skins, sound_enabled
      FROM players
      WHERE firebase_uid = ${firebaseUid}
    `;

    if (rows.length > 0) {
      if (rows[0].callsign !== callsign) {
        rows = await sql`
          UPDATE players
          SET callsign = ${callsign}, updated_at = NOW()
          WHERE firebase_uid = ${firebaseUid}
          RETURNING id, guest_token, callsign, equipped_skin, paperclips, unlocked_skins, sound_enabled
        `;
      }
      const player = rows[0];
      res.json({
        token: player.guest_token,
        player: {
          id: player.id,
          callsign: player.callsign,
          equippedSkin: player.equipped_skin,
          paperclips: player.paperclips,
          unlockedSkins: player.unlocked_skins,
          soundEnabled: player.sound_enabled,
        },
      });
      return;
    }

    // 2. Not found by firebase_uid; insert new linked pilot
    const guestToken = crypto.randomUUID();
    rows = await sql`
      INSERT INTO players (guest_token, firebase_uid, callsign)
      VALUES (${guestToken}, ${firebaseUid}, ${callsign})
      RETURNING id, guest_token, callsign, equipped_skin, paperclips, unlocked_skins, sound_enabled
    `;

    const player = rows[0];
    res.status(201).json({
      token: player.guest_token,
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
    console.error('Sync pilot error:', error);
    res.status(500).json({ error: 'Failed to sync pilot account' });
  }
});

// DELETE /api/auth/account — Permanently delete pilot account & all Neon DB details
router.delete('/account', async (req: Request, res: Response) => {
  try {
    const { firebaseUid, callsign, token } = req.body || {};
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const activeToken = token || bearerToken;

    if (!firebaseUid && !callsign && !activeToken) {
      res.status(400).json({ error: 'Identification required to delete account' });
      return;
    }

    const deleted = await sql`
      DELETE FROM players
      WHERE (firebase_uid IS NOT NULL AND firebase_uid = ${firebaseUid || ''})
         OR (guest_token IS NOT NULL AND guest_token = ${activeToken || ''})
         OR (callsign IS NOT NULL AND callsign = ${callsign || ''})
      RETURNING id, callsign
    `;

    res.json({
      success: true,
      deletedCount: deleted.length,
      message: 'Pilot account and all associated records permanently removed from Neon DB.',
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account from Neon DB' });
  }
});

export default router;

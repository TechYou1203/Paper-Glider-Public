import { Router, Response } from 'express';
import { sql } from '../db.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { DEFAULT_SKINS } from '../../src/game/rules.js';
import { updateLeaderboardCallsign } from '../ranking.js';
import { callsignValue } from '../http.js';

const router = Router();

const SKINS_BY_ID = new Map(DEFAULT_SKINS.map((skin) => [skin.id, skin]));

function unlockedSkins(player: any): string[] {
  return Array.isArray(player?.unlockedSkins)
    ? player.unlockedSkins
    : ['classic'];
}

function playerPayload(updated: any) {
  return {
    id: updated.id,
    callsign: updated.callsign,
    equippedSkin: updated.equipped_skin,
    paperclips: updated.paperclips,
    unlockedSkins: updated.unlocked_skins,
    soundEnabled: updated.sound_enabled,
  };
}

// POST /api/inventory/unlock — Unlock a new skin
router.post('/unlock', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const player = req.player!;
    const { skinId } = req.body || {};

    if (typeof skinId !== 'string') {
      res.status(400).json({ error: 'Missing required field: skinId' });
      return;
    }

    // Prices are authoritative on the server. The client cannot name its own
    // price or unlock an item for free.
    const skin = SKINS_BY_ID.get(skinId);
    if (!skin) {
      res.status(400).json({ error: 'Unknown glider skin' });
      return;
    }
    if (skin.unlockedByDefault || unlockedSkins(player).includes(skinId)) {
      res.status(409).json({ error: 'Skin already unlocked' });
      return;
    }

    const rows = await sql`
      UPDATE players
      SET paperclips = COALESCE(paperclips, 0) - ${skin.costInClips},
          unlocked_skins = array_append(
            COALESCE(unlocked_skins, ARRAY['classic']::text[]),
            ${skinId}
          ),
          equipped_skin = ${skinId},
          updated_at = NOW()
      WHERE id = ${player.id}
        AND COALESCE(paperclips, 0) >= ${skin.costInClips}
        AND NOT (${skinId} = ANY(COALESCE(unlocked_skins, ARRAY['classic']::text[])))
      RETURNING id, callsign, equipped_skin, paperclips, unlocked_skins, sound_enabled
    `;

    if (rows.length === 0) {
      const current = await sql`SELECT paperclips FROM players WHERE id = ${player.id}`;
      if (Number(current[0]?.paperclips) < skin.costInClips) {
        res.status(400).json({ error: 'Not enough paperclips' });
      } else {
        res.status(409).json({ error: 'Skin already unlocked' });
      }
      return;
    }

    res.json({ player: playerPayload(rows[0]) });
  } catch (error) {
    console.error('Unlock skin error:', error);
    res.status(500).json({ error: 'Failed to unlock skin' });
  }
});

// PATCH /api/inventory/equip — Equip a skin
router.patch('/equip', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const player = req.player!;
    const { skinId } = req.body || {};

    if (typeof skinId !== 'string' || !SKINS_BY_ID.has(skinId)) {
      res.status(400).json({ error: 'Unknown glider skin' });
      return;
    }

    if (!unlockedSkins(player).includes(skinId)) {
      res.status(400).json({ error: 'Skin not unlocked' });
      return;
    }

    const updatedRows = await sql`
      UPDATE players
      SET equipped_skin = ${skinId}, updated_at = NOW()
      WHERE id = ${player.id}
        AND ${skinId} = ANY(COALESCE(unlocked_skins, ARRAY['classic']::text[]))
      RETURNING id, callsign, equipped_skin, paperclips, unlocked_skins, sound_enabled
    `;

    if (updatedRows.length === 0) {
      res.status(409).json({ error: 'Skin is not available on this account' });
      return;
    }

    res.json({ player: playerPayload(updatedRows[0]) });
  } catch (error) {
    console.error('Equip skin error:', error);
    res.status(500).json({ error: 'Failed to equip skin' });
  }
});

// PATCH /api/inventory/settings — Update player settings
router.patch('/settings', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const player = req.player!;
    const { callsign, soundEnabled } = req.body || {};

    if (callsign === undefined && soundEnabled === undefined) {
      res.status(400).json({ error: 'No settings to update' });
      return;
    }

    if (soundEnabled !== undefined && typeof soundEnabled !== 'boolean') {
      res.status(400).json({ error: 'soundEnabled must be a boolean' });
      return;
    }

    const cleanCallsign = callsign === undefined ? null : callsignValue(callsign);

    // An empty callsign change is still a no-op update, which keeps the return
    // shape consistent for the client.
    const updatedRows = await sql`
      UPDATE players
      SET callsign = COALESCE(${cleanCallsign}, callsign),
          sound_enabled = COALESCE(${soundEnabled ?? null}::boolean, sound_enabled),
          updated_at = NOW()
      WHERE id = ${player.id}
      RETURNING id, callsign, equipped_skin, paperclips, unlocked_skins, sound_enabled
    `;

    const updated = updatedRows[0];

    if (cleanCallsign) {
      // The all-time board stores a denormalized callsign for fast reads, and
      // Google account lookup stores it too. Keep both from going stale.
      await updateLeaderboardCallsign(player.id);

      if (player.firebaseUid || player.email) {
        await sql`
          UPDATE google_accounts
          SET callsign = ${cleanCallsign}, updated_at = NOW()
          WHERE (${player.firebaseUid ?? null}::text IS NOT NULL
                 AND firebase_uid = ${player.firebaseUid ?? null})
             OR (${player.email ?? null}::text IS NOT NULL
                 AND LOWER(email) = LOWER(${player.email ?? null}::text))
        `;
      }
    }

    res.json({ player: playerPayload(updated) });
  } catch (error: any) {
    if (error?.status === 400) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;

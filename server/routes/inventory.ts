import { Router, Response } from 'express';
import { sql } from '../db.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// POST /api/inventory/unlock — Unlock a new skin
router.post('/unlock', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const player = req.player!;
    const { skinId, cost } = req.body;

    if (!skinId || cost == null) {
      res.status(400).json({ error: 'Missing required fields: skinId, cost' });
      return;
    }

    if (typeof cost !== 'number' || cost < 0) {
      res.status(400).json({ error: 'Invalid cost' });
      return;
    }

    // Check if player has enough paperclips
    if (player.paperclips < cost) {
      res.status(400).json({ error: 'Not enough paperclips' });
      return;
    }

    // Check if skin is already unlocked
    if (player.unlockedSkins.includes(skinId)) {
      res.status(409).json({ error: 'Skin already unlocked' });
      return;
    }

    // Deduct paperclips and add skin to unlocked_skins
    const updatedRows = await sql`
      UPDATE players
      SET paperclips = paperclips - ${cost},
          unlocked_skins = array_append(unlocked_skins, ${skinId}),
          updated_at = NOW()
      WHERE id = ${player.id}
      RETURNING id, callsign, equipped_skin, paperclips, unlocked_skins, sound_enabled
    `;

    const updated = updatedRows[0];

    res.json({
      player: {
        id: updated.id,
        callsign: updated.callsign,
        equippedSkin: updated.equipped_skin,
        paperclips: updated.paperclips,
        unlockedSkins: updated.unlocked_skins,
        soundEnabled: updated.sound_enabled,
      },
    });
  } catch (error) {
    console.error('Unlock skin error:', error);
    res.status(500).json({ error: 'Failed to unlock skin' });
  }
});

// PATCH /api/inventory/equip — Equip a skin
router.patch('/equip', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const player = req.player!;
    const { skinId } = req.body;

    if (!skinId) {
      res.status(400).json({ error: 'Missing required field: skinId' });
      return;
    }

    // Verify skin is unlocked
    if (!player.unlockedSkins.includes(skinId)) {
      res.status(400).json({ error: 'Skin not unlocked' });
      return;
    }

    const updatedRows = await sql`
      UPDATE players
      SET equipped_skin = ${skinId}, updated_at = NOW()
      WHERE id = ${player.id}
      RETURNING id, callsign, equipped_skin, paperclips, unlocked_skins, sound_enabled
    `;

    const updated = updatedRows[0];

    res.json({
      player: {
        id: updated.id,
        callsign: updated.callsign,
        equippedSkin: updated.equipped_skin,
        paperclips: updated.paperclips,
        unlockedSkins: updated.unlocked_skins,
        soundEnabled: updated.sound_enabled,
      },
    });
  } catch (error) {
    console.error('Equip skin error:', error);
    res.status(500).json({ error: 'Failed to equip skin' });
  }
});

// PATCH /api/inventory/settings — Update player settings
router.patch('/settings', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const player = req.player!;
    const { callsign, soundEnabled } = req.body;

    // Build dynamic update
    const updates: Record<string, unknown> = {};
    if (callsign !== undefined) updates.callsign = callsign;
    if (soundEnabled !== undefined) updates.soundEnabled = soundEnabled;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No settings to update' });
      return;
    }

    // We need to build the query based on what's provided
    let updatedRows;

    if (callsign !== undefined && soundEnabled !== undefined) {
      updatedRows = await sql`
        UPDATE players
        SET callsign = ${callsign}, sound_enabled = ${soundEnabled}, updated_at = NOW()
        WHERE id = ${player.id}
        RETURNING id, callsign, equipped_skin, paperclips, unlocked_skins, sound_enabled
      `;
    } else if (callsign !== undefined) {
      updatedRows = await sql`
        UPDATE players
        SET callsign = ${callsign}, updated_at = NOW()
        WHERE id = ${player.id}
        RETURNING id, callsign, equipped_skin, paperclips, unlocked_skins, sound_enabled
      `;
    } else {
      updatedRows = await sql`
        UPDATE players
        SET sound_enabled = ${soundEnabled}, updated_at = NOW()
        WHERE id = ${player.id}
        RETURNING id, callsign, equipped_skin, paperclips, unlocked_skins, sound_enabled
      `;
    }

    const updated = updatedRows[0];

    res.json({
      player: {
        id: updated.id,
        callsign: updated.callsign,
        equippedSkin: updated.equipped_skin,
        paperclips: updated.paperclips,
        unlockedSkins: updated.unlocked_skins,
        soundEnabled: updated.sound_enabled,
      },
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;

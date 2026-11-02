import { Router, Response } from 'express';
import { sql } from '../db.js';
import { optionalAuth, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/leaderboard — Top scores (all time)
router.get('/', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 500);

    const rows = await sql`
      SELECT l.id, l.player_id, l.callsign, l.score, l.clips, l.skin, l.achieved_at
      FROM leaderboard l
      JOIN players p ON l.player_id = p.id
      WHERE p.firebase_uid IS NOT NULL
      ORDER BY l.score DESC, l.clips DESC, l.achieved_at ASC
      LIMIT ${limit}
    `;

    const entries = rows.map((row: any, index: number) => ({
      rank: index + 1,
      playerId: row.player_id,
      callsign: row.callsign,
      score: row.score,
      clips: row.clips,
      skin: row.skin,
      achievedAt: row.achieved_at,
      isPlayer: req.player ? row.player_id === req.player.id : false,
    }));

    res.json({ entries });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// GET /api/leaderboard/daily — Top scores for today
router.get('/daily', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 500);

    const rows = await sql`
      SELECT l.id, l.player_id, l.callsign, l.score, l.clips, l.skin, l.achieved_at
      FROM leaderboard l
      JOIN players p ON l.player_id = p.id
      WHERE p.firebase_uid IS NOT NULL
        AND l.achieved_at >= CURRENT_DATE
      ORDER BY l.score DESC, l.clips DESC, l.achieved_at ASC
      LIMIT ${limit}
    `;

    const entries = rows.map((row: any, index: number) => ({
      rank: index + 1,
      playerId: row.player_id,
      callsign: row.callsign,
      score: row.score,
      clips: row.clips,
      skin: row.skin,
      achievedAt: row.achieved_at,
      isPlayer: req.player ? row.player_id === req.player.id : false,
    }));

    res.json({ entries });
  } catch (error) {
    console.error('Daily leaderboard error:', error);
    res.status(500).json({ error: 'Failed to fetch daily leaderboard' });
  }
});

export default router;

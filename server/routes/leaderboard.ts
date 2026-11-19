import { Router, Response } from 'express';
import { optionalAuth, AuthenticatedRequest } from '../middleware/auth.js';
import {
  fetchAllTimeEntries,
  fetchAllTimePlayerEntry,
  fetchDailyEntries,
  fetchDailyPlayerEntry,
  countAllTimePlayers,
  countDailyPlayers,
} from '../ranking.js';
import { utcDayString } from '../time.js';

const router = Router();

function limitValue(raw: unknown): number {
  const parsed = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(Math.max(Math.trunc(parsed), 1), 500);
}

function dayValue(raw: unknown): string | null {
  // No date means "today" for backwards compatibility. A supplied date must be
  // a real calendar day; silently substituting today would hide client bugs.
  if (raw == null || raw === '') return utcDayString();

  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  // Date.parse() would silently normalize 2026-02-31 into March. Compare the
  // round-trip so only real UTC calendar days reach the database.
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || utcDayString(parsed) !== value) return null;
  return value;
}

// GET /api/leaderboard — Top scores (all time)
router.get('/', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = limitValue(req.query.limit);
    const viewerId = req.player?.id ?? null;

    const [entries, player, totalPlayers] = await Promise.all([
      fetchAllTimeEntries(limit, viewerId),
      viewerId ? fetchAllTimePlayerEntry(viewerId) : Promise.resolve(null),
      countAllTimePlayers(),
    ]);

    res.set('Cache-Control', 'no-store');
    res.json({
      entries,
      playerEntry: player?.entry ?? null,
      playerRank: player?.rank ?? null,
      totalPlayers,
      date: utcDayString(),
    });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// GET /api/leaderboard/daily?date=YYYY-MM-DD — Top scores for a UTC day
router.get('/daily', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = limitValue(req.query.limit);
    const day = dayValue(req.query.date);
    if (!day) {
      res.status(400).json({ error: 'date must be a real calendar day in YYYY-MM-DD format.' });
      return;
    }
    const viewerId = req.player?.id ?? null;

    const [entries, player, totalPlayers] = await Promise.all([
      fetchDailyEntries(day, limit, viewerId),
      viewerId ? fetchDailyPlayerEntry(viewerId, day) : Promise.resolve(null),
      countDailyPlayers(day),
    ]);

    res.set('Cache-Control', 'no-store');
    res.json({
      entries,
      playerEntry: player?.entry ?? null,
      playerRank: player?.rank ?? null,
      totalPlayers,
      date: day,
    });
  } catch (error) {
    console.error('Daily leaderboard error:', error);
    res.status(500).json({ error: 'Failed to fetch daily leaderboard' });
  }
});

export default router;

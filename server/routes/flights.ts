import { Router, Response } from 'express';
import crypto from 'crypto';
import { sql } from '../db.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { verifyReplay, type ReplayInput } from '../replay.js';
import { DEFAULT_SKINS } from '../../src/game/rules.js';
import { MAX_FLIGHT_FRAMES, SIMULATION_VERSION } from '../../src/game/simulation.js';
import {
  fetchAllTimePlayerEntry,
  fetchDailyPlayerEntry,
} from '../ranking.js';
import { HttpError, rateLimit, uuidValue } from '../http.js';
import { utcDayString } from '../time.js';

const router = Router();

const MAX_SCORE = 1_000_000;
const MAX_CLIPS = 50_000;
const MAX_INPUTS = 10_000;
const MIN_WORLD = 200;
const MAX_WORLD = 5000;
const SKIN_IDS = new Set(DEFAULT_SKINS.map((skin) => skin.id));

function integerValue(value: unknown, min: number, max: number, label: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new HttpError(400, `${label} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

function seedValue(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{6,64}$/.test(value)) {
    throw new HttpError(400, 'Invalid flight seed.');
  }
  return value;
}

function worldValue(value: unknown, fallback: number, label: string): number {
  if (value == null) return fallback;
  return integerValue(value, MIN_WORLD, MAX_WORLD, label);
}

function skinValue(value: unknown, player: AuthenticatedRequest['player']): string {
  const unlocked = Array.isArray(player?.unlockedSkins) ? player!.unlockedSkins : [];
  const requested = typeof value === 'string' && value.length > 0
    ? value
    : player?.equippedSkin || 'classic';

  if (!SKIN_IDS.has(requested)) throw new HttpError(400, 'Unknown glider skin.');
  if (!unlocked.includes(requested)) throw new HttpError(403, 'This glider skin is not unlocked.');
  return requested;
}

function parseInputs(value: unknown): ReplayInput[] {
  if (!Array.isArray(value)) throw new HttpError(400, 'inputs must be an array.');
  if (value.length > MAX_INPUTS) throw new HttpError(400, 'Too many replay inputs.');

  return value.map((raw): ReplayInput => {
    if (!raw || typeof raw !== 'object') throw new HttpError(400, 'Invalid replay input.');
    const entry = raw as Record<string, unknown>;
    const frame = integerValue(entry.frame, 0, MAX_FLIGHT_FRAMES - 1, 'Input frame');

    if (entry.action === 'flap') return { frame, action: 'flap' };
    if (entry.action === 'resize') {
      return {
        frame,
        action: 'resize',
        width: integerValue(entry.width, MIN_WORLD, MAX_WORLD, 'Input width'),
        height: integerValue(entry.height, MIN_WORLD, MAX_WORLD, 'Input height'),
      };
    }
    throw new HttpError(400, 'Invalid replay input action.');
  });
}

function isRankedPilot(player: NonNullable<AuthenticatedRequest['player']>): boolean {
  return Boolean(player.firebaseUid || player.email);
}

interface AppliedFlight {
  rank: number | null;
  dailyRank: number | null;
  day: string;
  paperclips: number;
}

async function applyVerifiedFlight(
  player: NonNullable<AuthenticatedRequest['player']>,
  achievedAt: Date,
  clips: number
): Promise<AppliedFlight> {
  const day = utcDayString(achievedAt);
  const ranked = isRankedPilot(player);

  // Credit the clips, the all-time row and the daily row in one transaction. If
  // any write fails the transaction rolls back, so a pilot can never be paid
  // twice or appear on one board but not the other because of a partial write.
  const statements: any[] = [
    sql`
      UPDATE players
      SET paperclips = COALESCE(paperclips, 0) + ${clips}, updated_at = NOW()
      WHERE id = ${player.id}
      RETURNING paperclips
    `,
  ];

  if (ranked) {
    statements.push(
      // Derive the row from every verified flight instead of only the one just
      // submitted. This is self-healing: if a sign-in ever failed to refresh
      // this pilot's historical best, the next submission restores it rather
      // than ranking the pilot on a lower score. The unique index guarantees
      // one row per pilot and the WHERE clause means a slower concurrent
      // request can never replace a better flight.
      sql`
        INSERT INTO leaderboard (player_id, callsign, score, clips, skin, flight_id, achieved_at)
        SELECT
          f.player_id,
          p.callsign,
          f.score,
          COALESCE(f.clips_collected, 0),
          f.skin_used,
          f.id,
          f.created_at
        FROM flights f
        JOIN players p ON p.id = f.player_id
        WHERE f.player_id = ${player.id}
          AND f.verified = true
          AND f.verification_version >= 2
        ORDER BY
          f.score DESC,
          COALESCE(f.clips_collected, 0) DESC,
          f.created_at ASC,
          f.id ASC
        LIMIT 1
        ON CONFLICT (player_id) DO UPDATE SET
          callsign = EXCLUDED.callsign,
          score = EXCLUDED.score,
          clips = EXCLUDED.clips,
          skin = EXCLUDED.skin,
          flight_id = EXCLUDED.flight_id,
          achieved_at = EXCLUDED.achieved_at
        WHERE EXCLUDED.score > leaderboard.score
           OR (EXCLUDED.score = leaderboard.score AND EXCLUDED.clips > leaderboard.clips)
           OR (EXCLUDED.score = leaderboard.score
               AND EXCLUDED.clips = leaderboard.clips
               AND EXCLUDED.achieved_at < leaderboard.achieved_at)
      `,
      // Renames are independent of score improvements, so the display name is
      // applied unconditionally (a no-op when the upsert already wrote it).
      sql`
        UPDATE leaderboard l
        SET callsign = p.callsign
        FROM players p
        WHERE l.player_id = ${player.id}
          AND p.id = l.player_id
      `,
      sql`
        INSERT INTO daily_leaderboard (day, player_id, score, clips, skin, flight_id, achieved_at)
        SELECT
          (f.created_at AT TIME ZONE 'UTC')::date,
          f.player_id,
          f.score,
          COALESCE(f.clips_collected, 0),
          f.skin_used,
          f.id,
          f.created_at
        FROM flights f
        WHERE f.player_id = ${player.id}
          AND f.verified = true
          AND f.verification_version >= 2
          AND (f.created_at AT TIME ZONE 'UTC')::date = ${day}::date
        ORDER BY
          f.score DESC,
          COALESCE(f.clips_collected, 0) DESC,
          f.created_at ASC,
          f.id ASC
        LIMIT 1
        ON CONFLICT (day, player_id) DO UPDATE SET
          score = EXCLUDED.score,
          clips = EXCLUDED.clips,
          skin = EXCLUDED.skin,
          flight_id = EXCLUDED.flight_id,
          achieved_at = EXCLUDED.achieved_at
        WHERE EXCLUDED.score > daily_leaderboard.score
           OR (EXCLUDED.score = daily_leaderboard.score AND EXCLUDED.clips > daily_leaderboard.clips)
           OR (EXCLUDED.score = daily_leaderboard.score
               AND EXCLUDED.clips = daily_leaderboard.clips
               AND EXCLUDED.achieved_at < daily_leaderboard.achieved_at)
      `
    );
  }

  const results = await (sql as any).transaction(statements);
  const paperclips = Number((results[0] as any[])[0]?.paperclips) || 0;

  if (!ranked) {
    return { rank: null, dailyRank: null, day, paperclips };
  }

  const [allTime, daily] = await Promise.all([
    fetchAllTimePlayerEntry(player.id),
    fetchDailyPlayerEntry(player.id, day),
  ]);

  return {
    rank: allTime?.rank ?? null,
    dailyRank: daily?.rank ?? null,
    day,
    paperclips,
  };
}

// POST /api/flights/start — Start a new flight session
router.post('/start', rateLimit(600), authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const player = req.player!;
    const seed = seedValue(req.body?.seed ?? crypto.randomUUID());
    const skin = skinValue(req.body?.skinUsed, player);
    const worldWidth = worldValue(req.body?.worldWidth, 800, 'worldWidth');
    const worldHeight = worldValue(req.body?.worldHeight, 600, 'worldHeight');

    // Reuse an unsubmitted row for the same seed (client retry) but never
    // reopen a flight that has already been submitted.
    const rows = await sql`
      INSERT INTO flights (player_id, seed, skin_used, world_width, world_height, verification_version)
      VALUES (${player.id}, ${seed}, ${skin}, ${worldWidth}, ${worldHeight}, 2)
      ON CONFLICT (player_id, seed) DO UPDATE SET
        skin_used = EXCLUDED.skin_used,
        world_width = EXCLUDED.world_width,
        world_height = EXCLUDED.world_height,
        verification_version = 2
      WHERE flights.submitted_at IS NULL
        AND flights.verified = false
        AND flights.score = 0
      RETURNING id
    `;

    if (rows.length === 0) {
      throw new HttpError(409, 'This flight has already been submitted.');
    }

    res.status(201).json({
      sessionId: rows[0].id,
      seed,
      skinId: skin,
      simulationVersion: SIMULATION_VERSION,
      worldWidth,
      worldHeight,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('Flight start error:', error);
    res.status(500).json({ error: 'Failed to start flight' });
  }
});

// POST /api/flights/:id/submit — Submit flight results
router.post('/:id/submit', rateLimit(600), authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const player = req.player!;
    const flightId = uuidValue(req.params.id);
    const { score, clipsCollected, inputs, durationMs } = req.body || {};

    const claimedScore = integerValue(score, 0, MAX_SCORE, 'score');
    integerValue(clipsCollected ?? 0, 0, MAX_CLIPS, 'clipsCollected');
    const parsedInputs = parseInputs(inputs);
    const duration = durationMs == null
      ? null
      : integerValue(durationMs, 0, MAX_FLIGHT_FRAMES * 1000, 'durationMs');

    const flightRows = await sql`
      SELECT id, player_id, seed, score, submitted_at, skin_used, world_width, world_height, created_at
      FROM flights
      WHERE id = ${flightId}
    `;
    const flight = flightRows[0];

    if (!flight) throw new HttpError(404, 'Flight not found.');
    if (flight.player_id !== player.id) throw new HttpError(403, 'This flight belongs to another pilot.');
    if (flight.submitted_at !== null || flight.verified || flight.score !== 0) {
      throw new HttpError(409, 'This flight has already been submitted.');
    }

    const worldWidth = worldValue(
      flight.world_width ?? req.body?.worldWidth,
      800,
      'worldWidth'
    );
    const worldHeight = worldValue(
      flight.world_height ?? req.body?.worldHeight,
      600,
      'worldHeight'
    );
    const skin = skinValue(flight.skin_used ?? req.body?.skinUsed, player);

    const replay = verifyReplay(
      flight.seed,
      parsedInputs,
      claimedScore,
      skin,
      worldWidth,
      worldHeight
    );

    const updated = await sql`
      UPDATE flights
      SET score = ${replay.replayScore},
          clips_collected = ${replay.replayClips},
          input_log = ${JSON.stringify(parsedInputs)},
          duration_ms = ${duration},
          verified = ${replay.valid},
          world_width = ${worldWidth},
          world_height = ${worldHeight},
          verification_version = 2,
          submitted_at = NOW()
      WHERE id = ${flightId}
        AND player_id = ${player.id}
        AND submitted_at IS NULL
      RETURNING id, created_at
    `;

    if (updated.length === 0) throw new HttpError(409, 'This flight has already been submitted.');

    if (!replay.valid) {
      // The client optimistically adds the flight's clips to its local balance.
      // Send the authoritative balance back even on failure so the UI can roll
      // that phantom reward back immediately.
      const current = await sql`
        SELECT paperclips FROM players WHERE id = ${player.id}
      `;
      res.json({
        verified: false,
        score: replay.replayScore,
        clipsCollected: replay.replayClips,
        paperclips: Number(current[0]?.paperclips) || 0,
        rank: null,
        dailyRank: null,
        isGuest: !isRankedPilot(player),
        date: utcDayString(new Date(flight.created_at)),
        message: 'Score verification failed',
      });
      return;
    }

    const achievedAt = new Date(updated[0].created_at);
    const applied = await applyVerifiedFlight(player, achievedAt, replay.replayClips);

    res.json({
      verified: true,
      score: replay.replayScore,
      clipsCollected: replay.replayClips,
      rank: applied.rank,
      dailyRank: applied.dailyRank,
      paperclips: applied.paperclips,
      isGuest: !isRankedPilot(player),
      date: applied.day,
      message: isRankedPilot(player)
        ? undefined
        : 'Flight recorded! Sign in to join the official Global Leaderboard.',
    });
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('Flight submit error:', error);
    res.status(500).json({ error: 'Failed to submit flight' });
  }
});

// POST /api/flights/direct-submit — Verify and store a flight in one request
router.post('/direct-submit', rateLimit(600), authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const player = req.player!;
    const { seed, score, clipsCollected, inputs, durationMs, skinUsed, worldWidth, worldHeight } = req.body || {};

    const flightSeed = seedValue(seed);
    const claimedScore = integerValue(score, 0, MAX_SCORE, 'score');
    integerValue(clipsCollected ?? 0, 0, MAX_CLIPS, 'clipsCollected');
    const parsedInputs = parseInputs(inputs);
    const duration = durationMs == null
      ? null
      : integerValue(durationMs, 0, MAX_FLIGHT_FRAMES * 1000, 'durationMs');
    const skin = skinValue(skinUsed, player);
    const width = worldValue(worldWidth, 800, 'worldWidth');
    const height = worldValue(worldHeight, 600, 'worldHeight');

    const replay = verifyReplay(flightSeed, parsedInputs, claimedScore, skin, width, height);

    // The upsert simultaneously claims an existing /start row and prevents a
    // replay of the same seed from ever earning a second score or clips.
    const flightRows = await sql`
      INSERT INTO flights (
        player_id, seed, score, clips_collected, skin_used, input_log,
        verified, duration_ms, world_width, world_height, verification_version, submitted_at
      )
      VALUES (
        ${player.id}, ${flightSeed}, ${replay.replayScore}, ${replay.replayClips},
        ${skin}, ${JSON.stringify(parsedInputs)}, ${replay.valid}, ${duration},
        ${width}, ${height}, 2, NOW()
      )
      ON CONFLICT (player_id, seed) DO UPDATE SET
        score = EXCLUDED.score,
        clips_collected = EXCLUDED.clips_collected,
        skin_used = EXCLUDED.skin_used,
        input_log = EXCLUDED.input_log,
        verified = EXCLUDED.verified,
        duration_ms = EXCLUDED.duration_ms,
        world_width = EXCLUDED.world_width,
        world_height = EXCLUDED.world_height,
        verification_version = 2,
        submitted_at = NOW()
      WHERE flights.submitted_at IS NULL
        AND flights.verified = false
        AND flights.score = 0
      RETURNING id, created_at
    `;

    if (flightRows.length === 0) {
      throw new HttpError(409, 'This flight has already been submitted.');
    }

    const flight = flightRows[0];

    if (!replay.valid) {
      // See /:id/submit: roll back the client's optimistic clip reward.
      const current = await sql`
        SELECT paperclips FROM players WHERE id = ${player.id}
      `;
      res.json({
        verified: false,
        score: replay.replayScore,
        clipsCollected: replay.replayClips,
        paperclips: Number(current[0]?.paperclips) || 0,
        rank: null,
        dailyRank: null,
        isGuest: !isRankedPilot(player),
        date: utcDayString(new Date(flight.created_at)),
        message: 'Score verification failed',
      });
      return;
    }

    const applied = await applyVerifiedFlight(
      player,
      new Date(flight.created_at),
      replay.replayClips
    );

    res.json({
      verified: true,
      score: replay.replayScore,
      clipsCollected: replay.replayClips,
      rank: applied.rank,
      dailyRank: applied.dailyRank,
      paperclips: applied.paperclips,
      isGuest: !isRankedPilot(player),
      date: applied.day,
      message: isRankedPilot(player)
        ? undefined
        : 'Flight recorded! Sign in to join the official Global Leaderboard.',
    });
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('Direct flight submit error:', error);
    res.status(500).json({ error: 'Failed to submit flight directly' });
  }
});

export default router;

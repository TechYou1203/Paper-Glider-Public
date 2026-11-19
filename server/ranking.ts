import { sql } from './db.js';

/**
 * A single row in a competitive leaderboard.
 *
 * Ranking rule (used everywhere):
 *   1. Higher score wins.
 *   2. More paperclips wins when scores are equal.
 *   3. The earlier flight wins when score and clips are equal.
 *
 * Pilots with the exact same three values share a rank (competition ranking:
 * 1, 1, 3), and every list uses the same deterministic order.
 */
export interface RawLeaderboardRow {
  player_id: string;
  callsign: string | null;
  score: number | string;
  clips: number | string | null;
  skin: string | null;
  achieved_at: string | Date;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  callsign: string;
  score: number;
  clips: number;
  skin: string;
  achievedAt: string;
  isPlayer: boolean;
}

function timestampKey(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function rankKey(row: RawLeaderboardRow): string {
  return `${Number(row.score) || 0}|${Number(row.clips) || 0}|${timestampKey(row.achieved_at)}`;
}

function toEntry(row: RawLeaderboardRow, rank: number, viewerId?: string | null): LeaderboardEntry {
  return {
    rank,
    playerId: row.player_id,
    callsign: row.callsign || 'Pilot',
    score: Number(row.score) || 0,
    clips: Number(row.clips) || 0,
    skin: row.skin || 'classic',
    achievedAt: timestampKey(row.achieved_at),
    isPlayer: Boolean(viewerId && row.player_id === viewerId),
  };
}

/** Pure ranking helper so the tie rules can be unit-tested without a database. */
export function assignRanks(
  rows: RawLeaderboardRow[],
  viewerId?: string | null
): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];
  let previousKey: string | null = null;
  let currentRank = 0;

  rows.forEach((row, index) => {
    const key = rankKey(row);
    if (key !== previousKey) {
      currentRank = index + 1;
      previousKey = key;
    }
    entries.push(toEntry(row, currentRank, viewerId));
  });

  return entries;
}

export async function fetchAllTimeEntries(
  limit: number,
  viewerId?: string | null
): Promise<LeaderboardEntry[]> {
  // `leaderboard` is an invariant table: only eligible pilots are ever written
  // to it (and the migration removes everyone else). Reading the denormalized
  // callsign avoids a million-row join on every page load. Callsign changes are
  // propagated in updateLeaderboardCallsign().
  const rows = await sql`
    SELECT
      l.player_id,
      l.callsign,
      l.score,
      l.clips,
      COALESCE(l.skin, 'classic') AS skin,
      to_char(l.achieved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS achieved_at
    FROM leaderboard l
    ORDER BY l.score DESC, l.clips DESC, l.achieved_at ASC, l.player_id ASC
    LIMIT ${limit}
  `;
  return assignRanks(rows as unknown as RawLeaderboardRow[], viewerId);
}

export async function fetchDailyEntries(
  day: string,
  limit: number,
  viewerId?: string | null
): Promise<LeaderboardEntry[]> {
  const rows = await sql`
    SELECT
      d.player_id,
      p.callsign,
      d.score,
      d.clips,
      COALESCE(d.skin, p.equipped_skin, 'classic') AS skin,
      to_char(d.achieved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS achieved_at
    FROM daily_leaderboard d
    JOIN players p ON p.id = d.player_id
    WHERE d.day = ${day}::date
      AND (p.firebase_uid IS NOT NULL OR p.email IS NOT NULL)
    ORDER BY d.score DESC, d.clips DESC, d.achieved_at ASC, d.player_id ASC
    LIMIT ${limit}
  `;
  return assignRanks(rows as unknown as RawLeaderboardRow[], viewerId);
}

export async function fetchAllTimePlayerEntry(
  playerId: string
): Promise<{ entry: LeaderboardEntry; rank: number } | null> {
  const rows = await sql`
    WITH me AS (
      SELECT
        l.player_id,
        l.callsign,
        l.score,
        l.clips,
        COALESCE(l.skin, 'classic') AS skin,
        to_char(l.achieved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS achieved_at,
        l.achieved_at AS sort_at
      FROM leaderboard l
      WHERE l.player_id = ${playerId}
    )
    SELECT
      me.*,
      (
        SELECT COUNT(*)::int
        FROM leaderboard b
        WHERE b.score > me.score
           OR (b.score = me.score AND b.clips > me.clips)
           OR (b.score = me.score AND b.clips = me.clips AND b.achieved_at < me.sort_at)
      ) + 1 AS rank
    FROM me
  `;

  if (rows.length === 0) return null;
  const row = rows[0] as any;
  const rank = Number(row.rank) || 1;
  return {
    entry: toEntry(row as RawLeaderboardRow, rank, playerId),
    rank,
  };
}

export async function fetchDailyPlayerEntry(
  playerId: string,
  day: string
): Promise<{ entry: LeaderboardEntry; rank: number } | null> {
  const rows = await sql`
    WITH me AS (
      SELECT
        d.player_id,
        p.callsign,
        d.score,
        d.clips,
        COALESCE(d.skin, p.equipped_skin, 'classic') AS skin,
        to_char(d.achieved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS achieved_at,
        d.achieved_at AS sort_at
      FROM daily_leaderboard d
      JOIN players p ON p.id = d.player_id
      WHERE d.player_id = ${playerId}
        AND d.day = ${day}::date
        AND (p.firebase_uid IS NOT NULL OR p.email IS NOT NULL)
    )
    SELECT
      me.*,
      (
        SELECT COUNT(*)::int
        FROM daily_leaderboard b
        WHERE b.day = ${day}::date
          AND (
            b.score > me.score
            OR (b.score = me.score AND b.clips > me.clips)
            OR (b.score = me.score AND b.clips = me.clips AND b.achieved_at < me.sort_at)
          )
      ) + 1 AS rank
    FROM me
  `;

  if (rows.length === 0) return null;
  const row = rows[0] as any;
  const rank = Number(row.rank) || 1;
  return {
    entry: toEntry(row as RawLeaderboardRow, rank, playerId),
    rank,
  };
}

/**
 * Player totals are display-only. Caching them for a few seconds keeps the
 * board affordable at a million rows without ever caching a rank: competitive
 * positions are still computed from the live tables on every request.
 *
 * The cache is bounded so an instance can never grow without limit.
 */
const COUNT_CACHE_TTL_MS = 15_000;
const COUNT_CACHE_MAX_ENTRIES = 256;
const countCache = new Map<string, { count: number; expiresAt: number }>();

async function cachedCount(key: string, load: () => Promise<number>): Promise<number> {
  const now = Date.now();
  const cached = countCache.get(key);
  if (cached && cached.expiresAt > now) return cached.count;

  const count = await load();

  if (countCache.size >= COUNT_CACHE_MAX_ENTRIES) {
    for (const [entryKey, entry] of countCache) {
      if (entry.expiresAt <= now) countCache.delete(entryKey);
    }
    while (countCache.size >= COUNT_CACHE_MAX_ENTRIES) {
      const oldest = countCache.keys().next().value;
      if (oldest === undefined) break;
      countCache.delete(oldest);
    }
  }
  countCache.set(key, { count, expiresAt: now + COUNT_CACHE_TTL_MS });
  return count;
}

export async function countAllTimePlayers(): Promise<number> {
  // Invariant: leaderboard contains exactly the eligible pilots with a verified
  // flight, one row each. Counting the much smaller derived table avoids a join
  // with players on every leaderboard request.
  return cachedCount('all-time', async () => {
    const rows = await sql`
      SELECT COUNT(*)::int AS count
      FROM leaderboard
    `;
    return Number(rows[0]?.count) || 0;
  });
}

export async function countDailyPlayers(day: string): Promise<number> {
  // daily_leaderboard is likewise maintained only for eligible pilots.
  return cachedCount(`daily:${day}`, async () => {
    const rows = await sql`
      SELECT COUNT(*)::int AS count
      FROM daily_leaderboard
      WHERE day = ${day}::date
    `;
    return Number(rows[0]?.count) || 0;
  });
}

/**
 * Keep the denormalized display name in sync after a pilot renames themselves.
 *
 * The all-time query deliberately does not join players, so this must run for
 * every callsign change. The callsign is read from players in the same
 * statement: a concurrent rename therefore cannot be overwritten by a stale
 * value captured earlier in an HTTP request.
 */
export async function updateLeaderboardCallsign(playerId: string): Promise<void> {
  await sql`
    UPDATE leaderboard l
    SET callsign = p.callsign
    FROM players p
    WHERE l.player_id = ${playerId}
      AND p.id = l.player_id
  `;
}

/**
 * Rebuild a pilot's derived leaderboard rows from their verified flights.
 *
 * A pilot can become eligible after playing as a guest (sign-in links the same
 * player row). Without this refresh those already-verified flights would be
 * missing from both boards until the pilot happened to fly again.
 *
 * The statements are upserts, so they are safe to run against a live table and
 * can never downgrade a better concurrent submission.
 */
export async function refreshPlayerLeaderboard(playerId: string): Promise<void> {
  const playerRows = await sql`
    SELECT callsign, firebase_uid, email
    FROM players
    WHERE id = ${playerId}
  `;
  const player = playerRows[0];
  if (!player) return;

  if (!player.firebase_uid && !player.email) {
    await sql`DELETE FROM leaderboard WHERE player_id = ${playerId}`;
    await sql`DELETE FROM daily_leaderboard WHERE player_id = ${playerId}`;
    return;
  }

  await sql`
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
    WHERE f.player_id = ${playerId}
      AND f.verified = true
      AND f.verification_version >= 2
      AND (p.firebase_uid IS NOT NULL OR p.email IS NOT NULL)
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
  `;

  await sql`
    INSERT INTO daily_leaderboard (day, player_id, score, clips, skin, flight_id, achieved_at)
    SELECT
      best.day,
      best.player_id,
      best.score,
      best.clips,
      best.skin,
      best.flight_id,
      best.achieved_at
    FROM (
      SELECT DISTINCT ON (day)
        (f.created_at AT TIME ZONE 'UTC')::date AS day,
        f.player_id,
        f.score,
        COALESCE(f.clips_collected, 0) AS clips,
        f.skin_used AS skin,
        f.id AS flight_id,
        f.created_at AS achieved_at
      FROM flights f
      JOIN players p ON p.id = f.player_id
      WHERE f.player_id = ${playerId}
        AND f.verified = true
        AND f.verification_version >= 2
        AND (p.firebase_uid IS NOT NULL OR p.email IS NOT NULL)
      ORDER BY
        day,
        f.score DESC,
        COALESCE(f.clips_collected, 0) DESC,
        f.created_at ASC,
        f.id ASC
    ) AS best
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
  `;

  // A rename is not a better score, so the guarded upserts above intentionally
  // leave the existing row untouched. Apply the display name separately.
  await updateLeaderboardCallsign(playerId);
}

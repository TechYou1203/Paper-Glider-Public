import { Router, Response } from 'express';
import { sql } from '../db.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { utcDayString } from '../time.js';

const router = Router();

interface ChallengeDefinition {
  id: string;
  type: 'pass_pencils' | 'collect_clips' | 'reach_score';
  title: string;
  description: string;
  target: number;
  reward: number;
}

interface PlayerMetrics {
  bestScore: number;
  totalClips: number;
}

function generateDailyChallenges(dateStr: string): ChallengeDefinition[] {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash << 5) - hash + dateStr.charCodeAt(i);
    hash |= 0;
  }
  const absHash = Math.abs(hash);

  const passTarget = 12 + (absHash % 8);
  const clipTarget = 15 + ((absHash >> 2) % 10);
  const scoreTarget = 20 + ((absHash >> 4) % 15);

  return [
    {
      id: `pass_pencils_${dateStr}`,
      type: 'pass_pencils',
      title: 'Pencil Dodger',
      description: `Glide through ${passTarget} pencil barriers in a single flight.`,
      target: passTarget,
      reward: 10,
    },
    {
      id: `collect_clips_${dateStr}`,
      type: 'collect_clips',
      title: 'Stationery Scavenger',
      description: `Collect ${clipTarget} golden paperclips today.`,
      target: clipTarget,
      reward: 15,
    },
    {
      id: `reach_score_${dateStr}`,
      type: 'reach_score',
      title: 'Master Aeronaut',
      description: `Reach a flight score of ${scoreTarget} points.`,
      target: scoreTarget,
      reward: 25,
    },
  ];
}

async function fetchMetrics(playerId: string, day: string): Promise<PlayerMetrics> {
  const rows = await sql`
    SELECT
      COALESCE(MAX(score), 0)::int AS best_score,
      COALESCE(SUM(clips_collected), 0)::int AS total_clips
    FROM flights
    WHERE player_id = ${playerId}
      AND verified = true
      AND verification_version >= 2
      AND (created_at AT TIME ZONE 'UTC')::date = ${day}::date
  `;
  return {
    bestScore: Number(rows[0]?.best_score) || 0,
    totalClips: Number(rows[0]?.total_clips) || 0,
  };
}

function currentCountFor(challenge: ChallengeDefinition, metrics: PlayerMetrics): number {
  if (challenge.type === 'collect_clips') return metrics.totalClips;
  return metrics.bestScore;
}

function toResponse(
  challenge: ChallengeDefinition,
  progress: { currentCount: number; completed: boolean; claimed: boolean }
) {
  return {
    id: challenge.id,
    type: challenge.type,
    title: challenge.title,
    description: challenge.description,
    target: challenge.target,
    targetCount: challenge.target,
    reward: challenge.reward,
    rewardClips: challenge.reward,
    currentCount: progress.currentCount,
    completed: progress.completed,
    claimed: progress.claimed,
  };
}

async function syncProgress(
  playerId: string,
  challenges: ChallengeDefinition[],
  day: string,
  metrics: PlayerMetrics
): Promise<Array<{ id: string; currentCount: number; completed: boolean; claimed: boolean }>> {
  const result: Array<{ id: string; currentCount: number; completed: boolean; claimed: boolean }> = [];

  for (const challenge of challenges) {
    const currentCount = currentCountFor(challenge, metrics);
    const completed = currentCount >= challenge.target;
    const rows = await sql`
      INSERT INTO daily_challenge_progress (
        player_id, challenge_date, challenge_id, current_count, completed
      )
      VALUES (${playerId}, ${day}::date, ${challenge.id}, ${currentCount}, ${completed})
      ON CONFLICT (player_id, challenge_id) DO UPDATE SET
        challenge_date = EXCLUDED.challenge_date,
        current_count = EXCLUDED.current_count,
        completed = EXCLUDED.completed OR daily_challenge_progress.claimed
      RETURNING current_count, completed, claimed
    `;
    const row = rows[0];
    result.push({
      id: challenge.id,
      currentCount: Number(row?.current_count) || 0,
      completed: Boolean(row?.completed),
      claimed: Boolean(row?.claimed),
    });
  }

  return result;
}

// GET /api/challenges/daily — Get today's challenges with player progress
router.get('/daily', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const player = req.player!;
    const day = utcDayString();
    const definitions = generateDailyChallenges(day);
    const metrics = await fetchMetrics(player.id, day);
    const progress = await syncProgress(player.id, definitions, day, metrics);

    const byId = new Map(progress.map((entry) => [entry.id, entry]));
    res.json({
      date: day,
      challenges: definitions.map((challenge) =>
        toResponse(challenge, byId.get(challenge.id) ?? {
          currentCount: 0,
          completed: false,
          claimed: false,
        })
      ),
    });
  } catch (error) {
    console.error('Daily challenges error:', error);
    res.status(500).json({ error: 'Failed to fetch daily challenges' });
  }
});

// POST /api/challenges/:id/claim — Claim a completed challenge reward
router.post('/:id/claim', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const player = req.player!;
    const challengeId = req.params.id;
    const day = utcDayString();
    const definitions = generateDailyChallenges(day);
    const challenge = definitions.find((entry) => entry.id === challengeId);

    if (!challenge) {
      res.status(404).json({ error: 'Challenge not found' });
      return;
    }

    const metrics = await fetchMetrics(player.id, day);
    const currentCount = currentCountFor(challenge, metrics);
    const completed = currentCount >= challenge.target;

    await syncProgress(player.id, definitions, day, metrics);

    if (!completed) {
      res.status(400).json({ error: 'Challenge not yet completed' });
      return;
    }

    // Marking the reward claimed and granting the paperclips must happen in one
    // statement. Otherwise a process failure between the two steps would consume
    // the reward without paying it.
    const claimed = await sql`
      WITH claimed AS (
        UPDATE daily_challenge_progress
        SET claimed = true
        WHERE player_id = ${player.id}
          AND challenge_id = ${challengeId}
          AND completed = true
          AND claimed = false
        RETURNING id
      ), rewarded AS (
        UPDATE players
        SET paperclips = COALESCE(paperclips, 0) + ${challenge.reward},
            updated_at = NOW()
        WHERE id = ${player.id}
          AND EXISTS (SELECT 1 FROM claimed)
        RETURNING paperclips
      )
      SELECT
        (SELECT COUNT(*)::int FROM claimed) AS claimed_count,
        (SELECT paperclips FROM rewarded) AS paperclips
    `;

    if (Number(claimed[0]?.claimed_count) !== 1) {
      res.status(409).json({ error: 'Reward already claimed' });
      return;
    }

    res.json({
      success: true,
      claimed: true,
      reward: challenge.reward,
      paperclips: Number(claimed[0]?.paperclips) || 0,
    });
  } catch (error) {
    console.error('Claim challenge error:', error);
    res.status(500).json({ error: 'Failed to claim challenge reward' });
  }
});

export default router;

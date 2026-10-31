import { Router, Response } from 'express';
import { sql } from '../db.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

interface DailyChallenge {
  id: string;
  type: string;
  description: string;
  target: number;
  reward: number;
  currentCount: number;
  completed: boolean;
  claimed: boolean;
}

function generateDailyChallenges(dateStr: string): Array<{
  id: string;
  type: string;
  description: string;
  target: number;
  reward: number;
}> {
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
      description: `Pass ${passTarget} pencils in a single flight`,
      target: passTarget,
      reward: 10,
    },
    {
      id: `collect_clips_${dateStr}`,
      type: 'collect_clips',
      description: `Collect ${clipTarget} paperclips in a single flight`,
      target: clipTarget,
      reward: 15,
    },
    {
      id: `reach_score_${dateStr}`,
      type: 'reach_score',
      description: `Reach a score of ${scoreTarget}`,
      target: scoreTarget,
      reward: 25,
    },
  ];
}

function getTodayDateStr(): string {
  return new Date().toISOString().split('T')[0];
}

// GET /api/challenges/daily — Get today's challenges with player progress
router.get('/daily', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const player = req.player!;
    const dateStr = getTodayDateStr();
    const challenges = generateDailyChallenges(dateStr);

    // Fetch player's progress for today's challenges
    const challengeIds = challenges.map((c) => c.id);
    const progressRows = await sql`
      SELECT challenge_id, current_count, completed, claimed
      FROM daily_challenge_progress
      WHERE player_id = ${player.id}
        AND challenge_date = CURRENT_DATE
        AND challenge_id = ANY(${challengeIds})
    `;

    const progressMap = new Map<string, { currentCount: number; completed: boolean; claimed: boolean }>();
    for (const row of progressRows) {
      progressMap.set(row.challenge_id, {
        currentCount: row.current_count,
        completed: row.completed,
        claimed: row.claimed,
      });
    }

    const result: DailyChallenge[] = challenges.map((c) => {
      const progress = progressMap.get(c.id);
      return {
        id: c.id,
        type: c.type,
        description: c.description,
        target: c.target,
        reward: c.reward,
        currentCount: progress?.currentCount ?? 0,
        completed: progress?.completed ?? false,
        claimed: progress?.claimed ?? false,
      };
    });

    res.json({ date: dateStr, challenges: result });
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
    const dateStr = getTodayDateStr();

    // Find the challenge definition
    const challenges = generateDailyChallenges(dateStr);
    const challenge = challenges.find((c) => c.id === challengeId);

    if (!challenge) {
      res.status(404).json({ error: 'Challenge not found' });
      return;
    }

    // Check player's progress
    const progressRows = await sql`
      SELECT id, completed, claimed
      FROM daily_challenge_progress
      WHERE player_id = ${player.id}
        AND challenge_id = ${challengeId}
        AND challenge_date = CURRENT_DATE
    `;

    if (progressRows.length === 0) {
      res.status(400).json({ error: 'No progress found for this challenge' });
      return;
    }

    const progress = progressRows[0];

    if (!progress.completed) {
      res.status(400).json({ error: 'Challenge not yet completed' });
      return;
    }

    if (progress.claimed) {
      res.status(409).json({ error: 'Reward already claimed' });
      return;
    }

    // Mark as claimed
    await sql`
      UPDATE daily_challenge_progress
      SET claimed = true
      WHERE id = ${progress.id}
    `;

    // Add reward paperclips to player
    const updatedPlayer = await sql`
      UPDATE players
      SET paperclips = paperclips + ${challenge.reward}, updated_at = NOW()
      WHERE id = ${player.id}
      RETURNING paperclips
    `;

    res.json({
      claimed: true,
      reward: challenge.reward,
      paperclips: updatedPlayer[0].paperclips,
    });
  } catch (error) {
    console.error('Claim challenge error:', error);
    res.status(500).json({ error: 'Failed to claim challenge reward' });
  }
});

export default router;

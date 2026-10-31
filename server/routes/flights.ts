import { Router, Response } from 'express';
import crypto from 'crypto';
import { sql } from '../db.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { verifyReplay } from '../replay.js';

const router = Router();

// POST /api/flights/start — Start a new flight session
router.post('/start', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const player = req.player!;
    const seed = crypto.randomUUID();

    const rows = await sql`
      INSERT INTO flights (player_id, seed, skin_used)
      VALUES (${player.id}, ${seed}, ${player.equippedSkin})
      RETURNING id
    `;

    const flight = rows[0];

    res.status(201).json({
      sessionId: flight.id,
      seed,
    });
  } catch (error) {
    console.error('Flight start error:', error);
    res.status(500).json({ error: 'Failed to start flight' });
  }
});

// POST /api/flights/:id/submit — Submit flight results
router.post('/:id/submit', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const player = req.player!;
    const flightId = req.params.id;
    const { score, clipsCollected, inputs, durationMs, worldWidth, worldHeight } = req.body;

    if (score == null || !Array.isArray(inputs)) {
      res.status(400).json({ error: 'Missing required fields: score, inputs' });
      return;
    }

    // Look up the flight
    const flightRows = await sql`
      SELECT id, player_id, seed, score, verified
      FROM flights
      WHERE id = ${flightId}
    `;

    if (flightRows.length === 0) {
      res.status(404).json({ error: 'Flight not found' });
      return;
    }

    const flight = flightRows[0];

    // Verify it belongs to the authenticated player
    if (flight.player_id !== player.id) {
      res.status(403).json({ error: 'Flight does not belong to this player' });
      return;
    }

    // Verify the flight hasn't been submitted already
    if (flight.score !== 0 || flight.verified) {
      res.status(409).json({ error: 'Flight already submitted' });
      return;
    }

    // Run replay verifier with client's actual screen dimensions
    const replayResult = verifyReplay(
      flight.seed,
      inputs,
      score,
      flight.skin_used || 'classic',
      Number(worldWidth) || 800,
      Number(worldHeight) || 600
    );

    if (!replayResult.valid) {
      // Mark flight as unverified with the claimed score for auditing
      await sql`
        UPDATE flights
        SET score = ${score}, input_log = ${JSON.stringify(inputs)},
            duration_ms = ${durationMs || 0}, verified = false
        WHERE id = ${flightId}
      `;

      res.json({
        verified: false,
        score: replayResult.replayScore,
        message: 'Score verification failed',
      });
      return;
    }

    // Mark flight as verified
    const verifiedScore = replayResult.replayScore;
    const clipsCount = clipsCollected || 0;

    await sql`
      UPDATE flights
      SET score = ${verifiedScore}, clips_collected = ${clipsCount},
          input_log = ${JSON.stringify(inputs)}, duration_ms = ${durationMs || 0},
          verified = true
      WHERE id = ${flightId}
    `;

    // Update or insert into leaderboard (keep only player's best score)
    const existingLb = await sql`
      SELECT id, score FROM leaderboard
      WHERE player_id = ${player.id}
    `;

    if (existingLb.length === 0) {
      await sql`
        INSERT INTO leaderboard (player_id, callsign, score, clips, skin, flight_id)
        VALUES (${player.id}, ${player.callsign}, ${verifiedScore}, ${clipsCount}, ${player.equippedSkin}, ${flightId})
      `;
    } else if (verifiedScore > existingLb[0].score) {
      await sql`
        UPDATE leaderboard
        SET score = ${verifiedScore}, clips = ${clipsCount}, skin = ${player.equippedSkin},
            flight_id = ${flightId}, callsign = ${player.callsign}, achieved_at = NOW()
        WHERE player_id = ${player.id}
      `;
    }

    // Update player paperclips
    await sql`
      UPDATE players
      SET paperclips = paperclips + ${clipsCount}, updated_at = NOW()
      WHERE id = ${player.id}
    `;

    // Get the player's rank
    const rankRows = await sql`
      SELECT COUNT(*) + 1 AS rank
      FROM leaderboard
      WHERE score > (
        SELECT COALESCE(MAX(score), 0) FROM leaderboard WHERE player_id = ${player.id}
      )
    `;

    const rank = parseInt(rankRows[0].rank);

    res.json({
      verified: true,
      score: verifiedScore,
      rank,
    });
  } catch (error) {
    console.error('Flight submit error:', error);
    res.status(500).json({ error: 'Failed to submit flight' });
  }
});

export default router;

/**
 * One-time repair for flights written before window dimensions were stored.
 *
 * The old verifier accepted client-supplied worldWidth/worldHeight and trusted
 * client-supplied clips. The dimensions were never persisted, so those flights
 * could not be replayed later and are not safe to rank. This script recovers a
 * viewport that reproduces the stored server-verified score (and, where
 * possible, the stored clips), then marks the flight as version 2 so it can be
 * used by the official boards.
 *
 * Legacy rows that cannot be reproduced are marked version 0 and stay out of
 * leaderboard/daily queries. Player paperclip balances are intentionally left
 * untouched: this repairs ranking data, not historical currency grants.
 *
 * Run with `npm run db:backfill-legacy` (add `-- --dry-run` to preview).
 */
import 'dotenv/config';
import { sql } from './db.js';
import { verifyReplay, type ReplayInput } from './replay.js';

const CANDIDATE_WIDTHS = [
  1280, 1366, 1440, 1536, 1920, 800, 1024, 1152, 1269, 390, 360, 412, 414, 393,
  375, 420, 430, 480, 512, 540, 551, 552, 553, 555, 568, 576, 600, 640, 667, 700,
  720, 736, 768, 812, 844, 896, 900, 932, 960, 966, 1000, 1080, 1100, 1200, 1300,
  1400, 1512, 1600, 1680, 1728, 1800, 2048, 2560, 3440, 320,
];

const CANDIDATE_HEIGHTS = [
  720, 768, 900, 864, 1080, 600, 700, 761, 844, 640, 915, 932, 852, 667, 680, 740,
  800, 824, 937, 982, 1000, 1050, 1117, 1200, 1440, 550, 588, 606, 620, 625, 650,
  675, 690, 710, 730, 737, 750, 760, 780, 790, 810, 816, 830, 850, 870, 890, 910,
  930, 950, 960, 970, 990, 1024, 320, 360, 375, 390, 412, 430, 480, 512, 540, 568,
  576,
];

interface LegacyFlight {
  id: string;
  seed: string;
  score: number;
  clips_collected: number | null;
  skin_used: string | null;
  input_log: unknown;
  callsign: string;
  firebase_uid: string | null;
  email: string | null;
}

interface ResolvedFlight {
  width: number;
  height: number;
  score: number;
  clips: number;
  exactClips: boolean;
}

const dimensions: Array<[number, number]> = (() => {
  const seen = new Set<string>();
  const result: Array<[number, number]> = [];
  for (const width of CANDIDATE_WIDTHS) {
    for (const height of CANDIDATE_HEIGHTS) {
      const key = `${width}x${height}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push([width, height]);
    }
  }
  return result;
})();

function replayInputs(raw: unknown): ReplayInput[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter(
    (input): input is ReplayInput =>
      Boolean(input) &&
      typeof input === 'object' &&
      ((input as ReplayInput).action === 'flap' ||
        ((input as ReplayInput).action === 'resize' &&
          Number.isFinite((input as any).width) &&
          Number.isFinite((input as any).height)))
  );
}

function resolve(flight: LegacyFlight, inputs: ReplayInput[]): ResolvedFlight | null {
  let bestScoreMatch: ResolvedFlight | null = null;

  for (const [width, height] of dimensions) {
    const result = verifyReplay(
      flight.seed,
      inputs,
      -1,
      flight.skin_used || 'classic',
      width,
      height
    );

    if (result.replayScore !== Number(flight.score)) continue;

    const candidate: ResolvedFlight = {
      width,
      height,
      score: result.replayScore,
      clips: result.replayClips,
      exactClips: result.replayClips === Number(flight.clips_collected ?? 0),
    };

    if (candidate.exactClips) return candidate;

    // No exact clip match yet. Keep the interpretation that credits the most
    // actually-achievable clips for the same verified score.
    if (!bestScoreMatch || candidate.clips > bestScoreMatch.clips) {
      bestScoreMatch = candidate;
    }
  }

  return bestScoreMatch;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const flights = (await sql`
    SELECT f.id, f.seed, f.score, f.clips_collected, f.skin_used, f.input_log,
           p.callsign, p.firebase_uid, p.email
    FROM flights f
    JOIN players p ON p.id = f.player_id
    WHERE f.verified = true
      AND f.verification_version < 2
    ORDER BY f.score DESC, f.clips_collected DESC, f.created_at ASC
  `) as unknown as LegacyFlight[];

  console.log(
    `${dryRun ? 'Previewing' : 'Backfilling'} ${flights.length} legacy verified flights...`
  );

  let exact = 0;
  let scoreOnly = 0;
  let skipped = 0;

  for (const flight of flights) {
    const inputs = replayInputs(flight.input_log);
    if (!inputs) {
      skipped++;
      console.log(`SKIP  ${flight.callsign} ${flight.score}/${flight.clips_collected ?? 0} (no replay log)`);
      if (!dryRun) {
        await sql`UPDATE flights SET verification_version = 0 WHERE id = ${flight.id}`;
      }
      continue;
    }

    const resolved = resolve(flight, inputs);
    if (!resolved) {
      skipped++;
      console.log(`SKIP  ${flight.callsign} ${flight.score}/${flight.clips_collected ?? 0} (unreproducible)`);
      if (!dryRun) {
        await sql`UPDATE flights SET verification_version = 0 WHERE id = ${flight.id}`;
      }
      continue;
    }

    const eligible = Boolean(flight.firebase_uid || flight.email);
    if (!resolved.exactClips && !eligible) {
      // Guest flights are not ranked. Leave ambiguous clips unverified rather
      // than inventing a score/clip pair if the pilot signs in later.
      skipped++;
      console.log(`SKIP  ${flight.callsign} ${flight.score}/${flight.clips_collected ?? 0} (guest, clips ambiguous)`);
      if (!dryRun) {
        await sql`UPDATE flights SET verification_version = 0 WHERE id = ${flight.id}`;
      }
      continue;
    }

    if (resolved.exactClips) exact++;
    else scoreOnly++;

    console.log(
      `${resolved.exactClips ? 'OK   ' : 'CLIP '} ${flight.callsign} ` +
      `${resolved.score}/${resolved.clips} at ${resolved.width}x${resolved.height}` +
      (resolved.exactClips ? '' : ` (claimed ${flight.clips_collected ?? 0})`)
    );

    if (!dryRun) {
      await sql`
        UPDATE flights
        SET world_width = ${resolved.width},
            world_height = ${resolved.height},
            clips_collected = ${resolved.clips},
            verification_version = 2
        WHERE id = ${flight.id}
      `;
    }
  }

  console.log(
    JSON.stringify({ total: flights.length, exact, scoreOnly, skipped, dryRun })
  );

  if (!dryRun) {
    console.log('Run `npm run db:migrate` next to rebuild the official boards.');
  }
}

main().catch((error) => {
  console.error('Legacy flight backfill failed:', error);
  process.exitCode = 1;
});

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_token VARCHAR(64) UNIQUE NOT NULL,
  firebase_uid VARCHAR(128) UNIQUE,
  callsign VARCHAR(32) NOT NULL,
  equipped_skin VARCHAR(32) DEFAULT 'classic',
  paperclips INTEGER DEFAULT 0,
  unlocked_skins TEXT[] DEFAULT ARRAY['classic'],
  sound_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE players ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR(128) UNIQUE;
ALTER TABLE players ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE players ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(32) DEFAULT 'guest';

CREATE TABLE IF NOT EXISTS google_accounts (
  email VARCHAR(255) PRIMARY KEY,
  firebase_uid VARCHAR(128),
  callsign VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  seed VARCHAR(64) NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  clips_collected INTEGER DEFAULT 0,
  skin_used VARCHAR(32),
  input_log JSONB,
  verified BOOLEAN DEFAULT false,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE flights ADD COLUMN IF NOT EXISTS world_width INTEGER;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS world_height INTEGER;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

-- Version 2 means the replay was verified against dimensions that are stored
-- with the flight, so score *and* clips can be reproduced later. Version 1 is
-- legacy data written before dimensions were durable and must be re-verified by
-- server/backfillLegacyFlights.ts before it may affect an official board.
ALTER TABLE flights ADD COLUMN IF NOT EXISTS verification_version INTEGER NOT NULL DEFAULT 2;

UPDATE flights
SET verification_version = 1
WHERE verification_version = 2
  AND world_width IS NULL;

CREATE TABLE IF NOT EXISTS leaderboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  callsign VARCHAR(32) NOT NULL,
  score INTEGER NOT NULL,
  clips INTEGER DEFAULT 0,
  skin VARCHAR(32),
  flight_id UUID REFERENCES flights(id) ON DELETE SET NULL,
  achieved_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_challenge_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  challenge_date DATE NOT NULL DEFAULT CURRENT_DATE,
  challenge_id VARCHAR(64) NOT NULL,
  current_count INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  claimed BOOLEAN DEFAULT false,
  UNIQUE(player_id, challenge_id)
);

CREATE TABLE IF NOT EXISTS verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  username VARCHAR(64) NOT NULL,
  code VARCHAR(16) NOT NULL,
  type VARCHAR(32) NOT NULL DEFAULT 'signup',
  password_hash VARCHAR(255),
  expires_at TIMESTAMPTZ NOT NULL,
  verified BOOLEAN DEFAULT false,
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recover email addresses for legacy OTP accounts. The update is deliberately
-- conservative: it only links when exactly one pilot with that callsign can be
-- identified, so a duplicate callsign can never assign an email to the wrong
-- account.
UPDATE players p
SET email = v.email,
    auth_provider = CASE
      WHEN p.auth_provider IS NULL OR p.auth_provider = 'guest' THEN 'otp'
      ELSE p.auth_provider
    END,
    updated_at = NOW()
FROM (
  SELECT DISTINCT ON (LOWER(email))
    LOWER(email) AS email,
    LOWER(username) AS username
  FROM verification_codes
  WHERE verified = true
  ORDER BY LOWER(email), created_at DESC
) v
WHERE p.email IS NULL
  AND p.firebase_uid IS NULL
  AND LOWER(p.callsign) = v.username
  AND NOT EXISTS (
    SELECT 1 FROM players p3
    WHERE LOWER(p3.email) = v.email
  )
  AND (
    SELECT COUNT(*)
    FROM players p2
    WHERE p2.email IS NULL
      AND p2.firebase_uid IS NULL
      AND LOWER(p2.callsign) = v.username
  ) = 1;

CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(score DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_date ON leaderboard(achieved_at DESC);
CREATE INDEX IF NOT EXISTS idx_flights_player ON flights(player_id);
CREATE INDEX IF NOT EXISTS idx_flights_player_seed ON flights(player_id, seed);
CREATE INDEX IF NOT EXISTS idx_flights_verified_date ON flights(verified, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_flights_player_best
  ON flights(player_id, score DESC, clips_collected DESC, created_at ASC)
  WHERE verified = true AND verification_version >= 2;
CREATE INDEX IF NOT EXISTS idx_daily_player_date ON daily_challenge_progress(player_id, challenge_date);
CREATE INDEX IF NOT EXISTS idx_players_token ON players(guest_token);
CREATE INDEX IF NOT EXISTS idx_players_firebase_uid ON players(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_verification_email_code ON verification_codes(email, code);
CREATE INDEX IF NOT EXISTS idx_verification_expires ON verification_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_google_accounts_email ON google_accounts(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_players_email ON players(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_players_auth_provider ON players(auth_provider);

-- One email can identify at most one pilot. The partial index allows guests to
-- exist without an email while still preventing duplicate verified accounts.
CREATE UNIQUE INDEX IF NOT EXISTS uq_players_email_lower
  ON players (LOWER(email)) WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_players_firebase_uid
  ON players (firebase_uid) WHERE firebase_uid IS NOT NULL;

-- A client-generated seed identifies one flight attempt. Deduplicate historical
-- rows before enforcing that invariant so a replay cannot be submitted twice.
DELETE FROM flights f
WHERE f.player_id IS NOT NULL
  AND f.id IN (
    SELECT id FROM (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY player_id, seed
          ORDER BY verified DESC, score DESC, created_at ASC, id ASC
        ) AS row_num
      FROM flights
      WHERE player_id IS NOT NULL
    ) ranked
    WHERE row_num > 1
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_flights_player_seed ON flights(player_id, seed);

-- The official leaderboard is derived data. Rebuild it from verified flights
-- belonging to signed-in pilots so stale callsigns, inflated clips and
-- duplicate rows can never survive a migration.
DELETE FROM leaderboard;

ALTER TABLE leaderboard ALTER COLUMN player_id SET NOT NULL;
ALTER TABLE leaderboard ALTER COLUMN clips SET NOT NULL;

INSERT INTO leaderboard (player_id, callsign, score, clips, skin, flight_id, achieved_at)
SELECT DISTINCT ON (f.player_id)
  f.player_id,
  p.callsign,
  f.score,
  COALESCE(f.clips_collected, 0),
  f.skin_used,
  f.id,
  f.created_at
FROM flights f
JOIN players p ON p.id = f.player_id
WHERE f.verified = true
  AND f.verification_version >= 2
  AND (p.firebase_uid IS NOT NULL OR p.email IS NOT NULL)
ORDER BY
  f.player_id,
  f.score DESC,
  COALESCE(f.clips_collected, 0) DESC,
  f.created_at ASC,
  f.id ASC;

CREATE UNIQUE INDEX IF NOT EXISTS uq_leaderboard_player_id ON leaderboard(player_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_rank
  ON leaderboard(score DESC, clips DESC, achieved_at ASC, player_id ASC);

-- The all-time board only contains eligible pilots. Keep the table honouring
-- that invariant even if an account is altered outside the API.
DELETE FROM leaderboard l
USING players p
WHERE l.player_id = p.id
  AND p.firebase_uid IS NULL
  AND p.email IS NULL;

-- Per-day best scores. Deriving the daily board from the all-time row (as the
-- old code did) hides every flight that is not also a pilot's lifetime record.
CREATE TABLE IF NOT EXISTS daily_leaderboard (
  day DATE NOT NULL,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  clips INTEGER NOT NULL DEFAULT 0,
  skin VARCHAR(32),
  flight_id UUID REFERENCES flights(id) ON DELETE SET NULL,
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (day, player_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_leaderboard_rank
  ON daily_leaderboard(day, score DESC, clips DESC, achieved_at ASC, player_id ASC);

-- Like the all-time board this is fully derived data, so rebuild it from the
-- verified flight log. A full delete also removes rows written by older,
-- less-strict verification code that the guarded upsert below cannot downgrade.
DELETE FROM daily_leaderboard;

INSERT INTO daily_leaderboard (day, player_id, score, clips, skin, flight_id, achieved_at)
SELECT DISTINCT ON (f.player_id, (f.created_at AT TIME ZONE 'UTC')::date)
  (f.created_at AT TIME ZONE 'UTC')::date,
  f.player_id,
  f.score,
  COALESCE(f.clips_collected, 0),
  f.skin_used,
  f.id,
  f.created_at
FROM flights f
JOIN players p ON p.id = f.player_id
WHERE f.verified = true
  AND f.verification_version >= 2
  AND (p.firebase_uid IS NOT NULL OR p.email IS NOT NULL)
ORDER BY
  f.player_id,
  (f.created_at AT TIME ZONE 'UTC')::date,
  f.score DESC,
  COALESCE(f.clips_collected, 0) DESC,
  f.created_at ASC,
  f.id ASC
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
       AND EXCLUDED.achieved_at < daily_leaderboard.achieved_at);

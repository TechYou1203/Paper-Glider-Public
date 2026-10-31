CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_token VARCHAR(64) UNIQUE NOT NULL,
  callsign VARCHAR(32) NOT NULL,
  equipped_skin VARCHAR(32) DEFAULT 'classic',
  paperclips INTEGER DEFAULT 0,
  unlocked_skins TEXT[] DEFAULT ARRAY['classic'],
  sound_enabled BOOLEAN DEFAULT true,
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

CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(score DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_date ON leaderboard(achieved_at DESC);
CREATE INDEX IF NOT EXISTS idx_flights_player ON flights(player_id);
CREATE INDEX IF NOT EXISTS idx_daily_player_date ON daily_challenge_progress(player_id, challenge_date);
CREATE INDEX IF NOT EXISTS idx_players_token ON players(guest_token);

/**
 * Game rules, Daily challenges, Skins, and Leaderboard routines
 */

import { DailyChallenge, GliderSkin, GliderStats, LeaderboardEntry, UserStats } from './types';

export const DEFAULT_SKINS: GliderSkin[] = [
  {
    id: 'classic',
    name: 'Origami Standard',
    description: 'Clean folded bond paper. Balanced and reliable.',
    primaryColor: '#ffffff',
    foldColor: '#e2e8f0',
    accentColor: '#3b82f6',
    lineStyle: 'plain',
    unlockedByDefault: true,
    costInClips: 0,
  },
  {
    id: 'graph',
    name: 'Quad Grapher',
    description: 'Folded from an engineer’s 5mm math grid notebook.',
    primaryColor: '#f8fafc',
    foldColor: '#cbd5e1',
    accentColor: '#0ea5e9',
    lineStyle: 'grid',
    unlockedByDefault: false,
    costInClips: 15,
  },
  {
    id: 'postit',
    name: 'Neon Post-It',
    description: 'Vibrant sticky-note fold that catches schoolroom drafts.',
    primaryColor: '#fef08a',
    foldColor: '#fde047',
    accentColor: '#eab308',
    lineStyle: 'postit',
    unlockedByDefault: false,
    costInClips: 25,
  },
  {
    id: 'blueprint',
    name: 'Aero Blueprint',
    description: 'Cyanotype paper with precision drafting schematics.',
    primaryColor: '#1e3a8a',
    foldColor: '#172554',
    accentColor: '#93c5fd',
    lineStyle: 'blueprint',
    unlockedByDefault: false,
    costInClips: 40,
  },
  {
    id: 'airmail',
    name: 'Airmail Express',
    description: 'Classic red & blue chevron border airmail stationery.',
    primaryColor: '#fffbeb',
    foldColor: '#fef3c7',
    accentColor: '#ef4444',
    lineStyle: 'creased',
    unlockedByDefault: false,
    costInClips: 60,
  },
  {
    id: 'gold',
    name: 'Golden Parchment',
    description: 'Lustrous foil origami reserved for sketchbook masters.',
    primaryColor: '#fbbf24',
    foldColor: '#d97706',
    accentColor: '#fef08a',
    lineStyle: 'gold',
    unlockedByDefault: false,
    costInClips: 100,
  },
];

/**
 * Returns today's ISO date string: YYYY-MM-DD
 */
export function getTodayDateString(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * Generates deterministic daily challenges for a given date string (e.g. "2026-10-24")
 */
export function generateDailyChallenges(dateStr: string): DailyChallenge[] {
  // Simple deterministic hash from date
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash << 5) - hash + dateStr.charCodeAt(i);
    hash |= 0;
  }
  const absHash = Math.abs(hash);

  const targets = [
    { target: 12 + (absHash % 8), reward: 10 },
    { target: 15 + ((absHash >> 2) % 10), reward: 15 },
    { target: 20 + ((absHash >> 4) % 15), reward: 25 },
  ];

  return [
    {
      id: `${dateStr}-pencils`,
      title: 'Pencil Dodger',
      description: `Glide through ${targets[0].target} pencil barriers in a single flight.`,
      targetCount: targets[0].target,
      currentCount: 0,
      rewardClips: targets[0].reward,
      completed: false,
      claimed: false,
      type: 'pass_pencils',
    },
    {
      id: `${dateStr}-clips`,
      title: 'Stationery Scavenger',
      description: `Collect ${targets[1].target} golden paperclips today.`,
      targetCount: targets[1].target,
      currentCount: 0,
      rewardClips: targets[1].reward,
      completed: false,
      claimed: false,
      type: 'collect_clips',
    },
    {
      id: `${dateStr}-score`,
      title: 'Master Aeronaut',
      description: `Reach a flight score of ${targets[2].target} points.`,
      targetCount: targets[2].target,
      currentCount: 0,
      rewardClips: targets[2].reward,
      completed: false,
      claimed: false,
      type: 'reach_score',
    },
  ];
}

/**
 * Initial leaderboard entries (empty — only real player records are shown)
 */
export const SEED_LEADERBOARD: LeaderboardEntry[] = [];

const STORAGE_KEY = 'paper_glider_user_stats';
const LEADERBOARD_KEY = 'paper_glider_leaderboard';

export function getInitialUserStats(): UserStats {
  const today = getTodayDateString();
  return {
    highScore: 0,
    totalFlights: 0,
    totalPencilsCleared: 0,
    paperclips: 0,
    selectedSkin: 'classic',
    unlockedSkins: ['classic'],
    callsign: 'Pilot' + Math.floor(100 + Math.random() * 900),
    soundEnabled: true,
    dailyChallengeDate: today,
    completedDailyChallenges: [],
    claimedDailyChallenges: [],
  };
}

export function loadUserStats(): UserStats {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const today = getTodayDateString();
      if (parsed.dailyChallengeDate !== today) {
        parsed.dailyChallengeDate = today;
        parsed.completedDailyChallenges = [];
        parsed.claimedDailyChallenges = [];
      }
      return { ...getInitialUserStats(), ...parsed };
    }
  } catch {
    // fallback
  }
  return getInitialUserStats();
}

export function saveUserStats(stats: UserStats): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // localStorage might fail in restricted iframe
  }
}

export function loadLeaderboard(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        // Filter out any legacy fake seed entries (lb-*)
        const realEntries = list.filter(
          (entry: LeaderboardEntry) => entry && typeof entry.id === 'string' && !entry.id.startsWith('lb-')
        );
        if (realEntries.length !== list.length) {
          localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(realEntries));
        }
        return realEntries;
      }
    }
  } catch {
    // fallback
  }
  return [];
}

export function recordScoreToLeaderboard(
  callsign: string,
  score: number,
  clips: number,
  planeSkin: string
): LeaderboardEntry[] {
  const current = loadLeaderboard();
  const today = getTodayDateString();

  // Check if player already has an entry
  const cleanCallsign = callsign.trim() || 'Player';
  const existingIdx = current.findIndex((e) => e.isPlayer || e.callsign === cleanCallsign);
  if (existingIdx >= 0) {
    current[existingIdx].callsign = cleanCallsign;
    if (score >= current[existingIdx].score) {
      current[existingIdx].score = score;
      current[existingIdx].clips = Math.max(current[existingIdx].clips, clips);
      current[existingIdx].date = today;
      current[existingIdx].planeSkin = planeSkin;
    }
  } else {
    current.push({
      id: 'player-' + Date.now(),
      callsign: cleanCallsign,
      score,
      clips,
      date: today,
      planeSkin,
      country: '🌟',
      isPlayer: true,
    });
  }

  // Sort descending by score
  current.sort((a, b) => b.score - a.score);

  try {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(current));
  } catch {
    // ignore
  }

  return current;
}


// ─── Glider Aerodynamic Stat Profiles ───────────────────────
// Each skin has distinct handling characteristics.

export const GLIDER_STATS: Record<string, GliderStats> = {
  classic: {
    gravity: 920,
    flapImpulse: -360,
    maxFallSpeed: 540,
    maxRiseSpeed: -420,
    horizontalSpeed: 210,
    pitchUpAngle: -0.55,
    pitchDownAngle: 0.65,
  },
  graph: {
    // Engineer's precision: tighter control, slightly faster fall
    gravity: 950,
    flapImpulse: -370,
    maxFallSpeed: 560,
    maxRiseSpeed: -430,
    horizontalSpeed: 215,
    pitchUpAngle: -0.50,
    pitchDownAngle: 0.60,
  },
  postit: {
    // Light and floaty: low gravity, gentle flap, slow fall
    gravity: 820,
    flapImpulse: -320,
    maxFallSpeed: 480,
    maxRiseSpeed: -380,
    horizontalSpeed: 195,
    pitchUpAngle: -0.60,
    pitchDownAngle: 0.55,
  },
  blueprint: {
    // Heavy aerodynamic: strong flap, fast fall, high speed
    gravity: 980,
    flapImpulse: -400,
    maxFallSpeed: 600,
    maxRiseSpeed: -460,
    horizontalSpeed: 230,
    pitchUpAngle: -0.48,
    pitchDownAngle: 0.70,
  },
  airmail: {
    // Express delivery: fastest horizontal, balanced vertical
    gravity: 900,
    flapImpulse: -350,
    maxFallSpeed: 530,
    maxRiseSpeed: -410,
    horizontalSpeed: 245,
    pitchUpAngle: -0.52,
    pitchDownAngle: 0.62,
  },
  gold: {
    // Master-tier: best all-around stats
    gravity: 880,
    flapImpulse: -380,
    maxFallSpeed: 500,
    maxRiseSpeed: -440,
    horizontalSpeed: 225,
    pitchUpAngle: -0.58,
    pitchDownAngle: 0.58,
  },
};

/**
 * Get the aerodynamic stats for a given skin ID.
 * Falls back to classic stats if not found.
 */
export function getGliderStats(skinId: string): GliderStats {
  return GLIDER_STATS[skinId] ?? GLIDER_STATS.classic;
}

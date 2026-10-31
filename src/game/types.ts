/**
 * Core types for Paper Glider
 */

export type GameState = 'title' | 'playing' | 'paused' | 'gameover';

export interface GliderSkin {
  id: string;
  name: string;
  description: string;
  primaryColor: string;
  foldColor: string;
  accentColor: string;
  lineStyle: 'plain' | 'grid' | 'blueprint' | 'creased' | 'gold' | 'postit';
  unlockedByDefault: boolean;
  costInClips: number;
}

export interface PlayerPlane {
  x: number;
  y: number;
  vx: number;
  vy: number;
  pitch: number; // in radians, -0.6 to +0.8
  targetPitch: number;
  radius: number;
  trail: Array<{ x: number; y: number; alpha: number; width: number }>;
  isAlive: boolean;
  wingspan: number;
}

export interface PencilBarrier {
  id: number;
  x: number;
  width: number;
  gapY: number; // center of vertical opening
  gapHeight: number;
  colorType: 'yellow' | 'blue' | 'red' | 'green' | 'graphite';
  brandLabel: string;
  hasClip: boolean;
  clipCollected: boolean;
  clipY: number;
  clipX?: number;
  passed: boolean;
  speedY?: number; // for dynamic moving obstacles
}

export interface PaperclipPickup {
  x: number;
  y: number;
  collected: boolean;
  id: number;
  rotation: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
  rotation: number;
  vRot: number;
  shape: 'wood' | 'lead' | 'paper' | 'sparkle';
}

export interface DailyChallenge {
  id: string;
  title: string;
  description: string;
  targetCount: number;
  currentCount: number;
  rewardClips: number;
  completed: boolean;
  claimed: boolean;
  type: 'pass_pencils' | 'collect_clips' | 'reach_score' | 'no_flap_streak';
}

export interface LeaderboardEntry {
  id: string;
  callsign: string;
  score: number;
  clips: number;
  date: string;
  planeSkin: string;
  country: string;
  isPlayer?: boolean;
}

export interface PilotUser {
  uid: string;
  username: string;
  email?: string;
  photoURL?: string;
  isGuest?: boolean;
}

export interface UserStats {
  highScore: number;
  totalFlights: number;
  totalPencilsCleared: number;
  paperclips: number;
  selectedSkin: string;
  unlockedSkins: string[];
  callsign: string;
  soundEnabled: boolean;
  dailyChallengeDate: string;
  completedDailyChallenges: string[];
  claimedDailyChallenges: string[];
  dailyChallengeProgress?: Record<string, number>;
}


// ─── Biome System ───────────────────────────────────────────

export type BiomeType = 'classroom' | 'art_studio' | 'architects_desk';

export interface BiomeConfig {
  id: BiomeType;
  name: string;
  paperBg: string;
  paperGrainFrom: string;
  paperGrainMid: string;
  paperGrainTo: string;
  lineColor: string;
  marginColor: string;
  holeFill: string;
  holeStroke: string;
  spiralColor: string;
  pencilPalette: Array<'yellow' | 'blue' | 'red' | 'green' | 'graphite'>;
  doodleOpacity: number;
  /** Score threshold to transition to this biome */
  transitionAtScore: number;
}

// ─── Power-Up System ────────────────────────────────────────

export type PowerUpType = 'magnet' | 'shield' | 'slingshot';

export interface PowerUp {
  id: number;
  type: PowerUpType;
  x: number;
  y: number;
  collected: boolean;
  rotation: number;
}

export interface ActivePowerUp {
  type: PowerUpType;
  remainingTime: number;
  duration: number;
}

// ─── Glider Aerodynamic Profiles ────────────────────────────

export interface GliderStats {
  gravity: number;
  flapImpulse: number;
  maxFallSpeed: number;
  maxRiseSpeed: number;
  horizontalSpeed: number;
  pitchUpAngle: number;
  pitchDownAngle: number;
}

// ─── Flight Session (Anti-Cheat) ────────────────────────────

export interface FlightSession extends FlightStartResponse {
  startedAt: number;
  frameCount: number;
  inputs: FlightInput[];
}

export interface FlightInput {
  /** Zero-based fixed tick; at most one flap per tick. */
  frame: number;
  action: 'flap';
}

// ─── Server API Types ───────────────────────────────────────

export interface ServerPlayer {
  id: string;
  callsign: string;
  equippedSkin: string;
  paperclips: number;
  unlockedSkins: string[];
  soundEnabled: boolean;
  highScore: number;
  totalFlights: number;
  totalPencilsCleared: number;
}

export interface PlayerResponse {
  player: ServerPlayer;
}

export interface GuestAuthResponse extends PlayerResponse {
  token: string;
}

export interface ServerLeaderboardEntry {
  playerId: string;
  rank: number;
  callsign: string;
  score: number;
  clips: number;
  skin: string;
  achievedAt: string;
  isPlayer: boolean;
}

export interface LeaderboardResponse {
  entries: ServerLeaderboardEntry[];
}

export interface DailyChallengesResponse {
  date: string;
  challenges: DailyChallenge[];
}

export interface ChallengeClaimResponse extends DailyChallengesResponse, PlayerResponse {}

export interface FlightStartResponse {
  sessionId: string;
  seed: string;
  skinId: string;
  simulationVersion: string;
  worldWidth: number;
  worldHeight: number;
  expiresAt: string;
}

export interface FlightSubmitRequest {
  frameCount: number;
  inputs: FlightInput[];
  score: number;
  clipsCollected: number;
}

export interface FlightSubmitResponse {
  verified: boolean;
  score: number;
  clipsCollected: number;
  rank: number | null;
  player?: ServerPlayer;
  message?: string;
}

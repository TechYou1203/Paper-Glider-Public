/**
 * API client for Paper Glider backend.
 * Falls back to localStorage when the server is unavailable.
 */

import type {
  FlightStartResponse,
  FlightSubmitResponse,
  ServerLeaderboardEntry,
  ServerPlayer,
  FlightInput,
  DailyChallenge,
} from '../game/types';

const API_BASE = '/api';
const TOKEN_KEY = 'paper_glider_auth_token';

let cachedToken: string | null = null;
let serverOnline: boolean | null = null;

// ─── Helpers ────────────────────────────────────────────────

function getToken(): string | null {
  if (cachedToken) return cachedToken;
  if (typeof localStorage !== 'undefined') {
    cachedToken = localStorage.getItem(TOKEN_KEY);
  }
  return cachedToken;
}

function setToken(token: string) {
  cachedToken = token;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(TOKEN_KEY, token);
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T | null> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });
    if (!res.ok) {
      console.warn(`API ${path} returned ${res.status}`);
      return null;
    }
    serverOnline = true;
    return (await res.json()) as T;
  } catch {
    serverOnline = false;
    return null;
  }
}

// ─── Server Availability ────────────────────────────────────

export async function checkServerHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    serverOnline = res.ok;
  } catch {
    serverOnline = false;
  }
  return serverOnline ?? false;
}

export function isServerOnline(): boolean {
  return serverOnline ?? false;
}

// ─── Auth ───────────────────────────────────────────────────

export async function registerGuest(callsign?: string): Promise<ServerPlayer | null> {
  const data = await apiFetch<{ token: string; player: ServerPlayer }>('/auth/guest', {
    method: 'POST',
    body: JSON.stringify({ callsign }),
  });
  if (data?.token) {
    setToken(data.token);
    return data.player;
  }
  return null;
}

export async function loginWithToken(): Promise<ServerPlayer | null> {
  const token = getToken();
  if (!token) return null;

  const data = await apiFetch<{ player: ServerPlayer }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  return data?.player ?? null;
}

/**
 * Initialize auth: try to login with existing token, or register a new guest.
 */
export async function initAuth(callsign?: string): Promise<ServerPlayer | null> {
  const online = await checkServerHealth();
  if (!online) return null;

  // Try existing token first
  let player = await loginWithToken();
  if (player) return player;

  // Register new guest
  player = await registerGuest(callsign);
  return player;
}

// ─── Flights ────────────────────────────────────────────────

export async function startFlight(): Promise<FlightStartResponse | null> {
  return apiFetch<FlightStartResponse>('/flights/start', {
    method: 'POST',
  });
}

export async function submitFlight(
  sessionId: string,
  score: number,
  clipsCollected: number,
  inputs: FlightInput[],
  durationMs: number,
  worldWidth?: number,
  worldHeight?: number
): Promise<FlightSubmitResponse | null> {
  return apiFetch<FlightSubmitResponse>(`/flights/${sessionId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ score, clipsCollected, inputs, durationMs, worldWidth, worldHeight }),
  });
}

// ─── Leaderboard ────────────────────────────────────────────

export async function fetchLeaderboard(
  limit = 100
): Promise<ServerLeaderboardEntry[] | null> {
  return apiFetch<ServerLeaderboardEntry[]>(`/leaderboard?limit=${limit}`);
}

export async function fetchDailyLeaderboard(
  limit = 100
): Promise<ServerLeaderboardEntry[] | null> {
  return apiFetch<ServerLeaderboardEntry[]>(`/leaderboard/daily?limit=${limit}`);
}

// ─── Challenges ─────────────────────────────────────────────

export async function fetchDailyChallenges(): Promise<DailyChallenge[] | null> {
  return apiFetch<DailyChallenge[]>('/challenges/daily');
}

export async function claimChallenge(
  challengeId: string
): Promise<{ paperclips: number } | null> {
  return apiFetch<{ paperclips: number }>(`/challenges/${challengeId}/claim`, {
    method: 'POST',
  });
}

// ─── Inventory ──────────────────────────────────────────────

export async function unlockSkin(
  skinId: string,
  cost: number
): Promise<ServerPlayer | null> {
  return apiFetch<ServerPlayer>('/inventory/unlock', {
    method: 'POST',
    body: JSON.stringify({ skinId, cost }),
  });
}

export async function equipSkin(skinId: string): Promise<ServerPlayer | null> {
  return apiFetch<ServerPlayer>('/inventory/equip', {
    method: 'PATCH',
    body: JSON.stringify({ skinId }),
  });
}

export async function updateSettings(
  settings: { callsign?: string; soundEnabled?: boolean }
): Promise<ServerPlayer | null> {
  return apiFetch<ServerPlayer>('/inventory/settings', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}

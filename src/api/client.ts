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

type StatusListener = (online: boolean) => void;
const statusListeners = new Set<StatusListener>();

export function onServerStatusChange(listener: StatusListener): () => void {
  statusListeners.add(listener);
  if (serverOnline !== null) {
    listener(serverOnline);
  }
  return () => {
    statusListeners.delete(listener);
  };
}

function updateServerStatus(online: boolean) {
  if (serverOnline !== online) {
    serverOnline = online;
    statusListeners.forEach((listener) => {
      try {
        listener(online);
      } catch (err) {
        console.error('Error in server status listener:', err);
      }
    });
  }
}

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
    ...((options.headers as Record<string, string>) || {}),
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
    updateServerStatus(true);
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`API fetch error on ${path}:`, err);
    updateServerStatus(false);
    return null;
  }
}

// ─── Server Availability ────────────────────────────────────

export async function checkServerHealth(timeoutMs = 9000): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      updateServerStatus(false);
      return false;
    }
    const data = await res.json().catch(() => null);

    if (data?.database === 'missing_database_url') {
      console.warn('[Paper Glider] DATABASE_URL is not configured in environment variables. Running in Local Storage mode.');
    } else if (data?.database === 'connecting_or_error') {
      console.warn('[Paper Glider] Neon database waking up or encountered error:', data?.dbError);
    }

    const isConnected = Boolean(data?.database === 'connected');
    updateServerStatus(isConnected);
    return isConnected;
  } catch {
    updateServerStatus(false);
    return false;
  }
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
    updateServerStatus(true);
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
  if (data?.player) {
    updateServerStatus(true);
    return data.player;
  }
  return null;
}

/**
 * Initialize auth: try to login with existing token, or register a new guest.
 * Includes cold-start resilience for serverless functions & Neon DB sleep states.
 */
export async function initAuth(callsign?: string): Promise<ServerPlayer | null> {
  let online = await checkServerHealth(9000);

  // If initial check fails, retry once after 2.5s for cold start wake-up
  if (!online) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    online = await checkServerHealth(9000);
  }

  if (!online) {
    updateServerStatus(false);
    return null;
  }

  // Try existing token first
  let player = await loginWithToken();
  if (player) {
    updateServerStatus(true);
    return player;
  }

  // Register new guest
  player = await registerGuest(callsign);
  if (player) {
    updateServerStatus(true);
  }
  return player;
}

/**
 * Re-trigger server connection and auth on-demand (e.g., when clicking the status pill).
 */
export async function reconnectServer(callsign?: string): Promise<ServerPlayer | null> {
  return initAuth(callsign);
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
  const data = await apiFetch<{ entries: ServerLeaderboardEntry[] } | ServerLeaderboardEntry[]>(
    `/leaderboard?limit=${limit}`
  );
  if (!data) return null;
  if (Array.isArray(data)) return data;
  return data.entries ?? null;
}

export async function fetchDailyLeaderboard(
  limit = 100
): Promise<ServerLeaderboardEntry[] | null> {
  const data = await apiFetch<{ entries: ServerLeaderboardEntry[] } | ServerLeaderboardEntry[]>(
    `/leaderboard/daily?limit=${limit}`
  );
  if (!data) return null;
  if (Array.isArray(data)) return data;
  return data.entries ?? null;
}

// ─── Challenges ─────────────────────────────────────────────

export async function fetchDailyChallenges(): Promise<DailyChallenge[] | null> {
  const data = await apiFetch<{ challenges: DailyChallenge[] } | DailyChallenge[]>(
    '/challenges/daily'
  );
  if (!data) return null;
  if (Array.isArray(data)) return data;
  return data.challenges ?? null;
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
  const data = await apiFetch<{ player: ServerPlayer } | ServerPlayer>('/inventory/unlock', {
    method: 'POST',
    body: JSON.stringify({ skinId, cost }),
  });
  if (!data) return null;
  return 'player' in data ? data.player : data;
}

export async function equipSkin(skinId: string): Promise<ServerPlayer | null> {
  const data = await apiFetch<{ player: ServerPlayer } | ServerPlayer>('/inventory/equip', {
    method: 'PATCH',
    body: JSON.stringify({ skinId }),
  });
  if (!data) return null;
  return 'player' in data ? data.player : data;
}

export async function updateSettings(
  settings: { callsign?: string; soundEnabled?: boolean }
): Promise<ServerPlayer | null> {
  const data = await apiFetch<{ player: ServerPlayer } | ServerPlayer>('/inventory/settings', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
  if (!data) return null;
  return 'player' in data ? data.player : data;
}

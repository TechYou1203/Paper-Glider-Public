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

export function getToken(): string | null {
  if (cachedToken) return cachedToken;
  if (typeof localStorage !== 'undefined') {
    cachedToken = localStorage.getItem(TOKEN_KEY);
  }
  return cachedToken;
}

export function setToken(token: string) {
  cachedToken = token;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(TOKEN_KEY, token);
  }
}

export function clearToken() {
  cachedToken = null;
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY);
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
      if (res.status === 401) {
        clearToken();
      }
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

export interface ServerConnectResult {
  success: boolean;
  message: string;
  databaseStatus?: 'connected' | 'missing_database_url' | 'connecting_or_error' | 'unreachable';
  player?: ServerPlayer | null;
}

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

    const isConnected = Boolean(data?.status === 'ok' && (data?.database === 'connected' || data?.database === undefined));
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
  try {
    const res = await fetch(`${API_BASE}/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callsign }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (data?.token) {
      setToken(data.token);
      updateServerStatus(true);
      return data.player;
    }
    return null;
  } catch {
    return null;
  }
}

export async function loginWithToken(): Promise<ServerPlayer | null> {
  const token = getToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ token }),
    });
    if (res.status === 401 || !res.ok) {
      clearToken();
      return null;
    }
    const data = await res.json().catch(() => null);
    if (data?.player) {
      updateServerStatus(true);
      return data.player;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Re-trigger server connection and auth with detailed feedback for users and UI.
 */
export async function reconnectServerWithDetails(callsign?: string): Promise<ServerConnectResult> {
  let data: any = null;
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(9000) });
    if (!res.ok) {
      updateServerStatus(false);
      return {
        success: false,
        databaseStatus: 'unreachable',
        message: `API returned HTTP ${res.status}. Serverless API is not ready.`,
      };
    }
    data = await res.json().catch(() => null);
  } catch (err: any) {
    updateServerStatus(false);
    return {
      success: false,
      databaseStatus: 'unreachable',
      message: 'Cannot reach backend server. Please verify your internet connection and Vercel deployment.',
    };
  }

  if (data?.database === 'missing_database_url') {
    updateServerStatus(false);
    return {
      success: false,
      databaseStatus: 'missing_database_url',
      message: 'DATABASE_URL is not configured in Vercel. Please add DATABASE_URL in Vercel Settings → Environment Variables.',
    };
  }

  if (data?.database === 'connecting_or_error') {
    updateServerStatus(false);
    return {
      success: false,
      databaseStatus: 'connecting_or_error',
      message: `Neon DB is waking up (${data?.dbError || 'cold start'}). Please retry in 5 seconds.`,
    };
  }

  // Neon DB is connected or reachable
  let player = await loginWithToken();
  if (player) {
    updateServerStatus(true);
    return {
      success: true,
      databaseStatus: 'connected',
      message: 'Connected to Neon DB! Cloud flight verification active.',
      player,
    };
  }

  // Token was absent or expired; register/sync with pilot's callsign
  clearToken();
  player = await registerGuest(callsign);
  if (player) {
    updateServerStatus(true);
    return {
      success: true,
      databaseStatus: 'connected',
      message: 'Connected to Neon DB! Cloud flight verification active.',
      player,
    };
  }

  updateServerStatus(false);
  return {
    success: false,
    databaseStatus: 'connected',
    message: 'Neon DB is online, but creating player session failed. Please retry.',
  };
}

/**
 * Initialize auth: try to login with existing token, or register a new guest.
 * Includes cold-start resilience for serverless functions & Neon DB sleep states.
 */
export async function initAuth(callsign?: string): Promise<ServerPlayer | null> {
  const result = await reconnectServerWithDetails(callsign);
  return result.player || null;
}

/**
 * Re-trigger server connection and auth on-demand.
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

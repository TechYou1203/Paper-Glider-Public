/**
 * API client for Paper Glider backend.
 * Falls back to localStorage when the server is unavailable.
 */

import type {
  FlightStartResponse,
  FlightSubmitResponse,
  LeaderboardResponse,
  ServerLeaderboardEntry,
  ServerPlayer,
  FlightInput,
  DailyChallenge,
} from '../game/types';

const API_BASE = typeof window !== 'undefined' ? '/api' : 'http://localhost:3001/api';
const TOKEN_KEY = 'paper_glider_auth_token';
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * A stalled request must never leave the flight deck waiting forever. Callers
 * that need a shorter budget pass their own signal.
 */
function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

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

function authHeaders(): Record<string, string> {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
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
    const res = await fetchWithTimeout(`${API_BASE}${path}`, {
      ...options,
      headers,
    });
    // Any HTTP response proves the API is reachable, even if it is a rejection.
    // Callers use isServerOnline() to decide whether a local fallback is safe.
    updateServerStatus(true);
    if (!res.ok) {
      if (res.status === 401) {
        clearToken();
      }
      console.warn(`API ${path} returned ${res.status}`);
      return null;
    }
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
    const res = await fetchWithTimeout(`${API_BASE}/health`, { signal: AbortSignal.timeout(timeoutMs) });
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
    const res = await fetchWithTimeout(`${API_BASE}/auth/guest`, {
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

export interface TokenSessionResult {
  player: ServerPlayer | null;
  /** The token is absent or the server definitively rejected it. */
  invalid: boolean;
  /** False only when the server could not be reached at all. */
  reachable: boolean;
}

/**
 * Distinguishes "this token is no longer valid" from "the server had a bad
 * moment". Only the former may clear the saved session; a transient 5xx or
 * network failure must never replace a pilot with a fresh guest account.
 */
export async function loginWithTokenDetailed(): Promise<TokenSessionResult> {
  const token = getToken();
  if (!token) return { player: null, invalid: true, reachable: true };

  try {
    const res = await fetchWithTimeout(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ token }),
    });
    updateServerStatus(true);

    if (res.status === 401) {
      clearToken();
      return { player: null, invalid: true, reachable: true };
    }
    if (!res.ok) {
      return { player: null, invalid: false, reachable: true };
    }
    const data = await res.json().catch(() => null);
    if (data?.player) {
      return { player: data.player, invalid: false, reachable: true };
    }
    return { player: null, invalid: false, reachable: true };
  } catch {
    updateServerStatus(false);
    return { player: null, invalid: false, reachable: false };
  }
}

export async function loginWithToken(): Promise<ServerPlayer | null> {
  return (await loginWithTokenDetailed()).player;
}

/**
 * Re-trigger server connection and auth with detailed feedback for users and UI.
 */
export async function reconnectServerWithDetails(
  callsign?: string,
  allowCreateGuest = true
): Promise<ServerConnectResult> {
  let data: any = null;
  try {
    const res = await fetchWithTimeout(`${API_BASE}/health`, { signal: AbortSignal.timeout(9000) });
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
  const session = await loginWithTokenDetailed();
  if (session.player) {
    updateServerStatus(true);
    return {
      success: true,
      databaseStatus: 'connected',
      message: 'Connected to Neon DB! Cloud flight verification active.',
      player: session.player,
    };
  }

  // A 5xx or network error is not proof that the token is bad. Preserve the
  // pilot's session and let them retry instead of creating a new guest row.
  if (!session.invalid) {
    updateServerStatus(session.reachable);
    return {
      success: false,
      databaseStatus: session.reachable ? 'connected' : 'unreachable',
      message: session.reachable
        ? 'Your saved session could not be verified right now. Please retry; your progress is safe.'
        : 'Cannot reach backend server. Please verify your internet connection and Vercel deployment.',
    };
  }

  // Token was absent or expired; register/sync with pilot's callsign
  clearToken();
  if (!allowCreateGuest) {
    updateServerStatus(false);
    return {
      success: false,
      databaseStatus: 'connected',
      message: 'No active server session was found. Please sign in again.',
    };
  }

  const player = await registerGuest(callsign);
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

/**
 * Sync signed-in Firebase pilot with Neon DB.
 */
export async function syncPilotAccount(
  firebaseUid: string,
  callsign: string,
  email?: string,
  authProvider?: string,
  idToken?: string
): Promise<ServerPlayer | null> {
  const data = await apiFetch<{ token: string; player: ServerPlayer }>('/auth/sync-pilot', {
    method: 'POST',
    body: JSON.stringify({ firebaseUid, callsign, email, authProvider, idToken }),
  });
  if (data?.token) {
    setToken(data.token);
    updateServerStatus(true);
    return data.player;
  }
  return null;
}

/**
 * Check if an email or username is registered via Google.
 */
export async function checkIsGoogleAccount(identifier: string): Promise<boolean> {
  try {
    const data = await apiFetch<{ isGoogle: boolean; message?: string }>(
      `/auth/check-google?identifier=${encodeURIComponent(identifier)}`
    );
    return Boolean(data?.isGoogle);
  } catch {
    return false;
  }
}

/**
 * Permanently delete pilot account and all associated records from Neon DB.
 */
export async function deleteServerAccount(): Promise<boolean> {
  const token = getToken();
  try {
    const res = await fetchWithTimeout(`${API_BASE}/auth/account`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (res.ok) {
      clearToken();
      return true;
    }
    if (res.status === 401) {
      clearToken();
    }
    console.warn(`Delete server account returned ${res.status}`);
    return false;
  } catch (err) {
    console.warn('Delete server account failed:', err);
    return false;
  }
}

/**
 * Send 6-digit email verification code with username validation.
 */
export async function sendVerificationCode(
  email: string,
  username: string,
  type: 'signup' | 'login' = 'signup'
): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  email?: string;
  username?: string;
}> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/auth/send-verification-code`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email, username, type }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: data?.error || 'Failed to send verification code.' };
    }
    return {
      success: true,
      message: data.message,
      email: data.email,
      username: data.username,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error sending verification code.' };
  }
}

/**
 * Verify 6-digit code sent to pilot's email address.
 */
export async function verifyAuthCode(
  email: string,
  code: string,
  username?: string,
  type: 'signup' | 'login' = 'signup'
): Promise<{
  success: boolean;
  token?: string;
  player?: ServerPlayer;
  error?: string;
}> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/auth/verify-code`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email, code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: data?.error || 'Invalid verification code.' };
    }
    if (data.token) {
      setToken(data.token);
      updateServerStatus(true);
    }
    return {
      success: true,
      token: data.token,
      player: data.player,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error verifying code.' };
  }
}

// ─── Flights ────────────────────────────────────────────────

export async function startFlight(
  seed?: string,
  skinUsed?: string,
  worldWidth?: number,
  worldHeight?: number
): Promise<FlightStartResponse | null> {
  return apiFetch<FlightStartResponse>('/flights/start', {
    method: 'POST',
    body: JSON.stringify({ seed, skinUsed, worldWidth, worldHeight }),
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

export async function submitFlightDirect(
  seed: string,
  score: number,
  clipsCollected: number,
  inputs: FlightInput[],
  durationMs: number,
  skinUsed?: string,
  worldWidth?: number,
  worldHeight?: number
): Promise<FlightSubmitResponse | null> {
  return apiFetch<FlightSubmitResponse>('/flights/direct-submit', {
    method: 'POST',
    body: JSON.stringify({ seed, score, clipsCollected, inputs, durationMs, skinUsed, worldWidth, worldHeight }),
  });
}

// ─── Leaderboard ────────────────────────────────────────────

export async function fetchLeaderboard(
  limit = 100
): Promise<LeaderboardResponse | null> {
  const data = await apiFetch<LeaderboardResponse | ServerLeaderboardEntry[]>(
    `/leaderboard?limit=${limit}`
  );
  if (!data) return null;
  if (Array.isArray(data)) {
    return {
      entries: data,
      playerEntry: null,
      playerRank: null,
      totalPlayers: data.length,
      date: new Date().toISOString().slice(0, 10),
    };
  }
  return {
    entries: Array.isArray(data.entries) ? data.entries : [],
    playerEntry: data.playerEntry ?? null,
    playerRank: data.playerRank ?? null,
    totalPlayers: Number(data.totalPlayers) || 0,
    date: data.date || new Date().toISOString().slice(0, 10),
  };
}

export async function fetchDailyLeaderboard(
  limit = 100,
  date?: string
): Promise<LeaderboardResponse | null> {
  // The daily endpoint is date-addressed. Always send the UTC day explicitly so
  // the "Today" tab can never request an argument-less URL and come back empty.
  const day = date || new Date().toISOString().slice(0, 10);
  const query = new URLSearchParams({ limit: String(limit), date: day });
  const data = await apiFetch<LeaderboardResponse | ServerLeaderboardEntry[]>(
    `/leaderboard/daily?${query.toString()}`
  );
  if (!data) return null;
  if (Array.isArray(data)) {
    return {
      entries: data,
      playerEntry: null,
      playerRank: null,
      totalPlayers: data.length,
      date: date || new Date().toISOString().slice(0, 10),
    };
  }
  return {
    entries: Array.isArray(data.entries) ? data.entries : [],
    playerEntry: data.playerEntry ?? null,
    playerRank: data.playerRank ?? null,
    totalPlayers: Number(data.totalPlayers) || 0,
    date: data.date || date || new Date().toISOString().slice(0, 10),
  };
}

// ─── Challenges ─────────────────────────────────────────────

interface RawDailyChallenge {
  id: string;
  type?: DailyChallenge['type'];
  title?: string;
  description?: string;
  target?: number;
  targetCount?: number;
  reward?: number;
  rewardClips?: number;
  currentCount?: number;
  completed?: boolean;
  claimed?: boolean;
}

const CHALLENGE_TITLES: Record<string, string> = {
  pass_pencils: 'Pencil Dodger',
  collect_clips: 'Stationery Scavenger',
  reach_score: 'Master Aeronaut',
};

export async function fetchDailyChallenges(): Promise<DailyChallenge[] | null> {
  const data = await apiFetch<{ challenges: RawDailyChallenge[] } | RawDailyChallenge[]>(
    '/challenges/daily'
  );
  if (!data) return null;
  const list = Array.isArray(data) ? data : data.challenges;
  if (!Array.isArray(list)) return null;

  return list.map((challenge) => {
    const type = (challenge.type || 'pass_pencils') as DailyChallenge['type'];
    const target = Number(challenge.targetCount ?? challenge.target) || 0;
    return {
      id: challenge.id,
      type,
      title: challenge.title || CHALLENGE_TITLES[type] || 'Daily Challenge',
      description: challenge.description || '',
      targetCount: target,
      currentCount: Number(challenge.currentCount) || 0,
      rewardClips: Number(challenge.rewardClips ?? challenge.reward) || 0,
      completed: Boolean(challenge.completed),
      claimed: Boolean(challenge.claimed),
    };
  });
}

export async function claimChallenge(
  challengeId: string
): Promise<{ paperclips: number; reward?: number } | null> {
  return apiFetch<{ paperclips: number; reward?: number }>(`/challenges/${challengeId}/claim`, {
    method: 'POST',
  });
}

// ─── Inventory ──────────────────────────────────────────────

export async function unlockSkin(skinId: string): Promise<ServerPlayer | null> {
  const data = await apiFetch<{ player: ServerPlayer } | ServerPlayer>('/inventory/unlock', {
    method: 'POST',
    body: JSON.stringify({ skinId }),
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

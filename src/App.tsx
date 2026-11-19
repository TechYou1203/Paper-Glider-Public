import React, { useEffect, useRef, useState, useCallback } from 'react';
import { TitleScreen } from './components/TitleScreen';
import { HUD } from './components/HUD';
import { PauseModal } from './components/PauseModal';
import { GameOverModal } from './components/GameOverModal';
import { LeaderboardModal } from './components/LeaderboardModal';
import { DailyChallengesModal } from './components/DailyChallengesModal';
import { HangarModal } from './components/HangarModal';
import { AuthModal } from './components/AuthModal';
import { AccountModal } from './components/AccountModal';
import {
  DailyChallenge,
  FlightInput,
  GameState,
  GliderSkin,
  LeaderboardEntry,
  Particle,
  PilotUser,
  ServerLeaderboardEntry,
  ServerPlayer,
  UserStats,
} from './game/types';
import {
  drawNotebookBackground,
  drawPaperPlane,
  drawParticles,
  drawPencilBarrier,
} from './game/renderer';
import {
  DEFAULT_SKINS,
  generateDailyChallenges,
  getInitialUserStats,
  getTodayDateString,
  loadUserStats,
  saveUserStats,
} from './game/rules';
import { sound } from './game/audio';
import { createFixedTimestep, advanceFixedTimestep, FixedTimestepState } from './game/fixedTimestep';
import { createParticlePool, ObjectPool } from './game/pool';
import { perlinShake } from './game/perlin';
import { getCurrentBiome, drawBiomeDoodles } from './game/biomes';
import { drawPowerUp, drawActivePowerUpHUD } from './game/powerups';
import {
  createFlightSimulation,
  stepFlightSimulation,
} from './game/simulation';
import {
  claimChallenge as apiClaimChallenge,
  clearToken,
  deleteServerAccount,
  equipSkin as apiEquipSkin,
  fetchDailyChallenges as apiFetchChallenges,
  fetchLeaderboard as apiFetchLeaderboard,
  initAuth,
  isServerOnline,
  loginWithToken,
  loginWithTokenDetailed,
  onServerStatusChange,
  reconnectServer,
  reconnectServerWithDetails,
  startFlight as apiStartFlight,
  submitFlight as apiSubmitFlight,
  submitFlightDirect as apiSubmitFlightDirect,
  syncPilotAccount,
  unlockSkin as apiUnlockSkin,
  updateSettings as apiUpdateSettings,
} from './api/client';
import {
  getCurrentSession,
  getFirebaseIdToken,
  logoutUser,
  deletePilotAccount,
  syncCloudStats,
  loadCloudStats,
  checkAndCompleteEmailLinkSignIn,
} from './services/firebase';

function mapServerLeaderboard(entries: ServerLeaderboardEntry[]): LeaderboardEntry[] {
  return entries.map((entry) => ({
    id: `server-${entry.playerId}`,
    playerId: entry.playerId,
    rank: entry.rank,
    callsign: entry.callsign,
    score: entry.score,
    clips: entry.clips,
    date: entry.achievedAt ? entry.achievedAt.split('T')[0] : getTodayDateString(),
    planeSkin: entry.skin || 'classic',
    country: '🌐',
    isPlayer: entry.isPlayer,
    achievedAt: entry.achievedAt,
  }));
}

/**
 * The Neon player row is authoritative whenever the API answers. Merging with
 * Math.max() would let a stale/tampered localStorage balance survive a refresh
 * even after the player spent those paperclips on another device.
 */
const GUEST_FLAG_KEY = 'paper_glider_is_guest';

/**
 * Storage can throw in restricted iframes and private browsing. Losing an
 * optional UI flag must never crash the game or block sign-in.
 */
function readLocalString(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function writeLocalString(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch {}
}

function removeLocalString(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  } catch {}
}

function withServerPlayer(prev: UserStats, player: ServerPlayer): UserStats {
  const unlocked = Array.isArray(player.unlockedSkins) && player.unlockedSkins.length > 0
    ? Array.from(new Set(['classic', ...player.unlockedSkins]))
    : prev.unlockedSkins;

  return {
    ...prev,
    callsign: player.callsign || prev.callsign,
    paperclips: typeof player.paperclips === 'number' ? player.paperclips : prev.paperclips,
    unlockedSkins: unlocked,
    selectedSkin: player.equippedSkin || prev.selectedSkin,
  };
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // High-level UI state
  const [gameState, setGameState] = useState<GameState>('title');
  const [hasStartedFlight, setHasStartedFlight] = useState<boolean>(false);
  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(0);
  const [flightClips, setFlightClips] = useState<number>(0);
  const [isNewBest, setIsNewBest] = useState<boolean>(false);
  const [userStats, setUserStats] = useState<UserStats>(getInitialStats());
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [challenges, setChallenges] = useState<DailyChallenge[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [verifiedRank, setVerifiedRank] = useState<number | null>(null);

  // Subscribe to backend status updates
  useEffect(() => {
    const unsub = onServerStatusChange((online) => {
      setIsOnline(online);
    });
    return unsub;
  }, []);

  // Authentication State
  const [currentUser, setCurrentUser] = useState<PilotUser | null>(() => getCurrentSession());
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | 'email-confirm'>('register');
  const [showAuthModal, setShowAuthModal] = useState<boolean>(() => {
    const session = getCurrentSession();
    const isGuest = readLocalString(GUEST_FLAG_KEY) === 'true';
    return !session && !isGuest;
  });

  // Modals visibility
  const [showLeaderboard, setShowLeaderboard] = useState<boolean>(false);
  const [showChallenges, setShowChallenges] = useState<boolean>(false);
  const [showHangar, setShowHangar] = useState<boolean>(false);
  const [showAccountModal, setShowAccountModal] = useState<boolean>(false);

  // Engine systems
  const particlePoolRef = useRef<ObjectPool<Particle>>(createParticlePool(100));
  const fixedTimestepRef = useRef<FixedTimestepState>(createFixedTimestep());

  function getInitialStats(): UserStats {
    if (typeof window !== 'undefined') {
      const session = getCurrentSession();
      if (session) {
        return loadUserStats();
      }
      return getInitialUserStats();
    }
    return getInitialUserStats();
  }

  // Active skin reference
  const selectedSkin =
    DEFAULT_SKINS.find((s) => s.id === userStats.selectedSkin) || DEFAULT_SKINS[0];

  // Ref mirror for the 60fps game loop
  const simRef = useRef({
    state: 'title' as GameState,
    sim: createFlightSimulation(
      'initial-seed',
      selectedSkin.id,
      typeof window !== 'undefined' ? window.innerWidth : 800,
      typeof window !== 'undefined' ? window.innerHeight : 600
    ),
    flightSessionId: null as string | null,
    flightStartTime: 0,
    inputs: [] as FlightInput[],
    wantsFlap: false,
    hasStartedFlight: false,
    isCrashHandled: false,
    cameraTrauma: 0,
    hitstopTimer: 0,
    canvasWidth: typeof window !== 'undefined' ? window.innerWidth : 800,
    canvasHeight: typeof window !== 'undefined' ? window.innerHeight : 600,
    flightWorldWidth: typeof window !== 'undefined' ? window.innerWidth : 800,
    flightWorldHeight: typeof window !== 'undefined' ? window.innerHeight : 600,
    skin: selectedSkin,
    stats: userStats,
    challenges: [] as DailyChallenge[],
  });

  // Sync state with simRef and body dataset
  useEffect(() => {
    simRef.current.state = gameState;
    document.body.dataset.state = gameState;
  }, [gameState]);

  useEffect(() => {
    simRef.current.skin = selectedSkin;
  }, [selectedSkin]);

  useEffect(() => {
    simRef.current.stats = userStats;
    setHighScore(userStats.highScore);
    sound.setMuted(!userStats.soundEnabled);
  }, [userStats]);

  useEffect(() => {
    simRef.current.challenges = challenges;
  }, [challenges]);

  // Load persistent stats and authenticate on boot
  useEffect(() => {
    const session = getCurrentSession();
    const loaded = session ? loadUserStats() : getInitialUserStats();
    if (!session) {
      removeLocalString('paper_glider_user_stats');
    }
    setUserStats(loaded);
    setHighScore(loaded.highScore);
    sound.setMuted(!loaded.soundEnabled);

    // The official board is server-owned. Never show legacy local rows (they
    // could contain unverified or stale scores) while the live board loads.
    setLeaderboard([]);

    const today = getTodayDateString();

    // Fetch official global leaderboard from Neon DB on boot
    apiFetchLeaderboard(100)
      .then((remoteLb) => {
        if (remoteLb) {
          setLeaderboard(mapServerLeaderboard(remoteLb.entries));
        }
      })
      .catch(() => {});

    const dailyList = generateDailyChallenges(today);
    const updatedChallenges = dailyList.map((c) => ({
      ...c,
      completed: loaded.completedDailyChallenges.includes(c.id),
      claimed: loaded.claimedDailyChallenges.includes(c.id),
      currentCount: loaded.completedDailyChallenges.includes(c.id) ? c.targetCount : 0,
    }));
    setChallenges(updatedChallenges);

    // Initialise Neon Backend Auth. Firebase accounts are only linked with a
    // signed ID token; local OTP accounts reuse their existing Neon token.
    const backendAuthPromise = (async () => {
      if (session?.uid) {
        if (!session.uid.startsWith('local-')) {
          const idToken = await getFirebaseIdToken();
          if (idToken) {
            const linked = await syncPilotAccount(
              session.uid,
              loaded.callsign,
              session.email,
              undefined,
              idToken
            );
            if (linked) return linked;
          }
        }
        return loginWithToken();
      }
      return initAuth(loaded.callsign);
    })();

    backendAuthPromise.then(async (player) => {
      if (player) {
        setIsOnline(true);
        setUserStats((prev) => {
          const next = withServerPlayer(prev, player);
          if (session) {
            saveUserStats(next);
          }
          return next;
        });

        // Sync daily challenges
        const remoteChallenges = await apiFetchChallenges();
        if (remoteChallenges && remoteChallenges.length > 0) {
          setChallenges(remoteChallenges);
        }
      } else {
        setIsOnline(false);
      }
    }).catch(() => {
      setIsOnline(false);
    });

    // Check for passwordless email sign-in link in URL
    checkAndCompleteEmailLinkSignIn().then(({ isEmailLink, needsEmailPrompt, result }) => {
      if (isEmailLink) {
        if (needsEmailPrompt) {
          setAuthModalMode('email-confirm');
          setShowAuthModal(true);
        } else if (result?.success && result.user) {
          handleAuthSuccess(result.user);
        } else if (result?.needsUsername && result.user) {
          setShowAuthModal(true);
        }
      }
    }).catch(() => {});

    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      startGame();
    }
  }, []);

  // Spawn crash particles using ObjectPool (Zero GC)
  const spawnCrashParticles = (x: number, y: number) => {
    const pool = particlePoolRef.current;
    const skin = simRef.current.skin;

    // Wood splinters
    for (let i = 0; i < 16; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 200;
      const p = pool.acquire();
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed - 60;
      p.size = 5 + Math.random() * 7;
      p.color = Math.random() > 0.5 ? '#e8c99b' : '#facc15';
      p.alpha = 1;
      p.decay = 1.6 + Math.random() * 0.8;
      p.rotation = Math.random() * Math.PI;
      p.vRot = (Math.random() - 0.5) * 10;
      p.shape = 'wood';
    }

    // Graphite dust flakes
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 140;
      const p = pool.acquire();
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.size = 3 + Math.random() * 4;
      p.color = '#1e293b';
      p.alpha = 1;
      p.decay = 2.0;
      p.rotation = 0;
      p.vRot = 0;
      p.shape = 'lead';
    }

    // Paper tears
    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 180;
      const p = pool.acquire();
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed - 50;
      p.size = 6 + Math.random() * 8;
      p.color = skin.primaryColor;
      p.alpha = 1;
      p.decay = 1.4;
      p.rotation = Math.random() * Math.PI;
      p.vRot = (Math.random() - 0.5) * 8;
      p.shape = 'paper';
    }
  };

  // Sparkles for paperclip pickup
  const spawnSparkles = (x: number, y: number) => {
    const pool = particlePoolRef.current;
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 120;
      const p = pool.acquire();
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.size = 4 + Math.random() * 5;
      p.color = '#fef08a';
      p.alpha = 1;
      p.decay = 2.5;
      p.rotation = Math.random() * Math.PI;
      p.vRot = (Math.random() - 0.5) * 6;
      p.shape = 'sparkle';
    }
  };

  // Handle crash / game over sequence
  const handleCrash = useCallback(() => {
    const simState = simRef.current;
    const sim = simState.sim;

    // Guard against multiple executions
    if (simState.isCrashHandled) return;
    simState.isCrashHandled = true;

    sim.plane.isAlive = false;
    simState.hitstopTimer = 0.06;
    simState.cameraTrauma = 0.8;

    sound.stopAmbient();
    sound.playCrash();

    spawnCrashParticles(sim.plane.x, sim.plane.y);

    const finalScore = sim.score;
    const finalClips = sim.clipsCollected;
    const isBest = finalScore > userStats.highScore;

    if (isBest) {
      sound.playFanfare();
      setIsNewBest(true);
    }

    const durationMs = Math.round(performance.now() - simState.flightStartTime);

    // Update player stats
    const updatedStats: UserStats = {
      ...userStats,
      highScore: Math.max(userStats.highScore, finalScore),
      totalFlights: userStats.totalFlights + 1,
      totalPencilsCleared: userStats.totalPencilsCleared + finalScore,
      paperclips: userStats.paperclips + finalClips,
    };

    // Update daily challenges using the same rules as the server.
    const updatedChallenges = simState.challenges.map((c) => {
      let newCount = c.currentCount;
      if (c.type === 'collect_clips') {
        newCount = c.currentCount + finalClips;
      } else {
        newCount = Math.max(c.currentCount, finalScore);
      }
      const isNowCompleted = newCount >= c.targetCount;

      return {
        ...c,
        currentCount: newCount,
        completed: c.completed || isNowCompleted,
      };
    });

    updatedStats.completedDailyChallenges = updatedChallenges
      .filter((c) => c.completed)
      .map((c) => c.id);

    setUserStats(updatedStats);
    saveUserStats(updatedStats);
    setChallenges(updatedChallenges);

    const isGuest = !currentUser || readLocalString(GUEST_FLAG_KEY) === 'true';

    // Sync stats to cloud if logged in
    if (currentUser) {
      syncCloudStats(currentUser.uid, updatedStats).catch(() => {});
    }

    // Submit to server for anti-cheat verification asynchronously. The world
    // size captured at flight start is replayed with every resize event.
    const submitPromise = simState.flightSessionId
      ? apiSubmitFlight(
          simState.flightSessionId,
          finalScore,
          finalClips,
          simState.inputs,
          durationMs,
          simState.flightWorldWidth,
          simState.flightWorldHeight
        )
      : apiSubmitFlightDirect(
          sim.seed,
          finalScore,
          finalClips,
          simState.inputs,
          durationMs,
          simState.skin.id,
          simState.flightWorldWidth,
          simState.flightWorldHeight
        );

    submitPromise.then((res) => {
      if (!res) return;

      // Reconcile the optimistic local clip award with the durable balance. This
      // also rolls back the award when replay verification fails.
      if (typeof res.paperclips === 'number') {
        setUserStats((prev) => {
          const next = { ...prev, paperclips: res.paperclips as number };
          if (currentUser) saveUserStats(next);
          return next;
        });
      }

      if (res.verified) {
        const serverSaysGuest = res.isGuest ?? isGuest;
        if (!serverSaysGuest && res.rank != null) {
          setVerifiedRank(res.rank);
        } else {
          setVerifiedRank(null);
        }

        apiFetchLeaderboard(100).then((lb) => {
          if (lb) setLeaderboard(mapServerLeaderboard(lb.entries));
        });

        apiFetchChallenges().then((remoteChallenges) => {
          if (remoteChallenges && remoteChallenges.length > 0) {
            setChallenges(remoteChallenges);
          }
        });
      }
    }).catch(() => {});

    if (isGuest) {
      setVerifiedRank(null);
    }

    // Transition to game over screen smoothly
    setTimeout(() => {
      setGameState('gameover');
    }, 550);
  }, [userStats, currentUser]);

  // Start a fresh flight run (INSTANT start with zero network latency)
  const startGame = useCallback(() => {
    if (typeof document !== 'undefined') {
      (document.activeElement as HTMLElement)?.blur();
    }

    setScore(0);
    setFlightClips(0);
    setIsNewBest(false);
    setHasStartedFlight(false);
    setVerifiedRank(null);
    particlePoolRef.current.releaseAll();
    fixedTimestepRef.current = createFixedTimestep();

    const width = Math.round(
      simRef.current.canvasWidth || (typeof window !== 'undefined' ? window.innerWidth : 800)
    );
    const height = Math.round(
      simRef.current.canvasHeight || (typeof window !== 'undefined' ? window.innerHeight : 600)
    );
    const seed: string = crypto.randomUUID();
    const sim = createFlightSimulation(seed, selectedSkin.id, width, height);

    simRef.current.sim = sim;
    simRef.current.flightSessionId = null;
    simRef.current.flightStartTime = performance.now();
    simRef.current.flightWorldWidth = width;
    simRef.current.flightWorldHeight = height;
    simRef.current.inputs = [];
    simRef.current.wantsFlap = false;
    simRef.current.hasStartedFlight = false;
    simRef.current.isCrashHandled = false;
    simRef.current.cameraTrauma = 0;
    simRef.current.hitstopTimer = 0;

    setGameState('playing');
    sound.playClick();
    sound.startAmbient();

    // Request authoritative session from server with identical seed & skin
    apiStartFlight(seed, selectedSkin.id, width, height).then((serverSession) => {
      if (serverSession) {
        simRef.current.flightSessionId = serverSession.sessionId;
        setIsOnline(true);
      }
    }).catch(() => {
      setIsOnline(false);
    });
  }, [selectedSkin.id]);

  // Handle Flap input
  const triggerFlap = useCallback(() => {
    const simState = simRef.current;
    if (simState.state === 'playing' && simState.sim.plane.isAlive) {
      if (!simState.hasStartedFlight) {
        simState.hasStartedFlight = true;
        setHasStartedFlight(true);
      }
      simState.wantsFlap = true;
      sound.playFlap();
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.(20);
      }
    } else if (simState.state === 'title') {
      startGame();
    }
  }, [startGame]);

  // 60-120fps Main Loop with 60Hz Fixed Timestep
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animationId: number;
    let lastTime = performance.now();

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      simRef.current.canvasWidth = width;
      simRef.current.canvasHeight = height;
      const sim = simRef.current.sim;
      if (sim && (sim.worldWidth !== width || sim.worldHeight !== height)) {
        // Viewport changes alter barrier generation, so they must be replayed
        // at exactly the same tick or a legitimate score fails verification.
        // A resize while paused is recorded too: the tick does not advance, so
        // it is applied before the next simulated step on both sides.
        if (
          (simRef.current.state === 'playing' || simRef.current.state === 'paused') &&
          sim.plane.isAlive
        ) {
          simRef.current.inputs.push({
            frame: sim.frameCount,
            action: 'resize',
            width,
            height,
          });
        }
        sim.worldWidth = width;
        sim.worldHeight = height;
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const gameLoop = (currentTime: number) => {
      const rawDt = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      const simState = simRef.current;
      const sim = simState.sim;
      const width = simState.canvasWidth;
      const height = simState.canvasHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

      const pool = particlePoolRef.current;

      // Hitstop logic
      if (simState.hitstopTimer > 0) {
        simState.hitstopTimer -= rawDt;
      } else {
        // 1. UPDATE SIMULATION (Fixed 60Hz Timestep)
        if (simState.state === 'playing' && sim.plane.isAlive) {
          if (!simState.hasStartedFlight) {
            // Hovering motion is visual only. Mutating the simulation plane here
            // would make the first replay tick diverge from the server.
            sim.scrollOffset += 24 * rawDt;
          } else {
            advanceFixedTimestep(fixedTimestepRef.current, rawDt, () => {
              if (!sim.plane.isAlive) return;

              const willFlap = simState.wantsFlap;
              if (willFlap) {
                simState.inputs.push({
                  frame: sim.frameCount,
                  action: 'flap',
                });
              }

              const prevScore = sim.score;
              const events = stepFlightSimulation(sim, willFlap);
              simState.wantsFlap = false;

              // Handle simulation events
              if (events.scored) {
                setScore(sim.score);
                sound.playScore();
                sound.setAmbientIntensity(Math.min(1, sim.score / 35));

                if (
                  (prevScore < 15 && sim.score >= 15) ||
                  (prevScore < 30 && sim.score >= 30)
                ) {
                  sound.playBiomeTransition();
                }
              }

              if (events.clipsCollected > 0) {
                setFlightClips(sim.clipsCollected);
                sound.playClipPickup();
                spawnSparkles(sim.plane.x, sim.plane.y);
              }

              if (events.collectedPowerUps.length > 0) {
                sound.playPowerUpCollect();
              }

              if (events.shieldUsed) {
                sound.playShieldAbsorb();
                simState.cameraTrauma = Math.min(1, simState.cameraTrauma + 0.45);
              }

              if (events.crashed) {
                handleCrash();
              }

              // Flight trail
              if (Math.random() < 0.8) {
                sim.plane.trail.unshift({
                  x: sim.plane.x - 14,
                  y: sim.plane.y,
                  alpha: 1.0,
                  width: 1.6,
                });
                if (sim.plane.trail.length > 24) sim.plane.trail.pop();
              }
              for (const pt of sim.plane.trail) {
                pt.x -= 3.5;
                pt.alpha -= 0.025;
              }
              sim.plane.trail = sim.plane.trail.filter((p) => p.alpha > 0);
            });
          }
        } else if (simState.state === 'title') {
          sim.scrollOffset += 60 * rawDt;
        }

        // Particle simulation update
        pool.releaseWhere((p) => {
          p.x += p.vx * rawDt;
          p.y += p.vy * rawDt;
          p.vy += 320 * rawDt;
          p.rotation += p.vRot * rawDt;
          p.alpha -= p.decay * rawDt;
          return p.alpha <= 0;
        });

        // Decay camera trauma
        if (simState.cameraTrauma > 0) {
          simState.cameraTrauma = Math.max(0, simState.cameraTrauma - rawDt * 1.5);
        }
      }

      // 2. RENDER FRAME (True Edge-to-Edge Responsive Full Screen)
      ctx.save();
      ctx.scale(dpr, dpr);

      // Smooth Organic Camera Shake via Perlin Noise
      if (simState.cameraTrauma > 0) {
        const shake = perlinShake(currentTime * 0.001, simState.cameraTrauma);
        ctx.translate(shake.x, shake.y);
        ctx.rotate(shake.rotation);
      }

      // Current biome styling and notebook background (spans full width and height)
      const currentBiome = getCurrentBiome(sim.score);
      drawNotebookBackground(ctx, width, height, sim.scrollOffset, currentBiome);
      drawBiomeDoodles(ctx, currentBiome, width, height, sim.scrollOffset);

      // Draw pencil barriers spanning the full height of the device screen
      for (const barrier of sim.barriers) {
        drawPencilBarrier(ctx, barrier, height);
      }

      // Draw collectibles & power-ups
      for (const powerUp of sim.powerUps) {
        drawPowerUp(ctx, powerUp, currentTime * 0.001);
      }

      // Draw paper glider (with shield aura if active)
      if (simState.state !== 'title') {
        const isShielded = sim.activePowerUps.some((p) => p.type === 'shield');
        const hoverOffsetY = simState.hasStartedFlight
          ? 0
          : Math.sin(currentTime * 0.006) * 8;
        const hoverPitch = simState.hasStartedFlight
          ? 0
          : Math.sin(currentTime * 0.006) * 0.05;
        drawPaperPlane(ctx, sim.plane, simState.skin, isShielded, hoverOffsetY, hoverPitch);
      }

      // Draw particles from zero-allocation pool
      drawParticles(ctx, pool.getActive() as Particle[]);

      // Draw active power-ups HUD overlay onto canvas
      if (simState.state === 'playing') {
        drawActivePowerUpHUD(ctx, sim.activePowerUps, 16, height - 85);
      }

      ctx.restore();

      animationId = requestAnimationFrame(gameLoop);
    };

    animationId = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [handleCrash]);

  // Keyboard Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        triggerFlap();
      }
      if (e.code === 'Enter') {
        if (gameState === 'title' || gameState === 'gameover') {
          startGame();
        }
      }
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (gameState === 'playing') {
          setGameState('paused');
          sound.stopAmbient();
        } else if (gameState === 'paused') {
          setGameState('playing');
          sound.startAmbient();
        }
      }
      if (e.code === 'KeyM') {
        handleToggleSound();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, startGame, triggerFlap]);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    triggerFlap();
  };

  const handleToggleSound = () => {
    const updated = !userStats.soundEnabled;
    const newStats = { ...userStats, soundEnabled: updated };
    setUserStats(newStats);
    saveUserStats(newStats);
    sound.setMuted(!updated);
    apiUpdateSettings({ soundEnabled: updated }).catch(() => {});
  };

  const handleUpdateCallsign = async (newCallsign: string): Promise<boolean> => {
    const trimmed = newCallsign.trim();
    if (!trimmed) return false;

    const previousCallsign = userStats.callsign;
    const optimistic = { ...userStats, callsign: trimmed };
    setUserStats(optimistic);
    if (currentUser) {
      saveUserStats(optimistic);
    }

    const player = await apiUpdateSettings({ callsign: trimmed }).catch(() => null);
    if (!player) {
      if (isServerOnline()) {
        // The server rejected the callsign, so restore (and persist) the last
        // valid one instead of leaving local storage out of sync.
        const restored = { ...userStats, callsign: previousCallsign };
        setUserStats(restored);
        if (currentUser) {
          saveUserStats(restored);
          syncCloudStats(currentUser.uid, restored).catch(() => {});
        }
        return false;
      }
      // Offline: keep the local callsign for this session.
      return true;
    }

    const accepted = { ...userStats, callsign: player.callsign };
    setUserStats(accepted);
    if (currentUser) {
      saveUserStats(accepted);
      syncCloudStats(currentUser.uid, accepted).catch(() => {});
    }
    const lb = await apiFetchLeaderboard(100);
    if (lb) setLeaderboard(mapServerLeaderboard(lb.entries));
    return true;
  };

  const handleClaimChallenge = async (challengeId: string) => {
    const targetChallenge = challenges.find((c) => c.id === challengeId);
    if (!targetChallenge || targetChallenge.claimed || !targetChallenge.completed) return;

    const serverResult = await apiClaimChallenge(challengeId).catch(() => null);

    if (!serverResult) {
      // Never grant a reward locally when the server rejected the claim. Only
      // fall back when the API is genuinely unreachable.
      if (isServerOnline()) return;

      sound.playClipPickup();
      setChallenges((prev) =>
        prev.map((c) => c.id === challengeId ? { ...c, claimed: true } : c)
      );
      const fallbackStats: UserStats = {
        ...userStats,
        paperclips: userStats.paperclips + targetChallenge.rewardClips,
        claimedDailyChallenges: Array.from(new Set([...userStats.claimedDailyChallenges, challengeId])),
      };
      setUserStats(fallbackStats);
      if (currentUser) saveUserStats(fallbackStats);
      return;
    }

    sound.playClipPickup();
    setChallenges((prev) =>
      prev.map((c) => c.id === challengeId ? { ...c, claimed: true } : c)
    );

    const updatedStats: UserStats = {
      ...userStats,
      paperclips: serverResult.paperclips,
      claimedDailyChallenges: Array.from(new Set([...userStats.claimedDailyChallenges, challengeId])),
    };
    setUserStats(updatedStats);
    if (currentUser) saveUserStats(updatedStats);
  };

  const handleSelectSkin = async (skinId: string) => {
    const player = await apiEquipSkin(skinId).catch(() => null);

    if (player) {
      const updated = {
        ...userStats,
        selectedSkin: player.equippedSkin,
        paperclips: player.paperclips,
        unlockedSkins: player.unlockedSkins,
      };
      setUserStats(updated);
      if (currentUser) {
        saveUserStats(updated);
        syncCloudStats(currentUser.uid, updated).catch(() => {});
      }
      sound.playClick();
      return;
    }

    // A rejection from the live server is final. Only fall back when the API is
    // genuinely unreachable (apiFetch updates the status on network failure).
    if (isServerOnline()) return;

    const updated = { ...userStats, selectedSkin: skinId };
    setUserStats(updated);
    if (currentUser) {
      saveUserStats(updated);
      syncCloudStats(currentUser.uid, updated).catch(() => {});
    }
    sound.playClick();
  };

  const handleUnlockSkin = async (skin: GliderSkin) => {
    if (userStats.paperclips < skin.costInClips) return;

    const player = await apiUnlockSkin(skin.id).catch(() => null);

    if (player) {
      sound.playFanfare();
      const updated = {
        ...userStats,
        paperclips: player.paperclips,
        unlockedSkins: player.unlockedSkins,
        selectedSkin: player.equippedSkin,
      };
      setUserStats(updated);
      if (currentUser) {
        saveUserStats(updated);
        syncCloudStats(currentUser.uid, updated).catch(() => {});
      }
      return;
    }

    if (isServerOnline()) return;

    // Offline-only fallback. It can never mint a server unlock or spend server
    // paperclips, so the authoritative inventory remains server-owned.
    sound.playFanfare();
    const updated: UserStats = {
      ...userStats,
      paperclips: userStats.paperclips - skin.costInClips,
      unlockedSkins: [...userStats.unlockedSkins, skin.id],
      selectedSkin: skin.id,
    };
    setUserStats(updated);
    if (currentUser) {
      saveUserStats(updated);
      syncCloudStats(currentUser.uid, updated).catch(() => {});
    }
  };

  const startFreshGuestSession = async (callsign: string) => {
    const guest = await initAuth(callsign).catch(() => null);
    if (!guest) {
      setIsOnline(false);
      return;
    }
    setIsOnline(true);
    const [remoteLb, remoteChallenges] = await Promise.all([
      apiFetchLeaderboard(100).catch(() => null),
      apiFetchChallenges().catch(() => null),
    ]);
    if (remoteLb) setLeaderboard(mapServerLeaderboard(remoteLb.entries));
    if (remoteChallenges && remoteChallenges.length > 0) setChallenges(remoteChallenges);
  };

  const handleAuthSuccess = async (user: PilotUser) => {
    setCurrentUser(user);
    setShowAuthModal(false);
    removeLocalString(GUEST_FLAG_KEY);

    // Update pilot callsign with their verified username
    setUserStats((prev) => {
      const next = { ...prev, callsign: user.username };
      saveUserStats(next);
      return next;
    });

    // Load any saved cloud progress for this pilot and merge with local
    try {
      const cloud = await loadCloudStats(user.uid);
      if (cloud) {
        setUserStats((prev) => {
          const merged: UserStats = {
            ...prev,
            callsign: user.username,
            highScore: Math.max(prev.highScore, cloud.highScore ?? 0),
            paperclips: Math.max(prev.paperclips, cloud.paperclips ?? 0),
            selectedSkin: cloud.selectedSkin || prev.selectedSkin,
            unlockedSkins: Array.from(
              new Set([...prev.unlockedSkins, ...(cloud.unlockedSkins || [])])
            ),
          };
          saveUserStats(merged);
          return merged;
        });
      }
    } catch {}

    // Synchronize pilot callsign & Firebase UID with Neon database. The UID is
    // only accepted with a signed Firebase ID token; local OTP accounts keep
    // the token that /auth/verify-code already issued.
    try {
      if (user.uid.startsWith('local-')) {
        const session = await loginWithTokenDetailed();
        const existing = session.player;
        const emailMatches = Boolean(
          user.email &&
          existing?.email &&
          existing.email.toLowerCase() === user.email.toLowerCase()
        );
        const callsignMatches = Boolean(
          existing?.callsign &&
          existing.callsign.toLowerCase() === user.username.toLowerCase()
        );

        // Never attach a new local login to whichever account happened to own
        // the previous bearer token. OTP logins have a matching email; legacy
        // email-less local accounts must at least match the callsign.
        if (existing && (emailMatches || (!user.email && callsignMatches))) {
          setIsOnline(true);
        } else if (existing || session.invalid) {
          // The token belongs to someone else, or is definitively invalid.
          clearToken();
          await startFreshGuestSession(user.username);
        } else {
          // The server had a transient failure. Keep the token and local state;
          // do not strand the pilot in a brand-new guest account.
          setIsOnline(false);
        }
      } else {
        const idToken = await getFirebaseIdToken();
        if (!idToken) {
          // A local mock/fallback session must not reuse a stale token from a
          // different pilot.
          clearToken();
          await startFreshGuestSession(user.username);
          return;
        }
        const player = await syncPilotAccount(
          user.uid,
          user.username,
          user.email,
          user.email ? 'firebase' : 'guest',
          idToken
        );
        if (player) {
          setIsOnline(true);
          setUserStats((prev) => {
            const next = withServerPlayer(prev, player);
            saveUserStats(next);
            return next;
          });
        }
      }
    } catch {
      // A transient API failure must not destroy the saved bearer token. A real
      // 401 has already been handled by apiFetch/loginWithTokenDetailed.
      setUserStats((prev) => {
        const next = { ...prev, callsign: user.username };
        saveUserStats(next);
        return next;
      });
      setIsOnline(false);
    }
  };

  const handleContinueAsGuest = () => {
    writeLocalString(GUEST_FLAG_KEY, 'true');
    removeLocalString('paper_glider_user_stats');
    // Do not let the previous pilot's bearer token submit this guest's flights.
    clearToken();
    // Guest starts with clean stats (progress is not persisted locally).
    const fresh = getInitialUserStats();
    setUserStats(fresh);
    setHighScore(0);
    setScore(0);
    setFlightClips(0);
    setShowAuthModal(false);
    void startFreshGuestSession(fresh.callsign);
  };

  const handleReconnect = useCallback(async (): Promise<{ success: boolean; message: string }> => {
    setIsConnecting(true);
    try {
      const result = await reconnectServerWithDetails(
        currentUser?.username || userStats.callsign,
        !currentUser
      );
      if (result.success && result.player) {
        setIsOnline(true);
        const player = result.player;
        setUserStats((prev) => {
          const next = withServerPlayer(prev, player);
          if (currentUser) {
            saveUserStats(next);
          }
          return next;
        });

        const remoteLb = await apiFetchLeaderboard(100);
        if (remoteLb) {
          setLeaderboard(mapServerLeaderboard(remoteLb.entries));
        }

        const remoteChallenges = await apiFetchChallenges();
        if (remoteChallenges && remoteChallenges.length > 0) {
          setChallenges(remoteChallenges);
        }

        return { success: true, message: result.message };
      } else {
        return { success: false, message: result.message };
      }
    } catch (err: any) {
      return { success: false, message: err?.message || 'Connection attempt failed. Please check network.' };
    } finally {
      setIsConnecting(false);
    }
  }, [currentUser, userStats.callsign]);

  const handleLogout = async () => {
    await logoutUser();
    // Firebase sign-out does not revoke the Neon bearer token. Clear it so the
    // next guest cannot be ranked as, or submit flights for, the old pilot.
    clearToken();
    setCurrentUser(null);
    writeLocalString(GUEST_FLAG_KEY, 'true');
    removeLocalString('paper_glider_user_stats');
    // Reset to fresh guest stats
    const fresh = getInitialUserStats();
    setUserStats(fresh);
    setHighScore(0);
    setScore(0);
    setFlightClips(0);
    setLeaderboard([]);
    setVerifiedRank(null);
    void startFreshGuestSession(fresh.callsign);
  };

  const handleDeleteAccount = async (): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) {
      return { success: false, error: 'No active pilot session.' };
    }

    try {
      // 1. Permanently delete from Neon PostgreSQL database (cascades flights, leaderboard, challenges)
      const serverDeleted = await deleteServerAccount();
      if (!serverDeleted) {
        return {
          success: false,
          error: 'Could not delete the cloud account. Check your connection and try again.',
        };
      }

      // 2. Permanently delete from Firebase Authentication, Firestore, and local registry
      const result = await deletePilotAccount(currentUser);

      if (result.success) {
        setCurrentUser(null);
        setShowAccountModal(false);
        writeLocalString(GUEST_FLAG_KEY, 'true');
        removeLocalString('paper_glider_user_stats');
        removeLocalString('paper_glider_auth_token');
        const fresh = getInitialUserStats();
        setUserStats(fresh);
        setHighScore(0);
        setScore(0);
        setFlightClips(0);
        setLeaderboard([]);
        setVerifiedRank(null);
        void startFreshGuestSession(fresh.callsign);
        return { success: true };
      }

      return { success: false, error: result.error };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to delete account.' };
    }
  };

  const handleOpenLeaderboard = () => {
    setShowLeaderboard(true);
    apiFetchLeaderboard(100)
      .then((remoteLb) => {
        if (remoteLb) {
          setLeaderboard(mapServerLeaderboard(remoteLb.entries));
        }
      })
      .catch(() => {});
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#faf7ed] select-none touch-none">
      <canvas
        ref={canvasRef}
        data-testid="game-canvas"
        onPointerDown={handlePointerDown}
        className="absolute inset-0 w-full h-full cursor-pointer block touch-none"
      />

      {gameState === 'title' && (
        <TitleScreen
          onStart={startGame}
          onOpenLeaderboard={handleOpenLeaderboard}
          onOpenChallenges={() => setShowChallenges(true)}
          onOpenHangar={() => setShowHangar(true)}
          onToggleSound={handleToggleSound}
          onOpenAuth={() => setShowAuthModal(true)}
          onLogout={handleLogout}
          onOpenAccount={() => setShowAccountModal(true)}
          onReconnect={handleReconnect}
          currentUser={currentUser}
          stats={userStats}
          isOnline={isOnline}
          isConnecting={isConnecting}
        />
      )}

      {gameState === 'playing' && (
        <HUD
          score={score}
          highScore={highScore}
          paperclips={userStats.paperclips}
          flightPaperclips={flightClips}
          soundEnabled={userStats.soundEnabled}
          onPause={() => {
            setGameState('paused');
            sound.stopAmbient();
          }}
          onToggleSound={handleToggleSound}
          showTapHint={!hasStartedFlight}
        />
      )}

      {gameState === 'paused' && (
        <PauseModal
          onResume={() => {
            setGameState('playing');
            sound.startAmbient();
          }}
          onRestart={startGame}
          onHome={() => {
            setGameState('title');
            sound.stopAmbient();
          }}
          score={score}
        />
      )}

      {gameState === 'gameover' && (
        <GameOverModal
          score={score}
          highScore={highScore}
          isNewBest={isNewBest}
          flightPaperclips={flightClips}
          callsign={userStats.callsign}
          onRestart={startGame}
          onHome={() => setGameState('title')}
          onOpenLeaderboard={handleOpenLeaderboard}
          onOpenChallenges={() => setShowChallenges(true)}
          onUpdateCallsign={handleUpdateCallsign}
          verifiedRank={verifiedRank}
          isOnline={isOnline}
          isGuest={!currentUser}
          onOpenAuth={() => setShowAuthModal(true)}
        />
      )}

      {showLeaderboard && (
        <LeaderboardModal
          entries={leaderboard}
          userCallsign={userStats.callsign}
          userHighScore={userStats.highScore}
          onClose={() => setShowLeaderboard(false)}
          isOnline={isOnline}
          isGuest={!currentUser}
          onOpenAuth={() => setShowAuthModal(true)}
        />
      )}

      {showChallenges && (
        <DailyChallengesModal
          challenges={challenges}
          onClaim={handleClaimChallenge}
          onClose={() => setShowChallenges(false)}
          dateStr={userStats.dailyChallengeDate}
        />
      )}

      {showHangar && (
        <HangarModal
          paperclips={userStats.paperclips}
          selectedSkinId={userStats.selectedSkin}
          unlockedSkins={userStats.unlockedSkins}
          onSelectSkin={handleSelectSkin}
          onUnlockSkin={handleUnlockSkin}
          onClose={() => setShowHangar(false)}
        />
      )}

      {showAuthModal && (
        <AuthModal
          onSuccess={handleAuthSuccess}
          onContinueAsGuest={handleContinueAsGuest}
          onClose={() => setShowAuthModal(false)}
          canClose={Boolean(currentUser || readLocalString(GUEST_FLAG_KEY) === 'true')}
          initialMode={authModalMode}
        />
      )}

      {showAccountModal && currentUser && (
        <AccountModal
          currentUser={currentUser}
          stats={userStats}
          isOnline={isOnline}
          onClose={() => setShowAccountModal(false)}
          onLogout={handleLogout}
          onDeleteAccount={handleDeleteAccount}
        />
      )}
    </div>
  );
}

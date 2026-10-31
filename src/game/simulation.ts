/**
 * The single authoritative flight simulation, shared by the browser and server.
 * All gameplay randomness and elapsed time live here; rendering never changes it.
 */

import type { ActivePowerUp, PencilBarrier, PlayerPlane, PowerUp, PowerUpType } from './types';
import { createSeededRandom, type SeededRandom } from './seededRandom';
import { createBarrierPool, type ObjectPool } from './pool';
import { FIXED_DT } from './fixedTimestep';
import { getGliderStats } from './rules';
import {
  checkBoundaryCollision, checkPaperclipPickup, checkPlanePencilCollision,
  generateSeededBarrier, stepGliderPhysicsWithStats,
} from './physics';
import {
  checkPowerUpPickup, createPowerUp, getPowerUpPhysicsModifiers,
  POWERUP_DEFINITIONS, shouldSpawnPowerUp,
} from './powerups';

export const SIMULATION_VERSION = '1';
export const WORLD_WIDTH = 800;
export const WORLD_HEIGHT = 600;
export const MAX_FLIGHT_FRAMES = 60 * 60 * 10;

export interface FlightSimulation {
  seed: string;
  skinId: string;
  worldWidth: number;
  worldHeight: number;
  frameCount: number;
  score: number;
  clipsCollected: number;
  plane: PlayerPlane;
  barriers: PencilBarrier[];
  powerUps: PowerUp[];
  activePowerUps: ActivePowerUp[];
  scrollOffset: number;
  shieldGraceFrames: number;
  rng: SeededRandom;
  barrierPool: ObjectPool<PencilBarrier>;
  nextBarrierId: number;
}

export interface FlightStepEvents {
  scored: boolean;
  clipsCollected: number;
  collectedPowerUps: PowerUpType[];
  shieldUsed: boolean;
  crashed: boolean;
}

function spawnBarrier(state: FlightSimulation, x: number): void {
  const h = state.worldHeight || 600;
  const barrier = generateSeededBarrier(
    state.barrierPool.acquire(), state.nextBarrierId++, x,
    state.score, h, state.rng,
  );
  state.barriers.push(barrier);
  const type = shouldSpawnPowerUp(state.score, () => state.rng.next());
  if (type) {
    state.powerUps.push(createPowerUp(barrier.id, type, x + barrier.width / 2, barrier.gapY));
  }
}

export function createFlightSimulation(
  seed: string,
  skinId: string,
  worldWidth: number = 800,
  worldHeight: number = 600
): FlightSimulation {
  const stats = getGliderStats(skinId);
  const startX = Math.max(90, Math.min(140, worldWidth * 0.22));
  const startY = worldHeight * 0.45;

  const state: FlightSimulation = {
    seed,
    skinId,
    worldWidth,
    worldHeight,
    frameCount: 0,
    score: 0,
    clipsCollected: 0,
    plane: {
      x: startX,
      y: startY,
      vx: stats.horizontalSpeed,
      vy: 0,
      pitch: 0,
      targetPitch: 0,
      radius: 12,
      trail: [],
      isAlive: true,
      wingspan: 36,
    },
    barriers: [],
    powerUps: [],
    activePowerUps: [],
    scrollOffset: 0,
    shieldGraceFrames: 0,
    rng: createSeededRandom(seed),
    barrierPool: createBarrierPool(),
    nextBarrierId: 1,
  };

  const spacing = Math.max(260, Math.min(320, worldWidth * 0.35));
  for (let i = 0; i < 3; i++) {
    spawnBarrier(state, worldWidth * 0.65 + i * spacing);
  }
  return state;
}

export function activatePowerUp(state: FlightSimulation, type: PowerUpType): void {
  const duration = POWERUP_DEFINITIONS[type].duration;
  const existing = state.activePowerUps.find((power) => power.type === type);
  if (existing) existing.remainingTime = duration;
  else state.activePowerUps.push({ type, duration, remainingTime: duration });
}

function absorbCollision(state: FlightSimulation, events: FlightStepEvents): boolean {
  if (state.shieldGraceFrames > 0) return true;
  const index = state.activePowerUps.findIndex((power) => power.type === 'shield');
  if (index < 0) return false;
  state.activePowerUps.splice(index, 1);
  state.shieldGraceFrames = 30;
  events.shieldUsed = true;
  return true;
}

/** One call consumes exactly one tick, including the terminal collision tick. */
export function stepFlightSimulation(state: FlightSimulation, flap: boolean): FlightStepEvents {
  const events: FlightStepEvents = {
    scored: false, clipsCollected: 0, collectedPowerUps: [], shieldUsed: false, crashed: false,
  };
  if (!state.plane.isAlive) return events;

  if (state.shieldGraceFrames > 0) state.shieldGraceFrames--;
  const modifiers = getPowerUpPhysicsModifiers(state.activePowerUps);
  const stats = getGliderStats(state.skinId);
  state.plane = stepGliderPhysicsWithStats(state.plane, FIXED_DT, flap, stats, modifiers);
  const dx = (stats.horizontalSpeed + Math.min(state.score * 2.5, 60)) * modifiers.speedMultiplier * FIXED_DT;
  state.scrollOffset += dx;

  // Existing effects last an exact number of simulation ticks, never wall time.
  for (let i = state.activePowerUps.length - 1; i >= 0; i--) {
    const power = state.activePowerUps[i];
    if (power.duration === 0) continue;
    power.remainingTime = Math.max(0, power.remainingTime - FIXED_DT);
    if (power.remainingTime < 1e-9) state.activePowerUps.splice(i, 1);
  }
  for (let i = state.powerUps.length - 1; i >= 0; i--) {
    const power = state.powerUps[i];
    power.x -= dx;
    if (checkPowerUpPickup(state.plane, power)) {
      power.collected = true;
      activatePowerUp(state, power.type);
      events.collectedPowerUps.push(power.type);
    }
    if (power.collected || power.x < -40) state.powerUps.splice(i, 1);
  }
  const pickupModifiers = getPowerUpPhysicsModifiers(state.activePowerUps);

  for (let i = 0; i < state.barriers.length; i++) {
    const barrier = state.barriers[i];
    barrier.x -= dx;
    barrier.clipX = (barrier.clipX ?? barrier.x + dx + barrier.width / 2) - dx;
    if (barrier.hasClip && !barrier.clipCollected) {
      if (pickupModifiers.magnetRadius > 0 && checkPaperclipPickup(
        state.plane, barrier.clipX, barrier.clipY, pickupModifiers.magnetRadius,
      )) {
        barrier.clipX += (state.plane.x - barrier.clipX) * 10 * FIXED_DT;
        barrier.clipY += (state.plane.y - barrier.clipY) * 10 * FIXED_DT;
      }
      if (checkPaperclipPickup(state.plane, barrier.clipX, barrier.clipY)) {
        barrier.clipCollected = true;
        state.clipsCollected++;
        events.clipsCollected++;
      }
    }

    const h = state.worldHeight || 600;
    const w = state.worldWidth || 800;

    if (checkPlanePencilCollision(state.plane, barrier, h)) {
      if (!absorbCollision(state, events)) {
        state.plane.isAlive = false;
        break;
      }
      // Tape breaks this pencil pair; it awards no clearance point.
      state.barriers.splice(i--, 1);
      state.barrierPool.release(barrier);
      continue;
    }
    if (!barrier.passed && barrier.x + barrier.width < state.plane.x - state.plane.radius) {
      barrier.passed = true;
      state.score++;
      events.scored = true;
    }
  }

  const h = state.worldHeight || 600;
  const w = state.worldWidth || 800;

  if (state.plane.isAlive && checkBoundaryCollision(state.plane, h, 10, 26)) {
    if (absorbCollision(state, events)) {
      state.plane.y = Math.max(23, Math.min(h - 39, state.plane.y));
      state.plane.vy = 0;
    } else state.plane.isAlive = false;
  }

  for (let i = state.barriers.length - 1; i >= 0; i--) {
    if (state.barriers[i].x + state.barriers[i].width < -40) {
      state.barrierPool.release(state.barriers[i]);
      state.barriers.splice(i, 1);
    }
  }
  if (state.plane.isAlive) {
    const last = state.barriers[state.barriers.length - 1];
    const spacing = Math.max(260, Math.min(320, w * 0.35));
    if (!last || last.x < w + 100) spawnBarrier(state, last ? last.x + spacing : w + 100);
  }
  state.frameCount++;
  if (state.frameCount >= MAX_FLIGHT_FRAMES) state.plane.isAlive = false;
  events.crashed = !state.plane.isAlive;
  return events;
}

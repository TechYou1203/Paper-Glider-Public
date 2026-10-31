import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stepGliderPhysics,
  checkPlanePencilCollision,
  checkBoundaryCollision,
  checkPaperclipPickup,
  isPointInTriangle,
} from './physics';
import {
  generateDailyChallenges,
  getInitialUserStats,
  getTodayDateString,
  recordScoreToLeaderboard,
  SEED_LEADERBOARD,
  DEFAULT_SKINS,
} from './rules';
import { PencilBarrier, PlayerPlane } from './types';

function createMockPlane(overrides: Partial<PlayerPlane> = {}): PlayerPlane {
  return {
    x: 150,
    y: 300,
    vx: 210,
    vy: 0,
    pitch: 0,
    targetPitch: 0,
    radius: 12,
    trail: [],
    isAlive: true,
    wingspan: 36,
    ...overrides,
  };
}

function createMockBarrier(overrides: Partial<PencilBarrier> = {}): PencilBarrier {
  return {
    id: 1,
    x: 300,
    width: 64,
    gapY: 300,
    gapHeight: 180,
    colorType: 'yellow',
    brandLabel: 'PAPER GLIDER HB',
    hasClip: true,
    clipCollected: false,
    clipY: 300,
    passed: false,
    ...overrides,
  };
}

test('aerodynamics: flap gives upward impulse and pitches nose up', () => {
  const initial = createMockPlane({ vy: 100, pitch: 0.2 });
  const updated = stepGliderPhysics(initial, 0.016, true);

  assert.ok(updated.vy < 0, 'Vertical speed should be negative (upward) on flap');
  assert.ok(updated.targetPitch < 0, 'Target pitch should tilt up on flap');
});

test('aerodynamics: gravity increases downward speed when not flapping', () => {
  const initial = createMockPlane({ vy: 0, pitch: 0 });
  const updated = stepGliderPhysics(initial, 0.1, false);

  assert.ok(updated.vy > 0, 'Downward vertical speed should increase under gravity');
  assert.ok(updated.y > initial.y, 'Plane should drop lower');
});

test('collision: plane passes cleanly through pencil gap', () => {
  const plane = createMockPlane({ x: 320, y: 300, pitch: 0 }); // In the middle of gap (210 to 390)
  const barrier = createMockBarrier({ x: 300, width: 64, gapY: 300, gapHeight: 180 });
  const collides = checkPlanePencilCollision(plane, barrier, 600);

  assert.equal(collides, false, 'Plane should pass through gap center without colliding');
});

test('collision: plane crashes into upper pencil body', () => {
  const plane = createMockPlane({ x: 320, y: 150 }); // Upper gap is 300 - 90 = 210. 150 is inside upper pencil
  const barrier = createMockBarrier({ x: 300, width: 64, gapY: 300, gapHeight: 180 });
  const collides = checkPlanePencilCollision(plane, barrier, 600);

  assert.equal(collides, true, 'Plane should collide with upper pencil');
});

test('collision: boundary check triggers at ceiling and floor', () => {
  const ceilingCrash = createMockPlane({ y: 5, radius: 12 });
  assert.equal(checkBoundaryCollision(ceilingCrash, 600), true);

  const safeMid = createMockPlane({ y: 300, radius: 12 });
  assert.equal(checkBoundaryCollision(safeMid, 600), false);

  const floorCrash = createMockPlane({ y: 590, radius: 12 });
  assert.equal(checkBoundaryCollision(floorCrash, 600), true);
});

test('collectibles: paperclip pickup detection works within radius', () => {
  const plane = createMockPlane({ x: 200, y: 200 });
  assert.equal(checkPaperclipPickup(plane, 205, 205), true, 'Close paperclip should be picked up');
  assert.equal(checkPaperclipPickup(plane, 260, 260), false, 'Far paperclip should not be picked up');
});

test('triangle math: isPointInTriangle accurately tests points', () => {
  // Triangle (0, 0), (10, 0), (5, 10)
  assert.equal(isPointInTriangle(5, 5, 0, 0, 10, 0, 5, 10), true);
  assert.equal(isPointInTriangle(20, 20, 0, 0, 10, 0, 5, 10), false);
});

test('daily challenges: generates 3 unique deterministic challenges for date', () => {
  const dateStr = '2026-10-24';
  const challenges = generateDailyChallenges(dateStr);

  assert.equal(challenges.length, 3);
  assert.equal(challenges[0].type, 'pass_pencils');
  assert.equal(challenges[1].type, 'collect_clips');
  assert.equal(challenges[2].type, 'reach_score');

  // Verify determinism
  const repeat = generateDailyChallenges(dateStr);
  assert.deepEqual(challenges, repeat);
});

test('skins catalog: contains classic unlocked skin and premium skins', () => {
  assert.ok(DEFAULT_SKINS.length >= 4);
  const classic = DEFAULT_SKINS.find((s) => s.id === 'classic');
  assert.ok(classic);
  assert.equal(classic?.unlockedByDefault, true);
  assert.equal(classic?.costInClips, 0);
});

test('leaderboard: contains no fake seed entries by default', () => {
  assert.equal(SEED_LEADERBOARD.length, 0, 'SEED_LEADERBOARD should be empty with no fake records');
  const entries = recordScoreToLeaderboard('TestPilot', 14, 3, 'classic');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].callsign, 'TestPilot');
  assert.equal(entries[0].score, 14);
});


import { createSeededRandom, seedFromString } from './seededRandom';
import { createParticlePool } from './pool';
import { perlinShake, noise1D } from './perlin';
import { createFixedTimestep, advanceFixedTimestep, FIXED_DT } from './fixedTimestep';
import { getCurrentBiome } from './biomes';
import { getPowerUpPhysicsModifiers, createPowerUp, checkPowerUpPickup } from './powerups';
import { createFlightSimulation, stepFlightSimulation } from './simulation';
import { verifyReplay } from '../../server/replay';

test('engine: seeded random Mulberry32 is deterministic across runs', () => {
  const seed = 'test-seed-123';
  const rng1 = createSeededRandom(seed);
  const rng2 = createSeededRandom(seed);

  const seq1 = [rng1.next(), rng1.next(), rng1.next(), rng1.nextInt(0, 100)];
  const seq2 = [rng2.next(), rng2.next(), rng2.next(), rng2.nextInt(0, 100)];

  assert.deepEqual(seq1, seq2);
});

test('engine: particle pool reuses objects without allocation growth', () => {
  const pool = createParticlePool(10);
  assert.equal(pool.activeCount, 0);

  const p1 = pool.acquire();
  p1.x = 42;
  assert.equal(pool.activeCount, 1);

  pool.release(p1);
  assert.equal(pool.activeCount, 0);

  const p2 = pool.acquire();
  assert.equal(p2.x, 0, 'Reset function should clear particle coordinates');
  pool.releaseAll();
  assert.equal(pool.activeCount, 0);
});

test('engine: fixed timestep decouples physics at exact 60Hz', () => {
  const state = createFixedTimestep();
  let stepCount = 0;

  // Advancing by exactly 1/30 second should trigger exactly 2 physics steps (60Hz)
  advanceFixedTimestep(state, 1 / 30, (dt) => {
    assert.equal(dt, FIXED_DT);
    stepCount++;
  });

  assert.equal(stepCount, 2);
});

test('engine: perlin noise camera shake computes continuous smooth offset', () => {
  const shake1 = perlinShake(1.0, 0.5);
  const shake2 = perlinShake(1.01, 0.5);

  assert.ok(typeof shake1.x === 'number');
  assert.ok(typeof shake1.y === 'number');
  assert.ok(typeof shake1.rotation === 'number');

  // Continuity check: small delta t yields small delta offset
  assert.ok(Math.abs(shake1.x - shake2.x) < 2);
});

test('biomes: progress from Classroom to Art Studio to Architect Desk', () => {
  assert.equal(getCurrentBiome(0).id, 'classroom');
  assert.equal(getCurrentBiome(14).id, 'classroom');
  assert.equal(getCurrentBiome(15).id, 'art_studio');
  assert.equal(getCurrentBiome(29).id, 'art_studio');
  assert.equal(getCurrentBiome(30).id, 'architects_desk');
  assert.equal(getCurrentBiome(999).id, 'architects_desk');
});

test('powerups: shield and magnet effects apply correct modifiers', () => {
  const modifiers = getPowerUpPhysicsModifiers([
    { type: 'shield', duration: 0, remainingTime: 0 },
    { type: 'magnet', duration: 5, remainingTime: 4 },
  ]);

  assert.equal(modifiers.isShielded, true);
  assert.ok(modifiers.magnetRadius > 0);
});

test('anti-cheat: deterministic simulation replay verification succeeds for valid inputs', () => {
  const seed = 'anti-cheat-verification-seed-99';
  const sim = createFlightSimulation(seed, 'classic');

  const inputs: Array<{ frame: number; action: 'flap' }> = [
    { frame: 10, action: 'flap' },
    { frame: 45, action: 'flap' },
    { frame: 80, action: 'flap' },
  ];

  // Run simulation for 120 frames
  let flapIdx = 0;
  for (let f = 0; f < 120; f++) {
    let flap = false;
    if (flapIdx < inputs.length && inputs[flapIdx].frame === sim.frameCount) {
      flap = true;
      flapIdx++;
    }
    const events = stepFlightSimulation(sim, flap);
    if (events.crashed) break;
  }

  // Verify that server replay verifier reaches the exact same score
  const result = verifyReplay(seed, inputs, sim.score, 'classic');
  assert.equal(result.valid, true);
  assert.equal(result.replayScore, sim.score);
});

test('guest stats: getInitialUserStats returns clean zeroed stats that do not persist', () => {
  const stats = getInitialUserStats();
  assert.equal(stats.highScore, 0);
  assert.equal(stats.paperclips, 0);
  assert.equal(stats.selectedSkin, 'classic');
  assert.deepEqual(stats.unlockedSkins, ['classic']);
});

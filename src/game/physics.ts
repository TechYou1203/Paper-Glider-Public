/**
 * Physics and Collision routines for Paper Glider
 */

import { GliderStats, PencilBarrier, PlayerPlane } from './types';
import type { SeededRandom } from './seededRandom';
import { getCurrentBiome } from './biomes';

export const GRAVITY = 920; // px/s^2
export const FLAP_IMPULSE = -360; // upward impulse in px/s
export const MAX_FALL_SPEED = 540;
export const MAX_RISE_SPEED = -420;
export const HORIZONTAL_SPEED = 210; // base scrolling speed px/s
export const PENCIL_WIDTH = 64;
export const TIP_HEIGHT = 44; // height of the sharpened pencil cone

/** Fill a recycled barrier using only the flight's deterministic RNG. */
export function generateSeededBarrier(
  barrier: PencilBarrier,
  id: number,
  x: number,
  score: number,
  height: number,
  rng: SeededRandom,
): PencilBarrier {
  const verticalMargin = Math.min(80, Math.max(30, height * 0.12));
  const minGap = Math.max(130, Math.min(190, height * 0.35) - Math.floor(score / 5) * 3);
  const gapHeight = minGap + rng.nextFloat(0, 16);
  const minY = verticalMargin + gapHeight / 2;
  const maxY = Math.max(minY + 20, height - verticalMargin - gapHeight / 2);
  const gapY = rng.nextFloat(minY, maxY);
  const brands = ['PAPER GLIDER No. 2 HB', 'STAEDTLER GRAPHITE 2B', 'AERODRAFT 4B', 'ARCHITECT CARMINE', 'NOTEBOOK PILOT HB'];
  Object.assign(barrier, {
    id, x, width: PENCIL_WIDTH, gapY, gapHeight,
    colorType: rng.pick(getCurrentBiome(score).pencilPalette),
    brandLabel: rng.pick(brands),
    hasClip: rng.next() < 0.45,
    clipCollected: false,
    clipX: x + PENCIL_WIDTH / 2,
    clipY: gapY + rng.nextFloat(-14, 14),
    passed: false,
    speedY: 0,
  });
  return barrier;
}

/**
 * Updates the glider physics for a clamped delta time (dt in seconds)
 */
export function stepGliderPhysics(
  plane: PlayerPlane,
  dt: number,
  isFlapping: boolean
): PlayerPlane {
  const newPlane = { ...plane };

  if (isFlapping) {
    // Upward flap with aerodynamic boost
    newPlane.vy = FLAP_IMPULSE;
    newPlane.targetPitch = -0.55; // nose up ~32 degrees
  } else {
    // Aerodynamic glide: gravity pulls down, with slight lift proportional to horizontal motion
    newPlane.vy += GRAVITY * dt;
    if (newPlane.vy > MAX_FALL_SPEED) {
      newPlane.vy = MAX_FALL_SPEED;
    }
    // As plane falls, nose gradually tips down
    if (newPlane.vy > 100) {
      newPlane.targetPitch = 0.65; // nose diving down ~37 degrees
    } else {
      newPlane.targetPitch = (newPlane.vy / MAX_FALL_SPEED) * 0.65;
    }
  }

  // Clamped rise speed
  if (newPlane.vy < MAX_RISE_SPEED) {
    newPlane.vy = MAX_RISE_SPEED;
  }

  // Smooth pitch interpolation (feels organic and weight-balanced)
  const pitchLerpSpeed = newPlane.vy < 0 ? 12 : 7;
  newPlane.pitch += (newPlane.targetPitch - newPlane.pitch) * Math.min(1, dt * pitchLerpSpeed);

  // Update vertical position
  newPlane.y += newPlane.vy * dt;

  return newPlane;
}

/**
 * Tests if point (px, py) is inside triangle (x1,y1), (x2,y2), (x3,y3)
 */
export function isPointInTriangle(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number
): boolean {
  const d1 = (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
  const d2 = (px - x3) * (y2 - y3) - (x2 - x3) * (py - y3);
  const d3 = (px - x1) * (y3 - y1) - (x3 - x1) * (py - y1);

  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;

  return !(hasNeg && hasPos);
}

/**
 * Tests collision between player plane (circle approximation or bounding points) and a pencil barrier.
 */
export function checkPlanePencilCollision(
  plane: PlayerPlane,
  barrier: PencilBarrier,
  canvasHeight: number
): boolean {
  // Hitbox circle for paper plane body and nose
  const noseX = plane.x + Math.cos(plane.pitch) * 18;
  const noseY = plane.y + Math.sin(plane.pitch) * 18;
  const wingLeftX = plane.x - Math.cos(plane.pitch) * 10 - Math.sin(plane.pitch) * 10;
  const wingLeftY = plane.y - Math.sin(plane.pitch) * 10 + Math.cos(plane.pitch) * 10;
  const wingRightX = plane.x - Math.cos(plane.pitch) * 10 + Math.sin(plane.pitch) * 10;
  const wingRightY = plane.y - Math.sin(plane.pitch) * 10 - Math.cos(plane.pitch) * 10;

  const testPoints = [
    { x: plane.x, y: plane.y },
    { x: noseX, y: noseY },
    { x: wingLeftX, y: wingLeftY },
    { x: wingRightX, y: wingRightY },
  ];

  const gapTop = barrier.gapY - barrier.gapHeight / 2;
  const gapBottom = barrier.gapY + barrier.gapHeight / 2;
  const bx = barrier.x;
  const bw = barrier.width;

  // Upper pencil geometry:
  // Body: [bx, 0, bw, gapTop - TIP_HEIGHT]
  // Sharpened tip: Triangle base [bx, gapTop - TIP_HEIGHT] to [bx + bw, gapTop - TIP_HEIGHT] pointing to [bx + bw/2, gapTop]
  const upperBodyBottom = Math.max(0, gapTop - TIP_HEIGHT);

  // Lower pencil geometry:
  // Sharpened tip: Triangle base [bx, gapBottom + TIP_HEIGHT] to [bx + bw, gapBottom + TIP_HEIGHT] pointing to [bx + bw/2, gapBottom]
  // Body: [bx, gapBottom + TIP_HEIGHT, bw, canvasHeight]
  const lowerBodyTop = Math.min(canvasHeight, gapBottom + TIP_HEIGHT);

  for (const pt of testPoints) {
    // Check horizontal overlap with pencil column
    if (pt.x >= bx && pt.x <= bx + bw) {
      // 1. Upper pencil body
      if (pt.y <= upperBodyBottom) {
        return true;
      }
      // 2. Upper pencil tip cone
      if (
        pt.y > upperBodyBottom &&
        pt.y <= gapTop &&
        isPointInTriangle(
          pt.x,
          pt.y,
          bx,
          upperBodyBottom,
          bx + bw,
          upperBodyBottom,
          bx + bw / 2,
          gapTop
        )
      ) {
        return true;
      }

      // 3. Lower pencil tip cone
      if (
        pt.y >= gapBottom &&
        pt.y <= lowerBodyTop &&
        isPointInTriangle(
          pt.x,
          pt.y,
          bx,
          lowerBodyTop,
          bx + bw,
          lowerBodyTop,
          bx + bw / 2,
          gapBottom
        )
      ) {
        return true;
      }

      // 4. Lower pencil body
      if (pt.y >= lowerBodyTop) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks if plane collides with ceiling or floor margin
 */
export function checkBoundaryCollision(
  plane: PlayerPlane,
  canvasHeight: number,
  ceilingPadding = 6,
  floorPadding = 24
): boolean {
  if (plane.y - plane.radius <= ceilingPadding) return true;
  if (plane.y + plane.radius >= canvasHeight - floorPadding) return true;
  return false;
}

/**
 * Tests if plane collects a paperclip pickup
 */
export function checkPaperclipPickup(
  plane: PlayerPlane,
  clipX: number,
  clipY: number,
  pickupRadius = 26
): boolean {
  const dx = plane.x - clipX;
  const dy = plane.y - clipY;
  return dx * dx + dy * dy <= pickupRadius * pickupRadius;
}


// ─── Stats-Aware Physics (used by game loop & server replay) ───

/**
 * Default glider stats matching the original physics constants.
 */
export const DEFAULT_GLIDER_STATS: GliderStats = {
  gravity: GRAVITY,
  flapImpulse: FLAP_IMPULSE,
  maxFallSpeed: MAX_FALL_SPEED,
  maxRiseSpeed: MAX_RISE_SPEED,
  horizontalSpeed: HORIZONTAL_SPEED,
  pitchUpAngle: -0.55,
  pitchDownAngle: 0.65,
};

/**
 * Steps glider physics using per-skin stats and optional power-up modifiers.
 * This is the authoritative physics function used by both client and server replay.
 */
export function stepGliderPhysicsWithStats(
  plane: PlayerPlane,
  dt: number,
  isFlapping: boolean,
  stats: GliderStats = DEFAULT_GLIDER_STATS,
  modifiers: { gravityMultiplier?: number; flapMultiplier?: number } = {}
): PlayerPlane {
  const grav = stats.gravity * (modifiers.gravityMultiplier ?? 1);
  const flap = stats.flapImpulse * (modifiers.flapMultiplier ?? 1);

  const newPlane = { ...plane };

  if (isFlapping) {
    newPlane.vy = flap;
    newPlane.targetPitch = stats.pitchUpAngle;
  } else {
    newPlane.vy += grav * dt;
    if (newPlane.vy > stats.maxFallSpeed) {
      newPlane.vy = stats.maxFallSpeed;
    }
    if (newPlane.vy > 100) {
      newPlane.targetPitch = stats.pitchDownAngle;
    } else {
      newPlane.targetPitch = (newPlane.vy / stats.maxFallSpeed) * stats.pitchDownAngle;
    }
  }

  if (newPlane.vy < stats.maxRiseSpeed) {
    newPlane.vy = stats.maxRiseSpeed;
  }

  const pitchLerpSpeed = newPlane.vy < 0 ? 12 : 7;
  newPlane.pitch += (newPlane.targetPitch - newPlane.pitch) * Math.min(1, dt * pitchLerpSpeed);
  newPlane.y += newPlane.vy * dt;

  return newPlane;
}

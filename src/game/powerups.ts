/**
 * powerups.ts — Power-Up System
 *
 * Defines three thematic power-up types with spawning logic, collision
 * detection, physics modifiers, and Canvas 2D rendering.
 *
 * Power-ups:
 *   📎 Paperclip Magnet — pulls nearby pickups toward the plane
 *   🛡️ Drafting Tape Shield — absorbs one collision
 *   🚀 Rubber Band Slingshot — speed boost with reduced gravity
 */

import type { PowerUp, PowerUpType, ActivePowerUp, PlayerPlane } from './types';

// ─── Power-Up Definitions ───────────────────────────────────────────────────

/**
 * Static definition for a power-up type — appearance, duration,
 * spawn rules, and minimum score requirement.
 */
export interface PowerUpDefinition {
  /** Internal power-up type key */
  type: PowerUpType;
  /** Human-readable display name */
  name: string;
  /** Short description of the effect */
  description: string;
  /** Emoji icon drawn on the power-up */
  icon: string;
  /** Primary colour for the power-up circle */
  color: string;
  /** Glow colour (translucent) for the pulsing aura */
  glowColor: string;
  /** Duration of the effect in seconds (0 = single-use) */
  duration: number;
  /** Probability of spawning per barrier (0–1) */
  spawnChance: number;
  /** Minimum score before this power-up can appear */
  minScore: number;
}

/** All power-up definitions, keyed by type */
export const POWERUP_DEFINITIONS: Record<PowerUpType, PowerUpDefinition> = {
  magnet: {
    type: 'magnet',
    name: 'Paperclip Magnet',
    icon: '📎',
    description: 'Pulls nearby paperclips toward your plane',
    color: '#f59e0b',
    glowColor: 'rgba(245,158,11,0.4)',
    duration: 5,
    spawnChance: 0.08,
    minScore: 5,
  },
  shield: {
    type: 'shield',
    name: 'Drafting Tape Shield',
    icon: '🛡️',
    description: 'Absorbs one collision',
    color: '#3b82f6',
    glowColor: 'rgba(59,130,246,0.4)',
    duration: 0, // Single-use
    spawnChance: 0.05,
    minScore: 8,
  },
  slingshot: {
    type: 'slingshot',
    name: 'Rubber Band Slingshot',
    icon: '🚀',
    description: 'Speed boost with reduced gravity',
    color: '#ef4444',
    glowColor: 'rgba(239,68,68,0.4)',
    duration: 3,
    spawnChance: 0.06,
    minScore: 3,
  },
};

/** Ordered list of all power-up types for iteration */
const ALL_TYPES: PowerUpType[] = ['magnet', 'shield', 'slingshot'];

// ─── Spawning ───────────────────────────────────────────────────────────────

/**
 * Decide whether to spawn a power-up near a barrier.
 *
 * Iterates through all power-up types in order, rolling the dice
 * for each one that the player's score qualifies for. Returns the
 * first type that passes, or null if none spawn.
 *
 * @param score  The player's current score
 * @param rng    A function returning a float in [0, 1) — use a seeded
 *               PRNG for deterministic replay
 * @returns      The PowerUpType to spawn, or null
 */
export function shouldSpawnPowerUp(
  score: number,
  rng: () => number,
): PowerUpType | null {
  for (const type of ALL_TYPES) {
    const def = POWERUP_DEFINITIONS[type];
    if (score >= def.minScore && rng() < def.spawnChance) {
      return type;
    }
  }
  return null;
}

/**
 * Create a PowerUp object at the specified position.
 *
 * @param id    Unique identifier for the power-up
 * @param type  The power-up type
 * @param x     X position in world coordinates
 * @param y     Y position in world coordinates
 * @returns     A fully initialised PowerUp
 */
export function createPowerUp(
  id: number,
  type: PowerUpType,
  x: number,
  y: number,
): PowerUp {
  return {
    id,
    type,
    x,
    y,
    collected: false,
    rotation: 0,
  };
}

// ─── Pickup Detection ───────────────────────────────────────────────────────

/** Default collection radius in pixels */
const DEFAULT_COLLECT_RADIUS = 28;

/**
 * Check whether the player plane is close enough to collect a power-up.
 *
 * Uses simple circle-vs-circle distance check for performance.
 *
 * @param plane          The player's plane
 * @param powerUp        The power-up to test
 * @param collectRadius  Distance threshold (default: 28px)
 * @returns              true if the plane can pick up the power-up
 */
export function checkPowerUpPickup(
  plane: PlayerPlane,
  powerUp: PowerUp,
  collectRadius: number = DEFAULT_COLLECT_RADIUS,
): boolean {
  if (powerUp.collected) return false;

  const dx = plane.x - powerUp.x;
  const dy = plane.y - powerUp.y;
  const distSq = dx * dx + dy * dy;
  const totalRadius = plane.radius + collectRadius;

  return distSq <= totalRadius * totalRadius;
}

// ─── Physics Modifiers ──────────────────────────────────────────────────────

/** Each simulation receives its own modifiers; replays never share mutable state. */

/**
 * Compute aggregate physics modifiers from all currently active power-ups.
 *
 * Multiple active power-ups stack multiplicatively for speed/gravity
 * and additively for boolean/radius effects.
 *
 * @param activePowerUps  Array of currently active power-ups
 * @returns               Physics modifier values to apply to the plane
 *
 * @example
 * ```ts
 * const mods = getPowerUpPhysicsModifiers(activePowerUps);
 * plane.vy += GRAVITY * mods.gravityMultiplier * dt;
 * scrollSpeed *= mods.speedMultiplier;
 * ```
 */
export function getPowerUpPhysicsModifiers(activePowerUps: ActivePowerUp[]): {
  gravityMultiplier: number;
  flapMultiplier: number;
  speedMultiplier: number;
  isShielded: boolean;
  magnetRadius: number;
} {
  const modifiers = {
    gravityMultiplier: 1,
    flapMultiplier: 1,
    speedMultiplier: 1,
    isShielded: false,
    magnetRadius: 0,
  };

  for (let i = 0; i < activePowerUps.length; i++) {
    const active = activePowerUps[i];
    if (active.duration > 0 && active.remainingTime <= 0) continue;

    switch (active.type) {
      case 'magnet':
        modifiers.magnetRadius = 120;
        break;

      case 'shield':
        modifiers.isShielded = true;
        break;

      case 'slingshot':
        modifiers.speedMultiplier *= 1.4;
        modifiers.gravityMultiplier *= 0.7;
        break;
    }
  }

  return modifiers;
}

// ─── Rendering: Power-Up in World ───────────────────────────────────────────

/** Radius of the power-up circle */
const POWERUP_RADIUS = 16;

/** Bobbing amplitude in pixels */
const BOB_AMPLITUDE = 4;

/** Bobbing speed multiplier */
const BOB_SPEED = 3;

/** Glow pulse speed */
const GLOW_SPEED = 4;

/** Maximum glow radius expansion */
const GLOW_EXPANSION = 6;

/**
 * Draw a power-up on the canvas.
 *
 * Renders as a floating circle with the power-up's colour, a pulsing
 * glow aura, and the emoji icon in the centre. The power-up bobs up
 * and down using a sine wave.
 *
 * @param ctx      Canvas 2D rendering context
 * @param powerUp  The power-up to draw
 * @param time     Current time in seconds (for animation)
 */
export function drawPowerUp(
  ctx: CanvasRenderingContext2D,
  powerUp: PowerUp,
  time: number,
): void {
  if (powerUp.collected) return;

  const def = POWERUP_DEFINITIONS[powerUp.type];
  const bobY = Math.sin(time * BOB_SPEED) * BOB_AMPLITUDE;
  const drawX = powerUp.x;
  const drawY = powerUp.y + bobY;

  ctx.save();

  // Pulsing glow
  const glowPulse = (Math.sin(time * GLOW_SPEED) + 1) * 0.5; // 0 to 1
  const glowRadius = POWERUP_RADIUS + GLOW_EXPANSION * glowPulse;

  ctx.beginPath();
  ctx.arc(drawX, drawY, glowRadius, 0, Math.PI * 2);
  ctx.fillStyle = def.glowColor;
  ctx.fill();

  // Main circle
  ctx.beginPath();
  ctx.arc(drawX, drawY, POWERUP_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = def.color;
  ctx.fill();

  // White inner highlight
  ctx.beginPath();
  ctx.arc(drawX - 3, drawY - 3, POWERUP_RADIUS * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fill();

  // Emoji icon
  ctx.font = '14px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(def.icon, drawX, drawY);

  ctx.restore();
}

// ─── Rendering: Active Power-Up HUD ────────────────────────────────────────

/** HUD indicator dimensions */
const HUD_WIDTH = 110;
const HUD_HEIGHT = 28;
const HUD_PADDING = 6;
const HUD_GAP = 4;
const HUD_RADIUS = 6;
const HUD_BAR_HEIGHT = 3;

/**
 * Draw active power-up HUD indicators.
 *
 * Each active power-up is shown as a small rounded rectangle with the
 * emoji icon, name abbreviation, and a shrinking progress bar showing
 * remaining time. Indicators stack vertically.
 *
 * @param ctx      Canvas 2D rendering context
 * @param actives  Array of currently active power-ups
 * @param x        X position of the HUD block
 * @param y        Y position of the HUD block
 */
export function drawActivePowerUpHUD(
  ctx: CanvasRenderingContext2D,
  actives: ActivePowerUp[],
  x: number,
  y: number,
): void {
  if (actives.length === 0) return;

  ctx.save();

  for (let i = 0; i < actives.length; i++) {
    const active = actives[i];
    const def = POWERUP_DEFINITIONS[active.type];
    const oy = y + i * (HUD_HEIGHT + HUD_GAP);

    // Background rounded rect
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    drawRoundedRect(ctx, x, oy, HUD_WIDTH, HUD_HEIGHT, HUD_RADIUS);
    ctx.fill();

    // Border
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, x, oy, HUD_WIDTH, HUD_HEIGHT, HUD_RADIUS);
    ctx.stroke();

    // Icon
    ctx.font = '12px serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(def.icon, x + HUD_PADDING, oy + HUD_HEIGHT * 0.4);

    // Name
    ctx.font = 'bold 9px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(def.name, x + HUD_PADDING + 18, oy + HUD_HEIGHT * 0.35);

    // Progress bar (only for timed power-ups)
    if (def.duration > 0) {
      const barX = x + HUD_PADDING + 18;
      const barY = oy + HUD_HEIGHT - HUD_PADDING - HUD_BAR_HEIGHT;
      const barMaxWidth = HUD_WIDTH - HUD_PADDING * 2 - 18;
      const progress = Math.max(0, active.remainingTime / active.duration);

      // Background track
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(barX, barY, barMaxWidth, HUD_BAR_HEIGHT);

      // Filled portion
      ctx.fillStyle = def.color;
      ctx.fillRect(barX, barY, barMaxWidth * progress, HUD_BAR_HEIGHT);
    } else {
      // Single-use indicator (e.g. shield)
      ctx.font = '8px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('ACTIVE', x + HUD_PADDING + 18, oy + HUD_HEIGHT - HUD_PADDING);
    }
  }

  ctx.restore();
}

// ─── Helper: Rounded Rectangle Path ────────────────────────────────────────

/**
 * Trace a rounded rectangle path (does not fill or stroke).
 *
 * @param ctx     Canvas context
 * @param x       Top-left x
 * @param y       Top-left y
 * @param w       Width
 * @param h       Height
 * @param radius  Corner radius
 */
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

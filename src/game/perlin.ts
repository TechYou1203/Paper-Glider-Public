/**
 * perlin.ts — 1D/2D Perlin Noise Generator
 *
 * Lightweight Perlin noise for smooth, organic procedural effects:
 * camera shake, terrain generation, wind gusts, etc.
 *
 * Uses the standard 256-entry permutation table approach.
 */

// ─── Permutation Table ──────────────────────────────────────────────────────

/**
 * Standard permutation table (Ken Perlin's reference implementation).
 * Doubled to 512 entries to avoid wrapping index arithmetic.
 */
const PERM: Uint8Array = new Uint8Array(512);

/** Base permutation — a shuffled sequence of 0-255 */
const BASE_PERM: readonly number[] = [
  151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225,
  140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148,
  247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32,
  57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175,
  74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122,
  60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54,
  65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169,
  200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64,
  52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212,
  207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213,
  119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9,
  129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104,
  218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241,
  81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157,
  184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93,
  222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180,
];

// Initialise the doubled permutation table
for (let i = 0; i < 256; i++) {
  PERM[i] = BASE_PERM[i];
  PERM[i + 256] = BASE_PERM[i];
}

// ─── Utility Functions ──────────────────────────────────────────────────────

/**
 * Compute the 5th-order smoothstep (Perlin's improved fade curve).
 * 6t^5 - 15t^4 + 10t^3
 */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Linear interpolation between a and b.
 */
function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

/**
 * 1D gradient function. Returns +x or -x based on hash bit.
 */
function grad1D(hash: number, x: number): number {
  return (hash & 1) === 0 ? x : -x;
}

/**
 * 2D gradient function. Uses the hash to select one of 4 gradient directions.
 */
function grad2D(hash: number, x: number, y: number): number {
  const h = hash & 3;
  switch (h) {
    case 0: return x + y;
    case 1: return -x + y;
    case 2: return x - y;
    case 3: return -x - y;
    default: return 0; // unreachable
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * 1D Perlin noise.
 *
 * @param x  The input coordinate
 * @returns  A value in approximately [-1, 1]
 */
export function noise1D(x: number): number {
  // Integer part (grid cell)
  const xi = Math.floor(x) & 255;
  // Fractional part within cell
  const xf = x - Math.floor(x);

  const u = fade(xf);

  const a = PERM[xi];
  const b = PERM[xi + 1];

  return lerp(grad1D(a, xf), grad1D(b, xf - 1), u);
}

/**
 * 2D Perlin noise.
 *
 * @param x  The x input coordinate
 * @param y  The y input coordinate
 * @returns  A value in approximately [-1, 1]
 */
export function noise2D(x: number, y: number): number {
  // Integer grid coordinates
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;

  // Fractional part within cell
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);

  const u = fade(xf);
  const v = fade(yf);

  // Hash corners of the unit square
  const aa = PERM[PERM[xi] + yi];
  const ab = PERM[PERM[xi] + yi + 1];
  const ba = PERM[PERM[xi + 1] + yi];
  const bb = PERM[PERM[xi + 1] + yi + 1];

  // Bilinear interpolation of gradient dot products
  const x1 = lerp(grad2D(aa, xf, yf), grad2D(ba, xf - 1, yf), u);
  const x2 = lerp(grad2D(ab, xf, yf - 1), grad2D(bb, xf - 1, yf - 1), u);

  return lerp(x1, x2, v);
}

/**
 * Fractal Brownian Motion — layered Perlin noise for richer detail.
 *
 * Each successive octave doubles the frequency (controlled by lacunarity)
 * and halves the amplitude (controlled by gain), producing a self-similar
 * pattern at multiple scales.
 *
 * @param x           The input coordinate
 * @param octaves     Number of noise layers (default: 4)
 * @param lacunarity  Frequency multiplier per octave (default: 2.0)
 * @param gain        Amplitude multiplier per octave (default: 0.5)
 * @returns           A value in approximately [-1, 1]
 */
export function fbm(
  x: number,
  octaves: number = 4,
  lacunarity: number = 2.0,
  gain: number = 0.5,
): number {
  let value = 0;
  let amplitude = 1.0;
  let frequency = 1.0;
  let maxAmplitude = 0; // For normalisation

  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise1D(x * frequency);
    maxAmplitude += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  // Normalise to [-1, 1]
  return value / maxAmplitude;
}

// ─── Camera Shake ───────────────────────────────────────────────────────────

/** Maximum pixel offset for camera shake */
const MAX_OFFSET = 20;

/** Maximum rotation in radians for camera shake */
const MAX_ANGLE = 0.05;

/** Noise frequency for X axis shake */
const FREQ_X = 15;

/** Noise frequency for Y axis shake */
const FREQ_Y = 17;

/** Noise frequency for rotation shake */
const FREQ_ROT = 13;

/** Reusable result object to avoid per-frame allocations */
const shakeResult = { x: 0, y: 0, rotation: 0 };

/**
 * Generate smooth camera shake offsets using Perlin noise.
 *
 * Produces organic, non-repetitive shake that looks much better than
 * random jitter. The trauma value (0–1) controls intensity with quadratic
 * falloff — small hits produce subtle wobble, large hits produce violent shake.
 *
 * @param time    Time value in seconds (e.g. performance.now() / 1000)
 * @param trauma  Shake intensity from 0 (none) to 1 (maximum)
 * @returns       An object with x, y pixel offsets and rotation in radians
 *
 * @example
 * ```ts
 * // On hit: set trauma to 0.6
 * trauma = 0.6;
 *
 * // Each frame: decay trauma and apply shake
 * trauma = Math.max(0, trauma - dt * 0.8);
 * const shake = perlinShake(performance.now() / 1000, trauma);
 * ctx.translate(shake.x, shake.y);
 * ctx.rotate(shake.rotation);
 * ```
 */
export function perlinShake(
  time: number,
  trauma: number,
): { x: number; y: number; rotation: number } {
  // Quadratic falloff feels more natural than linear
  const shake = trauma * trauma;

  shakeResult.x = MAX_OFFSET * shake * noise1D(time * FREQ_X);
  shakeResult.y = MAX_OFFSET * shake * noise1D(time * FREQ_Y + 100);
  shakeResult.rotation = MAX_ANGLE * shake * noise1D(time * FREQ_ROT + 200);

  return shakeResult;
}

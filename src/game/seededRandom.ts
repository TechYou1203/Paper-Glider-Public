/**
 * seededRandom.ts — Deterministic PRNG (Mulberry32)
 *
 * A fast, deterministic 32-bit pseudo-random number generator.
 * Produces identical sequences for the same seed on client and server,
 * enabling anti-cheat replay verification of flight sessions.
 */

/**
 * Interface for a seeded pseudo-random number generator.
 * All methods consume from the same internal sequence, so call order matters
 * for deterministic replay.
 */
export interface SeededRandom {
  /** Returns a float in [0, 1) */
  next(): number;

  /**
   * Returns an integer in [min, max).
   * @param min Inclusive lower bound
   * @param max Exclusive upper bound
   */
  nextInt(min: number, max: number): number;

  /**
   * Returns a float in [min, max).
   * @param min Inclusive lower bound
   * @param max Exclusive upper bound
   */
  nextFloat(min: number, max: number): number;

  /**
   * Pick a random element from an array.
   * @param arr The source array (must not be empty)
   * @returns A randomly selected element
   */
  pick<T>(arr: T[]): T;

  /**
   * Shuffle an array in place using Fisher-Yates.
   * @param arr The array to shuffle
   * @returns The same array, shuffled
   */
  shuffle<T>(arr: T[]): T[];
}

/**
 * Mulberry32 — a fast 32-bit PRNG with excellent distribution.
 *
 * @param seed  A 32-bit integer seed
 * @returns A function that returns the next float in [0, 1) on each call
 */
function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Convert a string to a deterministic numeric seed using a simple hash.
 *
 * Uses a multiplicative hash (factor 31) that produces well-distributed
 * 32-bit integer seeds from arbitrary strings.
 *
 * @param str The string to hash
 * @returns A 32-bit integer seed
 */
export function seedFromString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}

/**
 * Create a seeded PRNG from a string seed.
 *
 * The string is hashed to a 32-bit integer, then used to initialise a
 * Mulberry32 generator. The returned object provides convenience methods
 * for common random operations, all backed by the same deterministic
 * sequence.
 *
 * @param seed A string seed (e.g. session ID)
 * @returns A SeededRandom instance
 *
 * @example
 * ```ts
 * const rng = createSeededRandom('session-abc-123');
 * const roll = rng.nextInt(1, 7); // deterministic dice roll
 * const color = rng.pick(['red', 'blue', 'green']);
 * ```
 */
export function createSeededRandom(seed: string): SeededRandom {
  const numericSeed = seedFromString(seed);
  const nextRaw = mulberry32(numericSeed);

  return {
    next(): number {
      return nextRaw();
    },

    nextInt(min: number, max: number): number {
      return Math.floor(nextRaw() * (max - min)) + min;
    },

    nextFloat(min: number, max: number): number {
      return nextRaw() * (max - min) + min;
    },

    pick<T>(arr: T[]): T {
      return arr[Math.floor(nextRaw() * arr.length)];
    },

    shuffle<T>(arr: T[]): T[] {
      // Fisher-Yates (Knuth) shuffle — O(n), in-place
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(nextRaw() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
      return arr;
    },
  };
}

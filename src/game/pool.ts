/**
 * pool.ts — Generic Object Pool
 *
 * Zero-allocation object pool for reusing game objects (particles, power-ups).
 * Pre-allocates objects and recycles them to avoid GC pressure during gameplay.
 */

import type { Particle, PowerUp, PencilBarrier } from './types';

/**
 * Generic, zero-allocation object pool.
 *
 * Objects are created via a factory function and recycled through a reset
 * function, eliminating per-frame allocations for frequently created/destroyed
 * objects like particles and power-ups.
 *
 * @template T The type of pooled object
 */
export class ObjectPool<T> {
  private pool: T[] = [];
  private active: T[] = [];
  private factory: () => T;
  private reset: (obj: T) => void;

  /**
   * @param factory  Function that creates a new default instance of T
   * @param reset    Function that resets an instance back to its default state
   * @param initialSize  Number of objects to pre-allocate
   */
  constructor(factory: () => T, reset: (obj: T) => void, initialSize: number) {
    this.factory = factory;
    this.reset = reset;

    // Pre-allocate the initial pool
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(factory());
    }
  }

  /**
   * Acquire an object from the pool. If the pool is empty, a new object
   * is created via the factory function.
   * @returns A recycled or freshly created object
   */
  acquire(): T {
    const obj = this.pool.length > 0 ? this.pool.pop()! : this.factory();
    this.active.push(obj);
    return obj;
  }

  /**
   * Release an object back to the pool, resetting it to its default state.
   * The object is removed from the active list and made available for reuse.
   * @param obj The object to release
   */
  release(obj: T): void {
    const idx = this.active.indexOf(obj);
    if (idx === -1) return;

    // Swap-remove for O(1) removal from active list
    const last = this.active.length - 1;
    if (idx !== last) {
      this.active[idx] = this.active[last];
    }
    this.active.pop();

    this.reset(obj);
    this.pool.push(obj);
  }

  /**
   * Release all active objects that match a predicate back to the pool.
   * Useful for batch-removing dead particles, off-screen objects, etc.
   * @param predicate Function returning true for objects that should be released
   */
  releaseWhere(predicate: (obj: T) => boolean): void {
    // Iterate backwards to allow safe swap-removal
    for (let i = this.active.length - 1; i >= 0; i--) {
      if (predicate(this.active[i])) {
        const obj = this.active[i];

        // Swap-remove
        const last = this.active.length - 1;
        if (i !== last) {
          this.active[i] = this.active[last];
        }
        this.active.pop();

        this.reset(obj);
        this.pool.push(obj);
      }
    }
  }

  /**
   * Get all currently active (in-use) objects.
   * Returns a readonly view — do not mutate the returned array.
   */
  getActive(): readonly T[] {
    return this.active;
  }

  /** Number of currently active (in-use) objects */
  get activeCount(): number {
    return this.active.length;
  }

  /**
   * Release every active object back to the pool.
   * Useful for scene transitions or game resets.
   */
  releaseAll(): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      this.reset(this.active[i]);
      this.pool.push(this.active[i]);
    }
    this.active.length = 0;
  }
}

// ─── Pre-configured Pool Factories ──────────────────────────────────────────

/** Default particle size for pre-allocation */
const DEFAULT_PARTICLE_POOL_SIZE = 64;

/** Default power-up pool size for pre-allocation */
const DEFAULT_POWERUP_POOL_SIZE = 8;

/**
 * Creates a Particle with all fields zeroed/defaulted.
 * @returns A default Particle
 */
function particleFactory(): Particle {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    size: 2,
    color: '#ffffff',
    alpha: 0,
    decay: 0.02,
    rotation: 0,
    vRot: 0,
    shape: 'paper',
  };
}

/**
 * Resets a Particle back to its default (invisible, zero-positioned) state.
 * @param p The particle to reset
 */
function resetParticle(p: Particle): void {
  p.x = 0;
  p.y = 0;
  p.vx = 0;
  p.vy = 0;
  p.size = 2;
  p.color = '#ffffff';
  p.alpha = 0;
  p.decay = 0.02;
  p.rotation = 0;
  p.vRot = 0;
  p.shape = 'paper';
}

/**
 * Creates a PowerUp with all fields zeroed/defaulted.
 * @returns A default PowerUp
 */
function powerUpFactory(): PowerUp {
  return {
    id: 0,
    type: 'magnet',
    x: 0,
    y: 0,
    collected: false,
    rotation: 0,
  };
}

/**
 * Resets a PowerUp back to its default state.
 * @param p The power-up to reset
 */
function resetPowerUp(p: PowerUp): void {
  p.id = 0;
  p.type = 'magnet';
  p.x = 0;
  p.y = 0;
  p.collected = false;
  p.rotation = 0;
}

/**
 * Create a pre-configured object pool for Particles.
 * @param size Initial pool size (default: 64)
 * @returns An ObjectPool<Particle>
 */
export function createParticlePool(size: number = DEFAULT_PARTICLE_POOL_SIZE): ObjectPool<Particle> {
  return new ObjectPool<Particle>(particleFactory, resetParticle, size);
}

/**
 * Create a pre-configured object pool for PowerUps.
 * @param size Initial pool size (default: 8)
 * @returns An ObjectPool<PowerUp>
 */
export function createPowerUpPool(size: number = DEFAULT_POWERUP_POOL_SIZE): ObjectPool<PowerUp> {
  return new ObjectPool<PowerUp>(powerUpFactory, resetPowerUp, size);
}

/** Barriers are fully reinitialized by generateSeededBarrier when acquired. */
export function createBarrierPool(size = 8): ObjectPool<PencilBarrier> {
  return new ObjectPool<PencilBarrier>(() => ({
    id: 0, x: 0, width: 64, gapY: 300, gapHeight: 190,
    colorType: 'yellow', brandLabel: '', hasClip: false,
    clipCollected: false, clipX: 0, clipY: 300, passed: false,
  }), (barrier) => {
    barrier.clipCollected = false;
    barrier.passed = false;
    barrier.speedY = 0;
  }, size);
}

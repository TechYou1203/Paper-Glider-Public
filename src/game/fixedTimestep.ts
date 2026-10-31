/**
 * fixedTimestep.ts — Fixed Timestep Accumulator
 *
 * Decouples physics simulation from rendering frame rate.
 * Physics always runs at a consistent 60 Hz regardless of display refresh rate,
 * with interpolation alpha for smooth rendering between physics steps.
 *
 * Prevents the "spiral of death" by capping raw delta time and limiting
 * the maximum number of physics steps per frame.
 */

/** Fixed physics timestep: 1/60th of a second (60 Hz) */
export const FIXED_DT: number = 1 / 60;

/**
 * State for the fixed timestep accumulator.
 *
 * Keep one instance per game loop and pass it to `advanceFixedTimestep`
 * each frame.
 */
export interface FixedTimestepState {
  /** Accumulated leftover time from previous frames (seconds) */
  accumulator: number;

  /**
   * Interpolation alpha for rendering between physics steps.
   * Range [0, 1) — use this to lerp render positions between the
   * previous and current physics state for smooth visuals.
   */
  interpolationAlpha: number;
}

/**
 * Create a new fixed timestep state, initialised to zero.
 * @returns A fresh FixedTimestepState
 */
export function createFixedTimestep(): FixedTimestepState {
  return {
    accumulator: 0,
    interpolationAlpha: 0,
  };
}

/**
 * Maximum raw delta time allowed (100 ms).
 * Prevents the "spiral of death" when the tab is backgrounded or
 * the frame rate drops severely — without this cap, the accumulator
 * would try to catch up with dozens of physics steps at once.
 */
const MAX_RAW_DT = 0.1;

/** Default maximum physics steps per frame */
const DEFAULT_MAX_STEPS = 5;

/**
 * Advance the fixed timestep accumulator by the real elapsed time.
 *
 * Calls `stepFn` zero or more times with `FIXED_DT` to bring the
 * physics simulation up to date, then computes the interpolation
 * alpha for smooth rendering.
 *
 * @param state            The accumulator state (mutated in place)
 * @param rawDt            Real elapsed time since last frame (seconds)
 * @param stepFn           Physics step callback, called with FIXED_DT
 * @param maxStepsPerFrame Maximum physics steps per frame (default: 5)
 * @returns                Interpolation alpha in [0, 1) for rendering
 *
 * @example
 * ```ts
 * const tsState = createFixedTimestep();
 * let lastTime = performance.now();
 *
 * function gameLoop(now: number) {
 *   const rawDt = (now - lastTime) / 1000;
 *   lastTime = now;
 *
 *   const alpha = advanceFixedTimestep(tsState, rawDt, (dt) => {
 *     updatePhysics(dt);
 *     checkCollisions();
 *     frameCount++;
 *   });
 *
 *   // Render with interpolation
 *   render(alpha);
 *   requestAnimationFrame(gameLoop);
 * }
 * ```
 */
export function advanceFixedTimestep(
  state: FixedTimestepState,
  rawDt: number,
  stepFn: (dt: number) => void,
  maxStepsPerFrame: number = DEFAULT_MAX_STEPS,
): number {
  // Ignore invalid clock deltas and discard excess work after a long stall.
  const clampedDt = Number.isFinite(rawDt) ? Math.max(0, Math.min(rawDt, MAX_RAW_DT)) : 0;
  const stepLimit = Number.isFinite(maxStepsPerFrame)
    ? Math.max(1, Math.floor(maxStepsPerFrame))
    : DEFAULT_MAX_STEPS;

  state.accumulator += clampedDt;

  let steps = 0;
  while (state.accumulator + 1e-10 >= FIXED_DT && steps < stepLimit) {
    stepFn(FIXED_DT);
    state.accumulator = Math.max(0, state.accumulator - FIXED_DT);
    steps++;
  }

  if (steps >= stepLimit && state.accumulator >= FIXED_DT) {
    state.accumulator %= FIXED_DT;
  }

  // Compute interpolation alpha for smooth rendering
  state.interpolationAlpha = state.accumulator / FIXED_DT;

  return state.interpolationAlpha;
}

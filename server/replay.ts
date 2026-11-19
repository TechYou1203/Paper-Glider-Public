// Headless physics replay verifier for anti-cheat
import { createFlightSimulation, stepFlightSimulation, MAX_FLIGHT_FRAMES } from '../src/game/simulation.js';

export interface ReplayFlapInput {
  frame: number;
  action: 'flap';
}

export interface ReplayResizeInput {
  frame: number;
  action: 'resize';
  width: number;
  height: number;
}

export type ReplayInput = ReplayFlapInput | ReplayResizeInput;

export interface ReplayResult {
  valid: boolean;
  replayScore: number;
  replayClips: number;
  frames: number;
}

export function verifyReplay(
  seed: string,
  inputs: ReplayInput[],
  claimedScore: number,
  skinId: string = 'classic',
  worldWidth: number = 800,
  worldHeight: number = 600
): ReplayResult {
  const sim = createFlightSimulation(seed, skinId, worldWidth, worldHeight);
  // Preserve the client's ordering for events that share a frame (a resize
  // must be applied before the flap on that same tick).
  const sortedInputs = inputs
    .map((input, index) => ({ input, index }))
    .sort((a, b) => a.input.frame - b.input.frame || a.index - b.index)
    .map(({ input }) => input);
  let inputIndex = 0;

  while (sim.plane.isAlive && sim.frameCount < MAX_FLIGHT_FRAMES) {
    let flap = false;
    while (inputIndex < sortedInputs.length && sortedInputs[inputIndex].frame === sim.frameCount) {
      const input = sortedInputs[inputIndex];
      if (input.action === 'resize') {
        if (Number.isFinite(input.width) && Number.isFinite(input.height)) {
          sim.worldWidth = input.width;
          sim.worldHeight = input.height;
        }
      } else {
        flap = true;
      }
      inputIndex++;
    }

    const events = stepFlightSimulation(sim, flap);
    if (events.crashed) break;
  }

  // The client submits the exact score produced by this same simulation. Any
  // difference means the replay diverged or the score was fabricated.
  const valid = sim.score === claimedScore;

  return {
    valid,
    replayScore: sim.score,
    replayClips: sim.clipsCollected,
    frames: sim.frameCount,
  };
}

// Headless physics replay verifier for anti-cheat
import { createFlightSimulation, stepFlightSimulation } from '../src/game/simulation.js';

export interface ReplayInput {
  frame: number;
  action: 'flap';
}

export function verifyReplay(
  seed: string,
  inputs: ReplayInput[],
  claimedScore: number,
  skinId: string = 'classic',
  worldWidth: number = 800,
  worldHeight: number = 600
): { valid: boolean; replayScore: number } {
  const sim = createFlightSimulation(seed, skinId, worldWidth, worldHeight);
  const sortedInputs = [...inputs].sort((a, b) => a.frame - b.frame);
  let inputIndex = 0;

  const maxFrame = sortedInputs.length > 0
    ? sortedInputs[sortedInputs.length - 1].frame + 120
    : 600;

  while (sim.plane.isAlive && sim.frameCount <= maxFrame && sim.frameCount < 60 * 60 * 10) {
    let flap = false;
    while (inputIndex < sortedInputs.length && sortedInputs[inputIndex].frame === sim.frameCount) {
      if (sortedInputs[inputIndex].action === 'flap') {
        flap = true;
      }
      inputIndex++;
    }

    const events = stepFlightSimulation(sim, flap);
    if (events.crashed) {
      break;
    }
  }

  // Allow ±1 tolerance for frame timing edge cases
  const valid = Math.abs(sim.score - claimedScore) <= 1;

  return { valid, replayScore: sim.score };
}

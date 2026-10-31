/**
 * biomes.ts — Biome System
 *
 * Three distinct visual biomes that transition as the player's score increases,
 * each with unique background doodles, colour palettes, and paper textures.
 *
 * Biome 1: Classroom Notebook  (score  0–14)
 * Biome 2: Art Studio Sketchpad (score 15–29)
 * Biome 3: Architect's Drafting Table (score 30+)
 */

import type { BiomeConfig } from './types';

// ─── Biome Definitions ──────────────────────────────────────────────────────

/** The Classroom Notebook — familiar lined paper with school doodles */
const CLASSROOM: BiomeConfig = {
  id: 'classroom',
  name: 'Classroom Notebook',
  paperBg: '#faf7ed',
  paperGrainFrom: 'rgba(255,255,255,0.5)',
  paperGrainMid: 'rgba(240,235,220,0.2)',
  paperGrainTo: 'rgba(230,220,200,0.4)',
  lineColor: 'rgba(165,190,218,0.5)',
  marginColor: 'rgba(239,90,90,0.65)',
  holeFill: '#e8e2d2',
  holeStroke: '#c5bea9',
  spiralColor: 'rgba(120,115,100,0.35)',
  pencilPalette: ['yellow', 'blue', 'red', 'green', 'graphite'],
  doodleOpacity: 0.18,
  transitionAtScore: 0,
};

/** The Art Studio — warm tones with creative, artistic doodles */
const ART_STUDIO: BiomeConfig = {
  id: 'art_studio',
  name: 'Art Studio Sketchpad',
  paperBg: '#fdf6e3',
  paperGrainFrom: 'rgba(255,248,230,0.6)',
  paperGrainMid: 'rgba(245,235,210,0.3)',
  paperGrainTo: 'rgba(235,220,195,0.5)',
  lineColor: 'rgba(200,180,150,0.35)',
  marginColor: 'rgba(180,140,100,0.5)',
  holeFill: '#f0e6d0',
  holeStroke: '#d4c8ae',
  spiralColor: 'rgba(140,125,100,0.3)',
  pencilPalette: ['red', 'blue', 'graphite', 'green'],
  doodleOpacity: 0.22,
  transitionAtScore: 15,
};

/** The Architect's Desk — cool, precise drafting table aesthetic */
const ARCHITECTS_DESK: BiomeConfig = {
  id: 'architects_desk',
  name: "Architect's Drafting Table",
  paperBg: '#f0f4f8',
  paperGrainFrom: 'rgba(240,244,248,0.5)',
  paperGrainMid: 'rgba(220,230,240,0.3)',
  paperGrainTo: 'rgba(200,215,230,0.4)',
  lineColor: 'rgba(100,130,180,0.3)',
  marginColor: 'rgba(60,100,160,0.4)',
  holeFill: '#dce4ec',
  holeStroke: '#b8c8d8',
  spiralColor: 'rgba(80,100,130,0.3)',
  pencilPalette: ['graphite', 'blue', 'red'],
  doodleOpacity: 0.15,
  transitionAtScore: 30,
};

/** All biomes, ordered by transitionAtScore ascending */
export const BIOMES: BiomeConfig[] = [CLASSROOM, ART_STUDIO, ARCHITECTS_DESK];

// ─── Transition width (score points over which biomes cross-fade) ───────────

const TRANSITION_RANGE = 3;

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Get the current biome based on the player's score.
 *
 * @param score The player's current score
 * @returns The active BiomeConfig
 */
export function getCurrentBiome(score: number): BiomeConfig {
  // Walk backwards to find the highest-threshold biome the score qualifies for
  for (let i = BIOMES.length - 1; i >= 0; i--) {
    if (score >= BIOMES[i].transitionAtScore) {
      return BIOMES[i];
    }
  }
  return BIOMES[0];
}

/**
 * Get the transition state between the current and next biome.
 *
 * Returns the current biome, the next biome (if one exists), and a
 * progress value from 0 to 1 indicating how far the transition has
 * progressed. This can be used for cross-fading backgrounds.
 *
 * @param score The player's current score
 * @returns Transition info: current biome, next biome (or null), progress 0–1
 */
export function getBiomeTransition(score: number): {
  current: BiomeConfig;
  next: BiomeConfig | null;
  progress: number;
} {
  let currentIdx = 0;
  for (let i = BIOMES.length - 1; i >= 0; i--) {
    if (score >= BIOMES[i].transitionAtScore) {
      currentIdx = i;
      break;
    }
  }

  const current = BIOMES[currentIdx];
  const next = currentIdx < BIOMES.length - 1 ? BIOMES[currentIdx + 1] : null;

  if (!next) {
    return { current, next: null, progress: 0 };
  }

  // Transition begins TRANSITION_RANGE points before the next biome threshold
  const transitionStart = next.transitionAtScore - TRANSITION_RANGE;

  if (score < transitionStart) {
    return { current, next, progress: 0 };
  }

  const progress = Math.min(
    1,
    (score - transitionStart) / TRANSITION_RANGE,
  );

  return { current, next, progress };
}

// ─── Doodle Drawing ─────────────────────────────────────────────────────────

/** Loop width for parallax-scrolling doodles */
const LOOP_WIDTH = 720;

/** Parallax factor for doodle scroll speed relative to foreground */
const PARALLAX_FACTOR = 0.35;

/**
 * Draw biome-specific background doodles.
 *
 * Doodles scroll in parallax with the game world and loop seamlessly.
 * Each biome has 3–5 unique hand-drawn decorations rendered at the
 * biome's doodleOpacity.
 *
 * @param ctx          Canvas 2D rendering context
 * @param biome        The active biome configuration
 * @param width        Canvas width in pixels
 * @param height       Canvas height in pixels
 * @param scrollOffset Current horizontal scroll offset in pixels
 */
export function drawBiomeDoodles(
  ctx: CanvasRenderingContext2D,
  biome: BiomeConfig,
  width: number,
  height: number,
  scrollOffset: number,
): void {
  ctx.save();
  ctx.globalAlpha = biome.doodleOpacity;

  const parallaxOffset = scrollOffset * PARALLAX_FACTOR;

  switch (biome.id) {
    case 'classroom':
      drawClassroomDoodles(ctx, width, height, parallaxOffset);
      break;
    case 'art_studio':
      drawArtStudioDoodles(ctx, width, height, parallaxOffset);
      break;
    case 'architects_desk':
      drawArchitectDoodles(ctx, width, height, parallaxOffset);
      break;
  }

  ctx.restore();
}

// ─── Classroom Doodles ──────────────────────────────────────────────────────

/**
 * Draw classroom-themed doodles: clouds, equations, flight loops, stars.
 */
function drawClassroomDoodles(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  offset: number,
): void {
  const baseX = -(offset % LOOP_WIDTH);

  // Draw across enough repetitions to cover the canvas
  for (let rep = -1; rep <= Math.ceil(width / LOOP_WIDTH) + 1; rep++) {
    const ox = baseX + rep * LOOP_WIDTH;

    // 1. Cute cloud
    drawCloud(ctx, ox + 80, height * 0.15);

    // 2. "E=mc²" equation
    drawEquation(ctx, ox + 250, height * 0.72);

    // 3. Paper plane flight loop (spiral)
    drawFlightLoop(ctx, ox + 450, height * 0.25);

    // 4. Geometric compass star
    drawCompassStar(ctx, ox + 600, height * 0.6);

    // 5. Small cloud
    drawCloud(ctx, ox + 520, height * 0.82);
  }
}

/** Draw a fluffy cloud outline */
function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y, 12, Math.PI * 0.5, Math.PI * 1.5);
  ctx.arc(x + 10, y - 10, 14, Math.PI, Math.PI * 1.85);
  ctx.arc(x + 26, y - 8, 10, Math.PI * 1.2, Math.PI * 1.9);
  ctx.arc(x + 32, y, 10, Math.PI * 1.5, Math.PI * 0.5);
  ctx.closePath();
  ctx.stroke();
}

/** Draw "E=mc²" text in pencil style */
function drawEquation(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.font = 'italic 14px "Comic Sans MS", cursive, sans-serif';
  ctx.fillStyle = '#777';
  ctx.fillText('E=mc²', x, y);
}

/** Draw a looping flight path (figure-eight hint) */
function drawFlightLoop(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = '#aaa';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  // Simple loop shape
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x + 30, y - 30, x + 50, y - 30, x + 50, y);
  ctx.bezierCurveTo(x + 50, y + 20, x + 30, y + 25, x + 20, y + 10);
  ctx.bezierCurveTo(x + 10, y - 5, x - 5, y + 5, x, y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Tiny paper plane at the end
  ctx.fillStyle = '#aaa';
  ctx.beginPath();
  ctx.moveTo(x - 2, y);
  ctx.lineTo(x + 6, y - 3);
  ctx.lineTo(x + 6, y + 3);
  ctx.closePath();
  ctx.fill();
}

/** Draw a geometric compass star */
function drawCompassStar(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = '#bbb';
  ctx.lineWidth = 0.8;
  const points = 6;
  const outerR = 16;
  const innerR = 7;

  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI * i) / points - Math.PI / 2;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
}

// ─── Art Studio Doodles ─────────────────────────────────────────────────────

/**
 * Draw art studio-themed doodles: palette, treble clef, splash, easel.
 */
function drawArtStudioDoodles(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  offset: number,
): void {
  const baseX = -(offset % LOOP_WIDTH);

  for (let rep = -1; rep <= Math.ceil(width / LOOP_WIDTH) + 1; rep++) {
    const ox = baseX + rep * LOOP_WIDTH;

    // 1. Paint palette circles
    drawPalette(ctx, ox + 100, height * 0.2);

    // 2. Sketchy treble clef
    drawTrebleClef(ctx, ox + 300, height * 0.5);

    // 3. Watercolor splash blob outline
    drawSplashBlob(ctx, ox + 500, height * 0.3);

    // 4. Little easel
    drawEasel(ctx, ox + 650, height * 0.7);

    // 5. Additional palette dots
    drawPalette(ctx, ox + 420, height * 0.82);
  }
}

/** Draw a paint palette with color dots */
function drawPalette(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const colors = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6'];
  const radius = 5;
  const spacing = 14;

  for (let i = 0; i < colors.length; i++) {
    ctx.beginPath();
    ctx.arc(x + i * spacing, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = colors[i];
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Small filled center dot
    ctx.beginPath();
    ctx.arc(x + i * spacing, y, 2, 0, Math.PI * 2);
    ctx.fillStyle = colors[i];
    ctx.fill();
  }
}

/** Draw a simplified treble clef */
function drawTrebleClef(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 1.5;
  ctx.beginPath();

  // Simplified treble clef as a series of curves
  ctx.moveTo(x, y + 20);
  ctx.bezierCurveTo(x - 8, y + 10, x - 6, y - 5, x, y - 10);
  ctx.bezierCurveTo(x + 8, y - 18, x + 12, y - 8, x + 4, y);
  ctx.bezierCurveTo(x - 2, y + 6, x - 6, y + 2, x - 2, y - 6);
  ctx.bezierCurveTo(x + 2, y - 14, x + 6, y - 20, x + 2, y - 28);
  ctx.stroke();

  // Stem line
  ctx.beginPath();
  ctx.moveTo(x + 2, y - 28);
  ctx.lineTo(x + 2, y + 24);
  ctx.stroke();
}

/** Draw a watercolor splash blob outline */
function drawSplashBlob(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = '#b0a090';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y - 15);
  ctx.bezierCurveTo(x + 20, y - 20, x + 30, y - 5, x + 25, y + 5);
  ctx.bezierCurveTo(x + 35, y + 15, x + 15, y + 25, x + 5, y + 18);
  ctx.bezierCurveTo(x - 10, y + 28, x - 20, y + 10, x - 15, y);
  ctx.bezierCurveTo(x - 25, y - 10, x - 10, y - 18, x, y - 15);
  ctx.stroke();

  // Interior drip lines
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(x + 5, y - 5);
  ctx.lineTo(x + 10, y + 8);
  ctx.moveTo(x - 5, y + 2);
  ctx.lineTo(x + 2, y + 12);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Draw a tiny easel */
function drawEasel(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = '#a08060';
  ctx.lineWidth = 1.2;

  // Two front legs
  ctx.beginPath();
  ctx.moveTo(x - 10, y + 20);
  ctx.lineTo(x, y - 10);
  ctx.lineTo(x + 10, y + 20);
  ctx.stroke();

  // Back leg
  ctx.beginPath();
  ctx.moveTo(x, y - 5);
  ctx.lineTo(x + 5, y + 20);
  ctx.stroke();

  // Canvas rectangle on easel
  ctx.strokeStyle = '#888';
  ctx.strokeRect(x - 8, y - 22, 16, 14);

  // Shelf
  ctx.beginPath();
  ctx.moveTo(x - 10, y - 8);
  ctx.lineTo(x + 10, y - 8);
  ctx.stroke();
}

// ─── Architect's Desk Doodles ───────────────────────────────────────────────

/**
 * Draw architect-themed doodles: floor plans, compass rose, angles, scale text.
 */
function drawArchitectDoodles(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  offset: number,
): void {
  const baseX = -(offset % LOOP_WIDTH);

  for (let rep = -1; rep <= Math.ceil(width / LOOP_WIDTH) + 1; rep++) {
    const ox = baseX + rep * LOOP_WIDTH;

    // 1. Floor plan snippet
    drawFloorPlan(ctx, ox + 80, height * 0.18);

    // 2. Compass rose
    drawCompassRose(ctx, ox + 300, height * 0.55);

    // 3. Right-angle bracket symbols
    drawRightAngles(ctx, ox + 500, height * 0.25);

    // 4. Dotted construction lines
    drawConstructionLines(ctx, ox + 180, height * 0.75);

    // 5. "Scale 1:50" text
    drawScaleText(ctx, ox + 600, height * 0.85);
  }
}

/** Draw a tiny architectural floor plan snippet */
function drawFloorPlan(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = '#7090b0';
  ctx.lineWidth = 1;

  // Outer walls
  ctx.strokeRect(x, y, 40, 30);

  // Interior walls
  ctx.beginPath();
  ctx.moveTo(x + 20, y);
  ctx.lineTo(x + 20, y + 20);
  ctx.moveTo(x + 20, y + 20);
  ctx.lineTo(x + 40, y + 20);
  ctx.stroke();

  // Door arc
  ctx.beginPath();
  ctx.arc(x + 20, y + 20, 8, -Math.PI / 2, 0);
  ctx.stroke();

  // Window marks on outer wall
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 5, y);
  ctx.lineTo(x + 12, y);
  ctx.moveTo(x + 28, y + 30);
  ctx.lineTo(x + 36, y + 30);
  ctx.stroke();
  ctx.lineWidth = 1;
}

/** Draw a compass rose */
function drawCompassRose(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = '#6080a0';
  ctx.fillStyle = '#6080a0';
  ctx.lineWidth = 1;

  const r = 14;

  // Cross lines
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x, y + r);
  ctx.moveTo(x - r, y);
  ctx.lineTo(x + r, y);
  ctx.stroke();

  // Arrow head (north)
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x - 3, y - r + 6);
  ctx.lineTo(x + 3, y - r + 6);
  ctx.closePath();
  ctx.fill();

  // N label
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('N', x, y - r - 3);

  // Circle
  ctx.beginPath();
  ctx.arc(x, y, r + 2, 0, Math.PI * 2);
  ctx.stroke();
}

/** Draw right-angle bracket symbols */
function drawRightAngles(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = '#7090b0';
  ctx.lineWidth = 1;

  // Several right-angle symbols
  const positions = [
    [0, 0],
    [30, 15],
    [55, -5],
  ];

  for (const [dx, dy] of positions) {
    const px = x + dx;
    const py = y + dy;

    ctx.beginPath();
    ctx.moveTo(px, py - 8);
    ctx.lineTo(px, py);
    ctx.lineTo(px + 8, py);
    ctx.stroke();

    // Small square in the corner
    ctx.strokeRect(px, py - 4, 4, 4);
  }
}

/** Draw dotted construction lines */
function drawConstructionLines(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
): void {
  ctx.strokeStyle = '#90a8c0';
  ctx.lineWidth = 0.8;
  ctx.setLineDash([2, 4]);

  ctx.beginPath();
  // Horizontal
  ctx.moveTo(x, y);
  ctx.lineTo(x + 80, y);
  // Angled
  ctx.moveTo(x + 10, y - 15);
  ctx.lineTo(x + 70, y + 10);
  // Vertical
  ctx.moveTo(x + 40, y - 20);
  ctx.lineTo(x + 40, y + 15);
  ctx.stroke();

  ctx.setLineDash([]);

  // Dimension arrow endpoints
  ctx.fillStyle = '#90a8c0';
  const arrowSize = 3;

  // Left arrow
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + arrowSize, y - arrowSize);
  ctx.lineTo(x + arrowSize, y + arrowSize);
  ctx.closePath();
  ctx.fill();

  // Right arrow
  ctx.beginPath();
  ctx.moveTo(x + 80, y);
  ctx.lineTo(x + 80 - arrowSize, y - arrowSize);
  ctx.lineTo(x + 80 - arrowSize, y + arrowSize);
  ctx.closePath();
  ctx.fill();
}

/** Draw "Scale 1:50" text */
function drawScaleText(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.font = '10px monospace';
  ctx.fillStyle = '#7090b0';
  ctx.textAlign = 'left';
  ctx.fillText('Scale 1:50', x, y);

  // Underline
  ctx.strokeStyle = '#7090b0';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(x, y + 2);
  ctx.lineTo(x + 58, y + 2);
  ctx.stroke();
}

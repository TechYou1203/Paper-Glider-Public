/**
 * High-Performance Canvas 2D Sketchbook Renderer for Paper Glider
 */

import { BiomeConfig, GliderSkin, Particle, PencilBarrier, PlayerPlane } from './types';
import { TIP_HEIGHT } from './physics';

export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
  cameraShake: number;
  scrollOffset: number;
  plane: PlayerPlane;
  skin: GliderSkin;
  barriers: PencilBarrier[];
  particles: Particle[];
  score: number;
  highScore: number;
  paperclips: number;
  isPaused: boolean;
}

export function drawNotebookBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scrollOffset: number,
  biome?: BiomeConfig
) {
  // 1. Warm sketchbook paper background (biome-aware)
  ctx.fillStyle = biome?.paperBg ?? '#faf7ed';
  ctx.fillRect(0, 0, width, height);

  // Subtle paper texture grain (fast gradient simulation)
  const paperGrad = ctx.createLinearGradient(0, 0, width, height);
  paperGrad.addColorStop(0, biome?.paperGrainFrom ?? 'rgba(255, 255, 255, 0.5)');
  paperGrad.addColorStop(0.5, biome?.paperGrainMid ?? 'rgba(240, 235, 220, 0.2)');
  paperGrad.addColorStop(1, biome?.paperGrainTo ?? 'rgba(230, 220, 200, 0.4)');
  ctx.fillStyle = paperGrad;
  ctx.fillRect(0, 0, width, height);

  // 2. Ruled horizontal lines (faint notebook ink lines)
  const lineSpacing = 32;
  const lineStartY = 48;
  ctx.save();
  ctx.strokeStyle = 'rgba(165, 190, 218, 0.5)';
  ctx.lineWidth = 1.2;

  for (let y = lineStartY; y < height - 20; y += lineSpacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // 3. Left margin red line (classic schoolbook margin)
  // We can let the margin scroll slightly or stay anchored
  ctx.strokeStyle = 'rgba(239, 90, 90, 0.65)';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(76, 0);
  ctx.lineTo(76, height);
  ctx.stroke();

  // Spiral binder holes on far left edge
  ctx.fillStyle = '#e8e2d2';
  ctx.strokeStyle = '#c5bea9';
  ctx.lineWidth = 1.5;
  const holeSpacing = 56;
  for (let hy = 28; hy < height; hy += holeSpacing) {
    ctx.beginPath();
    ctx.arc(26, hy, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Spiral wire ring shadow
    ctx.strokeStyle = 'rgba(120, 115, 100, 0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(22, hy, 12, -Math.PI * 0.4, Math.PI * 0.4);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Faint cute hand-drawn doodles in pencil/ink in the background
 */
function drawBackgroundDoodles(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scrollOffset: number
) {
  ctx.save();
  ctx.strokeStyle = 'rgba(100, 116, 139, 0.18)';
  ctx.fillStyle = 'rgba(100, 116, 139, 0.12)';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const parallax = scrollOffset * 0.35;
  const loopWidth = 720;
  const baseDoodleX = -(parallax % loopWidth);

  // Doodle 1: Cute cloud
  for (let offset = -loopWidth; offset <= width + loopWidth; offset += loopWidth) {
    const cx = baseDoodleX + offset + 200;
    const cy = 90;

    ctx.beginPath();
    ctx.arc(cx, cy, 18, Math.PI * 0.5, Math.PI * 1.5);
    ctx.arc(cx + 20, cy - 14, 22, Math.PI * 0.9, Math.PI * 2.1);
    ctx.arc(cx + 46, cy, 18, Math.PI * 1.5, Math.PI * 0.5);
    ctx.closePath();
    ctx.stroke();

    // Doodle 2: Math equation "E = mc²"
    ctx.font = '16px "Caveat", cursive';
    ctx.fillText('E = mc²', cx + 180, cy + 180);

    // Doodle 3: Paper plane flight loop sketch
    const lx = cx + 380;
    const ly = 130;
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.moveTo(lx, ly);
    ctx.bezierCurveTo(lx + 40, ly - 30, lx + 50, ly + 40, lx + 10, ly + 20);
    ctx.stroke();
    ctx.setLineDash([]);

    // Doodle 4: Geometric compass star
    const sx = cx + 540;
    const sy = 80;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 12);
    ctx.lineTo(sx + 3, sy - 3);
    ctx.lineTo(sx + 12, sy);
    ctx.lineTo(sx + 3, sy + 3);
    ctx.lineTo(sx, sy + 12);
    ctx.lineTo(sx - 3, sy + 3);
    ctx.lineTo(sx - 12, sy);
    ctx.lineTo(sx - 3, sy - 3);
    ctx.closePath();
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Draws a realistic stationery pencil obstacle with hexagonal facets, sharpened wood cone, and ferrule/eraser
 */
export function drawPencilBarrier(
  ctx: CanvasRenderingContext2D,
  barrier: PencilBarrier,
  canvasHeight: number
) {
  const { x, width: bw, gapY, gapHeight, colorType, brandLabel } = barrier;
  const gapTop = gapY - gapHeight / 2;
  const gapBottom = gapY + gapHeight / 2;

  // Colors based on pencil variety
  let mainColor = '#facc15'; // Dixon Yellow #2
  let darkFacetColor = '#ca8a04';
  let lightFacetColor = '#fde047';
  let ferruleColor = '#15803d'; // Green metal band on standard #2
  let ferruleStripe = '#eab308';

  if (colorType === 'blue') {
    mainColor = '#0284c7';
    darkFacetColor = '#0369a1';
    lightFacetColor = '#38bdf8';
    ferruleColor = '#475569';
    ferruleStripe = '#94a3b8';
  } else if (colorType === 'red') {
    mainColor = '#dc2626';
    darkFacetColor = '#b91c1c';
    lightFacetColor = '#f87171';
    ferruleColor = '#d97706';
    ferruleStripe = '#fde047';
  } else if (colorType === 'green') {
    mainColor = '#16a34a';
    darkFacetColor = '#15803d';
    lightFacetColor = '#4ade80';
    ferruleColor = '#eab308';
    ferruleStripe = '#ca8a04';
  } else if (colorType === 'graphite') {
    mainColor = '#334155';
    darkFacetColor = '#1e293b';
    lightFacetColor = '#64748b';
    ferruleColor = '#94a3b8';
    ferruleStripe = '#cbd5e1';
  }

  // --- 1. UPPER PENCIL (Comes from ceiling down to gapTop) ---
  const upperBodyBottom = gapTop - TIP_HEIGHT;
  if (upperBodyBottom > 0) {
    // Hexagonal facets (3 vertical strips: light, mid, dark)
    const facetW = bw / 3;

    // Top Eraser & Ferrule (if pencil has enough height)
    const ferruleHeight = Math.min(32, upperBodyBottom * 0.35);
    const eraserHeight = Math.min(22, upperBodyBottom * 0.25);
    const bodyHeight = upperBodyBottom - ferruleHeight - eraserHeight;

    // Eraser (Pink rubber with bevel)
    if (eraserHeight > 4) {
      ctx.fillStyle = '#fb7185';
      ctx.fillRect(x, 0, bw, eraserHeight);
      ctx.fillStyle = '#f43f5e';
      ctx.fillRect(x + bw * 0.65, 0, bw * 0.35, eraserHeight);
      // Eraser rounded top
      ctx.strokeStyle = '#2d2a26';
      ctx.lineWidth = 1.8;
      ctx.strokeRect(x, 0, bw, eraserHeight);
    }

    // Ferrule (Metal crimped sleeve)
    if (ferruleHeight > 4) {
      const fy = eraserHeight;
      ctx.fillStyle = ferruleColor;
      ctx.fillRect(x, fy, bw, ferruleHeight);

      // Gold ridges / crimp lines
      ctx.strokeStyle = ferruleStripe;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, fy + ferruleHeight * 0.35);
      ctx.lineTo(x + bw, fy + ferruleHeight * 0.35);
      ctx.moveTo(x, fy + ferruleHeight * 0.7);
      ctx.lineTo(x + bw, fy + ferruleHeight * 0.7);
      ctx.stroke();

      ctx.strokeStyle = '#2d2a26';
      ctx.lineWidth = 1.8;
      ctx.strokeRect(x, fy, bw, ferruleHeight);
    }

    // Pencil Body (Hexagonal painted barrel)
    const bodyStartY = eraserHeight + ferruleHeight;
    if (bodyHeight > 0) {
      // Light facet
      ctx.fillStyle = lightFacetColor;
      ctx.fillRect(x, bodyStartY, facetW, bodyHeight);
      // Mid facet
      ctx.fillStyle = mainColor;
      ctx.fillRect(x + facetW, bodyStartY, facetW, bodyHeight);
      // Dark facet
      ctx.fillStyle = darkFacetColor;
      ctx.fillRect(x + facetW * 2, bodyStartY, facetW, bodyHeight);

      // Pencil outline
      ctx.strokeStyle = '#2d2a26';
      ctx.lineWidth = 1.8;
      ctx.strokeRect(x, bodyStartY, bw, bodyHeight);

      // Gold Brand Lettering (Rotated vertically)
      if (bodyHeight > 70) {
        ctx.save();
        ctx.translate(x + bw / 2, bodyStartY + bodyHeight / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(brandLabel, 0, 0);
        ctx.restore();
      }
    }
  }

  // Upper Sharpened Wood Cone & Lead (Pointing DOWN)
  drawPencilTip(ctx, x, upperBodyBottom, bw, TIP_HEIGHT, true);

  // --- 2. LOWER PENCIL (Comes from gapBottom down to canvasHeight) ---
  const lowerBodyTop = gapBottom + TIP_HEIGHT;
  const lowerBodyHeight = canvasHeight - lowerBodyTop;

  // Lower Sharpened Wood Cone & Lead (Pointing UP)
  drawPencilTip(ctx, x, gapBottom, bw, TIP_HEIGHT, false);

  // Lower Pencil Body
  if (lowerBodyHeight > 0) {
    const facetW = bw / 3;
    // Light facet
    ctx.fillStyle = lightFacetColor;
    ctx.fillRect(x, lowerBodyTop, facetW, lowerBodyHeight);
    // Mid facet
    ctx.fillStyle = mainColor;
    ctx.fillRect(x + facetW, lowerBodyTop, facetW, lowerBodyHeight);
    // Dark facet
    ctx.fillStyle = darkFacetColor;
    ctx.fillRect(x + facetW * 2, lowerBodyTop, facetW, lowerBodyHeight);

    // Outline
    ctx.strokeStyle = '#2d2a26';
    ctx.lineWidth = 1.8;
    ctx.strokeRect(x, lowerBodyTop, bw, lowerBodyHeight);

    // Brand lettering on lower pencil
    if (lowerBodyHeight > 70) {
      ctx.save();
      ctx.translate(x + bw / 2, lowerBodyTop + lowerBodyHeight / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(brandLabel, 0, 0);
      ctx.restore();
    }
  }

  // --- 3. PAPERCLIP PICKUP (if present in the gap) ---
  if (barrier.hasClip && !barrier.clipCollected) {
    drawPaperclip(ctx, x + bw / 2, barrier.clipY);
  }
}

/**
 * Draws the sharpened cedar wood cone with scallop cutouts and dark graphite lead point
 */
function drawPencilTip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  pointingDown: boolean
) {
  ctx.save();
  const tipX = x + width / 2;
  const tipY = pointingDown ? y + height : y;
  const baseY = pointingDown ? y : y + height;

  // Cedar wood taper base
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.lineTo(x + width, baseY);
  ctx.lineTo(tipX, tipY);
  ctx.closePath();
  ctx.fillStyle = '#e8c99b'; // Freshly shaved cedar wood
  ctx.fill();

  // Wood grain scallops where the sharpener blade cut
  ctx.fillStyle = '#d9b282';
  const scallopCount = 3;
  const sw = width / scallopCount;
  for (let i = 0; i < scallopCount; i++) {
    ctx.beginPath();
    const sx = x + i * sw;
    ctx.arc(sx + sw / 2, baseY, sw * 0.45, 0, Math.PI, !pointingDown);
    ctx.fill();
  }

  // Dark graphite lead point (last 30% of cone)
  const leadFraction = 0.32;
  const leadBaseY = pointingDown
    ? baseY + height * (1 - leadFraction)
    : baseY - height * (1 - leadFraction);
  const leadHalfWidth = (width / 2) * leadFraction;

  ctx.beginPath();
  ctx.moveTo(tipX - leadHalfWidth, leadBaseY);
  ctx.lineTo(tipX + leadHalfWidth, leadBaseY);
  ctx.lineTo(tipX, tipY);
  ctx.closePath();
  ctx.fillStyle = '#1e293b'; // Shiny 2B dark graphite lead
  ctx.fill();

  // Graphite specular shine
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(tipX - leadHalfWidth * 0.4, leadBaseY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  // Crisp hand-drawn ink outline around cone
  ctx.strokeStyle = '#2d2a26';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(x + width, baseY);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws an authentic golden stationery paperclip with metallic shine and floating bob
 */
export function drawPaperclip(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);

  // Soft drop shadow on notebook page
  ctx.shadowColor = 'rgba(40, 35, 30, 0.25)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 4;

  // Paperclip metallic gold loops
  ctx.strokeStyle = '#eab308';
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  // Outer loop
  ctx.moveTo(-7, 10);
  ctx.lineTo(-7, -12);
  ctx.arc(0, -12, 7, Math.PI, 0);
  ctx.lineTo(7, 12);
  ctx.arc(1, 12, 6, 0, Math.PI);
  // Inner return loop
  ctx.lineTo(-5, -6);
  ctx.arc(-1, -6, 4, Math.PI, 0);
  ctx.lineTo(3, 7);
  ctx.stroke();

  // Specular shine overlay
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-6, 6);
  ctx.lineTo(-6, -10);
  ctx.arc(0, -12, 6, Math.PI * 1.1, Math.PI * 1.7);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws the paper plane glider with origami facet shading, skin styling, and flight trail
 */
export function drawPaperPlane(
  ctx: CanvasRenderingContext2D,
  plane: PlayerPlane,
  skin: GliderSkin,
  isShielded: boolean = false
) {
  // 1. Draw dashed pencil trajectory flight trail
  if (plane.trail.length > 1) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    for (let i = 1; i < plane.trail.length; i++) {
      const p1 = plane.trail[i - 1];
      const p2 = plane.trail[i];
      ctx.strokeStyle = `rgba(50, 45, 40, ${p2.alpha * 0.4})`;
      ctx.lineWidth = p2.width;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 2. Draw Paper Glider Body
  ctx.save();
  ctx.translate(plane.x, plane.y);
  ctx.rotate(plane.pitch);

  // Shield aura when drafting tape shield power-up is active
  if (isShielded) {
    ctx.save();
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(2, 0, 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
    ctx.fill();
    ctx.restore();
  }

  // Crisp sketchbook drop shadow
  ctx.fillStyle = 'rgba(45, 40, 35, 0.14)';
  ctx.beginPath();
  ctx.moveTo(26, 6);
  ctx.lineTo(-12, -7);
  ctx.lineTo(-4, 6);
  ctx.lineTo(-12, 19);
  ctx.closePath();
  ctx.fill();

  // Geometry coordinates of folded origami dart:
  // Nose tip: (22, 0)
  // Left wing tip: (-16, -13)
  // Right wing tip: (-16, 13)
  // Center crease tail: (-10, 0)
  // Underwing folds: (-14, -4) and (-14, 4)

  // Underwing Shading (Darker crease underneath)
  ctx.fillStyle = skin.foldColor;
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(-16, -13);
  ctx.lineTo(-10, 0);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(-16, 13);
  ctx.lineTo(-10, 0);
  ctx.closePath();
  ctx.fill();

  // Top main wings (Primary color)
  ctx.fillStyle = skin.primaryColor;
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(-16, -11);
  ctx.lineTo(-8, 0);
  ctx.closePath();
  ctx.fill();

  // Shaded top wing for 3D origami depth
  const underwingGrad = ctx.createLinearGradient(-16, 0, 22, 0);
  underwingGrad.addColorStop(0, skin.foldColor);
  underwingGrad.addColorStop(1, skin.primaryColor);
  ctx.fillStyle = underwingGrad;
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(-16, 11);
  ctx.lineTo(-8, 0);
  ctx.closePath();
  ctx.fill();

  // Custom Skin Line Styles
  if (skin.lineStyle === 'grid') {
    // Math 5mm grid on wings
    ctx.strokeStyle = 'rgba(14, 165, 233, 0.4)';
    ctx.lineWidth = 1;
    for (let gx = -12; gx <= 16; gx += 5) {
      ctx.beginPath();
      ctx.moveTo(gx, -6);
      ctx.lineTo(gx, 6);
      ctx.stroke();
    }
  } else if (skin.lineStyle === 'blueprint') {
    // White drafting measurement lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(10, -3);
    ctx.lineTo(10, 3);
    ctx.moveTo(-5, -7);
    ctx.lineTo(-5, 7);
    ctx.stroke();
  } else if (skin.lineStyle === 'creased') {
    // Airmail red/blue chevrons on wing trailing edge
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-15, -10, 3, 4);
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(-12, -10, 3, 4);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-15, 6, 3, 4);
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(-12, 6, 3, 4);
  } else if (skin.lineStyle === 'gold') {
    // Shiny gold reflection streak
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-12, -6);
    ctx.stroke();
  }

  // Center Origami Spine Fold Line
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#2d2a26';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(-10, 0);
  ctx.stroke();

  // Outer Crisp Hand-Drawn Ink Silhouette
  ctx.strokeStyle = '#2d2a26';
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(-16, -13);
  ctx.lineTo(-8, 0);
  ctx.lineTo(-16, 13);
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws active particles (pencil wood splinters, graphite dust, paper tears, sparkle stars)
 */
export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  ctx.save();
  for (const p of particles) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.globalAlpha = Math.max(0, p.alpha);

    if (p.shape === 'wood') {
      // Wood splinter rectangle
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
      ctx.strokeStyle = '#2d2a26';
      ctx.lineWidth = 1;
      ctx.strokeRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
    } else if (p.shape === 'sparkle') {
      // Golden sparkle star
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(0, 0, p.size * 0.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.shape === 'lead') {
      // Dark graphite dust flake
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(0, 0, p.size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Paper scrap triangle
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(0, -p.size);
      ctx.lineTo(p.size, p.size);
      ctx.lineTo(-p.size, p.size);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(45, 42, 38, 0.4)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

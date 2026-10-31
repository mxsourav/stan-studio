import type { LampConfig, Point, Vec3 } from './types';
import { MATERIAL_LABELS, MATERIAL_RATES } from './types';
import {
  bridgeFloatingIslands,
} from './bridgeGenerator';
import {
  dropNoise,
  groupRegions,
  simplifyLoop,
  thresholdToMask,
  traceContours,
  type BinaryMask,
} from './contourTracer';
import { computeEnclosureDims, synthesizeEnclosure, computeBom } from './enclosureSynthesizer';
import type { EnclosureResult } from './enclosureSynthesizer';
import type { BomResult } from './types';

/**
 * Full artwork→lamp pipeline: source image → pre-blur → threshold mask →
 * despeckle → auto-strut bridging → contour tracing → wall-space placement →
 * enclosure synthesis → BOM. Pure functions, no React, no WebGL.
 */

export interface ArtworkTelemetry {
  islands: number;
  bridged: number;
  dropped: number;
}

export interface ProcessedArtwork {
  /** White-on-black mask used as the spotlight projection texture. */
  spotlightCanvas: HTMLCanvasElement;
  /** Silhouette preview for the 2D stencil card. */
  previewCanvas: HTMLCanvasElement;
  wallLoops: Vec3[][];
  telemetry: ArtworkTelemetry;
}

const MAX_WORK_SIZE = 260;

function boxBlur(data: Uint8ClampedArray, w: number, h: number): void {
  const src = new Uint8ClampedArray(data);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            sum += src[((y + dy) * w + (x + dx)) * 4 + c];
          }
        }
        data[i + c] = sum / 9;
      }
    }
  }
}

/** Chaikin corner-cutting on a closed loop — rounds pixel staircase into smooth curves. */
function chaikin(points: Point[], iterations: number): Point[] {
  let current = points;
  for (let it = 0; it < iterations; it++) {
    if (current.length < 3) break;
    const next: Point[] = [];
    for (let i = 0; i < current.length; i++) {
      const a = current[i];
      const b = current[(i + 1) % current.length];
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    current = next;
  }
  return current;
}

/**
 * Wall-space placement of the user's figure: sized by `shadowWidth` (the
 * silhouette spans that many millimeters on the wall) and positioned by
 * percentage offsets relative to the panel mid-height, so the figure can
 * tower over the box exactly like a real shadow lamp.
 */
function wallPlacement(config: LampConfig, imgW: number, imgH: number): {
  mmPerPxX: number;
  mmPerPxY: number;
  centerX: number;
  centerY: number;
  strutMmPerPx: number;
} {
  const dims = computeEnclosureDims(config);
  const scale = config.figureScale / 100;
  const mmPerPxX = (config.shadowWidth * scale) / imgW;
  const mmPerPxY = (config.shadowHeight * scale) / imgH;
  const panelCenterY = dims.floorTopY + dims.panelH / 2;
  return {
    mmPerPxX,
    mmPerPxY,
    centerX: ((50 - config.boxCenterX) / 100) * config.shadowWidth * scale,
    centerY: panelCenterY + ((config.boxCenterY - 50) / 100) * config.shadowHeight * scale,
    strutMmPerPx: Math.min(mmPerPxX, mmPerPxY),
  };
}

export function processArtwork(
  source: HTMLImageElement | ImageBitmap,
  config: LampConfig,
): ProcessedArtwork {
  const aspect = source.width / source.height;
  const w = Math.max(16, Math.round(aspect >= 1 ? MAX_WORK_SIZE : MAX_WORK_SIZE * aspect));
  const h = Math.max(16, Math.round(aspect >= 1 ? MAX_WORK_SIZE / aspect : MAX_WORK_SIZE));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.save();
  if (config.mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);
  ctx.restore();
  const imageData = ctx.getImageData(0, 0, w, h);
  boxBlur(imageData.data, w, h);

  const mask = thresholdToMask(imageData, config.threshold, config.invert);
  const droppedIslands = dropNoise(mask, config.noiseFilter);

  const placement = wallPlacement(config, w, h);
  const strutPx = Math.max(1.2, config.strutWidth / placement.strutMmPerPx);
  const { bridged } = bridgeFloatingIslands(mask, strutPx);

  // Final trace after bridging: region outer loops become panel cutouts.
  const loops = traceContours(mask);
  const regions = groupRegions(loops);
  // Region holes (material islands the bridger could not save) merge into the
  // cutout — counted as dropped.
  let dropped = droppedIslands;
  for (const region of regions) dropped += region.holes.length;

  const wallLoops: Vec3[][] = [];
  for (const region of regions) {
    const simplified = simplifyLoop(region.outer, config.pathSimplify);
    if (simplified.length < 4) continue;
    const smoothed = chaikin(simplified, config.smoothing);
    wallLoops.push(
      smoothed.map(
        (p) =>
          [
            (p.x - w / 2) * placement.mmPerPxX + placement.centerX,
            (h / 2 - p.y) * placement.mmPerPxY + placement.centerY,
            0,
          ] as Vec3,
      ),
    );
  }

  return {
    spotlightCanvas: renderSpotlightCanvas(mask),
    previewCanvas: renderPreviewCanvas(mask),
    wallLoops,
    telemetry: { islands: regions.length, bridged, dropped },
  };
}

function renderSpotlightCanvas(mask: BinaryMask): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = mask.width;
  canvas.height = mask.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const img = ctx.createImageData(mask.width, mask.height);
  for (let i = 0; i < mask.data.length; i++) {
    if (mask.data[i] === 1) {
      img.data[i * 4] = 0;
      img.data[i * 4 + 1] = 0;
      img.data[i * 4 + 2] = 0;
    } else {
      img.data[i * 4] = 255;
      img.data[i * 4 + 1] = 255;
      img.data[i * 4 + 2] = 255;
    }
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // Black border band: the spotlight map clamps edge texels across the whole
  // cone, so the rim must be "no light" or the wall floods outside the quad.
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

function renderPreviewCanvas(mask: BinaryMask): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = mask.width;
  canvas.height = mask.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  // Deep charcoal field, warm silhouette — mirrors the site's carbon palette.
  ctx.fillStyle = '#101012';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const img = ctx.createImageData(mask.width, mask.height);
  for (let i = 0; i < mask.data.length; i++) {
    if (mask.data[i] === 1) {
      img.data[i * 4] = 244;
      img.data[i * 4 + 1] = 240;
      img.data[i * 4 + 2] = 230;
    } else {
      img.data[i * 4] = 0;
      img.data[i * 4 + 1] = 0;
      img.data[i * 4 + 2] = 0;
    }
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export interface BuiltLamp {
  enclosure: EnclosureResult;
  bom: BomResult;
}

export function buildLamp(
  config: LampConfig,
  artwork: ProcessedArtwork | null,
  pricing: { ledCost: number; baseFee: number },
): BuiltLamp {
  const enclosure = synthesizeEnclosure({
    config,
    wallLoops: artwork?.wallLoops ?? [],
    hasArtwork: Boolean(artwork && artwork.wallLoops.length > 0),
  });
  const bom = computeBom(
    enclosure.volumeCm3,
    MATERIAL_RATES[config.material],
    pricing.ledCost,
    pricing.baseFee,
    MATERIAL_LABELS[config.material],
  );
  return { enclosure, bom };
}

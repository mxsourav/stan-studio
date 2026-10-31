import { labelComponents, type BinaryMask } from './contourTracer';

/**
 * Auto-strut engine. Finds "floating" material islands — light regions fully
 * enclosed by the silhouette (think the counter of a letter "O") — and unions
 * them back to the anchored panel material with shortest-path struts of the
 * requested width. Struts are carved out of the silhouette mask so the traced
 * cutout and the printed part stay in exact agreement.
 *
 * Mask convention: 1 = silhouette (cut away), 0 = panel material.
 */

export interface BridgeResult {
  mask: BinaryMask;
  /** Enclosed material islands connected with struts. */
  bridged: number;
}

function drawThickLine(mask: BinaryMask, x0: number, y0: number, x1: number, y1: number, radius: number): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const cx = Math.round(x0 + (x1 - x0) * t);
    const cy = Math.round(y0 + (y1 - y0) * t);
    const r = Math.ceil(radius);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > radius * radius + 0.25) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) continue;
        mask.data[y * mask.width + x] = 0;
      }
    }
  }
}

/**
 * Bridges every enclosed light region to the anchored (border-connected) light
 * region, largest island first, always connecting the island closest to the
 * currently anchored set so struts chain naturally.
 */
export function bridgeFloatingIslands(mask: BinaryMask, strutWidthPx: number): BridgeResult {
  const { width: w, height: h, data } = mask;
  const strutRadius = Math.max(0.5, strutWidthPx / 2);
  let bridged = 0;

  for (let iteration = 0; iteration < 96; iteration++) {
    // Light components (target = 0). Anchored = contains a border pixel.
    const { labels, sizes } = labelComponents(mask, 0);
    const anchored = new Set<number>();
    const floaterIds = new Set<number>();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (data[idx] !== 0) continue;
        const id = labels[idx];
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) anchored.add(id);
        else floaterIds.add(id);
      }
    }
    for (const id of anchored) floaterIds.delete(id);
    if (floaterIds.size === 0) break;

    // Largest floater first — it is the one most worth structurally saving.
    let target = -1;
    let targetSize = -1;
    for (const id of floaterIds) {
      if (sizes[id] > targetSize) {
        targetSize = sizes[id];
        target = id;
      }
    }
    if (target < 0) break;

    // BFS from every pixel of the target floater over ALL cells until the
    // first anchored light pixel is reached: that yields the closest
    // (floater pixel, anchored pixel) pair.
    const prev = new Int32Array(w * h).fill(-2);
    const queue = new Int32Array(w * h);
    let head = 0;
    let tail = 0;
    for (let i = 0; i < w * h; i++) {
      if (data[i] === 0 && labels[i] === target) {
        prev[i] = -1;
        queue[tail++] = i;
      }
    }
    let hit = -1;
    let hitStart = -1;
    while (head < tail && hit < 0) {
      const idx = queue[head++];
      const x = idx % w;
      const y = (idx - x) / w;
      const neighbours = [
        x > 0 ? idx - 1 : -1,
        x < w - 1 ? idx + 1 : -1,
        y > 0 ? idx - w : -1,
        y < h - 1 ? idx + w : -1,
      ];
      for (const n of neighbours) {
        if (n < 0 || prev[n] !== -2) continue;
        prev[n] = idx;
        if (data[n] === 0 && labels[n] !== target && anchored.has(labels[n])) {
          hit = n;
          hitStart = idx;
          break;
        }
        queue[tail++] = n;
      }
    }
    if (hit < 0) break;

    // Backtrack the BFS path to recover both endpoints of the strut.
    let anchorPixel = hit;
    while (prev[anchorPixel] !== -1) anchorPixel = prev[anchorPixel];
    drawThickLine(
      mask,
      hitStart % w,
      Math.floor(hitStart / w),
      anchorPixel % w,
      Math.floor(anchorPixel / w),
      strutRadius,
    );
    bridged++;
  }

  return { mask, bridged };
}

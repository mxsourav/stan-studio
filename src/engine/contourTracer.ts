import type { Point } from './types';

/**
 * Binary silhouette utilities: thresholding, connected components, and
 * directed-edge boundary tracing (marching-squares style segment chaining).
 *
 * Mask convention: 1 = silhouette (material to cut away), 0 = panel material.
 * Traced loops keep the silhouette on the right-hand side of travel, so outer
 * boundaries and internal holes come out with opposite signed areas.
 */

export interface BinaryMask {
  width: number;
  height: number;
  data: Uint8Array;
}

export function thresholdToMask(
  image: ImageData,
  threshold: number,
  invert: boolean,
): BinaryMask {
  const { width, height, data } = image;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const a = data[i * 4 + 3];
    const lum =
      a < 24
        ? 255 // transparent pixels read as background
        : 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
    const isSilhouette = invert ? lum >= threshold : lum < threshold;
    mask[i] = isSilhouette ? 1 : 0;
  }
  return { width, height, data: mask };
}

interface ComponentLabeling {
  labels: Int32Array;
  sizes: number[];
}

export function labelComponents(mask: BinaryMask, target: 0 | 1): ComponentLabeling {
  const { width: w, height: h, data } = mask;
  const labels = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  const queue = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (data[start] !== target || labels[start] !== -1) continue;
    const id = sizes.length;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = id;
    let size = 0;
    while (head < tail) {
      const idx = queue[head++];
      size++;
      const x = idx % w;
      const y = (idx - x) / w;
      if (x > 0 && data[idx - 1] === target && labels[idx - 1] === -1) {
        labels[idx - 1] = id;
        queue[tail++] = idx - 1;
      }
      if (x < w - 1 && data[idx + 1] === target && labels[idx + 1] === -1) {
        labels[idx + 1] = id;
        queue[tail++] = idx + 1;
      }
      if (y > 0 && data[idx - w] === target && labels[idx - w] === -1) {
        labels[idx - w] = id;
        queue[tail++] = idx - w;
      }
      if (y < h - 1 && data[idx + w] === target && labels[idx + w] === -1) {
        labels[idx + w] = id;
        queue[tail++] = idx + w;
      }
    }
    sizes.push(size);
  }
  return { labels, sizes };
}

/** Removes silhouette components smaller than `minArea` px. Returns count dropped. */
export function dropNoise(mask: BinaryMask, minArea: number): number {
  if (minArea <= 0) return 0;
  const { labels, sizes } = labelComponents(mask, 1);
  let dropped = 0;
  for (let i = 0; i < mask.data.length; i++) {
    if (mask.data[i] === 1 && sizes[labels[i]] < minArea) {
      mask.data[i] = 0;
      dropped++;
    }
  }
  return sizes.filter((s) => s < minArea).length;
}

function shoelace(points: Point[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function polygonArea(points: Point[]): number {
  return Math.abs(shoelace(points));
}

export function polygonSignedArea(points: Point[]): number {
  return shoelace(points);
}

/**
 * Traces every boundary loop of the silhouette. Corner junctions (diagonal
 * touches) are resolved deterministically by preferring the left-most turn,
 * which keeps diagonally adjacent regions in separate loops.
 */
export function traceContours(mask: BinaryMask): Point[][] {
  const { width: w, height: h, data } = mask;
  const stride = w + 1;
  const outgoing = new Map<number, number[]>();

  const add = (from: number, to: number): void => {
    const list = outgoing.get(from);
    if (list) list.push(to);
    else outgoing.set(from, [to]);
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[y * w + x] !== 1) continue;
      const above = y === 0 ? 0 : data[(y - 1) * w + x];
      const below = y === h - 1 ? 0 : data[(y + 1) * w + x];
      const left = x === 0 ? 0 : data[y * w + x - 1];
      const right = x === w - 1 ? 0 : data[y * w + x + 1];
      // Directed edges keep the silhouette on the right of travel:
      // top edge east, right edge south, bottom edge west, left edge north.
      if (!above) add(y * stride + x, y * stride + x + 1);
      if (!below) add((y + 1) * stride + x + 1, (y + 1) * stride + x);
      if (!left) add((y + 1) * stride + x, y * stride + x);
      if (!right) add(y * stride + x + 1, (y + 1) * stride + x + 1);
    }
  }

  const loops: Point[][] = [];
  const used = new Set<string>();
  const dirOf = (from: number, to: number): [number, number] => [
    (to % stride) - (from % stride),
    Math.floor(to / stride) - Math.floor(from / stride),
  ];

  for (const [start] of outgoing) {
    for (const firstTo of outgoing.get(start) ?? []) {
      const firstKey = `${start}>${firstTo}`;
      if (used.has(firstKey)) continue;
      const loop: Point[] = [];
      let from = start;
      let to = firstTo;
      let guard = 0;
      while (guard++ < w * h * 4) {
        used.add(`${from}>${to}`);
        loop.push({ x: from % stride, y: Math.floor(from / stride) });
        if (to === start) break;
        const candidates = outgoing.get(to) ?? [];
        const [dx, dy] = dirOf(from, to);
        let best: number | null = null;
        let bestScore = -Infinity;
        for (const c of candidates) {
          const key = `${to}>${c}`;
          if (used.has(key)) continue;
          const [cx, cy] = dirOf(to, c);
          // Prefer the left-most turn relative to incoming direction.
          const score = dx * cy - dy * cx;
          if (score > bestScore) {
            bestScore = score;
            best = c;
          }
        }
        if (best === null) break;
        from = to;
        to = best;
      }
      if (loop.length >= 4) loops.push(loop);
    }
  }
  return loops;
}

export interface ContourRegion {
  outer: Point[];
  holes: Point[][];
}

/**
 * Groups traced loops into regions (outer boundary + enclosed holes).
 * Orientation convention from the tracer: silhouette-on-right gives outer
 * loops negative signed area (image y-down) and holes positive.
 */
export function groupRegions(loops: Point[][]): ContourRegion[] {
  const tagged = loops
    .map((pts) => ({ pts, area: shoelace(pts) }))
    .filter((l) => Math.abs(l.area) > 1)
    .sort((a, b) => Math.abs(b.area) - Math.abs(a.area));

  const regions: ContourRegion[] = [];
  for (const loop of tagged) {
    if (loop.area > 0) {
      // Silhouette-on-right tracing in image coords (y down) winds outer
      // loops counter-clockwise in math terms — positive signed area.
      regions.push({ outer: loop.pts, holes: [] });
    } else {
      // Hole: attach to the smallest containing outer loop.
      let host: ContourRegion | null = null;
      let hostArea = Infinity;
      const px = loop.pts[0];
      for (const region of regions) {
        const area = Math.abs(shoelace(region.outer));
        if (area < hostArea && pointInPolygon(px, region.outer)) {
          host = region;
          hostArea = area;
        }
      }
      if (host) host.holes.push(loop.pts);
    }
  }
  return regions;
}

export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function simplifyLoop(points: Point[], tolerancePx: number): Point[] {
  if (points.length < 6 || tolerancePx <= 0) return points;
  // Ramer–Douglas–Peucker on a closed loop (anchor = farthest pair heuristic).
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  let far = 0;
  let farD = -1;
  for (let i = 1; i < points.length; i++) {
    const d = (points[i].x - points[0].x) ** 2 + (points[i].y - points[0].y) ** 2;
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  keep[far] = 1;
  const simplifyRange = (a: number, b: number): void => {
    if ((b - a + points.length) % points.length < 2) return;
    const ax = points[a].x;
    const ay = points[a].y;
    const bx = points[b].x;
    const by = points[b].y;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-9;
    let worst = -1;
    let worstD = (tolerancePx * tolerancePx) / 1;
    for (let i = (a + 1) % points.length; i !== b; i = (i + 1) % points.length) {
      const t = ((points[i].x - ax) * dx + (points[i].y - ay) * dy) / len2;
      const tt = Math.max(0, Math.min(1, t));
      const px = ax + dx * tt;
      const py = ay + dy * tt;
      const d = (points[i].x - px) ** 2 + (points[i].y - py) ** 2;
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      simplifyRange(a, worst);
      simplifyRange(worst, b);
    }
  };
  simplifyRange(0, far);
  simplifyRange(far, 0);
  return points.filter((_, i) => keep[i] === 1);
}

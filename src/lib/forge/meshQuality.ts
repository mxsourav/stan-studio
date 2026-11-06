/**
 * 3D Forge — mesh quality engine.
 *
 * Meshy-class output needs a measurable bar, not vibes. This module scores a
 * forged STL against what the user actually asked for:
 *
 * - silhouetteMatch: IoU between the mesh's projected silhouette and the
 *   foreground mask of the reference image (the same corner-delta background
 *   detection imageEnhancer.ts uses). Orientation-agnostic: every projection
 *   axis and sign is tried against 4 in-plane rotations of the mask.
 * - flatBasePct: share of vertices sitting on the most slab-like bottom
 *   plane — FDM prints need a flat base; the hub's Lay Flat fixes the rest.
 */

export interface QualityReport {
  /** 0–100 best IoU vs the reference mask; null when no usable mask. */
  silhouettePct: number | null;
  /** 0–100 share of verts on the flattest bottom plane. */
  flatBasePct: number;
  /** Foreground coverage of the reference mask (%). */
  maskCoveragePct: number;
}

const Q = 256;
const BASE_TOLERANCE_MM = 0.5;
const RASTER_TRI_BUDGET = 250_000;
const SILHOUETTE_MIN_MASK_COVERAGE = 0.5; // % — below this the mask is useless

const yieldUi = () => new Promise<void>((r) => setTimeout(r, 0));

interface StlPositions {
  positions: Float32Array; // 3 floats per duplicated STL vertex
  triCount: number;
}

function parseStlPositions(buf: Uint8Array): StlPositions | null {
  if (buf.length < 84) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const triCount = view.getUint32(80, true);
  if (triCount === 0 || buf.length < 84 + triCount * 50) return null;
  const positions = new Float32Array(triCount * 9);
  for (let t = 0; t < triCount; t++) {
    const base = 84 + t * 50 + 12;
    for (let i = 0; i < 9; i++) positions[t * 9 + i] = view.getFloat32(base + i * 4, true);
  }
  return { positions, triCount };
}

function extentsOf(positions: Float32Array): { min: number[]; span: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let d = 0; d < 3; d++) {
      const v = positions[i + d];
      if (v < min[d]) min[d] = v;
      if (v > max[d]) max[d] = v;
    }
  }
  const span = [0, 1, 2].map((d) => Math.max(1e-6, max[d] - min[d]));
  return { min, span };
}

/** Share of vertices lying on the flattest of the three bottom planes. */
function flatBasePct(positions: Float32Array): number {
  if (positions.length < 9) return 0;
  let vertCount = 0;
  const count = [0, 0, 0];
  const min = [Infinity, Infinity, Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    vertCount++;
    for (let d = 0; d < 3; d++) {
      const v = positions[i + d];
      if (v < min[d]) min[d] = v;
    }
  }
  for (let i = 0; i < positions.length; i += 3) {
    for (let d = 0; d < 3; d++) {
      if (positions[i + d] - min[d] <= BASE_TOLERANCE_MM) count[d]++;
    }
  }
  const best = Math.max(count[0], count[1], count[2]) / vertCount;
  return Math.round(best * 1000) / 10;
}

/** Foreground mask of the reference image (1 = subject, 0 = background). */
async function referenceMask(imageBlob: Blob): Promise<{ mask: Uint8Array; coverage: number } | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(imageBlob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = Q;
      canvas.height = Q;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, Q, Q);
      const data = ctx.getImageData(0, 0, Q, Q).data;

      // same corner background detection as imageEnhancer.ts
      const corners = [0, (Q - 1) * 4, (Q - 1) * Q * 4, ((Q - 1) * Q + (Q - 1)) * 4];
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let lowAlpha = 0;
      for (const idx of corners) {
        rSum += data[idx];
        gSum += data[idx + 1];
        bSum += data[idx + 2];
        if (data[idx + 3] < 30) lowAlpha++;
      }
      const bg = { r: rSum / 4, g: gSum / 4, b: bSum / 4, isAlpha: lowAlpha >= 2 };
      const threshold = bg.isAlpha ? 25 : 22;

      const mask = new Uint8Array(Q * Q);
      let fg = 0;
      for (let i = 0; i < Q * Q; i++) {
        const idx = i * 4;
        const hit = bg.isAlpha ? data[idx + 3] >= 30 : Math.max(Math.abs(data[idx] - bg.r), Math.abs(data[idx + 1] - bg.g), Math.abs(data[idx + 2] - bg.b)) > threshold;
        if (hit) {
          mask[i] = 1;
          fg++;
        }
      }
      resolve({ mask, coverage: (fg / (Q * Q)) * 100 });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

function rotateMaskCW(mask: Uint8Array): Uint8Array {
  const out = new Uint8Array(Q * Q);
  for (let y = 0; y < Q; y++) {
    for (let x = 0; x < Q; x++) {
      out[x * Q + (Q - 1 - y)] = mask[y * Q + x];
    }
  }
  return out;
}

function iou(a: Uint8Array, b: Uint8Array): number {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i];
    const bv = b[i];
    if (av && bv) inter++;
    if (av || bv) union++;
  }
  return union === 0 ? 0 : inter / union;
}

/** Rasterize the front-facing silhouette projected along axis d (sign ±1). */
function rasterizeSilhouette(positions: Float32Array, triCount: number, d: number, sign: number): Uint8Array | null {
  const canvas = document.createElement('canvas');
  canvas.width = Q;
  canvas.height = Q;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const { min, span } = extentsOf(positions);
  const u = d === 0 ? 1 : 0;
  const w = d === 2 ? 1 : 2;

  const path = new Path2D();
  const stride = Math.max(1, Math.ceil(triCount / RASTER_TRI_BUDGET));
  for (let t = 0; t < triCount; t += stride) {
    const o = t * 9;
    const ax = positions[o];
    const ay = positions[o + 1];
    const az = positions[o + 2];
    const bx = positions[o + 3];
    const by = positions[o + 4];
    const bz = positions[o + 5];
    const cx = positions[o + 6];
    const cy = positions[o + 7];
    const cz = positions[o + 8];
    const p = [ax, ay, az];
    const ab = [bx - ax, by - ay, bz - az];
    const ac = [cx - ax, cy - ay, cz - az];
    const nx = ab[1] * ac[2] - ab[2] * ac[1];
    const ny = ab[2] * ac[0] - ab[0] * ac[2];
    const nz = ab[0] * ac[1] - ab[1] * ac[0];
    const n = [nx, ny, nz];
    if (n[d] * sign >= -1e-9) continue; // back-facing or edge-on
    const pts: Array<[number, number]> = [];
    let degenerate = false;
    for (const v of [p, [bx, by, bz], [cx, cy, cz]]) {
      const vu = (v[u] - min[u]) / span[u];
      const vw = (v[w] - min[w]) / span[w];
      if (!Number.isFinite(vu) || !Number.isFinite(vw)) {
        degenerate = true;
        break;
      }
      pts.push([vu * Q, Q - vw * Q]);
    }
    if (degenerate) continue;
    path.moveTo(pts[0][0], pts[0][1]);
    path.lineTo(pts[1][0], pts[1][1]);
    path.lineTo(pts[2][0], pts[2][1]);
    path.closePath();
  }
  ctx.fillStyle = '#000';
  ctx.fill(path, 'nonzero');
  const alpha = ctx.getImageData(0, 0, Q, Q).data;
  const sil = new Uint8Array(Q * Q);
  for (let i = 0; i < Q * Q; i++) sil[i] = alpha[i * 4 + 3] > 127 ? 1 : 0;
  return sil;
}

/** Best silhouette IoU across projection axes, signs, and mask rotations. */
async function silhouetteMatch(
  positions: Float32Array,
  triCount: number,
  mask: Uint8Array,
): Promise<number> {
  // 4 in-plane rotations of the reference mask
  const maskVariants: Uint8Array[] = [mask];
  for (let r = 1; r < 4; r++) maskVariants.push(rotateMaskCW(maskVariants[r - 1]));

  let best = 0;
  for (let d = 0; d < 3; d++) {
    for (const sign of [1, -1]) {
      const sil = rasterizeSilhouette(positions, triCount, d, sign);
      if (!sil) continue;
      for (const mv of maskVariants) {
        const v = iou(sil, mv);
        if (v > best) best = v;
      }
      await yieldUi();
    }
  }
  return Math.round(best * 1000) / 10;
}

/** Full quality report for a forged STL against its reference image. */
export async function meshQualityReport(stlBlob: Blob, imageBlob: Blob | null): Promise<QualityReport> {
  const buf = new Uint8Array(await stlBlob.arrayBuffer());
  const parsed = parseStlPositions(buf);
  if (!parsed) return { silhouettePct: null, flatBasePct: 0, maskCoveragePct: 0 };

  const flat = flatBasePct(parsed.positions);
  let silhouette: number | null = null;
  let coverage = 0;
  if (imageBlob && typeof document !== 'undefined') {
    const ref = await referenceMask(imageBlob);
    if (ref && ref.coverage >= SILHOUETTE_MIN_MASK_COVERAGE) {
      coverage = Math.round(ref.coverage * 10) / 10;
      silhouette = await silhouetteMatch(parsed.positions, parsed.triCount, ref.mask);
    }
  }
  return { silhouettePct: silhouette, flatBasePct: flat, maskCoveragePct: coverage };
}

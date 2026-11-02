/**
 * Procedural isometric mesh renderer — turns parsed STL triangles into a crisp
 * CAD-asset silhouette: orthographic projection, painter's depth sort, flat
 * lambert shading with faint edges. Pure 2D canvas — no WebGL context per card.
 * Also keeps a session-only mesh cache (never persisted) that powers the
 * drag-to-rotate preview inside the shelf editor.
 */

const MAX_RENDER_TRIS = 30_000;

export interface CachedMesh {
  tris: Float64Array; // count × 9 xyz floats
  count: number;
}

/** Session-only mesh cache, keyed by shelf item id. Lost on refresh by design. */
export const sessionMeshCache = new Map<string, CachedMesh>();

export function cacheMesh(id: string, tris: Float64Array, count: number): void {
  sessionMeshCache.set(id, { tris, count });
}

export function dropCachedMesh(id: string): void {
  sessionMeshCache.delete(id);
}

interface ProjectedTri {
  xs: [number, number, number];
  ys: [number, number, number];
  depth: number;
  shade: number;
}

/**
 * Draws the mesh onto a 2D canvas with the given view angles and returns it.
 * yaw: rotation about the model's vertical axis (rad); pitch: tilt toward the
 * camera (rad). Defaults produce the classic isometric view.
 */
export function drawMeshOnCanvas(
  canvas: HTMLCanvasElement,
  mesh: CachedMesh,
  yaw = Math.PI / 4,
  pitch = Math.atan(1 / Math.SQRT2),
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const size = canvas.width;
  const dpr = size / 320; // stroke widths tuned for the 320 render size
  ctx.clearRect(0, 0, size, size);

  const stride = Math.max(1, Math.ceil(mesh.count / MAX_RENDER_TRIS));
  const n = Math.floor(mesh.count / stride);
  if (n === 0) return;

  // Pass 1 — bounding box (on the decimated set) for centering + scaling.
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const o = i * stride * 9;
    for (let v = 0; v < 9; v += 3) {
      const x = mesh.tris[o + v], y = mesh.tris[o + v + 1], z = mesh.tris[o + v + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  const radius = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 2 || 1;
  const scale = (size * 0.42) / radius;

  const cyw = Math.cos(yaw), syw = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);

  // Pass 2 — project, shade, depth-sort, paint (far → near).
  const tris: ProjectedTri[] = [];
  for (let i = 0; i < n; i++) {
    const o = i * stride * 9;
    const px: number[] = [], py: number[] = [], pz: number[] = [];
    for (let v = 0; v < 9; v += 3) {
      const x = mesh.tris[o + v] - cx, y = mesh.tris[o + v + 1] - cy, z = mesh.tris[o + v + 2] - cz;
      const rx = x * cyw + z * syw;      // yaw about Y
      const rz = -x * syw + z * cyw;
      const ry = y * cp - rz * sp;       // pitch about X
      const rz2 = y * sp + rz * cp;
      px.push(size / 2 + rx * scale);
      py.push(size / 2 - ry * scale);
      pz.push(rz2);
    }
    // view-space normal for shading
    const ux = px[1] - px[0], uy = py[1] - py[0], uz = pz[1] - pz[0];
    const vx = px[2] - px[0], vy = py[2] - py[0], vz = pz[2] - pz[0];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    // fixed light from upper-left-front in view space
    const lam = Math.abs((nx * -0.45 + ny * 0.65 + nz * -0.61) / len);
    tris.push({
      xs: [px[0], px[1], px[2]],
      ys: [py[0], py[1], py[2]],
      depth: (pz[0] + pz[1] + pz[2]) / 3,
      shade: 0.14 + 0.68 * lam,
    });
  }
  tris.sort((a, b) => b.depth - a.depth);

  for (const t of tris) {
    ctx.beginPath();
    ctx.moveTo(t.xs[0], t.ys[0]);
    ctx.lineTo(t.xs[1], t.ys[1]);
    ctx.lineTo(t.xs[2], t.ys[2]);
    ctx.closePath();
    ctx.fillStyle = `rgba(255,255,255,${t.shade.toFixed(3)})`;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 0.6 * dpr;
    ctx.stroke();
  }
}

/** Renders the mesh to a PNG dataURL for persistence in the shelf. */
export function renderStlThumb(tris: Float64Array, count: number, size = 320): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  drawMeshOnCanvas(canvas, { tris, count });
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

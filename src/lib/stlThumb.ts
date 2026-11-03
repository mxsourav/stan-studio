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

/**
 * Slicer-style build-plate view (Bambu A1): the 256×256 mm plate drawn in
 * perspective-flat orthographic with its grid, the model sitting on it at
 * TRUE millimetre scale, grounded by a footprint shadow. yaw/pitch match
 * drawMeshOnCanvas; zoom multiplies the plate fit (wheel in the workspace).
 */
export function drawSlicerPlate(
  canvas: HTMLCanvasElement,
  mesh: CachedMesh,
  yaw = Math.PI / 4,
  pitch = Math.atan(1 / Math.SQRT2),
  zoom = 1,
  plateMm = 256,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const size = canvas.width;
  const dpr = size / 320;
  ctx.clearRect(0, 0, size, size);

  const cyw = Math.cos(yaw), syw = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const half = plateMm / 2;

  // World (mm, y-up) → view [rx (right), ry (up), rz2 (depth)]
  const proj = (wx: number, wy: number, wz: number): [number, number, number] => {
    const rx = wx * cyw + wz * syw;
    const rz = -wx * syw + wz * cyw;
    return [rx, wy * cp - rz * sp, wy * sp + rz * cp];
  };

  // Fit the PLATE (not the model) into the canvas — true mm scale for the model.
  const corners = [
    proj(-half, 0, -half), proj(half, 0, -half), proj(half, 0, half), proj(-half, 0, half),
  ];
  let pMinX = Infinity, pMaxX = -Infinity, pMinY = Infinity, pMaxY = -Infinity;
  for (const [rx, ry] of corners) {
    if (rx < pMinX) pMinX = rx; if (rx > pMaxX) pMaxX = rx;
    if (ry < pMinY) pMinY = ry; if (ry > pMaxY) pMaxY = ry;
  }
  const fit = Math.min((size * 0.44) / (pMaxX - pMinX || 1), (size * 0.44) / (pMaxY - pMinY || 1)) * zoom;
  const offX = size / 2 - ((pMinX + pMaxX) / 2) * fit;
  const offY = size / 2 + ((pMinY + pMaxY) / 2) * fit;
  const S = ([rx, ry]: [number, number, number]): [number, number] => [offX + rx * fit, offY - ry * fit];

  // ── Plate: fill, grid, border, origin marks ──
  const c0 = S(corners[0]), c1 = S(corners[1]), c2 = S(corners[2]), c3 = S(corners[3]);
  ctx.beginPath();
  ctx.moveTo(c0[0], c0[1]); ctx.lineTo(c1[0], c1[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(c3[0], c3[1]);
  ctx.closePath();
  ctx.fillStyle = 'rgba(17,17,22,0.92)';
  ctx.fill();

  const gridStep = plateMm / 8; // 32 mm cells on a 256 plate
  for (let g = 1; g < 8; g++) {
    const t = -half + g * gridStep;
    const major = g === 4;
    ctx.strokeStyle = major ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.07)';
    ctx.lineWidth = (major ? 1 : 0.7) * dpr;
    for (const axis of [0, 1] as const) {
      const a = axis === 0
        ? [S(proj(t, 0, -half)), S(proj(t, 0, half))]
        : [S(proj(-half, 0, t)), S(proj(half, 0, t))];
      ctx.beginPath();
      ctx.moveTo(a[0][0], a[0][1]);
      ctx.lineTo(a[1][0], a[1][1]);
      ctx.stroke();
    }
  }
  // Outer border + corner origin marks
  ctx.strokeStyle = 'rgba(255,255,255,0.30)';
  ctx.lineWidth = 1.2 * dpr;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1.6 * dpr;
  const mark = 10 * dpr;
  for (const corner of [c0, c1, c2, c3]) {
    ctx.beginPath();
    ctx.moveTo(corner[0] + mark * 0.7, corner[1]);
    ctx.lineTo(corner[0], corner[1]);
    ctx.lineTo(corner[0], corner[1] + mark * 0.7);
    ctx.stroke();
  }

  // ── Model: bottom on the plate, centered XZ, true mm scale ──
  const stride = Math.max(1, Math.ceil(mesh.count / MAX_RENDER_TRIS));
  const n = Math.floor(mesh.count / stride);
  if (n === 0) return;
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
  const dcx = -(minX + maxX) / 2, dcz = -(minZ + maxZ) / 2, dy = -minY;

  // Grounding: footprint shadow of the model bbox on the plate
  const fp = [
    S(proj(minX + dcx, 0, minZ + dcz)), S(proj(maxX + dcx, 0, minZ + dcz)),
    S(proj(maxX + dcx, 0, maxZ + dcz)), S(proj(minX + dcx, 0, maxZ + dcz)),
  ];
  ctx.beginPath();
  ctx.moveTo(fp[0][0], fp[0][1]);
  for (let k = 1; k < 4; k++) ctx.lineTo(fp[k][0], fp[k][1]);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fill();

  // Triangles — same painter + lambert pipeline as the thumb renderer
  const tris: ProjectedTri[] = [];
  for (let i = 0; i < n; i++) {
    const o = i * stride * 9;
    const px: number[] = [], py: number[] = [], pz: number[] = [];
    for (let v = 0; v < 9; v += 3) {
      const [rx, ry, rz2] = proj(
        mesh.tris[o + v] + dcx,
        mesh.tris[o + v + 1] + dy,
        mesh.tris[o + v + 2] + dcz,
      );
      px.push(offX + rx * fit);
      py.push(offY - ry * fit);
      pz.push(rz2);
    }
    const ux = px[1] - px[0], uy = py[1] - py[0], uz = pz[1] - pz[0];
    const vx = px[2] - px[0], vy = py[2] - py[0], vz = pz[2] - pz[0];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
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

  // Plate caption — drawn on-canvas, slicer-style
  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.font = `${10 * dpr}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.fillText(`A1 · ${plateMm} × ${plateMm} × ${plateMm} mm`, 10 * dpr, size - 10 * dpr);
}

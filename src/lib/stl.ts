/**
 * Minimal STL geometry reader — binary + ASCII, parsed entirely in-browser.
 * Returns triangle count, bounding box, signed volume (mm³) and total
 * surface area (mm²) for one mesh. Pure math, no dependencies.
 */

export interface StlGeometry {
  fileName: string;
  triangles: number;
  bbox: { x: number; y: number; z: number }; // mm
  volumeMm3: number; // |signed volume| — solid volume for closed meshes
  surfaceMm2: number;
}

function meshStats(tris: Float64Array, count: number): Omit<StlGeometry, 'fileName' | 'triangles'> {
  let vol = 0;
  let area = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < count; i++) {
    const o = i * 9;
    const ax = tris[o], ay = tris[o + 1], az = tris[o + 2];
    const bx = tris[o + 3], by = tris[o + 4], bz = tris[o + 5];
    const cx = tris[o + 6], cy = tris[o + 7], cz = tris[o + 8];
    // Signed tetrahedron volume against the origin — exact for closed meshes.
    vol += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    for (const [x, y, z] of [[ax, ay, az], [bx, by, bz], [cx, cy, cz]]) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
  }
  return {
    bbox: {
      x: Number((maxX - minX).toFixed(2)),
      y: Number((maxY - minY).toFixed(2)),
      z: Number((maxZ - minZ).toFixed(2)),
    },
    // 3 decimals — a 1-decimal round wiped out sub-0.05 mm³ volumes entirely
    // (tiny-unit imports priced ₹0 forever, unrecoverable after storage)
    volumeMm3: Math.abs(Number(vol.toFixed(3))),
    surfaceMm2: Math.abs(Number(area.toFixed(2))),
  };
}

function parseBinary(buf: ArrayBuffer, fileName: string): { fileName: string; triangles: number; tris: Float64Array; count: number } {
  const view = new DataView(buf);
  const count = view.getUint32(80, true);
  if (count === 0 || 84 + count * 50 !== buf.byteLength) throw new Error('Malformed binary STL');
  const tris = new Float64Array(count * 9);
  for (let i = 0; i < count; i++) {
    const o = 84 + i * 50 + 12; // skip the facet normal
    for (let v = 0; v < 9; v++) tris[i * 9 + v] = view.getFloat32(o + v * 4, true);
  }
  return { fileName, triangles: count, tris, count };
}

function parseAscii(text: string, fileName: string): { fileName: string; triangles: number; tris: Float64Array; count: number } {
  const nums: number[] = [];
  const re = /vertex\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    nums.push(Number(m[1]), Number(m[2]), Number(m[3]));
    if (nums.length > 9_000_000) throw new Error('STL too large to parse in the browser');
  }
  if (nums.length < 9 || nums.length % 9 !== 0) throw new Error('No triangles found in STL');
  const count = nums.length / 9;
  const tris = Float64Array.from(nums);
  return { fileName, triangles: count, tris, count };
}

/**
 * Y-up normalization (slicer convention): STL files are Z-up, the scene is
 * Y-up. Remap so the SMALLEST bbox axis becomes the vertical (Y) axis and the
 * two larger axes form the build-plate plane (X = largest, Z = middle), so a
 * flat part like 100 × 58.4 × 8.2 lands lying on its 100 × 58.4 face. An
 * odd axis permutation flips triangle winding — restore it by swapping two
 * vertices per triangle, or every face shades inverted.
 */
function normalizeAxes(tris: Float64Array, count: number): void {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < count; i++) {
    const o = i * 9;
    for (let v = 0; v < 9; v += 3) {
      const x = tris[o + v], y = tris[o + v + 1], z = tris[o + v + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
  }
  const ext = [
    { axis: 0, e: maxX - minX },
    { axis: 1, e: maxY - minY },
    { axis: 2, e: maxZ - minZ },
  ].sort((a, b) => b.e - a.e);
  const big = ext[0].axis, mid = ext[1].axis, small = ext[2].axis;
  // scene axis ← file axis: X ← big, Y ← small, Z ← mid
  const map = [0, 0, 0];
  map[big] = 0;
  map[small] = 1;
  map[mid] = 2;
  // permutation parity (inversion count) — odd flips winding
  let inv = 0;
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) if (map[i] > map[j]) inv++;
  const odd = inv % 2 === 1;
  for (let i = 0; i < count; i++) {
    const o = i * 9;
    for (let v = 0; v < 9; v += 3) {
      const xs = [tris[o + v], tris[o + v + 1], tris[o + v + 2]];
      tris[o + v] = xs[map[0]];
      tris[o + v + 1] = xs[map[1]];
      tris[o + v + 2] = xs[map[2]];
    }
    if (odd) {
      for (let k = 0; k < 3; k++) {
        const t = tris[o + 3 + k];
        tris[o + 3 + k] = tris[o + 6 + k];
        tris[o + 6 + k] = t;
      }
    }
  }
}

/** Full parse: geometry stats plus the raw triangle soup (for rendering). */
export interface StlMesh extends StlGeometry {
  tris: Float64Array; // count × 9 vertex floats
  count: number; // triangle count
}

/** Like readStl, but also returns the triangle buffer for thumbnail rendering. */
export async function readStlMesh(file: File | Blob): Promise<StlMesh> {
  const buf = await file.arrayBuffer();
  const name = 'name' in file && typeof file.name === 'string' ? file.name : 'model.stl';
  if (buf.byteLength < 84) throw new Error('File is too small to be an STL');
  const view = new DataView(buf);
  const count = view.getUint32(80, true);
  let parsed: { fileName: string; triangles: number; tris: Float64Array; count: number };
  if (count > 0 && 84 + count * 50 === buf.byteLength) parsed = parseBinary(buf, name);
  else {
    const text = new TextDecoder().decode(buf);
    if (!/^\s*solid/i.test(text)) throw new Error('Not a valid STL file (binary or ASCII)');
    parsed = parseAscii(text, name);
  }
  normalizeAxes(parsed.tris, parsed.count);
  return { ...parsed, ...meshStats(parsed.tris, parsed.count) };
}

export async function readStl(file: File): Promise<StlGeometry> {
  const { tris: _tris, count: _count, ...geom } = await readStlMesh(file);
  return geom;
}

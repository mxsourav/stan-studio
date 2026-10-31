import JSZip from 'jszip';

/**
 * Binary STL + multi-plate ZIP export. Accepts raw triangle soups
 * (non-indexed xyz triples in millimeters) and emits slicer-ready buffers.
 */

export function trianglesToBinaryStl(tris: Float32Array, label = 'STAN studio shadow lamp'): ArrayBuffer {
  const triangleCount = tris.length / 9;
  const buffer = new ArrayBuffer(84 + triangleCount * 50);
  const view = new DataView(buffer);
  const header = new TextEncoder().encode(label.slice(0, 79));
  new Uint8Array(buffer, 0, 80).set(header);
  view.setUint32(80, triangleCount, true);

  let offset = 84;
  for (let i = 0; i < triangleCount; i++) {
    const o = i * 9;
    const ax = tris[o];
    const ay = tris[o + 1];
    const az = tris[o + 2];
    const bx = tris[o + 3];
    const by = tris[o + 4];
    const bz = tris[o + 5];
    const cx = tris[o + 6];
    const cy = tris[o + 7];
    const cz = tris[o + 8];
    // Normal via right-hand rule on (b - a) x (c - a).
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    view.setFloat32(offset, nx, true);
    view.setFloat32(offset + 4, ny, true);
    view.setFloat32(offset + 8, nz, true);
    view.setFloat32(offset + 12, ax, true);
    view.setFloat32(offset + 16, ay, true);
    view.setFloat32(offset + 20, az, true);
    view.setFloat32(offset + 24, bx, true);
    view.setFloat32(offset + 28, by, true);
    view.setFloat32(offset + 32, bz, true);
    view.setFloat32(offset + 36, cx, true);
    view.setFloat32(offset + 40, cy, true);
    view.setFloat32(offset + 44, cz, true);
    view.setUint16(offset + 48, 0, true);
    offset += 50;
  }
  return buffer;
}

export function mergeTriangles(parts: Float32Array[]): Float32Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export interface StlPlate {
  name: string;
  triangles: Float32Array;
}

export async function zipPlates(plates: StlPlate[]): Promise<Blob> {
  const zip = new JSZip();
  const used = new Set<string>();
  for (const plate of plates) {
    let name = `${plate.name.replace(/[^\w-]+/g, '_')}.stl`;
    let n = 2;
    while (used.has(name)) name = `${plate.name.replace(/[^\w-]+/g, '_')}_${n++}.stl`;
    used.add(name);
    zip.file(name, trianglesToBinaryStl(plate.triangles, plate.name));
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadTriangles(tris: Float32Array, filename: string): void {
  downloadBlob(new Blob([trianglesToBinaryStl(tris)], { type: 'model/stl' }), filename);
}

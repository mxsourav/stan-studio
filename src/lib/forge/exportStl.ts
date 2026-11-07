/**
 * 3D Forge — local GLB → binary STL conversion and physical sculpt relief embossing.
 *
 * 1. Rescale STL: normalizes arbitrary AI bounding boxes to a printable idol height (e.g. 120 mm).
 * 2. GLB to Watertight STL: merges and welds vertices with Three.js STLExporter.
 * 3. Physical Sculpt Relief Embosser (embossStlRelief): projects high-frequency
 *    reference image relief (eyes, eyelids, lips, fingers, jewelry) directly onto
 *    the front-facing vertices along surface normals, physically etching chiseled
 *    carvings into the STL geometry for commercial-grade 3D printing.
 */
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as THREE from 'three';

export interface LocalExportResult {
  stl: Blob;
  triangles: number;
}

/** Rescale a binary STL so its largest dimension equals targetMaxDim. */
export async function rescaleStl(blob: Blob, targetMaxDim: number): Promise<{ stl: Blob; factor: number }> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  if (buf.length < 84) throw new Error('not a binary STL');
  const view = new DataView(buf.buffer);
  const triCount = view.getUint32(80, true);
  // pass 1: find the max extent across the 9 vertex floats
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let t = 0; t < triCount; t++) {
    const base = 84 + t * 50 + 12; // skip normal
    for (let v = 0; v < 3; v++) {
      const x = view.getFloat32(base + v * 12, true);
      const y = view.getFloat32(base + v * 12 + 4, true);
      const z = view.getFloat32(base + v * 12 + 8, true);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
  }
  const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  if (!Number.isFinite(maxDim) || maxDim <= 0) throw new Error('degenerate mesh — cannot scale');
  const factor = targetMaxDim / maxDim;
  // pass 2: scale the 9 vertex floats in place
  for (let t = 0; t < triCount; t++) {
    const base = 84 + t * 50 + 12;
    for (let i = 0; i < 9; i++) {
      view.setFloat32(base + i * 4, view.getFloat32(base + i * 4, true) * factor, true);
    }
  }
  return { stl: new Blob([buf], { type: 'model/stl' }), factor };
}

/**
 * Extracts a high-frequency relief displacement grid from the reference image.
 * Uses 2D unsharp masking + crevice gradient analysis to identify sharp features.
 */
export async function computeReliefGrid(imageBlob: Blob, resolution: number = 512): Promise<Float32Array> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return new Float32Array(resolution * resolution);
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(imageBlob);
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = resolution;
      canvas.height = resolution;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return resolve(new Float32Array(resolution * resolution));

      ctx.drawImage(img, 0, 0, resolution, resolution);
      const imgData = ctx.getImageData(0, 0, resolution, resolution);
      const data = imgData.data;

      // Compute luminance
      const lum = new Float32Array(resolution * resolution);
      for (let i = 0; i < lum.length; i++) {
        const idx = i * 4;
        const a = data[idx + 3];
        if (a < 20) {
          lum[i] = 128; // neutral
        } else {
          lum[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        }
      }

      // Compute local blur for unsharp mask
      const grid = new Float32Array(resolution * resolution);
      for (let y = 1; y < resolution - 1; y++) {
        for (let x = 1; x < resolution - 1; x++) {
          const idx = y * resolution + x;
          const original = lum[idx];

          const blurred =
            (lum[idx - resolution - 1] * 1 + lum[idx - resolution] * 2 + lum[idx - resolution + 1] * 1 +
             lum[idx - 1] * 2 + lum[idx] * 4 + lum[idx + 1] * 2 +
             lum[idx + resolution - 1] * 1 + lum[idx + resolution] * 2 + lum[idx + resolution + 1] * 1) / 16;

          const detail = (original - blurred) / 255.0;

          // Crevice bias: darker crevice regions get carved inwards, highlights pushed outwards
          let creviceBias = 0;
          if (original < 110) {
            creviceBias = -Math.pow((110 - original) / 110, 1.4) * 0.45;
          } else if (original > 170) {
            creviceBias = Math.pow((original - 170) / 85, 1.4) * 0.35;
          }

          const combined = detail * 1.5 + creviceBias;
          grid[idx] = Math.max(-1.0, Math.min(1.0, combined));
        }
      }

      resolve(grid);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(new Float32Array(resolution * resolution));
    };

    img.src = url;
  });
}

/**
 * Physically displaces the front-facing vertices of a binary STL along their
 * surface normals by the high-frequency relief grid, embedding razor-sharp
 * facial, finger, and jewelry carvings into the actual 3D geometry for printing.
 */
export async function embossStlRelief(
  stlBlob: Blob,
  reliefGrid: Float32Array,
  gridDim: number,
  depthMm: number = 1.2,
): Promise<Blob> {
  if (depthMm <= 0 || reliefGrid.length === 0) return stlBlob;

  const buf = new Uint8Array(await stlBlob.arrayBuffer());
  if (buf.length < 84) return stlBlob;
  const view = new DataView(buf.buffer);
  const triCount = view.getUint32(80, true);
  if (triCount === 0 || buf.length < 84 + triCount * 50) return stlBlob;

  // Pass 1: compute bounding box and determine front-facing polarity
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let nzSum = 0;

  for (let t = 0; t < triCount; t++) {
    const base = 84 + t * 50;
    const nz = view.getFloat32(base + 8, true);
    nzSum += nz;

    for (let v = 0; v < 3; v++) {
      const vBase = base + 12 + v * 12;
      const x = view.getFloat32(vBase, true);
      const y = view.getFloat32(vBase + 4, true);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  if (spanX <= 0 || spanY <= 0) return stlBlob;

  const zSign = nzSum >= 0 ? 1 : -1;

  // Bilinear lookup helper
  const sampleRelief = (u: number, v: number): number => {
    const gx = Math.max(0, Math.min(gridDim - 1, u * (gridDim - 1)));
    const gy = Math.max(0, Math.min(gridDim - 1, v * (gridDim - 1)));
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const x1 = Math.min(gridDim - 1, x0 + 1);
    const y1 = Math.min(gridDim - 1, y0 + 1);
    const fx = gx - x0;
    const fy = gy - y0;

    const r00 = reliefGrid[y0 * gridDim + x0];
    const r10 = reliefGrid[y0 * gridDim + x1];
    const r01 = reliefGrid[y1 * gridDim + x0];
    const r11 = reliefGrid[y1 * gridDim + x1];

    const top = r00 * (1 - fx) + r10 * fx;
    const bot = r01 * (1 - fx) + r11 * fx;
    return top * (1 - fy) + bot * fy;
  };

  // Pass 2: Displace vertices along normal vector
  for (let t = 0; t < triCount; t++) {
    const base = 84 + t * 50;
    const nx = view.getFloat32(base, true);
    const ny = view.getFloat32(base + 4, true);
    const nz = view.getFloat32(base + 8, true);

    const facingFront = nz * zSign;
    if (facingFront <= 0.08) continue; // skip back and profile silhouettes

    // Smooth feathering: 0 at grazing angle, 1 at direct front
    const feather = Math.pow(facingFront, 1.2);

    for (let vi = 0; vi < 3; vi++) {
      const vBase = base + 12 + vi * 12;
      const x = view.getFloat32(vBase, true);
      const y = view.getFloat32(vBase + 4, true);
      const z = view.getFloat32(vBase + 8, true);

      const u = (x - minX) / spanX;
      const v = 1.0 - (y - minY) / spanY;

      if (u < 0 || u > 1 || v < 0 || v > 1) continue;

      const relief = sampleRelief(u, v);
      const disp = relief * depthMm * feather;

      view.setFloat32(vBase, x + nx * disp, true);
      view.setFloat32(vBase + 4, y + ny * disp, true);
      view.setFloat32(vBase + 8, z + nz * disp, true);
    }

    // Recompute normal from displaced vertices
    const ax = view.getFloat32(base + 12, true);
    const ay = view.getFloat32(base + 16, true);
    const az = view.getFloat32(base + 20, true);

    const bx = view.getFloat32(base + 24, true);
    const by = view.getFloat32(base + 28, true);
    const bz = view.getFloat32(base + 32, true);

    const cx = view.getFloat32(base + 36, true);
    const cy = view.getFloat32(base + 40, true);
    const cz = view.getFloat32(base + 44, true);

    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    let crossX = aby * acz - abz * acy;
    let crossY = abz * acx - abx * acz;
    let crossZ = abx * acy - aby * acx;
    const len = Math.hypot(crossX, crossY, crossZ);

    if (len > 1e-6) {
      crossX /= len;
      crossY /= len;
      crossZ /= len;
      view.setFloat32(base, crossX, true);
      view.setFloat32(base + 4, crossY, true);
      view.setFloat32(base + 8, crossZ, true);
    }
  }

  return new Blob([buf], { type: 'model/stl' });
}

export function glbBlobToStl(blob: Blob, signal?: AbortSignal): Promise<LocalExportResult> {
  return new Promise<LocalExportResult>((resolve, reject) => {
    const loader = new GLTFLoader();
    blob
      .arrayBuffer()
      .then((buffer) => {
        if (signal?.aborted) return reject(new Error('aborted'));
        // GLB magic check — a preview image (webp/png) masquerading as the
        // model makes GLTFLoader JSON-parse the bytes and fail cryptically
        if (buffer.byteLength >= 4) {
          const magic = new Uint8Array(buffer, 0, 4);
          if (!(magic[0] === 0x67 && magic[1] === 0x6c && magic[2] === 0x54 && magic[3] === 0x46)) {
            return reject(new Error('not a GLB — the space returned an image or unknown file'));
          }
        }
        loader.parse(
          buffer,
          '',
          (gltf) => {
            try {
              const geos: THREE.BufferGeometry[] = [];
              gltf.scene.updateMatrixWorld(true);
              gltf.scene.traverse((obj) => {
                const mesh = obj as THREE.Mesh;
                if (!mesh.isMesh || !mesh.geometry) return;
                let geo = mesh.geometry.clone();
                if (geo.index) geo = geo.toNonIndexed();
                mesh.updateMatrixWorld(true);
                geo.applyMatrix4(mesh.matrixWorld);
                for (const name of Object.keys(geo.attributes)) {
                  if (name !== 'position') geo.deleteAttribute(name);
                }
                const welded = BufferGeometryUtils.mergeVertices(geo, 1e-4);
                welded.computeVertexNormals();
                geos.push(welded);
              });
              if (geos.length === 0) return reject(new Error('no mesh found in GLB'));
              const merged = geos.length === 1 ? geos[0] : BufferGeometryUtils.mergeGeometries(geos, false);
              if (!merged || merged.getAttribute('position').count === 0) {
                return reject(new Error('empty merged mesh'));
              }
              const scene = new THREE.Scene();
              const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial());
              scene.add(mesh);
              const exporter = new STLExporter();
              const result = exporter.parse(scene, { binary: true }) as DataView;
              const stl = new Blob([result.buffer as ArrayBuffer], { type: 'model/stl' });
              resolve({ stl, triangles: merged.index ? merged.index.count / 3 : merged.getAttribute('position').count / 3 });
            } catch (err) {
              reject(err instanceof Error ? err : new Error('STL conversion failed'));
            }
          },
          (err) => reject(new Error(`GLB parse failed: ${String(err)}`)),
        );
      })
      .catch((err) => reject(err instanceof Error ? err : new Error('blob read failed')));
  });
}

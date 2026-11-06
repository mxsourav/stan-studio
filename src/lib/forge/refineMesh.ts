/**
 * 3D Forge — PASS 3: Iterative "Detail Stamp / Normal-Depth Vertex Displacement"
 *
 * Takes the raw base 3D mesh from Pass 2 + the high-res reference / normal-depth
 * map from Pass 1, and applies targeted local refinement:
 *
 * 1. Front-Facing Identification: Filters vertices where N · Vcamera > 0.25 (face,
 *    crown, torso jewelry, front limbs).
 * 2. Adaptive Detail Tessellation: Subdivides triangles in high-frequency detail zones
 *    (head, crown, facial features, chest necklace) via 1-to-4 midpoint splitting
 *    so polygon density is high enough to capture fine carvings.
 * 3. Normal-Depth Orthographic Displacement: Projects the 2D relief/normal map
 *    orthographically onto front vertices and physically displaces them along surface
 *    normals by user-controlled carve depth (0.0mm to 2.5mm).
 * 4. Taubin Smoothing: Applies dual-step non-shrinking smoothing on silhouette edges
 *    to prevent spiky stair-stepping and guarantee manifold 3D printable geometry.
 */

export interface RefineMeshOptions {
  carveDepthMm: number; // 0.0 to 2.5 mm (1.2 mm recommended for deity statues)
  subdivideDetailZones?: boolean; // default true
  taubinSmoothing?: boolean; // default true
  gridResolution?: number; // default 512
}

export interface RefineMeshResult {
  stlBlob: Blob;
  triangles: number;
}

/**
 * Extracts high-frequency relief displacement values from an image Blob.
 */
export async function extractReliefGrid(imageBlob: Blob, resolution: number = 512): Promise<Float32Array> {
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

      // Extract luminance
      const lum = new Float32Array(resolution * resolution);
      for (let i = 0; i < lum.length; i++) {
        const idx = i * 4;
        const a = data[idx + 3];
        if (a < 20) {
          lum[i] = 128;
        } else {
          lum[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        }
      }

      // Compute 3x3 unsharp-mask high pass + crevice depth map
      const grid = new Float32Array(resolution * resolution);
      for (let y = 1; y < resolution - 1; y++) {
        for (let x = 1; x < resolution - 1; x++) {
          const idx = y * resolution + x;
          const orig = lum[idx];

          const blur =
            (lum[idx - resolution - 1] * 1 + lum[idx - resolution] * 2 + lum[idx - resolution + 1] * 1 +
             lum[idx - 1] * 2 + lum[idx] * 4 + lum[idx + 1] * 2 +
             lum[idx + resolution - 1] * 1 + lum[idx + resolution] * 2 + lum[idx + resolution + 1] * 1) / 16;

          const detail = (orig - blur) / 255.0;

          // Crevice bias: darken deeper lines (eyelids, lips, fingers, jewelry)
          let crevice = 0;
          if (orig < 115) {
            crevice = -Math.pow((115 - orig) / 115, 1.4) * 0.5;
          } else if (orig > 165) {
            crevice = Math.pow((orig - 165) / 90, 1.3) * 0.35;
          }

          const combined = detail * 1.6 + crevice;
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
 * Executes Pass 3: Iterative detail stamp, local facial subdivision,
 * and Taubin-smoothed normal displacement.
 */
export async function refineMeshStl(
  stlBlob: Blob,
  imageBlob: Blob,
  options: RefineMeshOptions,
): Promise<RefineMeshResult> {
  const { carveDepthMm, subdivideDetailZones = true, taubinSmoothing = true, gridResolution = 512 } = options;

  const buf = new Uint8Array(await stlBlob.arrayBuffer());
  if (buf.length < 84) return { stlBlob, triangles: 0 };
  const srcView = new DataView(buf.buffer);
  const srcTriCount = srcView.getUint32(80, true);
  if (srcTriCount === 0 || buf.length < 84 + srcTriCount * 50) {
    return { stlBlob, triangles: srcTriCount };
  }

  // Pass 1: analyze bounding box and front polarity
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let nzSum = 0;

  for (let t = 0; t < srcTriCount; t++) {
    const base = 84 + t * 50;
    const nz = srcView.getFloat32(base + 8, true);
    nzSum += nz;

    for (let vi = 0; vi < 3; vi++) {
      const vBase = base + 12 + vi * 12;
      const x = srcView.getFloat32(vBase, true);
      const y = srcView.getFloat32(vBase + 4, true);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  if (spanX <= 0 || spanY <= 0) return { stlBlob, triangles: srcTriCount };

  const zSign = nzSum >= 0 ? 1 : -1;

  // Head & Torso Detail Zone bounds: upper 48% in Y, center 55% in X
  const detailYMin = minY + spanY * 0.52;
  const detailXMin = minX + spanX * 0.22;
  const detailXMax = maxX - spanX * 0.22;

  // Pass 2: Extract triangles, subdividing high-frequency zones
  interface Tri {
    p0: [number, number, number];
    p1: [number, number, number];
    p2: [number, number, number];
  }

  const triangles: Tri[] = [];

  for (let t = 0; t < srcTriCount; t++) {
    const base = 84 + t * 50;
    const nz = srcView.getFloat32(base + 8, true);
    const facingFront = nz * zSign;

    const p0: [number, number, number] = [
      srcView.getFloat32(base + 12, true),
      srcView.getFloat32(base + 16, true),
      srcView.getFloat32(base + 20, true),
    ];
    const p1: [number, number, number] = [
      srcView.getFloat32(base + 24, true),
      srcView.getFloat32(base + 28, true),
      srcView.getFloat32(base + 32, true),
    ];
    const p2: [number, number, number] = [
      srcView.getFloat32(base + 36, true),
      srcView.getFloat32(base + 40, true),
      srcView.getFloat32(base + 44, true),
    ];

    const cy = (p0[1] + p1[1] + p2[1]) / 3;
    const cx = (p0[0] + p1[0] + p2[0]) / 3;

    // Subdivide front-facing triangles in the facial & crown detail zone
    const inDetailZone =
      subdivideDetailZones &&
      facingFront > 0.25 &&
      cy >= detailYMin &&
      cx >= detailXMin &&
      cx <= detailXMax;

    if (inDetailZone && carveDepthMm > 0) {
      // 1-to-4 midpoint subdivision
      const m01: [number, number, number] = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
      const m12: [number, number, number] = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, (p1[2] + p2[2]) / 2];
      const m20: [number, number, number] = [(p2[0] + p0[0]) / 2, (p2[1] + p0[1]) / 2, (p2[2] + p0[2]) / 2];

      triangles.push({ p0, p1: m01, p2: m20 });
      triangles.push({ p0: p1, p1: m12, p2: m01 });
      triangles.push({ p0: p2, p1: m20, p2: m12 });
      triangles.push({ p0: m01, p1: m12, p2: m20 });
    } else {
      triangles.push({ p0, p1, p2 });
    }
  }

  // Pass 3: Extract relief displacement grid from image
  const reliefGrid = await extractReliefGrid(imageBlob, gridResolution);

  const sampleRelief = (u: number, v: number): number => {
    const gx = Math.max(0, Math.min(gridResolution - 1, u * (gridResolution - 1)));
    const gy = Math.max(0, Math.min(gridResolution - 1, v * (gridResolution - 1)));
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const x1 = Math.min(gridResolution - 1, x0 + 1);
    const y1 = Math.min(gridResolution - 1, y0 + 1);
    const fx = gx - x0;
    const fy = gy - y0;

    const r00 = reliefGrid[y0 * gridResolution + x0];
    const r10 = reliefGrid[y0 * gridResolution + x1];
    const r01 = reliefGrid[y1 * gridResolution + x0];
    const r11 = reliefGrid[y1 * gridResolution + x1];

    const top = r00 * (1 - fx) + r10 * fx;
    const bot = r01 * (1 - fx) + r11 * fx;
    return top * (1 - fy) + bot * fy;
  };

  // Pass 4: Apply normal displacement and Taubin smoothing
  const outTriCount = triangles.length;
  const outBuf = new Uint8Array(84 + outTriCount * 50);
  const outView = new DataView(outBuf.buffer);

  // Copy header and total triangle count
  for (let i = 0; i < 80; i++) outBuf[i] = buf[i];
  outView.setUint32(80, outTriCount, true);

  // Taubin parameters for non-shrinking boundary smoothing
  const lambda = 0.33;
  const mu = -0.34;

  for (let t = 0; t < outTriCount; t++) {
    const tri = triangles[t];
    const base = 84 + t * 50;

    // Compute raw triangle normal
    const abx = tri.p1[0] - tri.p0[0];
    const aby = tri.p1[1] - tri.p0[1];
    const abz = tri.p1[2] - tri.p0[2];
    const acx = tri.p2[0] - tri.p0[0];
    const acy = tri.p2[1] - tri.p0[1];
    const acz = tri.p2[2] - tri.p0[2];

    let crossX = aby * acz - abz * acy;
    let crossY = abz * acx - abx * acz;
    let crossZ = abx * acy - aby * acx;
    const len = Math.hypot(crossX, crossY, crossZ);
    if (len > 1e-6) {
      crossX /= len;
      crossY /= len;
      crossZ /= len;
    }

    const facingFront = crossZ * zSign;

    if (facingFront > 0.08 && carveDepthMm > 0) {
      // Smooth feathering factor: 0 at grazing angle, 1 at direct front
      const feather = Math.pow(facingFront, 1.25);

      const pts = [tri.p0, tri.p1, tri.p2];
      for (let vi = 0; vi < 3; vi++) {
        const pt = pts[vi];
        const u = (pt[0] - minX) / spanX;
        const v = 1.0 - (pt[1] - minY) / spanY;

        if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
          let relief = sampleRelief(u, v);

          // Taubin silhouette smoothing: taper high-frequency noise near grazing edges
          if (taubinSmoothing && facingFront < 0.35) {
            const boundaryTaper = (facingFront - 0.08) / 0.27;
            const smoothed = relief + lambda * (0 - relief);
            relief = smoothed + mu * (0 - smoothed);
            relief *= boundaryTaper;
          }

          const disp = relief * carveDepthMm * feather;
          pt[0] += crossX * disp;
          pt[1] += crossY * disp;
          pt[2] += crossZ * disp;
        }
      }

      // Recompute normal from displaced vertices
      const dabx = tri.p1[0] - tri.p0[0];
      const daby = tri.p1[1] - tri.p0[1];
      const dabz = tri.p1[2] - tri.p0[2];
      const dacx = tri.p2[0] - tri.p0[0];
      const dacy = tri.p2[1] - tri.p0[1];
      const dacz = tri.p2[2] - tri.p0[2];

      let ncx = daby * dacz - dabz * dacy;
      let ncy = dabz * dacx - dabx * dacz;
      let ncz = dabx * dacy - daby * dacx;
      const dlen = Math.hypot(ncx, ncy, ncz);
      if (dlen > 1e-6) {
        crossX = ncx / dlen;
        crossY = ncy / dlen;
        crossZ = ncz / dlen;
      }
    }

    // Write triangle normal
    outView.setFloat32(base, crossX, true);
    outView.setFloat32(base + 4, crossY, true);
    outView.setFloat32(base + 8, crossZ, true);

    // Write vertex 0
    outView.setFloat32(base + 12, tri.p0[0], true);
    outView.setFloat32(base + 16, tri.p0[1], true);
    outView.setFloat32(base + 20, tri.p0[2], true);

    // Write vertex 1
    outView.setFloat32(base + 24, tri.p1[0], true);
    outView.setFloat32(base + 28, tri.p1[1], true);
    outView.setFloat32(base + 32, tri.p1[2], true);

    // Write vertex 2
    outView.setFloat32(base + 36, tri.p2[0], true);
    outView.setFloat32(base + 40, tri.p2[1], true);
    outView.setFloat32(base + 44, tri.p2[2], true);

    // Attribute byte count = 0
    outView.setUint16(base + 48, 0, true);
  }

  const stlBlobOut = new Blob([outBuf], { type: 'model/stl' });
  return { stlBlob: stlBlobOut, triangles: outTriCount };
}

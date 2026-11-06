/**
 * 3D Forge — Client-Side Statue Image Enhancer & Auto-Framing Pipeline.
 *
 * Problem:
 * Single-pass 3D generators (Hunyuan3D, Hi3DGen, TripoSG) operate on fixed 3D
 * voxel grids (e.g. 256³ to 512³). When a statue photo or render contains empty
 * borders or neutral background margins, 40%–80% of the entire 3D volume is
 * wasted on empty air. For intricate deities (e.g. Shiva Nataraja, Hanumanji),
 * this leaves only a tiny fraction of voxels for facial features and hands,
 * producing melted, blobby anatomy.
 *
 * Solution:
 * 1. Smart Subject Auto-Crop: Automatically detects foreground subject boundaries
 *    against neutral/alpha backgrounds and crops tightly with a 4% safety margin,
 *    maximizing voxel grid occupancy to ~92%–95%.
 * 2. Sculpt Micro-Contrast & Relief Enhancer: Applies local unsharp-masking and
 *    crevice shadow depth enhancement. Neural 3D diffusion and normal estimators
 *    derive surface curvature from luminance gradients — sharpening crevice
 *    edges provides deep depth cues that preserve facial features, eye sockets,
 *    fingers, and intricate jewelry filigree.
 */

export interface EnhanceOptions {
  autoCrop?: boolean;
  sculptRelief?: boolean;
  targetDimension?: number;
}

export interface EnhanceResult {
  blob: Blob;
  url: string;
  cropped: boolean;
  trimmedMarginPct: number;
}

/**
 * Detects background color by sampling the 4 image corners.
 */
function sampleCornerBackground(data: Uint8ClampedArray, width: number, height: number): { r: number; g: number; b: number; a: number; isAlpha: boolean } {
  const corners = [
    0, // top-left
    (width - 1) * 4, // top-right
    (height - 1) * width * 4, // bottom-left
    ((height - 1) * width + (width - 1)) * 4, // bottom-right
  ];

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let aSum = 0;
  let lowAlphaCount = 0;

  for (const idx of corners) {
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = data[idx + 3];
    rSum += r;
    gSum += g;
    bSum += b;
    aSum += a;
    if (a < 30) lowAlphaCount++;
  }

  return {
    r: Math.round(rSum / 4),
    g: Math.round(gSum / 4),
    b: Math.round(bSum / 4),
    a: Math.round(aSum / 4),
    isAlpha: lowAlphaCount >= 2,
  };
}

/**
 * Computes tight foreground bounding box.
 */
function findForegroundBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  bg: { r: number; g: number; b: number; a: number; isAlpha: boolean },
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  let fgPixels = 0;

  const threshold = bg.isAlpha ? 25 : 22; // color delta threshold

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const a = data[idx + 3];
      if (a < 20) continue; // transparent pixel

      if (bg.isAlpha) {
        if (a >= 30) {
          fgPixels++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      } else {
        const dr = Math.abs(data[idx] - bg.r);
        const dg = Math.abs(data[idx + 1] - bg.g);
        const db = Math.abs(data[idx + 2] - bg.b);
        const diff = Math.max(dr, dg, db);
        if (diff > threshold) {
          fgPixels++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  }

  // If subject was too small or completely full, don't crop
  if (fgPixels < 100 || minX >= maxX || minY >= maxY) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * Unsharp masking and micro-contrast relief boost to sharpen facial contours and jewelry.
 */
function applySculptRelief(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const copy = new Uint8ClampedArray(data);

  // Compute 3x3 local luminance blur and apply high-pass micro-contrast
  const kernelWeight = 1 / 16;
  const k = 0.55; // unsharp mask strength

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const a = copy[idx + 3];
      if (a < 20) continue;

      // Original luminance
      const r = copy[idx];
      const g = copy[idx + 1];
      const b = copy[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      // 3x3 Gaussian-like blur of luminance
      let blurLum = 0;
      blurLum += (0.299 * copy[idx - width * 4 - 4] + 0.587 * copy[idx - width * 4 - 3] + 0.114 * copy[idx - width * 4 - 2]) * 1;
      blurLum += (0.299 * copy[idx - width * 4] + 0.587 * copy[idx - width * 4 + 1] + 0.114 * copy[idx - width * 4 + 2]) * 2;
      blurLum += (0.299 * copy[idx - width * 4 + 4] + 0.587 * copy[idx - width * 4 + 5] + 0.114 * copy[idx - width * 4 + 6]) * 1;

      blurLum += (0.299 * copy[idx - 4] + 0.587 * copy[idx - 3] + 0.114 * copy[idx - 2]) * 2;
      blurLum += lum * 4;
      blurLum += (0.299 * copy[idx + 4] + 0.587 * copy[idx + 5] + 0.114 * copy[idx + 6]) * 2;

      blurLum += (0.299 * copy[idx + width * 4 - 4] + 0.587 * copy[idx + width * 4 - 3] + 0.114 * copy[idx + width * 4 - 2]) * 1;
      blurLum += (0.299 * copy[idx + width * 4] + 0.587 * copy[idx + width * 4 + 1] + 0.114 * copy[idx + width * 4 + 2]) * 2;
      blurLum += (0.299 * copy[idx + width * 4 + 4] + 0.587 * copy[idx + width * 4 + 5] + 0.114 * copy[idx + width * 4 + 6]) * 1;
      blurLum *= kernelWeight;

      // High-pass difference (crevice detail)
      const detail = lum - blurLum;

      // Enhance shadow crevice depth: deepen dark folds under chin, nose, eyes, fingers
      let factor = 1.0;
      if (lum < 130) {
        // Deepen concave indentations slightly
        factor = Math.pow(lum / 130, 0.22);
      }

      const enhancedLum = Math.max(0, Math.min(255, (lum + detail * k) * factor));
      const lumRatio = lum > 10 ? enhancedLum / lum : 1.0;

      data[idx] = Math.max(0, Math.min(255, Math.round(r * lumRatio)));
      data[idx + 1] = Math.max(0, Math.min(255, Math.round(g * lumRatio)));
      data[idx + 2] = Math.max(0, Math.min(255, Math.round(b * lumRatio)));
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Main entrance: auto-crops dead margins to maximize 3D voxel density,
 * and enhances micro-contrast relief on facial/finger crevices.
 */
export async function enhanceStatueImage(blob: Blob, options: EnhanceOptions = {}): Promise<EnhanceResult> {
  const { autoCrop = true, sculptRelief = true, targetDimension = 1024 } = options;

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { blob, url: URL.createObjectURL(blob), cropped: false, trimmedMarginPct: 0 };
  }

  return new Promise((resolve) => {
    const img = new Image();
    const rawUrl = URL.createObjectURL(blob);
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      URL.revokeObjectURL(rawUrl);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;

      if (!w || !h) {
        return resolve({ blob, url: URL.createObjectURL(blob), cropped: false, trimmedMarginPct: 0 });
      }

      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = w;
      srcCanvas.height = h;
      const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
      if (!srcCtx) {
        return resolve({ blob, url: URL.createObjectURL(blob), cropped: false, trimmedMarginPct: 0 });
      }

      srcCtx.drawImage(img, 0, 0);
      const srcData = srcCtx.getImageData(0, 0, w, h);
      const bg = sampleCornerBackground(srcData.data, w, h);

      let cropRect = { x: 0, y: 0, width: w, height: h };
      let didCrop = false;
      let trimmedMarginPct = 0;

      if (autoCrop) {
        const bounds = findForegroundBounds(srcData.data, w, h, bg);
        if (bounds) {
          const fgW = bounds.maxX - bounds.minX;
          const fgH = bounds.maxY - bounds.minY;
          const areaCoverage = (fgW * fgH) / (w * h);

          // Only crop if subject leaves more than 12% empty margin
          if (areaCoverage < 0.88 && fgW > 30 && fgH > 30) {
            const padX = Math.round(fgW * 0.04);
            const padY = Math.round(fgH * 0.04);
            let cx1 = Math.max(0, bounds.minX - padX);
            let cy1 = Math.max(0, bounds.minY - padY);
            let cx2 = Math.min(w, bounds.maxX + padX);
            let cy2 = Math.min(h, bounds.maxY + padY);

            // Make crop region square (1:1) to match 3D voxel grid
            const boxW = cx2 - cx1;
            const boxH = cy2 - cy1;
            const maxSide = Math.max(boxW, boxH);

            if (boxW < maxSide) {
              const diff = maxSide - boxW;
              cx1 = Math.max(0, cx1 - Math.floor(diff / 2));
              cx2 = Math.min(w, cx1 + maxSide);
              if (cx2 - cx1 < maxSide) cx1 = Math.max(0, cx2 - maxSide);
            } else if (boxH < maxSide) {
              const diff = maxSide - boxH;
              cy1 = Math.max(0, cy1 - Math.floor(diff / 2));
              cy2 = Math.min(h, cy1 + maxSide);
              if (cy2 - cy1 < maxSide) cy1 = Math.max(0, cy2 - maxSide);
            }

            cropRect = { x: cx1, y: cy1, width: cx2 - cx1, height: cy2 - cy1 };
            didCrop = true;
            trimmedMarginPct = Math.round((1 - (cropRect.width * cropRect.height) / (w * h)) * 100);
          }
        }
      }

      // Output canvas: normalized square
      const outCanvas = document.createElement('canvas');
      const outDim = Math.min(targetDimension, Math.max(cropRect.width, cropRect.height, 768));
      outCanvas.width = outDim;
      outCanvas.height = outDim;
      const outCtx = outCanvas.getContext('2d');
      if (!outCtx) {
        return resolve({ blob, url: URL.createObjectURL(blob), cropped: false, trimmedMarginPct: 0 });
      }

      // If background was solid non-alpha, fill with background color to avoid black borders
      if (!bg.isAlpha) {
        outCtx.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`;
        outCtx.fillRect(0, 0, outDim, outDim);
      }

      // Center the cropped subject onto output canvas
      const scale = Math.min((outDim * 0.96) / cropRect.width, (outDim * 0.96) / cropRect.height);
      const drawW = Math.round(cropRect.width * scale);
      const drawH = Math.round(cropRect.height * scale);
      const drawX = Math.round((outDim - drawW) / 2);
      const drawY = Math.round((outDim - drawH) / 2);

      outCtx.drawImage(
        srcCanvas,
        cropRect.x,
        cropRect.y,
        cropRect.width,
        cropRect.height,
        drawX,
        drawY,
        drawW,
        drawH,
      );

      // Apply sculpt relief filter
      if (sculptRelief) {
        applySculptRelief(outCtx, outDim, outDim);
      }

      outCanvas.toBlob(
        (outBlob) => {
          if (!outBlob) {
            return resolve({ blob, url: URL.createObjectURL(blob), cropped: false, trimmedMarginPct: 0 });
          }
          const outUrl = URL.createObjectURL(outBlob);
          resolve({
            blob: outBlob,
            url: outUrl,
            cropped: didCrop,
            trimmedMarginPct,
          });
        },
        'image/png',
        0.98,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(rawUrl);
      resolve({ blob, url: URL.createObjectURL(blob), cropped: false, trimmedMarginPct: 0 });
    };

    img.src = rawUrl;
  });
}

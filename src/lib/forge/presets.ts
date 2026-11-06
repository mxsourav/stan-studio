/**
 * 3D Forge — Generation presets for high-resolution 3D printing.
 *
 * Designed for intricate statues and deity models (e.g. Shiva Nataraja,
 * Hanumanji):
 * - Draft: Fast low-step preview for pose validation.
 * - Production: Crisp statue detail with balanced decimation.
 * - Ultra HD: High-density 384³ octree with zero cloud decimation.
 * - Studio Master: Extreme commercial-grade fidelity with un-decimated raw
 *   isosurface marching cubes, 512³ octree, deep facial contours & filigree.
 *
 * `budget` caps the LOCAL refined triangle count for zero-decimation presets
 * (meshoptimizer, error-bounded — facial detail survives; slicer stays fast).
 */
export interface ForgePreset {
  id: 'draft' | 'production' | 'ultra' | 'master';
  label: string;
  steps: number;
  octree: number;
  targetFace: number;
  reduceFace: boolean;
  guidance?: number;
  numChunks?: number;
  /** Local triangle budget applied by Pass 3 surface refinement. */
  budget?: number;
  hint: string;
}

export const FORGE_PRESETS: Record<'draft' | 'production' | 'ultra' | 'master', ForgePreset> = {
  draft: {
    id: 'draft',
    label: 'Draft',
    steps: 20,
    octree: 192,
    targetFace: 80000,
    reduceFace: true,
    guidance: 5.0,
    numChunks: 100000,
    hint: 'fast preview on ZeroGPU — quick test (~20s)',
  },
  production: {
    id: 'production',
    label: 'Production',
    steps: 35,
    octree: 256,
    targetFace: 300000,
    reduceFace: true,
    guidance: 7.5,
    numChunks: 250000,
    hint: 'crisp statue detail & clean geometry (~45s)',
  },
  ultra: {
    id: 'ultra',
    label: 'Ultra HD',
    steps: 45,
    octree: 384,
    targetFace: 600000,
    reduceFace: false, // ZERO cloud decimation: keeps raw marching cubes geometry
    guidance: 8.5,
    numChunks: 500000,
    budget: 600000, // local error-bounded cap after refinement
    hint: 'high geometric density: 384³ octree, raw isosurface, local refine ≤600k (~1 min)',
  },
  master: {
    id: 'master',
    label: 'Studio Master',
    steps: 50,
    octree: 512, // maximum 512³ octree resolution
    targetFace: 1000000,
    reduceFace: false, // ZERO cloud decimation: stops facial & finger polygon crushing
    guidance: 9.0,
    numChunks: 1000000,
    budget: 750000, // local error-bounded cap after refinement
    hint: 'commercial-grade print fidelity: raw 512³ isosurface, deep facial contours, local refine ≤750k (2–3+ min)',
  },
};

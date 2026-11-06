/**
 * 3D Forge — Generation presets for high-resolution 3D printing.
 *
 * Designed for intricate statues and deity models (e.g. Shiva Nataraja,
 * Hanumanji):
 * - Draft: Fast low-step preview for pose validation.
 * - Production: Crisp statue detail with balanced decimation.
 * - Ultra HD: High-density 384³ octree with zero decimation.
 * - Studio Master: Extreme commercial-grade fidelity with un-decimated raw
 *   isosurface marching cubes, 448³ octree, deep facial contours & filigree.
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
    reduceFace: false, // ZERO DECIMATION: keeps raw marching cubes geometry
    guidance: 8.5,
    numChunks: 500000,
    hint: 'high geometric density: 384³ octree, zero decimation, fine jewelry (~1 min)',
  },
  master: {
    id: 'master',
    label: 'Studio Master',
    steps: 50,
    octree: 448, // maximum dense octree on ZeroGPU
    targetFace: 1000000,
    reduceFace: false, // ZERO DECIMATION: completely stops facial/finger polygon crushing
    guidance: 9.0,
    numChunks: 1000000,
    hint: 'commercial-grade print fidelity: un-decimated raw isosurface, 448³ octree, deep facial contours & filigree (2–3+ min)',
  },
};

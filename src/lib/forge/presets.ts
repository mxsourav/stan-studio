/**
 * 3D Forge — generation presets (approved refinement 2).
 * Draft saves ZeroGPU seconds for shape exploration; Production spends them
 * on crisp statue detail. Cloud-side decimation target differs accordingly.
 */
export interface ForgePreset {
  id: 'draft' | 'production' | 'ultra' | 'master';
  label: string;
  steps: number;
  octree: number;
  targetFace: number;
  reduceFace: boolean;
  guidance?: number;
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
    hint: 'fast preview on ZeroGPU — quick test',
  },
  production: {
    id: 'production',
    label: 'Production',
    steps: 35,
    octree: 256,
    targetFace: 250000,
    reduceFace: true,
    guidance: 7.0,
    hint: 'crisp statue detail & fine features (~45s)',
  },
  ultra: {
    id: 'ultra',
    label: 'Ultra HD',
    steps: 45,
    octree: 320,
    targetFace: 500000,
    reduceFace: false,
    guidance: 7.5,
    hint: 'high geometric fidelity & deep relief (~1 min)',
  },
  master: {
    id: 'master',
    label: 'Studio Master',
    steps: 50,
    octree: 384,
    targetFace: 800000,
    reduceFace: false,
    guidance: 8.5,
    hint: 'extreme micro-carving detail: un-decimated raw geometry, jewelry, filigree & facial contours (1–2+ min)',
  },
};

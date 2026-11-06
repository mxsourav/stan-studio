/**
 * 3D Forge — generation presets (approved refinement 2).
 * Draft saves ZeroGPU seconds for shape exploration; Production spends them
 * on crisp statue detail. Cloud-side decimation target differs accordingly.
 */
export interface ForgePreset {
  id: 'draft' | 'production' | 'ultra';
  label: string;
  steps: number;
  octree: number;
  targetFace: number;
  reduceFace: boolean;
  hint: string;
}

export const FORGE_PRESETS: Record<'draft' | 'production' | 'ultra', ForgePreset> = {
  draft: {
    id: 'draft',
    label: 'Draft',
    steps: 20,
    octree: 192,
    targetFace: 80000,
    reduceFace: true,
    hint: 'fast preview on ZeroGPU — quick test',
  },
  production: {
    id: 'production',
    label: 'Production',
    steps: 35,
    octree: 256,
    targetFace: 220000,
    reduceFace: true,
    hint: 'crisp statue detail & fine features',
  },
  ultra: {
    id: 'ultra',
    label: 'Ultra HD',
    steps: 45,
    octree: 320,
    targetFace: 350000,
    reduceFace: true,
    hint: 'maximum geometric fidelity & sculpted relief',
  },
};

/**
 * 3D Forge — generation presets (approved refinement 2).
 * Draft saves ZeroGPU seconds for shape exploration; Production spends them
 * on crisp statue detail. Cloud-side decimation target differs accordingly.
 */
export interface ForgePreset {
  id: 'draft' | 'production';
  label: string;
  steps: number;
  octree: number;
  targetFace: number;
  reduceFace: boolean;
  hint: string;
}

export const FORGE_PRESETS: Record<'draft' | 'production', ForgePreset> = {
  draft: {
    id: 'draft',
    label: 'Draft',
    steps: 20,
    octree: 192,
    targetFace: 80000,
    reduceFace: true,
    hint: 'fast + cheap on ZeroGPU — for picking the winner',
  },
  production: {
    id: 'production',
    label: 'Production',
    steps: 30,
    octree: 256,
    targetFace: 200000,
    reduceFace: true,
    hint: 'max detail — the run you actually print',
  },
};

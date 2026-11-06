/**
 * 3D Forge — Stage 3: image → 3D mesh via Hugging Face Spaces (@gradio/client,
 * browser-direct, ZeroGPU) with NVIDIA NIM backup.
 *
 * 3-Pass Iterative Architecture:
 * - PASS 1: Surface Normal & Micro-Depth Extraction (Cloud Call #1 on Stable-X/Hi3DGen
 *   or Depth-Anything-V2) with dedicated isolated ZeroGPU timer.
 * - PASS 2: Ultra-Dense Base Mesh Generation (Cloud Call #2 on microsoft/TRELLIS.2,
 *   tencent/Hunyuan3D-2.1 with 512³ octree and zero decimation, Stable-X/Hi3DGen,
 *   or VAST-AI/TripoSG).
 * - PASS 3: Iterative Detail Stamp & Normal-Depth Vertex Displacement in Three.js
 *   (see refineMesh.ts).
 */
import { Client, handle_file } from '@gradio/client';
import { glbBlobToStl } from './exportStl';
import type { ForgePreset } from './presets';

const NIM_PROXY = `${((import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '')) || ''}/api/forge/nim`;

export class QuotaError extends Error {
  constructor() {
    super('ZeroGPU daily quota exhausted for this account');
    this.name = 'QuotaError';
  }
}
export class SpaceUnavailableError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'SpaceUnavailableError';
  }
}

export type ForgeEngineId = 'auto' | 'trellis' | 'hi3dgen' | 'hunyuan' | 'triposg' | 'sparc';

export interface SpaceDef {
  id: string;
  subdomain: string;
  kind: 'hunyuan' | 'hi3dgen' | 'triposg' | 'trellis' | 'trellis2' | 'sparc';
  label: string;
  engine: ForgeEngineId;
}

export const SPACE_CHAIN: SpaceDef[] = [
  { id: 'tencent/Hunyuan3D-2.1', subdomain: 'tencent-hunyuan3d-2-1', kind: 'hunyuan', label: 'Hunyuan3D 2.1 (Full Octree)', engine: 'hunyuan' },
  { id: 'Stable-X/Hi3DGen', subdomain: 'stable-x-hi3dgen', kind: 'hi3dgen', label: 'Hi3DGen (Normal-Bridged Relief)', engine: 'hi3dgen' },
  { id: 'microsoft/TRELLIS.2', subdomain: 'microsoft-trellis-2', kind: 'trellis2', label: 'TRELLIS.2 (1024³ Dense O-Voxels)', engine: 'trellis' },
  { id: 'tencent/Hunyuan3D-2', subdomain: 'tencent-hunyuan3d-2', kind: 'hunyuan', label: 'Hunyuan3D 2.0 (Full Octree)', engine: 'hunyuan' },
  { id: 'VAST-AI/TripoSG', subdomain: 'vast-ai-triposg', kind: 'triposg', label: 'TripoSG (Dense Transformer SDF)', engine: 'triposg' },
  { id: 'trellis-community/TRELLIS', subdomain: 'trellis-community-trellis', kind: 'trellis', label: 'TRELLIS (Sparse Latent)', engine: 'trellis' },
  { id: 'ilcve21/Sparc3D', subdomain: 'ilcve21-sparc3d', kind: 'sparc', label: 'Sparc3D (1536P Sparse)', engine: 'sparc' },
];

export interface ForgeEvent {
  stage: 'probe' | 'shape' | 'export' | 'local-export' | 'space-failed' | 'done';
  space?: string;
  detail?: string;
  queue?: number | null;
  eta?: number | null;
}

export interface ForgeMeshResult {
  stlBlob: Blob;
  meshBlob: Blob; // cached raw mesh (glb/stl)
  triangles: number;
  source: 'cloud' | 'local' | 'nim';
  space: string;
}

interface ParamSpec {
  name: string;
  def: unknown;
}

interface SpaceSchema {
  endpoints: Record<string, ParamSpec[]>;
}

const probeCache = new Map<string, { schema: SpaceSchema | null; at: number }>();
const clients = new Map<string, Client>();
const PROBE_TTL = 5 * 60 * 1000;
const NULL_TTL = 15 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchSchemaJson(sub: string): Promise<unknown | null> {
  for (const path of ['/gradio_api/info', '/info']) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`https://${sub}.hf.space${path}`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const text = await res.text();
          if (text.startsWith('{')) return JSON.parse(text) as unknown;
          // If HTML page returned, this path is not JSON, try next path immediately
          break;
        }
        if (res.status === 404) break;
      } catch {
        /* cold or waking — retry */
      }
      await sleep(800 * (attempt + 1));
    }
  }
  return null;
}

/** Runtime schema probe — survives gradio-version drift across spaces. */
export async function probeSchema(sub: string): Promise<SpaceSchema | null> {
  const cached = probeCache.get(sub);
  const ttl = cached?.schema ? PROBE_TTL : NULL_TTL;
  if (cached && Date.now() - cached.at < ttl) return cached.schema;
  const raw = await fetchSchemaJson(sub);
  let schema: SpaceSchema | null = null;
  if (raw && typeof raw === 'object') {
    const named = (raw as Record<string, unknown>)['named_endpoints'] as Record<string, Record<string, unknown>> | undefined;
    if (named) {
      const endpoints: Record<string, ParamSpec[]> = {};
      for (const [name, def] of Object.entries(named)) {
        const params = (def['parameters'] as Array<Record<string, unknown>> | undefined) ?? [];
        endpoints[name] = params.map((p) => ({
          name: (p['parameter_name'] as string) ?? (p['name'] as string),
          def: p['parameter_default'] !== undefined ? p['parameter_default'] : (p['default'] as unknown),
        }));
      }
      schema = { endpoints };
    }
  }
  probeCache.set(sub, { schema, at: Date.now() });
  return schema;
}

async function getClient(space: SpaceDef, hfToken: string): Promise<Client> {
  const existing = clients.get(space.id);
  if (existing) return existing;
  const options = hfToken ? { token: hfToken as `hf_${string}` } : undefined;
  const client = await Client.connect(space.id, options);
  clients.set(space.id, client);
  return client;
}

/** Strict payload builder: overrides win, schema defaults fill gaps, undeclared keys dropped. */
function buildPayload(params: ParamSpec[] | undefined, overrides: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of params ?? []) {
    if (p.name in overrides) out[p.name] = overrides[p.name];
    else if (p.def !== undefined) out[p.name] = p.def;
  }
  return out;
}

function classify(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (/quota|gpu.?exceeded|gpu.?limit/i.test(msg)) return new QuotaError();
  return err instanceof Error ? err : new Error(msg);
}

async function runJob(
  client: Client,
  endpoint: string,
  payload: Record<string, unknown>,
  onEvent: (e: ForgeEvent) => void,
  space: string,
  signal?: AbortSignal,
): Promise<unknown[]> {
  const job = client.submit(endpoint, payload);
  let final: unknown[] | null = null;
  for await (const msg of job as AsyncIterable<Record<string, unknown>>) {
    if (signal?.aborted) throw new Error('aborted');
    const type = msg['type'];
    if (type === 'status') {
      const stage = msg['stage'] as string;
      if (stage === 'error') {
        const message = String(msg['message'] ?? 'space error');
        throw classify(new Error(message));
      }
      onEvent({
        stage: 'shape',
        space,
        queue: typeof msg['position'] === 'number' ? (msg['position'] as number) : null,
        eta: typeof msg['eta'] === 'number' ? Math.round(msg['eta'] as number) : null,
      });
    } else if (type === 'data') {
      final = (msg['data'] as unknown[]) ?? [];
    }
  }
  if (!final) {
    const directData = (job as unknown as { data?: unknown[] })?.data;
    if (Array.isArray(directData) && directData.length > 0) {
      final = directData;
    }
  }
  if (!final) throw classify(new Error('space returned no data'));
  return final;
}

function findFileData(data: unknown[]): { url: string; path: string; raw: unknown } | null {
  const queue: unknown[] = [...data];
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item || typeof item !== 'object') continue;

    const record = item as Record<string, unknown>;
    const url = typeof record['url'] === 'string' ? record['url'] : '';
    const path = typeof record['path'] === 'string' ? record['path'] : '';

    if (path || url) {
      return { url, path, raw: record };
    }

    if (record['value'] && typeof record['value'] === 'object') {
      queue.push(record['value']);
    }

    for (const v of Object.values(record)) {
      if (v && typeof v === 'object' && v !== record['value']) {
        queue.push(v);
      }
    }
  }
  return null;
}

async function downloadFile(file: { url: string; path: string }, subdomain: string, signal?: AbortSignal): Promise<Blob> {
  let url = file.url;
  if (!url || url.startsWith('/')) {
    const p = file.url ? file.url : `/gradio_api/file=${file.path}`;
    url = `https://${subdomain}.hf.space${p.startsWith('/') ? '' : '/'}${p}`;
  }
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`mesh download failed (${res.status})`);
  return await res.blob();
}

/**
 * PASS 1: Surface Normal & Micro-Depth Extraction (Cloud Call #1).
 * Runs as its own separate Gradio call with an isolated ZeroGPU budget.
 */
export async function extractSurfaceNormals(
  imageBlob: Blob,
  hfToken: string,
  onEvent: (e: ForgeEvent) => void,
  signal?: AbortSignal,
): Promise<{ normalBlob: Blob | null; space: string }> {
  // Candidate 1: Stable-X/Hi3DGen (/preprocess_image)
  try {
    const spaceDef: SpaceDef = {
      id: 'Stable-X/Hi3DGen',
      subdomain: 'stable-x-hi3dgen',
      kind: 'hi3dgen',
      label: 'Hi3DGen NiRNE Normal Bridge',
      engine: 'hi3dgen',
    };
    onEvent({ stage: 'probe', space: spaceDef.id, detail: 'Pass 1: connecting to normal extractor…' });
    const client = await getClient(spaceDef, hfToken);
    const schema = await probeSchema(spaceDef.subdomain);
    if (schema?.endpoints['/preprocess_image']) {
      onEvent({ stage: 'shape', space: spaceDef.id, detail: 'Pass 1: extracting 2.5D surface normal map…' });
      const prepData = await runJob(client, '/preprocess_image', { image: handle_file(imageBlob) }, onEvent, spaceDef.id, signal);
      const prepFile = findFileData(prepData);
      if (prepFile) {
        const normalBlob = await downloadFile(prepFile, spaceDef.subdomain, signal);
        onEvent({ stage: 'done', space: spaceDef.id, detail: 'Pass 1: 2.5D normal map generated' });
        return { normalBlob, space: spaceDef.id };
      }
    }
  } catch {
    onEvent({ stage: 'space-failed', space: 'Stable-X/Hi3DGen', detail: 'Normal pass fallback' });
  }

  // Candidate 2: depth-anything/Depth-Anything-V2 (/on_submit)
  try {
    const depthDef: SpaceDef = {
      id: 'depth-anything/Depth-Anything-V2',
      subdomain: 'depth-anything-depth-anything-v2',
      kind: 'hi3dgen',
      label: 'Depth-Anything-V2 Metric Depth',
      engine: 'auto',
    };
    onEvent({ stage: 'probe', space: depthDef.id, detail: 'Pass 1: probing Depth-Anything-V2…' });
    const client = await getClient(depthDef, hfToken);
    const schema = await probeSchema(depthDef.subdomain);
    if (schema?.endpoints['/on_submit']) {
      onEvent({ stage: 'shape', space: depthDef.id, detail: 'Pass 1: extracting micro-depth field…' });
      const depthData = await runJob(client, '/on_submit', { image: handle_file(imageBlob) }, onEvent, depthDef.id, signal);
      const depthFile = findFileData(depthData);
      if (depthFile) {
        const normalBlob = await downloadFile(depthFile, depthDef.subdomain, signal);
        onEvent({ stage: 'done', space: depthDef.id, detail: 'Pass 1: micro-depth field generated' });
        return { normalBlob, space: depthDef.id };
      }
    }
  } catch {
    /* fallback to local relief */
  }

  return { normalBlob: null, space: 'local-relief' };
}

export interface ForgeRunInput {
  imageBlob: Blob;
  caption: string;
  hfToken: string;
  nimToken: string;
  preset: ForgePreset;
  engine?: ForgeEngineId;
  onEvent: (e: ForgeEvent) => void;
  signal?: AbortSignal;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('image read failed'));
    r.readAsDataURL(blob);
  });
}

/** NIM quota backup via NVIDIA's hosted TRELLIS. */
async function runNimTrellis(input: ForgeRunInput): Promise<ForgeMeshResult> {
  const { imageBlob, nimToken, preset, onEvent, signal } = input;
  if (!nimToken) throw new SpaceUnavailableError('no NVIDIA key set');
  onEvent({ stage: 'probe', space: 'NVIDIA TRELLIS (NIM)' });
  const dataUrl = await blobToDataUrl(imageBlob);
  onEvent({ stage: 'shape', space: 'NVIDIA TRELLIS (NIM)' });
  const steps =
    preset.id === 'master' || preset.id === 'ultra'
      ? { ss: 35, slat: 35 }
      : preset.id === 'production'
        ? { ss: 25, slat: 25 }
        : { ss: 12, slat: 16 };
  const res = await fetch(NIM_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      apiKey: nimToken,
      path: 'genai/microsoft/trellis',
      image: dataUrl,
      ss_cfg_scale: 7.5,
      slat_cfg_scale: 3,
      ss_sampling_steps: steps.ss,
      slat_sampling_steps: steps.slat,
      seed: Math.floor(Math.random() * 1_000_000),
      no_texture: true,
      output_format: 'stl',
    }),
  });
  const buf = await res.arrayBuffer();
  let parsed: { artifacts?: Array<{ base64?: string; finishReason?: string; seed?: number }>; detail?: string; error?: string } | null = null;
  try {
    parsed = JSON.parse(new TextDecoder().decode(buf));
  } catch {
    /* binary body */
  }
  const artifact = parsed?.artifacts?.[0];
  if (!res.ok || !artifact?.base64) {
    let detail = parsed?.detail || parsed?.error || `NIM ${res.status}`;
    if (/example_id|preview/i.test(detail)) {
      detail += ' — NVIDIA trial tier accepts only its example images; a production NIM key is required for your own photos.';
    }
    if (/credit|quota|exceed/i.test(detail)) throw new QuotaError();
    throw new SpaceUnavailableError(detail);
  }
  if (artifact.finishReason && artifact.finishReason !== 'SUCCESS') {
    throw new SpaceUnavailableError(`NVIDIA finishReason: ${artifact.finishReason}`);
  }
  const b64 = artifact.base64.replace(/^data:[^;]+;base64,/, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const isStl = !(bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46);
  let triangles = preset.targetFace;
  if (isStl && bytes.length >= 84) {
    triangles = new DataView(bytes.buffer).getUint32(80, true);
  }
  const kind = isStl ? 'model/stl' : 'model/gltf-binary';
  const meshBlob = new Blob([bytes], { type: kind });
  onEvent({ stage: 'export', space: 'NVIDIA TRELLIS (NIM)' });
  let stlBlob = meshBlob;
  let tri = triangles;
  if (!isStl) {
    const local = await glbBlobToStl(meshBlob, signal);
    stlBlob = local.stl;
    tri = local.triangles;
  }
  onEvent({ stage: 'done', space: 'NVIDIA TRELLIS (NIM)' });
  return { stlBlob, meshBlob, triangles: tri, source: 'nim', space: 'NVIDIA TRELLIS (NIM)' };
}

/**
 * PASS 2: Ultra-Dense Base Mesh Generation (Cloud Call #2).
 * Runs with an independent ZeroGPU timeout budget.
 */
export async function forgeMesh(input: ForgeRunInput): Promise<ForgeMeshResult> {
  const { imageBlob, caption, hfToken, preset, engine = 'auto', onEvent, signal } = input;

  const targetChain =
    engine === 'auto'
      ? SPACE_CHAIN
      : [
          ...SPACE_CHAIN.filter((s) => s.engine === engine),
          ...SPACE_CHAIN.filter((s) => s.engine !== engine),
        ];

  let lastErr: Error = new Error('no space available');

  for (const space of targetChain) {
    try {
      onEvent({ stage: 'probe', space: space.id });
      const client = await getClient(space, hfToken);
      const schema = await probeSchema(space.subdomain);

      // ── TRELLIS.2 (1024³ Dense O-Voxels) ──
      if (space.kind === 'trellis2') {
        const required = ['/image_to_3d'];
        const missing = schema ? required.filter((e) => !schema.endpoints[e]) : required;
        if (!schema || missing.length > 0) {
          throw new SpaceUnavailableError(`endpoints missing: ${missing.join(', ') || 'schema unreachable'}`);
        }

        let inputImage = handle_file(imageBlob);
        if (schema.endpoints['/preprocess_image']) {
          onEvent({ stage: 'shape', space: space.id, detail: 'Preprocessing reference image & silhouette…' });
          try {
            const prepData = await runJob(client, '/preprocess_image', { input: inputImage }, onEvent, space.id, signal);
            const prepFile = findFileData(prepData);
            if (prepFile) inputImage = (prepFile.raw as unknown as typeof inputImage) ?? inputImage;
          } catch {
            /* proceed with inputImage */
          }
        }

        onEvent({ stage: 'shape', space: space.id, detail: `TRELLIS.2 (1024³ O-Voxels · ${preset.steps} steps)` });
        const trellisParams = schema.endpoints['/image_to_3d'];
        const trellisOverrides = {
          image: inputImage,
          seed: Math.floor(Math.random() * 1000000),
          resolution: '1024',
          ss_guidance_strength: 7.5,
          ss_guidance_rescale: 0.7,
          ss_sampling_steps: preset.steps >= 40 ? 25 : 12,
          ss_rescale_t: 5,
          shape_slat_guidance_strength: 7.5,
          shape_slat_guidance_rescale: 0.5,
          shape_slat_sampling_steps: preset.steps >= 40 ? 25 : 12,
          shape_slat_rescale_t: 3,
          tex_slat_guidance_strength: 1,
          tex_slat_guidance_rescale: 0,
          tex_slat_sampling_steps: 12,
          tex_slat_rescale_t: 3,
        };
        const shapeData = await runJob(client, '/image_to_3d', buildPayload(trellisParams, trellisOverrides), onEvent, space.id, signal);

        let meshBlob: Blob;
        if (schema.endpoints['/extract_glb']) {
          onEvent({ stage: 'export', space: space.id, detail: `Extracting GLB mesh (${preset.reduceFace ? '300k' : '600k'} decimation target)` });
          const extractParams = schema.endpoints['/extract_glb'];
          const extractOverrides = {
            decimation_target: preset.reduceFace ? 300000 : 600000,
            texture_size: 2048,
          };
          const extractData = await runJob(client, '/extract_glb', buildPayload(extractParams, extractOverrides), onEvent, space.id, signal);
          const meshFile = findFileData(extractData) || findFileData(shapeData);
          if (!meshFile) throw new SpaceUnavailableError('no mesh file in TRELLIS.2 output');
          meshBlob = await downloadFile(meshFile, space.subdomain, signal);
        } else {
          const meshFile = findFileData(shapeData);
          if (!meshFile) throw new SpaceUnavailableError('no mesh file in TRELLIS.2 output');
          meshBlob = await downloadFile(meshFile, space.subdomain, signal);
        }

        onEvent({ stage: 'local-export', space: space.id, detail: 'Converting watertight binary STL' });
        const local = await glbBlobToStl(meshBlob, signal);
        onEvent({ stage: 'done', space: space.id });
        return { stlBlob: local.stl, meshBlob, triangles: local.triangles, source: 'local', space: space.id };
      }

      // ── Hunyuan3D-2 / 2.1 (Full Octree Marching Cubes) ──
      if (space.kind === 'hunyuan') {
        const required = ['/shape_generation', '/on_export_click'];
        const missing = schema ? required.filter((e) => !schema.endpoints[e]) : required;
        if (!schema || missing.length > 0) {
          throw new SpaceUnavailableError(`endpoints missing: ${missing.join(', ') || 'schema unreachable'}`);
        }

        if (schema.endpoints['/on_gen_mode_change']) {
          try {
            await runJob(client, '/on_gen_mode_change', { value: 'Standard' }, onEvent, space.id, signal);
          } catch {
            /* mode change optional */
          }
        }
        if (schema.endpoints['/on_decode_mode_change']) {
          try {
            await runJob(client, '/on_decode_mode_change', { value: 'Standard' }, onEvent, space.id, signal);
          } catch {
            /* mode change optional */
          }
        }

        onEvent({ stage: 'shape', space: space.id, queue: null, eta: null, detail: `Octree ${preset.octree}³ · ${preset.steps} steps` });
        const shapeParams = schema.endpoints['/shape_generation'];
        let shapeData: unknown[];
        try {
          const shapeOverrides = {
            image: handle_file(imageBlob),
            caption,
            steps: preset.steps,
            octree_resolution: preset.octree,
            check_box_rembg: true,
            randomize_seed: true,
            guidance_scale: preset.guidance ?? 8.5,
            num_chunks: preset.numChunks ?? 500000,
          };
          shapeData = await runJob(client, '/shape_generation', buildPayload(shapeParams, shapeOverrides), onEvent, space.id, signal);
        } catch (shapeErr) {
          // If 512³ octree OOMs/times out, immediately retry at 384³ fallback
          if (preset.octree > 384) {
            onEvent({ stage: 'shape', space: space.id, detail: 'Octree 512³ fallback → retrying at 384³' });
            const shapeOverrides = {
              image: handle_file(imageBlob),
              caption,
              steps: preset.steps,
              octree_resolution: 384,
              check_box_rembg: true,
              randomize_seed: true,
              guidance_scale: preset.guidance ?? 8.5,
              num_chunks: 500000,
            };
            shapeData = await runJob(client, '/shape_generation', buildPayload(shapeParams, shapeOverrides), onEvent, space.id, signal);
          } else {
            throw shapeErr;
          }
        }

        const meshFile = findFileData(shapeData);
        if (!meshFile) throw new SpaceUnavailableError('no mesh file in shape output');
        const meshBlob = await downloadFile(meshFile, space.subdomain, signal);
        onEvent({ stage: 'export', space: space.id, detail: preset.reduceFace ? 'Decimating…' : 'Zero decimation: un-decimated isosurface export' });

        try {
          const exportParams = schema.endpoints['/on_export_click'];
          const exportOverrides = {
            file_out: meshFile.raw,
            file_out2: null,
            file_type: 'stl' as const,
            reduce_face: preset.reduceFace,
            export_texture: false,
            target_face_num: preset.targetFace,
          };
          const exportData = await runJob(client, '/on_export_click', buildPayload(exportParams, exportOverrides), onEvent, space.id, signal);
          const stlFile = findFileData(exportData);
          if (!stlFile) throw new SpaceUnavailableError('no STL file in export output');
          const stlBlob = await downloadFile(stlFile, space.subdomain, signal);
          const head = new Uint8Array(await stlBlob.slice(0, 84).arrayBuffer());
          const tris = head.length >= 84 ? new DataView(head.buffer).getUint32(80, true) : preset.targetFace;
          onEvent({ stage: 'done', space: space.id });
          return { stlBlob, meshBlob, triangles: tris, source: 'cloud', space: space.id };
        } catch (exportErr) {
          if (signal?.aborted) throw exportErr;
          if (exportErr instanceof QuotaError) throw exportErr;
          onEvent({ stage: 'local-export', space: space.id, detail: exportErr instanceof Error ? exportErr.message : String(exportErr) });
          const local = await glbBlobToStl(meshBlob, signal);
          onEvent({ stage: 'done', space: space.id });
          return { stlBlob: local.stl, meshBlob, triangles: local.triangles, source: 'local', space: space.id };
        }
      }

      // ── Hi3DGen (Normal-Bridged Facial & Relief Specialist) ──
      if (space.kind === 'hi3dgen') {
        const required = ['/generate_3d'];
        const missing = schema ? required.filter((e) => !schema.endpoints[e]) : required;
        if (!schema || missing.length > 0) {
          throw new SpaceUnavailableError(`endpoints missing: ${missing.join(', ') || 'schema unreachable'}`);
        }

        let prepImage = handle_file(imageBlob);
        if (schema.endpoints['/preprocess_image']) {
          onEvent({ stage: 'shape', space: space.id, detail: 'Pass 1: Normal bridging & surface segmentation' });
          try {
            const prepData = await runJob(client, '/preprocess_image', { image: prepImage }, onEvent, space.id, signal);
            const prepFile = findFileData(prepData);
            if (prepFile) prepImage = prepFile.raw as unknown as typeof prepImage;
          } catch {
            /* proceed with original image if preprocess fails */
          }
        }

        onEvent({ stage: 'shape', space: space.id, detail: `Pass 2: Normal-bridged 3D synthesis (${preset.steps} steps)` });
        const genParams = schema.endpoints['/generate_3d'];
        const genOverrides = {
          image: prepImage,
          seed: Math.floor(Math.random() * 1000000),
          ss_guidance_strength: preset.guidance ? Math.min(preset.guidance / 2, 4.0) : 3.0,
          ss_sampling_steps: preset.steps,
          slat_guidance_strength: 3.0,
          slat_sampling_steps: preset.id === 'master' || preset.id === 'ultra' ? 12 : 6,
        };
        const genData = await runJob(client, '/generate_3d', buildPayload(genParams, genOverrides), onEvent, space.id, signal);
        const meshFile = findFileData(genData);
        if (!meshFile) throw new SpaceUnavailableError('no 3D mesh in Hi3DGen output');
        const meshBlob = await downloadFile(meshFile, space.subdomain, signal);

        onEvent({ stage: 'local-export', space: space.id, detail: 'Converting watertight binary STL' });
        const local = await glbBlobToStl(meshBlob, signal);
        onEvent({ stage: 'done', space: space.id });
        return { stlBlob: local.stl, meshBlob, triangles: local.triangles, source: 'local', space: space.id };
      }

      // ── TripoSG (Rectified Flow SDF Mesh Generator) ──
      if (space.kind === 'triposg') {
        const required = ['/image_to_3d'];
        const missing = schema ? required.filter((e) => !schema.endpoints[e]) : required;
        if (!schema || missing.length > 0) {
          throw new SpaceUnavailableError(`endpoints missing: ${missing.join(', ') || 'schema unreachable'}`);
        }

        let inputImage = handle_file(imageBlob);
        if (schema.endpoints['/run_segmentation']) {
          onEvent({ stage: 'shape', space: space.id, detail: 'TripoSG: Segmenting foreground object…' });
          try {
            const segData = await runJob(client, '/run_segmentation', { image: inputImage }, onEvent, space.id, signal);
            const segFile = findFileData(segData);
            if (segFile) inputImage = segFile.raw as unknown as typeof inputImage;
          } catch {
            /* proceed with inputImage */
          }
        }

        onEvent({ stage: 'shape', space: space.id, detail: `Rectified flow SDF synthesis (${preset.steps} steps)` });
        const tripoParams = schema.endpoints['/image_to_3d'];
        const tripoOverrides = {
          image: inputImage,
          seed: Math.floor(Math.random() * 1000000),
          num_inference_steps: preset.steps,
          guidance_scale: preset.guidance ?? 7.5,
          simplify: preset.reduceFace,
          target_face_num: preset.targetFace,
        };
        const tripoData = await runJob(client, '/image_to_3d', buildPayload(tripoParams, tripoOverrides), onEvent, space.id, signal);
        const meshFile = findFileData(tripoData);
        if (!meshFile) throw new SpaceUnavailableError('no mesh file in TripoSG output');
        const meshBlob = await downloadFile(meshFile, space.subdomain, signal);

        onEvent({ stage: 'local-export', space: space.id, detail: 'Converting watertight binary STL' });
        const local = await glbBlobToStl(meshBlob, signal);
        onEvent({ stage: 'done', space: space.id });
        return { stlBlob: local.stl, meshBlob, triangles: local.triangles, source: 'local', space: space.id };
      }

      // ── Legacy Trellis Community Fallback ──
      if (space.kind === 'trellis') {
        if (schema && schema.endpoints['/generate_and_extract_glb']) {
          onEvent({ stage: 'shape', space: space.id, detail: `TRELLIS structured latent (${preset.steps} steps)` });
          const trellisParams = schema.endpoints['/generate_and_extract_glb'];
          const trellisOverrides = {
            image: handle_file(imageBlob),
            multiimages: [],
            seed: Math.floor(Math.random() * 1000000),
            ss_guidance_strength: 7.5,
            ss_sampling_steps: preset.steps >= 40 ? 25 : 12,
            slat_guidance_strength: 3.0,
            slat_sampling_steps: preset.steps >= 40 ? 25 : 12,
            mesh_simplify: preset.reduceFace ? 0.95 : 0.99,
            texture_size: 1024,
          };
          const trellisData = await runJob(client, '/generate_and_extract_glb', buildPayload(trellisParams, trellisOverrides), onEvent, space.id, signal);
          const meshFile = findFileData(trellisData);
          if (!meshFile) throw new SpaceUnavailableError('no mesh file in TRELLIS output');
          const meshBlob = await downloadFile(meshFile, space.subdomain, signal);
          const local = await glbBlobToStl(meshBlob, signal);
          onEvent({ stage: 'done', space: space.id });
          return { stlBlob: local.stl, meshBlob, triangles: local.triangles, source: 'local', space: space.id };
        }

        if (schema && schema.endpoints['/image_to_3d']) {
          onEvent({ stage: 'shape', space: space.id, detail: `TRELLIS shape generation` });
          const shapeParams = schema.endpoints['/image_to_3d'];
          const shapeOverrides = {
            image: handle_file(imageBlob),
            seed: 0,
            ss_sampling_steps: preset.steps >= 40 ? 25 : 12,
            slat_sampling_steps: preset.steps >= 40 ? 25 : 12,
            ss_guidance_scale: 7.5,
            slat_guidance_scale: 3.0,
          };
          const shapeData = await runJob(client, '/image_to_3d', buildPayload(shapeParams, shapeOverrides), onEvent, space.id, signal);
          const meshFile = findFileData(shapeData);
          if (!meshFile) throw new SpaceUnavailableError('no mesh file in TRELLIS output');
          const meshBlob = await downloadFile(meshFile, space.subdomain, signal);
          const local = await glbBlobToStl(meshBlob, signal);
          onEvent({ stage: 'done', space: space.id });
          return { stlBlob: local.stl, meshBlob, triangles: local.triangles, source: 'local', space: space.id };
        }

        throw new SpaceUnavailableError('TRELLIS endpoints missing in schema');
      }

      // ── Sparc3D Fallback ──
      if (space.kind === 'sparc') {
        throw new SpaceUnavailableError('Sparc3D running on CPU-basic; please use TRELLIS.2 or Hunyuan3D 2.1');
      }
    } catch (err) {
      const typed = classify(err);
      if (signal?.aborted) throw err;
      if (typed instanceof QuotaError) {
        try {
          const nim = await runNimTrellis({ ...input, onEvent });
          onEvent({ stage: 'done', space: 'NVIDIA TRELLIS (NIM)' });
          return nim;
        } catch (nimErr) {
          throw nimErr instanceof QuotaError || nimErr instanceof SpaceUnavailableError ? nimErr : classify(nimErr);
        }
      }
      lastErr = typed;
      onEvent({ stage: 'space-failed', space: space.id, detail: typed.message });
    }
  }

  // Backup on NVIDIA NIM pool
  if (input.nimToken) {
    try {
      return await runNimTrellis({ ...input, onEvent });
    } catch (nimErr) {
      throw classify(nimErr);
    }
  }

  throw lastErr;
}

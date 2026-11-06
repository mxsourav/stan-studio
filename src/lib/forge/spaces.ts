/**
 * 3D Forge — Stage 3: image → 3D mesh via Hugging Face Spaces (@gradio/client,
 * browser-direct, ZeroGPU). Verified live 2026-11-06:
 *   tencent/Hunyuan3D-2  → /shape_generation (shape-only, built-in rembg)
 *                        → /on_export_click (stl/obj/glb + target_face_num decimation)
 * Fallbacks: tencent/Hunyuan3D-2.1, JeffreyXiang/TRELLIS, trellis-community/TRELLIS.
 * (StabilityAI/TripoSR = Runtime error, dropped.)
 *
 * Approved refinements baked in: the generated mesh Blob is CACHED the moment
 * /shape_generation returns — if the cloud export fails/times out, the local
 * Three.js exporter converts the cached mesh so spent ZeroGPU quota is never
 * lost. ZeroGPU quota is account-global, so a quota error aborts the chain
 * (switching spaces cannot help; multi-account rotation is an HF ToS
 * violation and is deliberately NOT implemented).
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

export interface SpaceDef {
  id: string;
  subdomain: string;
  kind: 'hunyuan' | 'trellis';
}

export const SPACE_CHAIN: SpaceDef[] = [
  { id: 'tencent/Hunyuan3D-2', subdomain: 'tencent-hunyuan3d-2', kind: 'hunyuan' },
  { id: 'tencent/Hunyuan3D-2.1', subdomain: 'tencent-hunyuan3d-2-1', kind: 'hunyuan' },
  { id: 'JeffreyXiang/TRELLIS', subdomain: 'jeffreyxiang-trellis', kind: 'trellis' },
  { id: 'trellis-community/TRELLIS', subdomain: 'trellis-community-trellis', kind: 'trellis' },
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
  meshBlob: Blob; // cached raw mesh (glb/stl) — refinement 1
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
const NULL_TTL = 15 * 1000; // failed probes retry soon — spaces wake lazily

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchSchemaJson(sub: string): Promise<unknown | null> {
  // ZeroGPU spaces sleep aggressively: HF's space host answers 404/503 WITHOUT
  // CORS headers while waking, which a browser fetch sees as a network error.
  // Retry both paths — the first hit usually wakes the space for the rest.
  for (const path of ['/gradio_api/info', '/info']) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`https://${sub}.hf.space${path}`);
        if (res.ok) return (await res.json()) as unknown;
      } catch {
        /* sleeping or cold — retry */
      }
      await sleep(4000 * (attempt + 1));
    }
  }
  return null;
}

/** Runtime schema probe — survives gradio-version drift across spaces.
 *  Null results are cached only briefly (spaces wake lazily). */
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
  // `token` (hf_token is the deprecated alias)
  const options = hfToken ? { token: hfToken as `hf_${string}` } : undefined;
  const client = await Client.connect(space.id, options);
  clients.set(space.id, client);
  return client;
}

/** Named-params payload: explicit overrides win, schema defaults fill gaps.
 *  STRICT — overrides for params the schema doesn't declare are DROPPED
 *  (Hunyuan3D-2.1 rejects unknown kwargs like `caption`). */
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
  if (!final) throw classify(new Error('space returned no data'));
  return final;
}

function findFileData(data: unknown[]): { url: string; path: string; raw: unknown } | null {
  for (const item of data) {
    // gradio File components return update wrappers: { value: FileData, __type__: 'update' }
    const d = (item as Record<string, unknown>)?.['value'] as Record<string, unknown> | undefined;
    const top = item as Record<string, unknown> | null;
    const file = (d && (typeof d['url'] === 'string' || typeof d['path'] === 'string')) ? d
      : (top && (typeof top['url'] === 'string' || typeof top['path'] === 'string')) ? top
      : null;
    if (file) {
      return {
        url: (file['url'] as string) ?? '',
        path: (file['path'] as string) ?? '',
        raw: d ?? top, // the plain FileData dict — what downstream endpoints expect
      };
    }
  }
  return null;
}

async function downloadFile(file: { url: string; path: string }, signal?: AbortSignal): Promise<Blob> {
  const url = file.url || `https://tencent-hunyuan3d-2.hf.space/gradio_api/file=${file.path}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`mesh download failed (${res.status})`);
  return await res.blob();
}

export interface ForgeRunInput {
  imageBlob: Blob;
  caption: string;
  hfToken: string;
  nimToken: string; // NVIDIA API key — quota backup via NIM-hosted TRELLIS
  preset: ForgePreset;
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

/**
 * NIM quota backup: NVIDIA's hosted TRELLIS
 * (ai.api.nvidia.com/v1/genai/microsoft/trellis) on the NVIDIA credit pool —
 * a completely separate quota from Hugging Face. Documented contract:
 * payload {image | prompt, ss/slat cfg + steps, seed, no_texture, output_format}
 * → JSON {artifacts: [{base64 (glb|stl bytes), finishReason, seed}]}.
 * NOTE: the TRIAL tier only accepts NVIDIA's 4 example images
 * (image: "data:image/png;example_id,0-3") — your own images need the
 * production tier. The error is surfaced verbatim in that case.
 */
async function runNimTrellis(input: ForgeRunInput): Promise<ForgeMeshResult> {
  const { imageBlob, nimToken, preset, onEvent, signal } = input;
  if (!nimToken) throw new SpaceUnavailableError('no NVIDIA key set');
  onEvent({ stage: 'probe', space: 'NVIDIA TRELLIS (NIM)' });
  const dataUrl = await blobToDataUrl(imageBlob);
  onEvent({ stage: 'shape', space: 'NVIDIA TRELLIS (NIM)' });
  const steps = preset.id === 'production' ? { ss: 25, slat: 25 } : { ss: 12, slat: 16 };
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
      no_texture: true, // shape only — the studio hand-paints
      output_format: 'stl', // direct STL from NVIDIA
    }),
  });
  const buf = await res.arrayBuffer();
  let parsed: { artifacts?: Array<{ base64?: string; finishReason?: string; seed?: number }>; detail?: string; title?: string; error?: string; message?: string } | null = null;
  try {
    parsed = JSON.parse(new TextDecoder().decode(buf));
  } catch {
    /* binary body — not expected from this endpoint */
  }
  const artifact = parsed?.artifacts?.[0];
  if (!res.ok || !artifact?.base64) {
    let detail = parsed?.detail || parsed?.error || parsed?.title || parsed?.message || `NIM ${res.status}`;
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
  // output_format 'stl' → bytes are a binary STL; read the real tri count
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

/** Full chain: probe → shape (cache mesh) → export (cloud STL, local fallback). */
export async function forgeMesh(input: ForgeRunInput): Promise<ForgeMeshResult> {
  const { imageBlob, caption, hfToken, preset, onEvent, signal } = input;
  let lastErr: Error = new Error('no space available');
  for (const space of SPACE_CHAIN) {
    try {
      onEvent({ stage: 'probe', space: space.id });
      // connect FIRST — Client.connect handles space wake with its own retry
      // loop (probe fetches alone give up on a sleeping space)
      const client = await getClient(space, hfToken);
      const schema = await probeSchema(space.subdomain);
      const required = space.kind === 'hunyuan' ? ['/shape_generation', '/on_export_click'] : ['/image_to_3d', '/extract_glb'];
      const missing = schema ? required.filter((e) => !schema.endpoints[e]) : required;
      if (!schema || missing.length > 0) {
        throw new SpaceUnavailableError(`endpoints missing: ${missing.join(', ') || 'schema unreachable'}`);
      }

      onEvent({ stage: 'shape', space: space.id, queue: null, eta: null });
      const shapeParams = schema.endpoints[space.kind === 'hunyuan' ? '/shape_generation' : '/image_to_3d'];
      const shapeOverrides =
        space.kind === 'hunyuan'
          ? {
              image: handle_file(imageBlob),
              caption,
              steps: preset.steps,
              octree_resolution: preset.octree,
              check_box_rembg: true,
              randomize_seed: true,
              guidance_scale: 5.0,
              num_chunks: 200000,
            }
          : { image: handle_file(imageBlob), seed: 0 };
      const shapeData = await runJob(client, space.kind === 'hunyuan' ? '/shape_generation' : '/image_to_3d', buildPayload(shapeParams, shapeOverrides), onEvent, space.id, signal);

      // REFINEMENT 1 — cache the mesh blob IMMEDIATELY (quota never wasted)
      const meshFile = findFileData(shapeData);
      if (!meshFile) throw new SpaceUnavailableError('no mesh file in shape output');
      const meshBlob = await downloadFile(meshFile, signal);
      onEvent({ stage: 'export', space: space.id });

      try {
        if (space.kind === 'hunyuan') {
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
          const stlBlob = await downloadFile(stlFile, signal);
          // read the REAL triangle count from the binary STL header (bytes 80–84)
          const head = new Uint8Array(await stlBlob.slice(0, 84).arrayBuffer());
          const tris = head.length >= 84 ? new DataView(head.buffer).getUint32(80, true) : preset.targetFace;
          onEvent({ stage: 'done', space: space.id });
          return { stlBlob, meshBlob, triangles: tris, source: 'cloud', space: space.id };
        }
        // TRELLIS: GLB only — local conversion from the cached mesh
        const local = await glbBlobToStl(meshBlob, signal);
        onEvent({ stage: 'done', space: space.id });
        return { stlBlob: local.stl, meshBlob, triangles: local.triangles, source: 'local', space: space.id };
      } catch (exportErr) {
        if (signal?.aborted) throw exportErr;
        if (exportErr instanceof QuotaError) throw exportErr;
        // cloud export failed — convert the CACHED mesh locally (refinement 1)
        onEvent({ stage: 'local-export', space: space.id, detail: exportErr instanceof Error ? exportErr.message : String(exportErr) });
        const local = await glbBlobToStl(meshBlob, signal);
        onEvent({ stage: 'done', space: space.id });
        return { stlBlob: local.stl, meshBlob, triangles: local.triangles, source: 'local', space: space.id };
      }
    } catch (err) {
      const typed = classify(err);
      if (signal?.aborted) throw err;
      // quota is account-global — more HF spaces cannot help. NVIDIA's NIM
      // pool is separate, so this is THE moment for the backup (approved).
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
  // every space failed — one last shot on NVIDIA's pool before giving up
  if (input.nimToken) {
    try {
      return await runNimTrellis({ ...input, onEvent });
    } catch (nimErr) {
      throw classify(nimErr);
    }
  }
  throw lastErr;
}

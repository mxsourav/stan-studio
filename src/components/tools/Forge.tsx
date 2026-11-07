import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconCheckmark, IconCube, IconForge, IconLink, IconUpload } from '../icons';
import { clearForgeKeys, getForgeKey, setForgeKeys } from '../../lib/forge/keys';
import { enhancePrompt, type EnhancedPrompt } from '../../lib/forge/groq';
import { fetchImageBlob, genImageUrl } from '../../lib/forge/pollinations';
import { extractNormalBridge, forgeMesh, type ForgeEngineId, type ForgeEvent, type ForgeMeshResult } from '../../lib/forge/spaces';
import { FORGE_PRESETS } from '../../lib/forge/presets';
import { meshQualityReport, type QualityReport } from '../../lib/forge/meshQuality';
import { refineMeshStl, type RefineMeshResult } from '../../lib/forge/refineMesh';
import { enhanceStatueImage, sanitizeImageToPng } from '../../lib/forge/imageEnhancer';
import { rescaleStl } from '../../lib/forge/exportStl';
import { autoProperOrientation, autoProperScale, putShelfFile, saveShelfItem, uid } from '../../lib/stlHub';
import { readStlMesh } from '../../lib/stl';
import { drawMeshOnCanvas, renderStlThumb, sessionMeshCache } from '../../lib/stlThumb';

/** Auto-normalize every forged idol to this height (mm) — AI mesh units are
 *  arbitrary (a 1.97 mm Ganesha is as useless as a 4 m one). */
const AUTO_PRINT_MM = 120;

/**
 * 3D Forge — idea → statue view → forged mesh → print-ready STL.
 * Browser-direct cloud pipeline (no backend in the hot path): Groq sculpts
 * the prompt, Pollinations drafts the statue view, Hunyuan3D forges the
 * mesh + cloud-side decimated STL. Mesh blob is cached the moment the shape
 * finishes — a failed cloud export falls back to the local Three.js exporter
 * (approved refinement 1). Output lands in the STL Hub shelf on request.
 */

const STAGES = ['Idea', 'Statue view', 'Forge', 'Print ready'] as const;

interface StlInfo {
  triangles: number;
  dims: { x: number; y: number; z: number };
  volumeCm3: number;
}

/** Drag-to-rotate mesh preview over an arbitrary STL blob (hub MeshView pattern). */
function ForgeMeshView({ mesh, size = 210 }: { mesh: { tris: Float64Array; count: number }; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef({ yaw: Math.PI / 4, pitch: Math.atan(1 / Math.SQRT2) });
  const dragging = useRef(false);

  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = size * 2;
    c.height = size * 2;
    drawMeshOnCanvas(c, mesh, view.current.yaw, view.current.pitch);
  }, [mesh, size]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={size * 2}
      height={size * 2}
      style={{ width: size, height: size, touchAction: 'none' }}
      title="Drag to rotate"
      className="cursor-grab rounded-2xl border border-white/[0.08] bg-black/40 active:cursor-grabbing"
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        view.current.yaw += e.movementX * 0.01;
        view.current.pitch = Math.max(-1.2, Math.min(1.2, view.current.pitch + e.movementY * 0.01));
        draw();
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
    />
  );
}

/** Minimal binary-STL box for mock mode (E2E without any cloud call). */
function mockStlBlob(dx: number, dy: number, dz: number): Blob {
  const v = [
    [0, 0, 0], [dx, 0, 0], [dx, dy, 0], [0, dy, 0],
    [0, 0, dz], [dx, 0, dz], [dx, dy, dz], [0, dy, dz],
  ] as Array<[number, number, number]>;
  const quads: Array<[number, number, number, number, [number, number, number]]> = [
    [0, 3, 2, 1, [0, 0, -1]], [4, 5, 6, 7, [0, 0, 1]],
    [0, 1, 5, 4, [0, -1, 0]], [1, 2, 6, 5, [1, 0, 0]],
    [2, 3, 7, 6, [0, 1, 0]], [3, 0, 4, 7, [-1, 0, 0]],
  ];
  const tris: Array<[[number, number, number], [number, number, number], [number, number, number], [number, number, number]]> = [];
  for (const [a, b, c, d, n] of quads) {
    tris.push([n, v[a], v[b], v[c]], [n, v[a], v[c], v[d]]);
  }
  const buf = new ArrayBuffer(84 + tris.length * 50);
  const view = new DataView(buf);
  const header = new TextEncoder().encode('STAN forge mock box');
  new Uint8Array(buf).set(header, 0);
  view.setUint32(80, tris.length, true);
  let off = 84;
  for (const [n, p1, p2, p3] of tris) {
    for (const c of n) { view.setFloat32(off, c, true); off += 4; }
    for (const p of [p1, p2, p3]) for (const c of p) { view.setFloat32(off, c, true); off += 4; }
    view.setUint16(off, 0, true); off += 2;
  }
  return new Blob([buf], { type: 'model/stl' });
}

export default function Forge() {
  const navigate = useNavigate();
  const isMock = new URLSearchParams(window.location.search).get('forgeMock') === '1';

  const [stage, setStage] = useState<0 | 1 | 2 | 3>(0);
  const [idea, setIdea] = useState('');
  const [presetId, setPresetId] = useState<'draft' | 'production' | 'ultra' | 'master'>('master');
  const [engineId, setEngineId] = useState<ForgeEngineId>('auto');
  const [rawImageBlob, setRawImageBlob] = useState<Blob | null>(null);
  const [rawImageUrl, setRawImageUrl] = useState<string | null>(null);
  const [enhancedImageBlob, setEnhancedImageBlob] = useState<Blob | null>(null);
  const [enhancedImageUrl, setEnhancedImageUrl] = useState<string | null>(null);
  const [sculptReliefActive, setSculptReliefActive] = useState(true);
  const [trimmedMarginPct, setTrimmedMarginPct] = useState(0);
  const [enhancingImage, setEnhancingImage] = useState(false);
  const [refineStrength, setRefineStrength] = useState<0 | 1 | 2 | 3>(2);
  const [refining, setRefining] = useState(false);
  const [normalBridgeOn, setNormalBridgeOn] = useState(false);
  const [guardOn, setGuardOn] = useState(true);
  const [condSource, setCondSource] = useState<string | null>(null);
  const [refineMeta, setRefineMeta] = useState<Omit<RefineMeshResult, 'stlBlob'> | null>(null);
  const [quality, setQuality] = useState<QualityReport | null>(null);
  const [rawBaseStl, setRawBaseStl] = useState<Blob | null>(null);
  const [enhanced, setEnhanced] = useState<EnhancedPrompt | null>(null);
  const [enhBusy, setEnhBusy] = useState(false);
  const [enhErr, setEnhErr] = useState<string | null>(null);

  const [imageSeed, setImageSeed] = useState(() => Math.floor(Math.random() * 999999));
  const [imageBusy, setImageBusy] = useState(false);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imageObjectUrl, setImageObjectUrl] = useState<string | null>(null);
  const [imgErr, setImgErr] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const directUploadRef = useRef<HTMLInputElement>(null);
  // Generation epoch: any newer user action (upload / regenerate) invalidates
  // an in-flight pollinations fetch so it can NEVER clobber the user's image
  const genEpochRef = useRef(0);

  const [meshBusy, setMeshBusy] = useState(false);
  const [meshStatus, setMeshStatus] = useState<string | null>(null);
  const [meshErr, setMeshErr] = useState<string | null>(null);
  const [spaceFails, setSpaceFails] = useState<string[]>([]);
  const [eventLog, setEventLog] = useState<Array<{ label: string; at: number }>>([]);
  const [meshStartedAt, setMeshStartedAt] = useState<number | null>(null);
  const [result, setResult] = useState<ForgeMeshResult | null>(null);
  const [stlInfo, setStlInfo] = useState<StlInfo | null>(null);
  const [stlMesh, setStlMesh] = useState<{ tris: Float64Array; count: number } | null>(null);
  const [hubBusy, setHubBusy] = useState(false);
  const [hubDone, setHubDone] = useState(false);
  const [scaleNote, setScaleNote] = useState<string | null>(null);

  const [keysOpen, setKeysOpen] = useState(false);
  const [groqKey, setGroqKey] = useState('');
  const [hfToken, setHfToken] = useState('');
  const [nimKey, setNimKey] = useState('');
  const [tripoKey, setTripoKey] = useState('');
  const [keysSaved, setKeysSaved] = useState(false);

  useEffect(() => {
    setGroqKey(getForgeKey('groq'));
    setHfToken(getForgeKey('hf'));
    setNimKey(getForgeKey('nim'));
    setTripoKey(getForgeKey('tripo'));
  }, []);

  const preset = FORGE_PRESETS[presetId];
  const groqReady = Boolean(groqKey) || isMock;
  const hfReady = Boolean(hfToken) || isMock;
  const nimReady = Boolean(nimKey) || isMock;
  const tripoReady = Boolean(tripoKey) || isMock;

  const saveKeys = () => {
    setForgeKeys({ groq: groqKey, hf: hfToken, nim: nimKey, tripo: tripoKey });
    setKeysSaved(true);
    window.setTimeout(() => setKeysSaved(false), 1600);
  };

  // ── Stage 1: idea → sculpted prompt ──
  const doEnhance = async () => {
    if (!idea.trim()) return;
    setEnhBusy(true);
    setEnhErr(null);
    try {
      let out: EnhancedPrompt;
      if (isMock) {
        out = { imagePrompt: `mock statue prompt: ${idea.trim()}`, caption: idea.trim().slice(0, 60), usedGroq: false };
      } else {
        out = await enhancePrompt(idea, groqKey);
      }
      setEnhanced(out);
      if (!out.usedGroq && !isMock) setEnhErr('Groq unavailable — using the offline template (add a key in Settings for LLM sculpting).');
    } catch (err) {
      setEnhErr(err instanceof Error ? err.message : 'enhance failed');
    } finally {
      setEnhBusy(false);
    }
  };

  // ── Stage 2: statue view ──
  const doGenerateImage = async () => {
    if (!enhanced) return;
    const epoch = ++genEpochRef.current; // any upload/regenerate invalidates this run
    setImageBusy(true);
    setImgErr(null);
    setImageBlob(null);
    try {
      let blob: Blob;
      let url: string;
      if (isMock) {
        blob = await (await fetch('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mPcv2P9fwAH1QM7dEKEpAAAAABJRU5ErkJggg==')).blob();
        url = URL.createObjectURL(blob);
      } else {
        url = genImageUrl(enhanced.imagePrompt, imageSeed);
        blob = await fetchImageBlob(url);
      }
      if (epoch !== genEpochRef.current) return;
      await processImage(blob);
    } catch (err) {
      if (epoch !== genEpochRef.current) return;
      setImgErr(err instanceof Error ? err.message : 'image generation failed');
    } finally {
      if (epoch === genEpochRef.current) setImageBusy(false);
    }
  };

  const processImage = async (fileOrBlob: Blob) => {
    const epoch = genEpochRef.current;
    setRawImageBlob(fileOrBlob);
    const rawUrl = URL.createObjectURL(fileOrBlob);
    setRawImageUrl(rawUrl);
    setSculptReliefActive(true);
    setImageBlob(fileOrBlob);
    setImageObjectUrl(rawUrl);
    setImgErr(null);
    setImageBusy(false);
    setStage(1);
    setEnhancingImage(true);

    try {
      const res = await enhanceStatueImage(fileOrBlob, { autoCrop: true, sculptRelief: true });
      if (epoch !== genEpochRef.current) return;
      setEnhancedImageBlob(res.blob);
      setEnhancedImageUrl(res.url);
      setTrimmedMarginPct(res.trimmedMarginPct);
      setImageBlob(res.blob);
      setImageObjectUrl(res.url);
    } catch (err) {
      console.warn('Sculpt relief preprocessor error:', err);
    } finally {
      if (epoch === genEpochRef.current) setEnhancingImage(false);
    }
  };

  const onUploadOverride = async (file: File | undefined | null) => {
    if (!file) return;
    ++genEpochRef.current;
    await processImage(file);
  };

  /** Direct upload from the IDEA stage — a real photo skips AI generation. */
  const onDirectUpload = async (file: File | undefined | null) => {
    if (!file) return;
    ++genEpochRef.current;
    await processImage(file);
  };

  // ── Stage 3: forge the mesh (conditioned generation + surface refinement) ──
  const doForge = async () => {
    if (!imageBlob) return;
    // canonical RGB PNG in, whatever the format out of the camera/generator —
    // spaces crash silently on webp/heic uploads
    const forgeImage = await sanitizeImageToPng(imageBlob);
    const caption = enhanced?.caption ?? (idea.trim().replace(/\s+/g, ' ').slice(0, 90) || 'idol statue from photo');
    const t0 = Date.now();
    setMeshStartedAt(t0);
    setEventLog([]);
    setMeshBusy(true);
    setMeshErr(null);
    setSpaceFails([]);
    setResult(null);
    setStlInfo(null);
    setStlMesh(null);
    setQuality(null);
    setRefineMeta(null);
    setHubDone(false);
    const logEvent = (label: string) => setEventLog((log) => [...log.slice(-7), { label, at: Date.now() }]);
    const budget = isMock ? 0 : (preset.budget ?? 0);
    try {
      // PASS 1 — normal-bridge conditioning (skipped in mock / when toggled off)
      let conditioningBlob: Blob | null = null;
      if (isMock) {
        setCondSource('rgb input');
        logEvent('Pass 1: skipped (mock pipeline)');
      } else if (normalBridgeOn) {
        logEvent('Pass 1: normal bridge conditioning (Hi3DGen)');
        setMeshStatus('Pass 1: normal bridge conditioning…');
        conditioningBlob = await extractNormalBridge(forgeImage, hfToken, (e) => {
          if (e.detail) {
            logEvent(e.detail);
            setMeshStatus(e.detail);
          }
        });
        if (conditioningBlob) {
          setCondSource('normal bridge · Hi3DGen');
          logEvent('Pass 1 complete: generator input = surface normal map');
        } else {
          setCondSource('rgb input');
          logEvent('Pass 1 fallback: generator input = rgb image');
        }
      } else {
        setCondSource('rgb input');
        logEvent('Pass 1: normal bridge off — rgb input');
      }

      const attempt = async (excludeSpace?: string): Promise<{ out: ForgeMeshResult; info: Awaited<ReturnType<typeof readStlMesh>>; refined: Omit<RefineMeshResult, 'stlBlob'>; quality: QualityReport }> => {
        // PASS 2 — conditioned base mesh generation
        let out: ForgeMeshResult;
        if (isMock) {
          logEvent('Pass 2: mock ultra-dense base mesh forging');
          setMeshStatus('mock: Pass 2 forging box');
          await new Promise((r) => setTimeout(r, 900));
          const stl = mockStlBlob(40, 45, 30);
          out = { stlBlob: stl, meshBlob: stl, triangles: 12, source: 'local', space: 'mock' };
        } else {
          logEvent(`Pass 2: synthesizing base geometry (${preset.label})`);
          out = await forgeMesh({
            imageBlob: forgeImage,
            caption,
            hfToken,
            nimToken: nimKey,
            tripoKey,
            preset,
            engine: engineId,
            conditioningBlob,
            excludeSpace,
            onEvent: (e: ForgeEvent) => {
              const bits: string[] = [e.stage];
              if (e.space) bits.push(e.space.split('/')[1] ?? e.space);
              if (typeof e.queue === 'number') bits.push(`queue #${e.queue}`);
              if (typeof e.eta === 'number' && e.eta > 0) bits.push(`~${e.eta}s`);
              if (e.stage === 'local-export') bits.push('cloud export failed — local fallback');
              const line = bits.join(' · ');
              setMeshStatus(line);
              logEvent(line);
              if (e.stage === 'space-failed' && e.space) {
                const name = e.space.split('/')[1] ?? e.space;
                setSpaceFails((f) => [...f, `${name}: ${e.detail ?? 'unavailable'}`]);
              }
            },
          });
        }

        let info = await readStlMesh(out.stlBlob);
        // Auto-scale to a printable idol size — AI generators emit arbitrary
        // units (a 1.97 mm Ganesha is as useless as a 4 m one)
        const maxDim = Math.max(info.bbox.x, info.bbox.y, info.bbox.z);
        if (maxDim > 0 && Math.abs(maxDim - AUTO_PRINT_MM) / AUTO_PRINT_MM > 0.02) {
          const { stl: scaled, factor } = await rescaleStl(out.stlBlob, AUTO_PRINT_MM);
          out = { ...out, stlBlob: scaled };
          info = await readStlMesh(scaled);
          setScaleNote(`auto-scaled ×${factor >= 1 ? factor.toFixed(1) : factor.toFixed(3)} → ${AUTO_PRINT_MM} mm tall`);
        } else {
          setScaleNote(null);
        }
        setRawBaseStl(out.stlBlob);

        // PASS 3 — surface refinement (weld + Taubin + budget cap)
        logEvent('Pass 3: weld + Taubin surface refinement');
        setMeshStatus('Pass 3: weld + Taubin surface refinement…');
        const refined = await refineMeshStl(out.stlBlob, { smoothingStrength: isMock ? 0 : refineStrength, maxTriangles: budget });
        if (refined.simplified) {
          logEvent(`Pass 3 budget: ${refined.inputTriangles.toLocaleString('en-IN')} → ${refined.triangles.toLocaleString('en-IN')} tris`);
        }
        logEvent(`Pass 3 complete: ${refined.triangles.toLocaleString('en-IN')} tris · manifold ${refined.manifold.closedPct}%`);

        const quality = await meshQualityReport(refined.stlBlob, forgeImage);
        const finalOut: ForgeMeshResult = { ...out, stlBlob: refined.stlBlob, triangles: refined.triangles };
        const finalInfo = await readStlMesh(refined.stlBlob);
        return { out: finalOut, info: finalInfo, refined, quality };
      };

      let run = await attempt();
      // quality guard — one automatic retry on the next space of the chain
      if (!isMock && guardOn && run.quality.silhouettePct != null && run.quality.silhouettePct < 55) {
        logEvent(`quality guard: silhouette ${run.quality.silhouettePct}% < 55% — reforging on the next space`);
        const retry = await attempt(run.out.space);
        const first = run.quality.silhouettePct ?? 0;
        const second = retry.quality.silhouettePct ?? 0;
        const better = second > first;
        logEvent(`quality guard: kept the ${better ? 'retry' : 'first'} forge · silhouette ${Math.max(first, second)}%`);
        if (better) run = retry;
      }

      setResult(run.out);
      setRefineMeta(run.refined);
      setQuality(run.quality);
      setStlInfo({ triangles: run.info.triangles, dims: run.info.bbox, volumeCm3: run.info.volumeMm3 / 1000 });
      setStlMesh({ tris: run.info.tris, count: run.info.count });
      setMeshStatus(null);
      setStage(3);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'forge failed';
      setMeshErr(msg);
    } finally {
      setMeshBusy(false);
    }
  };

  /** Re-run Pass 3 from the cached pre-refine STL with a new denoise strength. */
  const handleRefine = async (strength: 0 | 1 | 2 | 3) => {
    if (!rawBaseStl || !imageBlob || refining || meshBusy) return;
    setRefining(true);
    setRefineStrength(strength);
    try {
      const budget = isMock ? 0 : (preset.budget ?? 0);
      const refined = await refineMeshStl(rawBaseStl, { smoothingStrength: strength, maxTriangles: budget });
      const info = await readStlMesh(refined.stlBlob);
      setResult((r) => (r ? { ...r, stlBlob: refined.stlBlob, triangles: refined.triangles } : null));
      setRefineMeta(refined);
      setStlInfo({ triangles: info.triangles, dims: info.bbox, volumeCm3: info.volumeMm3 / 1000 });
      setStlMesh({ tris: info.tris, count: info.count });
      setQuality(await meshQualityReport(refined.stlBlob, imageBlob));
    } catch (err) {
      console.warn('Refine error:', err);
    } finally {
      setRefining(false);
    }
  };

  // ── Stage 4: hand off to the hub shelf ──
  const sendToHub = async () => {
    if (!result || !stlInfo) return;
    setHubBusy(true);
    try {
      const name = idea.trim().replace(/\s+/g, ' ').slice(0, 48) || 'Forge idol';
      const id = uid();
      const autoRot = autoProperOrientation(stlInfo.dims);
      const initialScale = autoProperScale(stlInfo.dims);
      sessionMeshCache.set(id, { tris: stlMesh?.tris ?? new Float64Array(0), count: stlMesh?.count ?? 0 });
      if (result.stlBlob.size <= 30 * 1024 * 1024) await putShelfFile(id, result.stlBlob);
      await saveShelfItem({
        id,
        name: `${name} (forge)`,
        addedAt: Date.now(),
        updatedAt: Date.now(),
        source: 'upload',
        fileName: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.stl`,
        geom: { triangles: stlInfo.triangles, bbox: stlInfo.dims, volumeMm3: stlInfo.volumeCm3 * 1000, surfaceMm2: 0 },
        thumb: stlMesh ? renderStlThumb(stlMesh.tris, stlMesh.count) : '',
        scale: initialScale,
        orient: 'none',
        placement: [{
          id: uid(),
          plate: 0,
          x: 0,
          z: 0,
          rotY: autoRot.rotY,
          rotX: autoRot.rotX,
          rotZ: autoRot.rotZ,
        }],
        params: { material: 'PLA', infill: 15, colorMode: 'single', qty: 1, primaryColor: 'polar-white' },
        history: [],
      });
      setHubDone(true);
      navigate('/tools/stl-hub');
    } finally {
      setHubBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <ForgeHeader
        keysOpen={keysOpen}
        onToggleKeys={() => setKeysOpen((v) => !v)}
        groqReady={groqReady}
        hfReady={hfReady}
        nimReady={nimReady}
        tripoReady={tripoReady}
      />
      {keysOpen && (
        <KeysDrawer
          groqKey={groqKey}
          hfToken={hfToken}
          nimKey={nimKey}
          tripoKey={tripoKey}
          setGroqKey={setGroqKey}
          setHfToken={setHfToken}
          setNimKey={setNimKey}
          setTripoKey={setTripoKey}
          saveKeys={saveKeys}
          keysSaved={keysSaved}
          clearKeys={() => {
            clearForgeKeys();
            setGroqKey('');
            setHfToken('');
            setNimKey('');
            setTripoKey('');
          }}
        />
      )}
      <div className="mt-5">
        <Stepper stage={stage} />
      </div>

      {/* ── Stage 1: IDEA ── */}
      {stage === 0 && (
        <div className="liquid-glass mt-4 rounded-3xl p-5 sm:p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">Describe the idol</p>
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            rows={3}
            placeholder="e.g. Ganesha idol on a lotus, or a diya stand with om engraving"
            className="mt-2.5 w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-[13px] leading-relaxed text-zinc-100 placeholder:text-zinc-500 outline-none transition focus:border-white/30"
          />
          {enhanced ? (
            <div className="mt-4 border-t border-white/[0.08] pt-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">
                Sculpted prompt {enhanced.usedGroq ? '· groq sculpted' : '· offline template'}
              </p>
              <textarea
                value={enhanced.imagePrompt}
                onChange={(e) => setEnhanced({ ...enhanced, imagePrompt: e.target.value })}
                rows={4}
                className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 font-mono text-[11px] leading-relaxed text-zinc-300 outline-none transition focus:border-white/30"
              />
              <p className="mt-1.5 font-mono text-[10px] tabular-nums text-zinc-500">caption: {enhanced.caption}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">Engine</span>
                {[
                  { id: 'auto' as const, label: 'Auto' },
                  { id: 'trellis' as const, label: 'TRELLIS.2 (1024³)' },
                  { id: 'hi3dgen' as const, label: 'Hi3DGen' },
                  { id: 'hunyuan' as const, label: 'Hunyuan3D 2.1' },
                  { id: 'triposg' as const, label: 'TripoSG' },
                ].map((eng) => (
                  <button
                    key={eng.id}
                    type="button"
                    onClick={() => setEngineId(eng.id)}
                    className={`rounded-xl border px-2.5 py-1 text-[11px] font-medium transition ${
                      engineId === eng.id
                        ? 'border-white/25 bg-white/[0.12] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]'
                        : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20 hover:text-zinc-100'
                    }`}
                  >
                    {eng.label}
                  </button>
                ))}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">Mode</span>
                {(Object.keys(FORGE_PRESETS) as Array<'draft' | 'production' | 'ultra' | 'master'>).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPresetId(id)}
                    title={FORGE_PRESETS[id].hint}
                    className={`rounded-xl border px-3 py-1.5 text-[11.5px] font-medium transition active:scale-[0.99] ${
                      presetId === id
                        ? 'border-white/25 bg-white/[0.12] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]'
                        : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20 hover:text-zinc-100'
                    }`}
                  >
                    {FORGE_PRESETS[id].label}
                  </button>
                ))}
                <span className="font-mono text-[9.5px] text-zinc-500">
                  {preset.steps} steps · octree {preset.octree} · {preset.targetFace.toLocaleString('en-IN')} faces
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  ++genEpochRef.current;
                  setImageSeed(Math.floor(Math.random() * 999999));
                  setStage(1);
                  void doGenerateImage();
                }}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-black transition hover:bg-white/90 active:scale-[0.99]"
              >
                Generate statue view
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void doEnhance()}
              disabled={enhBusy || !idea.trim()}
              className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider transition active:scale-[0.99] ${
                enhBusy || !idea.trim() ? 'cursor-not-allowed bg-white/[0.06] text-zinc-500' : 'bg-white text-black hover:bg-white/90'
              }`}
            >
              <IconForge size={14} />
              {enhBusy ? 'Sculpting…' : 'Sculpt the prompt'}
            </button>
          )}

          {/* direct upload — a real photo skips AI generation entirely */}
          <div className="mt-3 flex items-center gap-3">
            <span aria-hidden className="h-px min-w-4 flex-1 bg-white/10" />
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-600">or skip the ai image</span>
            <span aria-hidden className="h-px min-w-4 flex-1 bg-white/10" />
          </div>
          <input
            ref={directUploadRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void onDirectUpload(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => directUploadRef.current?.click()}
            className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-zinc-200 transition hover:bg-white/[0.1] active:scale-[0.99]"
          >
            <IconUpload size={13} />
            Start from my own image
          </button>
          {enhErr && <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 font-mono text-[10.5px] text-amber-200/90">{enhErr}</p>}
          {!groqReady && !enhErr && (
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-600">
              offline template mode — add a groq key for LLM sculpting
            </p>
          )}
        </div>
      )}

      {/* ── Stage 2: STATUE VIEW ── */}
      {stage === 1 && (
        <div className="liquid-glass mt-4 rounded-3xl p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">Statue view · seed {imageSeed}</p>
            <button
              type="button"
              onClick={() => {
                ++genEpochRef.current;
                setImageSeed((s) => s + 1);
                void doGenerateImage();
              }}
              disabled={imageBusy}
              className="rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-wider text-zinc-300 transition hover:bg-white/[0.1] disabled:opacity-50"
            >
              Regenerate
            </button>
          </div>
          <div className="mt-3 flex justify-center">
            {imageObjectUrl ? (
              <img src={imageObjectUrl} alt="statue draft" className="max-h-[380px] rounded-2xl border border-white/[0.08] object-contain" />
            ) : (
              <div className={`flex h-[280px] w-[280px] items-center justify-center rounded-2xl border border-dashed border-white/15 ${imageBusy ? 'animate-pulse bg-white/[0.04]' : ''}`}>
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">{imageBusy ? 'painting…' : 'no image'}</span>
              </div>
            )}
          </div>
          {imgErr && <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 font-mono text-[10.5px] text-red-300">{imgErr}</p>}

          {/* Sculpt Relief & Auto-Framing toggle */}
          <div className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10.5px] font-semibold text-zinc-200">
                    {sculptReliefActive ? '✦ Auto-Framing & Sculpt Relief Active' : 'Raw Untouched Image'}
                  </span>
                  {sculptReliefActive && trimmedMarginPct > 0 && (
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 font-mono text-[9px] text-emerald-300">
                      +{trimmedMarginPct}% voxel density
                    </span>
                  )}
                  {enhancingImage && (
                    <span className="font-mono text-[9.5px] text-zinc-400 animate-pulse">optimizing…</span>
                  )}
                </div>
                <p className="mt-1 text-[10.5px] leading-relaxed text-zinc-400">
                  {sculptReliefActive
                    ? 'Tight 95% bounding-box crop + micro-contrast crevice darkening to stop melted faces and fused fingers.'
                    : 'Standard image without auto-framing or crevice enhancement.'}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setSculptReliefActive(false);
                    if (rawImageBlob && rawImageUrl) {
                      setImageBlob(rawImageBlob);
                      setImageObjectUrl(rawImageUrl);
                    }
                  }}
                  className={`rounded-lg border px-2.5 py-1 font-mono text-[10px] transition ${
                    !sculptReliefActive
                      ? 'border-white/30 bg-white/10 text-white font-medium'
                      : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white'
                  }`}
                >
                  Raw Image
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSculptReliefActive(true);
                    if (enhancedImageBlob && enhancedImageUrl) {
                      setImageBlob(enhancedImageBlob);
                      setImageObjectUrl(enhancedImageUrl);
                    }
                  }}
                  className={`rounded-lg border px-2.5 py-1 font-mono text-[10px] transition ${
                    sculptReliefActive
                      ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-200 font-medium'
                      : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white'
                  }`}
                >
                  Sculpt Relief
                </button>
              </div>
            </div>
          </div>

          {/* Mesh Engine & Detail Preset selectors */}
          <div className="mt-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-2.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">Mesh Engine</span>
              <div className="flex flex-wrap gap-1">
                {[
                  { id: 'auto' as const, label: 'Auto Failover' },
                  { id: 'trellis' as const, label: 'TRELLIS.2 (1024³ Dense)' },
                  { id: 'hi3dgen' as const, label: 'Hi3DGen (Normal Bridge)' },
                  { id: 'hunyuan' as const, label: 'Hunyuan3D 2.1 (Full Octree)' },
                  { id: 'triposg' as const, label: 'TripoSG (Dense SDF)' },
                ].map((eng) => (
                  <button
                    key={eng.id}
                    type="button"
                    onClick={() => setEngineId(eng.id)}
                    className={`rounded-lg border px-2.5 py-1 font-mono text-[10px] transition ${
                      engineId === eng.id
                        ? 'border-white/30 bg-white/[0.12] text-white font-medium'
                        : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white'
                    }`}
                  >
                    {eng.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">Print Preset</span>
              <div className="flex flex-wrap gap-1">
                {(Object.keys(FORGE_PRESETS) as Array<'draft' | 'production' | 'ultra' | 'master'>).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPresetId(id)}
                    title={FORGE_PRESETS[id].hint}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                      presetId === id
                        ? 'border-white/30 bg-white/[0.12] text-white'
                        : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white'
                    }`}
                  >
                    {FORGE_PRESETS[id].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2 font-mono text-[9.5px]">
              <span className="text-zinc-400">
                {preset.steps} steps · {preset.octree}³ octree · {preset.reduceFace ? `Decimate to ${preset.targetFace.toLocaleString('en-IN')} faces` : `Raw isosurface · refine ≤ ${(preset.budget ?? 0).toLocaleString('en-IN')}`}
              </span>
              {!preset.reduceFace && (
                <span className="text-emerald-300 font-semibold uppercase tracking-wider">
                  ✦ Ultra-Detail Raw Isosurface
                </span>
              )}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">Pipeline</span>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setNormalBridgeOn((v) => !v)}
                  title="Experimental: feed the generator a Hi3DGen surface normal map instead of your image. A/B-tested worse on Hunyuan (fatter, blobbier meshes) — keep off unless experimenting"
                  className={`rounded-lg border px-2.5 py-1 font-mono text-[10px] transition ${
                    normalBridgeOn
                      ? 'border-sky-400/40 bg-sky-400/15 text-sky-200 font-medium'
                      : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white'
                  }`}
                >
                  Normal bridge {normalBridgeOn ? 'on' : 'off'}
                </button>
                <button
                  type="button"
                  onClick={() => setGuardOn((v) => !v)}
                  title="If the forged silhouette barely matches your image (<55%), the forge auto-retries once on the next space of the chain"
                  className={`rounded-lg border px-2.5 py-1 font-mono text-[10px] transition ${
                    guardOn
                      ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-200 font-medium'
                      : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white'
                  }`}
                >
                  Quality guard {guardOn ? 'on' : 'off'}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <input
              ref={uploadRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void onUploadOverride(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => uploadRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-zinc-200 transition hover:bg-white/[0.1] active:scale-[0.99]"
            >
              <IconUpload size={13} />
              Use my own image
            </button>
            <button
              type="button"
              onClick={() => setStage(2)}
              disabled={!imageBlob}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider transition active:scale-[0.99] ${
                imageBlob ? 'bg-white text-black hover:bg-white/90' : 'cursor-not-allowed bg-white/[0.06] text-zinc-500'
              }`}
            >
              <IconForge size={14} />
              Forge this
            </button>
          </div>
        </div>
      )}

      {/* ── Stage 3: FORGE ── */}
      {stage === 2 && (
        <div className="liquid-glass mt-4 rounded-3xl p-5 sm:p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">Forging mesh</p>
          <ForgeProgress busy={meshBusy} status={meshStatus} events={eventLog} startedAt={meshStartedAt} presetLabel={`${preset.label}${engineId !== 'auto' ? ` · ${engineId.toUpperCase()}` : ''}`} />
          {spaceFails.length > 0 && (
            <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5">
              <p className="font-mono text-[9.5px] uppercase tracking-wider text-zinc-500">space chain attempts</p>
              {spaceFails.map((f, i) => (
                <p key={i} className="mt-1 font-mono text-[10px] leading-relaxed text-zinc-400">{f}</p>
              ))}
            </div>
          )}
          {meshErr && (
            <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 font-mono text-[10.5px] leading-relaxed text-red-300">
              {meshErr.includes('quota') ? meshErr + ' — try Draft mode or wait for the 24h reset.' : meshErr}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setStage(1)}
              disabled={meshBusy}
              className="flex flex-1 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-zinc-200 transition hover:bg-white/[0.1] active:scale-[0.99] disabled:opacity-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => void doForge()}
              disabled={meshBusy}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider transition active:scale-[0.99] ${
                meshBusy ? 'cursor-not-allowed bg-white/[0.06] text-zinc-500' : 'bg-white text-black hover:bg-white/90'
              }`}
            >
              <IconForge size={14} />
              {meshBusy ? 'Forging…' : result ? 'Forge again' : 'Forge mesh'}
            </button>
          </div>
        </div>
      )}

      {/* ── Stage 4: PRINT READY ── */}
      {stage === 3 && result && stlInfo && (
        <div className="liquid-glass mt-4 rounded-3xl p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">Print ready</p>
            <span
              className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                result.source === 'cloud'
                  ? 'border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-200/90'
                  : result.source === 'nim'
                    ? 'border-sky-300/25 bg-sky-300/[0.08] text-sky-200/90'
                    : result.source === 'tripo'
                      ? 'border-violet-300/25 bg-violet-300/[0.08] text-violet-200/90'
                      : 'border-amber-300/25 bg-amber-300/[0.08] text-amber-200/90'
              }`}
            >
              {result.source === 'cloud' ? 'cloud stl' : result.source === 'nim' ? 'nim · trellis stl' : result.source === 'tripo' ? 'tripo stl' : 'local fallback stl'}
            </span>
          </div>
          <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            {stlMesh && <ForgeMeshView mesh={stlMesh} />}
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[12px] tabular-nums text-zinc-100">
                {stlInfo.dims.x} × {stlInfo.dims.y} × {stlInfo.dims.z} mm
              </p>
              <p className="mt-1 font-mono text-[10.5px] tabular-nums text-zinc-400">
                {stlInfo.triangles.toLocaleString('en-IN')} tris · {stlInfo.volumeCm3.toFixed(1)} cm³
              </p>
              {!preset.reduceFace ? (
                <p className="mt-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-emerald-300">
                  ✦ Raw isosurface{preset.budget ? ` · refined ≤ ${preset.budget.toLocaleString('en-IN')}` : ' · zero decimation'}
                </p>
              ) : stlInfo.triangles > 150000 ? (
                <p className="mt-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-amber-200/80">heavy mesh — slicer may lag</p>
              ) : null}
              {scaleNote && (
                <p className="mt-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-sky-200/80">{scaleNote}</p>
              )}
              <p className="mt-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-zinc-600">via {result.space}</p>
            </div>
          </div>

          {/* Surface refinement (Pass 3 live tuning) */}
          <div className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] font-semibold text-zinc-100">
                    ✦ Pass 3 · Surface refinement
                  </span>
                  {condSource && (
                    <span className="rounded-full border border-sky-400/30 bg-sky-400/[0.08] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-sky-300">
                      {condSource}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[10px] text-zinc-400">
                  Weld → Taubin denoise → error-bounded budget. Manifold, spike-free geometry.
                </p>
              </div>
              {refining && (
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-emerald-300">
                  <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-emerald-300 border-t-transparent" />
                  refining…
                </span>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-300">Denoise</span>
              {([0, 1, 2, 3] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={refining || !rawBaseStl}
                  onClick={() => void handleRefine(s)}
                  className={`rounded-lg border px-2.5 py-1 font-mono text-[10px] transition active:scale-95 ${
                    refineStrength === s
                      ? 'border-emerald-400/40 bg-emerald-400/20 text-emerald-200 font-semibold'
                      : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white hover:bg-white/[0.06]'
                  } disabled:opacity-50`}
                >
                  {(['Off', 'Light', 'Medium', 'Strong'] as const)[s]}
                </button>
              ))}
              {preset.budget ? (
                <span className="font-mono text-[9.5px] text-zinc-500">budget ≤ {preset.budget.toLocaleString('en-IN')}</span>
              ) : null}
            </div>

            {(refineMeta || quality) && (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-white/[0.06] pt-2.5 font-mono text-[9.5px] tabular-nums">
                {refineMeta && (
                  <span className={refineMeta.manifold.closedPct >= 99 ? 'text-emerald-300' : refineMeta.manifold.closedPct >= 90 ? 'text-zinc-300' : 'text-amber-300'}>
                    manifold {refineMeta.manifold.closedPct}%
                  </span>
                )}
                {quality && (
                  <span className={quality.silhouettePct == null ? 'text-zinc-500' : quality.silhouettePct >= 70 ? 'text-emerald-300' : quality.silhouettePct >= 55 ? 'text-zinc-300' : 'text-amber-300'}>
                    silhouette {quality.silhouettePct == null ? 'n/a' : `${quality.silhouettePct}%`}
                  </span>
                )}
                {refineMeta && (
                  <span className="text-zinc-500">
                    {refineMeta.simplified
                      ? `${refineMeta.inputTriangles.toLocaleString('en-IN')} → ${refineMeta.triangles.toLocaleString('en-IN')} tris`
                      : `${refineMeta.triangles.toLocaleString('en-IN')} tris`}
                  </span>
                )}
                {quality && (
                  <span className={quality.flatBasePct >= 2 ? 'text-emerald-300' : 'text-amber-300'}>
                    base {quality.flatBasePct >= 2 ? 'flat' : `rounded · ${quality.flatBasePct}%`}
                  </span>
                )}
              </div>
            )}
            {quality && quality.flatBasePct < 2 && (
              <p className="mt-2 rounded-xl bg-amber-500/10 px-3 py-2 font-mono text-[10px] text-amber-200/90">
                rounded base — Lay Flat in the STL Hub puts it print-ready on the plate
              </p>
            )}
          </div>

          <div className="mt-5 flex gap-2">
            <a
              href={URL.createObjectURL(result.stlBlob)}
              download="stan-forge-idol.stl"
              className="flex flex-1 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-zinc-200 transition hover:bg-white/[0.1] active:scale-[0.99]"
            >
              Download STL
            </a>
            <button
              type="button"
              onClick={() => void sendToHub()}
              disabled={hubBusy || hubDone}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider transition active:scale-[0.99] ${
                hubDone ? 'bg-emerald-400 text-black' : 'bg-white text-black hover:bg-white/90'
              } disabled:opacity-80`}
            >
              {hubDone ? <IconCheckmark size={14} /> : <IconCube size={14} />}
              {hubDone ? 'On the shelf' : 'Send to STL Hub'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ForgeHeader(props: { keysOpen: boolean; onToggleKeys: () => void; groqReady: boolean; hfReady: boolean; nimReady: boolean; tripoReady: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">STΔN · 3D Forge</p>
        <h1 className="mt-1 text-[18px] font-semibold tracking-[-0.015em] text-zinc-100">Idea to printable idol</h1>
        <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-zinc-600">
          groq {props.groqReady ? '✓' : '—'} · hf {props.hfReady ? '✓' : '—'} · nim {props.nimReady ? '✓' : '—'} · tripo {props.tripoReady ? '✓' : '—'}
        </p>
      </div>
      <button
        type="button"
        onClick={props.onToggleKeys}
        aria-label="API keys"
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition active:scale-[0.97] ${
          props.keysOpen ? 'border-white/30 bg-white/[0.12] text-white' : 'border-white/10 bg-white/[0.04] text-zinc-400 hover:text-zinc-100'
        }`}
      >
        <IconLink size={15} />
      </button>
    </div>
  );
}

/** Stage label from the latest pipeline event prefix. */
function forgeStageLabel(status: string | null, busy: boolean): string {
  if (!busy && status) return 'Forged.';
  const s = status ?? 'probe';
  if (s.startsWith('Pass 1')) return 'Pass 1 · Normal bridge conditioning…';
  if (s.startsWith('Pass 2')) return 'Pass 2 · Synthesizing base geometry…';
  if (s.startsWith('Pass 3')) return 'Pass 3 · Surface refinement…';
  const head = s.split(' · ')[0];
  if (head.startsWith('probe')) return 'Waking the space…';
  if (head.startsWith('shape')) return 'Forging on the GPU…';
  if (head.startsWith('export')) return 'Decimating + exporting STL…';
  if (head.startsWith('local-export')) return 'Converting the cached mesh locally…';
  if (head.startsWith('space-failed')) return 'Space failed — trying the next…';
  if (head.startsWith('done')) return 'Forged.';
  return busy ? 'Connecting…' : 'Ready';
}

/** Animated forging readout: rings + pulse, live T+ elapsed, event log. */
function ForgeProgress({ busy, status, events, startedAt, presetLabel }: {
  busy: boolean;
  status: string | null;
  events: Array<{ label: string; at: number }>;
  startedAt: number | null;
  presetLabel: string;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!busy) return;
    const t = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(t);
  }, [busy]);
  const elapsed = busy && startedAt ? Math.max(0, (now - startedAt) / 1000) : 0;
  return (
    <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3.5">
      <div className="flex items-center gap-3.5">
        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
          {busy && (
            <>
              <span className="forge-ring absolute inset-0 rounded-full border border-[#ff2d55]/60" style={{ animationDelay: '0s' }} />
              <span className="forge-ring absolute inset-0 rounded-full border border-[#ff2d55]/40" style={{ animationDelay: '0.6s' }} />
              <span className="forge-ring absolute inset-0 rounded-full border border-[#ff2d55]/25" style={{ animationDelay: '1.2s' }} />
            </>
          )}
          <IconForge size={22} className={busy ? 'forge-pulse text-white' : 'text-zinc-400'} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[12.5px] text-zinc-100">{forgeStageLabel(status, busy)}</p>
          <p className="mt-0.5 truncate font-mono text-[10px] tabular-nums text-zinc-500">
            {status ?? 'connecting to the space chain…'}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-[19px] font-bold tabular-nums text-white">T+{elapsed.toFixed(0)}s</p>
          <p className="font-mono text-[8.5px] uppercase tracking-wider text-zinc-500">{presetLabel}</p>
        </div>
      </div>
      <div className="relative mt-3 h-1 overflow-hidden rounded-full bg-white/10">
        {busy ? (
          <div className="forge-shimmer relative h-full w-full rounded-full bg-white/[0.06]" />
        ) : (
          <div className="h-full w-full rounded-full bg-emerald-400/50" />
        )}
      </div>
      {events.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-0.5">
          {events.slice(-5).map((e, i) => (
            <p key={i} className="font-mono text-[9.5px] tabular-nums text-zinc-500">
              [T+{Math.max(0, Math.round((e.at - (startedAt ?? e.at)) / 1000))}s] {e.label}
            </p>
          ))}
        </div>
      )}
      {busy && (
        <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-600">
          typical: 40–120s gpu once the space wakes · cold start adds ~60s
        </p>
      )}
    </div>
  );
}

function Stepper({ stage }: { stage: 0 | 1 | 2 | 3 }) {  return (
    <div className="no-scrollbar flex items-center gap-1 overflow-x-auto rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
      {STAGES.map((label, i) => (
        <div key={label} className="flex min-w-0 flex-1 items-center gap-1">
          {i > 0 && <span aria-hidden className="h-px w-3 shrink-0 bg-white/15" />}
          <span
            className={`min-w-0 flex-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-center font-mono text-[9px] uppercase tracking-wider transition ${
              i === stage ? 'bg-white/[0.14] text-white' : i < stage ? 'text-zinc-500' : 'text-zinc-600'
            }`}
          >
            {i + 1} · {label}
          </span>
        </div>
      ))}
    </div>
  );
}

function KeysDrawer(props: {
  groqKey: string;
  hfToken: string;
  nimKey: string;
  tripoKey: string;
  setGroqKey: (v: string) => void;
  setHfToken: (v: string) => void;
  setNimKey: (v: string) => void;
  setTripoKey: (v: string) => void;
  saveKeys: () => void;
  keysSaved: boolean;
  clearKeys: () => void;
}) {
  const fieldCls =
    'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 font-mono text-[12px] text-zinc-100 placeholder:text-zinc-500 outline-none transition focus:border-white/30';
  return (
    <div className="liquid-glass mt-3 rounded-2xl p-4 sm:p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">API keys — stored on this device only</p>
      <div className="mt-3 flex flex-col gap-2.5">
        <input
          type="password"
          value={props.groqKey}
          onChange={(e) => props.setGroqKey(e.target.value)}
          placeholder="gsk_… (console.groq.com)"
          aria-label="Groq API key"
          className={fieldCls}
        />
        <input
          type="password"
          value={props.hfToken}
          onChange={(e) => props.setHfToken(e.target.value)}
          placeholder="hf_… (huggingface.co settings → tokens)"
          aria-label="Hugging Face token"
          className={fieldCls}
        />
        <input
          type="password"
          value={props.nimKey}
          onChange={(e) => props.setNimKey(e.target.value)}
          placeholder="nvapi-… (build.nvidia.com — quota backup, optional)"
          aria-label="NVIDIA API key"
          className={fieldCls}
        />
        <input
          type="password"
          value={props.tripoKey}
          onChange={(e) => props.setTripoKey(e.target.value)}
          placeholder="tsk_… (platform.tripo3d.ai — own-image backup engine)"
          aria-label="Tripo API key"
          className={fieldCls}
        />
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={props.saveKeys}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-black transition hover:bg-white/90 active:scale-[0.99]"
        >
          {props.keysSaved ? <IconCheckmark size={13} /> : null}
          {props.keysSaved ? 'Saved' : 'Save keys'}
        </button>
        <button
          type="button"
          onClick={props.clearKeys}
          className="flex-1 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-300 transition hover:bg-white/[0.1]"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

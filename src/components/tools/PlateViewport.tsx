import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { sessionMeshCache } from '../../lib/stlThumb';
import { readStlMesh } from '../../lib/stl';
import { getShelfFile } from '../../lib/stlHub';
import type { ShelfItem } from '../../lib/stlHub';

/**
 * Bambu-style 3D build-plate viewport (WebGL): perspective orbit camera,
 * textured 256×256 mm A1 PEI plate as a real 3D object, the parsed mesh
 * sitting on it at true millimetre scale with real shadowing. Drag = orbit,
 * wheel = zoom. FIT VIEW zooms to the model; RESET ORBIT restores the home
 * plate framing (exposed to the parent HUD via onReady). If the session mesh
 * cache misses (page reload), the model is revived from the IndexedDB files
 * store so a saved part ALWAYS renders on the plate. Renders on demand; any
 * WebGL failure degrades to the stored 2D thumb, never a crash.
 */

const PLATE = 256;
const HOME = { theta: Math.PI / 4, phi: 0.95 };
const FOV = 40;
const R_MIN = 60, R_MAX = 1600;

export interface PlateViewApi {
  fit: () => void; // zoom to the model (or the plate when empty)
  reset: () => void; // home orientation + full-plate framing
}

function makePlateTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#1b1b21';
    ctx.fillRect(0, 0, 1024, 1024);
    const cell = 1024 / 8; // 32 mm cells
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    for (let i = 1; i < 8; i++) {
      const p = i * cell;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 1024); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(1024, p); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.30)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(512, 0); ctx.lineTo(512, 1024); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 512); ctx.lineTo(1024, 512); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.42)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 1018, 1018);
    // Front-edge plate label (drawn onto the texture, slicer-style)
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    ctx.font = '600 22px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('STΔN A1 · 256×256mm PEI PLATE', 28, 988);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export default function PlateViewport({
  item,
  onReady,
  className = '',
}: {
  item: ShelfItem;
  onReady?: (api: PlateViewApi) => void;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef<((api: PlateViewApi) => void) | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    readyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;

    try {
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      Object.assign(renderer.domElement.style, {
        width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: 'grab',
      });
      host.appendChild(renderer.domElement);
      const el = renderer.domElement;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 6000);

      // Lighting — bright studio key + cool fill, shadows onto the plate
      const hemi = new THREE.HemisphereLight(0xffffff, 0x14141a, 0.65);
      const key = new THREE.DirectionalLight(0xffffff, 1.6);
      key.position.set(180, 340, 160);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.left = key.shadow.camera.bottom = -240;
      key.shadow.camera.right = key.shadow.camera.top = 240;
      key.shadow.camera.far = 1200;
      key.shadow.bias = -0.0004;
      const fill = new THREE.DirectionalLight(0xcdd6ff, 0.35);
      fill.position.set(-220, 140, -160);
      scene.add(hemi, key, fill);

      // A1 PEI plate — grid-textured top face, dark rim, corner axis triad
      const plateTex = makePlateTexture();
      const sideMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0f, roughness: 0.9 });
      const topMat = new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.82, metalness: 0.05 });
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(PLATE, 6, PLATE),
        [sideMat, sideMat, topMat, sideMat, sideMat, sideMat],
      );
      plate.position.y = -3;
      plate.receiveShadow = true;
      scene.add(plate);
      const axes = new THREE.AxesHelper(38);
      axes.position.set(-116, 0.5, -116);
      scene.add(axes);

      // Model builder — bottom on the plate, centered, bright PLA
      const buildModel = (tris: Float64Array, count: number): { mesh: THREE.Mesh; radius: number; cy: number } | null => {
        if (count <= 0) return null;
        const cap = 150_000;
        const stride = Math.max(1, Math.ceil(count / cap));
        const n = Math.floor(count / stride);
        if (n <= 0) return null;
        const arr = new Float32Array(n * 9);
        for (let i = 0; i < n; i++) {
          const o = i * stride * 9;
          arr.set(tris.subarray(o, o + 9), i * 9);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        geo.computeVertexNormals();
        geo.computeBoundingBox();
        const bb = geo.boundingBox;
        if (!bb) {
          geo.dispose();
          return null;
        }
        geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
        const model = new THREE.Mesh(
          geo,
          new THREE.MeshStandardMaterial({ color: 0xf4f4f5, roughness: 0.45, metalness: 0.03 }),
        );
        model.castShadow = true;
        return {
          mesh: model,
          radius: Math.hypot(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) / 2 || 1,
          cy: (bb.min.y + bb.max.y) / 2,
        };
      };

      // Orbit state + framing
      const target = new THREE.Vector3(0, 24, 0);
      let theta = HOME.theta, phi = HOME.phi;
      let dirty = true;
      const halfFov = Math.tan((FOV * Math.PI) / 360);
      const plateFitDist = ((PLATE * Math.SQRT2) / 2 / halfFov) * 1.04; // plate fills ~80% of the frame
      let radius = plateFitDist;
      let modelInfo: { radius: number; cy: number } | null = null;

      const applyCamera = () => {
        camera.position.set(
          target.x + radius * Math.sin(phi) * Math.sin(theta),
          target.y + radius * Math.cos(phi),
          target.z + radius * Math.sin(phi) * Math.cos(theta),
        );
        camera.lookAt(target);
      };

      const clampR = (r: number) => Math.min(R_MAX, Math.max(R_MIN, r));
      const fit = () => {
        // Zoom to the model, keeping the plate in context.
        if (modelInfo) {
          radius = clampR(Math.max(Math.min((modelInfo.radius / halfFov) * 1.5, plateFitDist * 1.15), plateFitDist * 0.34));
          target.y = Math.min(Math.max(modelInfo.cy, 8), 70);
        } else {
          radius = clampR(plateFitDist);
          target.y = 24;
        }
        dirty = true;
      };
      const reset = () => {
        theta = HOME.theta;
        phi = HOME.phi;
        radius = clampR(plateFitDist);
        target.y = 24;
        dirty = true;
      };

      // Initial framing — model prominent when we already have its mesh
      const cached = sessionMeshCache.get(item.id);
      if (cached && cached.count > 0) {
        const built = buildModel(cached.tris, cached.count);
        if (built) {
          scene.add(built.mesh);
          modelInfo = { radius: built.radius, cy: built.cy };
          fit();
        }
      }

      // onReady after initial framing so HUD buttons bind to real state
      readyRef.current?.({ fit, reset });

      // Mesh revival — session cache misses after a page reload: reload the
      // binary from the IndexedDB files store so the part ALWAYS renders.
      if (!modelInfo && item.source === 'upload' && item.fileName) {
        void (async () => {
          try {
            const blob = await getShelfFile(item.id);
            if (!blob || disposed) return;
            const parsed = await readStlMesh(blob);
            if (disposed) return;
            sessionMeshCache.set(item.id, { tris: parsed.tris, count: parsed.count });
            const built = buildModel(parsed.tris, parsed.count);
            if (built && !disposed) {
              scene.add(built.mesh);
              modelInfo = { radius: built.radius, cy: built.cy };
              fit();
            }
          } catch {
            /* revival is best-effort — plate still renders */
          }
        })();
      }

      let dragging = false;
      const onDown = (e: PointerEvent) => {
        dragging = true;
        el.setPointerCapture(e.pointerId);
        el.style.cursor = 'grabbing';
      };
      const onMove = (e: PointerEvent) => {
        if (!dragging) return;
        theta += e.movementX * 0.005;
        phi = Math.min(1.45, Math.max(0.12, phi - e.movementY * 0.005));
        dirty = true;
      };
      const onUp = (e: PointerEvent) => {
        dragging = false;
        el.releasePointerCapture?.(e.pointerId);
        el.style.cursor = 'grab';
      };
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        radius = clampR(radius * (e.deltaY < 0 ? 0.9 : 1 / 0.9));
        dirty = true;
      };
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('wheel', onWheel, { passive: false });

      const resize = () => {
        const w = host.clientWidth || 1;
        const h = host.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        dirty = true;
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(host);

      // Render-on-demand loop
      let raf = 0;
      const tick = () => {
        raf = requestAnimationFrame(tick);
        if (!dirty) return;
        dirty = false;
        applyCamera();
        renderer.render(scene, camera);
      };
      tick();

      // Debug handle (project convention) — lets probes read camera state
      (window as unknown as Record<string, unknown>).__stanPlateView = {
        fit,
        reset,
        state: () => ({ radius: Math.round(radius), theta: +theta.toFixed(2), phi: +phi.toFixed(2), targetY: Math.round(target.y), hasModel: Boolean(modelInfo) }),
      };

      return () => {
        disposed = true;
        cancelAnimationFrame(raf);
        ro.disconnect();
        el.removeEventListener('pointerdown', onDown);
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('wheel', onWheel);
        scene.traverse((obj) => {
          const m = obj as THREE.Mesh;
          if (m.geometry) m.geometry.dispose();
          const mat = m.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else mat?.dispose();
        });
        plateTex.dispose();
        renderer.dispose();
        el.remove();
        delete (window as unknown as Record<string, unknown>).__stanPlateView;
      };
    } catch {
      // No WebGL / context refused — degrade to the stored thumb, never crash.
      setFailed(true);
    }
  }, [item.id]);

  if (failed) {
    return (
      <div className={`flex items-center justify-center rounded-xl border border-white/[0.08] bg-black/40 ${className}`}>
        {item.thumb ? (
          <img src={item.thumb} alt={item.name} className="h-full w-full rounded-xl object-contain" />
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500">3D view unavailable</span>
        )}
      </div>
    );
  }

  return <div ref={hostRef} className={`min-h-0 w-full ${className}`} />;
}

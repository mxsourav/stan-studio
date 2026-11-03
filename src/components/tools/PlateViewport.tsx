import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { sessionMeshCache } from '../../lib/stlThumb';
import type { ShelfItem } from '../../lib/stlHub';

/**
 * Bambu-style 3D build-plate viewport (WebGL): perspective orbit camera,
 * textured 256×256 mm A1 plate as a real 3D object, the parsed mesh sitting
 * on it at true millimetre scale with real shadowing. Drag = orbit,
 * wheel = zoom, double-click = reset view. The camera AUTO-FITS the model on
 * mount (plate stays in context) — a 20 mm part is not a speck. Renders on
 * demand; any WebGL failure degrades to the stored 2D thumb, never a crash.
 */

const PLATE = 256;
const HOME = { theta: Math.PI / 4, phi: 0.95 };
const FOV = 40;
const R_MIN = 60, R_MAX = 1600;

function makePlateTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#131318';
    ctx.fillRect(0, 0, 1024, 1024);
    const cell = 1024 / 8; // 32 mm cells
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 2;
    for (let i = 1; i < 8; i++) {
      const p = i * cell;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 1024); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(1024, p); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.24)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(512, 0); ctx.lineTo(512, 1024); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 512); ctx.lineTo(1024, 512); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.34)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 1018, 1018);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export default function PlateViewport({ item, className = '' }: { item: ShelfItem; className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<(() => void) | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    try {
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      Object.assign(renderer.domElement.style, {
        width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: 'grab',
      });
      host.appendChild(renderer.domElement);
      const el = renderer.domElement;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 6000);

      // Lighting — soft studio key + cool fill, shadows onto the plate
      const hemi = new THREE.HemisphereLight(0xffffff, 0x0a0a0c, 0.55);
      const key = new THREE.DirectionalLight(0xffffff, 1.5);
      key.position.set(180, 340, 160);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.left = key.shadow.camera.bottom = -240;
      key.shadow.camera.right = key.shadow.camera.top = 240;
      key.shadow.camera.far = 1200;
      key.shadow.bias = -0.0004;
      const fill = new THREE.DirectionalLight(0xcdd6ff, 0.3);
      fill.position.set(-220, 140, -160);
      scene.add(hemi, key, fill);

      // A1 plate — grid-textured top face, dark rim
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

      // Model — bottom on the plate, centered, natural-PLA flat shading
      const mesh = sessionMeshCache.get(item.id);
      let modelInfo: { r: number; cy: number } | null = null;
      if (mesh && mesh.count > 0) {
        const cap = 150_000;
        const stride = Math.max(1, Math.ceil(mesh.count / cap));
        const n = Math.floor(mesh.count / stride);
        const arr = new Float32Array(n * 9);
        for (let i = 0; i < n; i++) {
          const o = i * stride * 9;
          arr.set(mesh.tris.subarray(o, o + 9), i * 9);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        geo.computeVertexNormals();
        geo.computeBoundingBox();
        const bb = geo.boundingBox;
        if (bb) {
          geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
          const model = new THREE.Mesh(
            geo,
            new THREE.MeshStandardMaterial({ color: 0xd8d8dc, roughness: 0.5, metalness: 0.03 }),
          );
          model.castShadow = true;
          scene.add(model);
          // bbox in world mm (before centering) — drives the smart fit
          modelInfo = {
            r: Math.hypot(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) / 2 || 1,
            cy: (bb.min.y + bb.max.y) / 2,
          };
        } else {
          geo.dispose();
        }
      }

      // Orbit state + smart framing: model prominent, plate in context
      const target = new THREE.Vector3(0, 24, 0);
      let theta = HOME.theta, phi = HOME.phi;
      let dirty = true;
      const halfFov = Math.tan((FOV * Math.PI) / 360);
      const plateFit = ((PLATE * Math.SQRT2) / 2 / halfFov) * 1.1;
      let radius = plateFit;

      const fit = () => {
        if (modelInfo) {
          radius = Math.max(Math.min((modelInfo.r / halfFov) * 1.5, plateFit * 1.15), plateFit * 0.34);
          target.y = Math.min(Math.max(modelInfo.cy, 8), 70);
        } else {
          radius = plateFit;
          target.y = 24;
        }
        radius = Math.min(R_MAX, Math.max(R_MIN, radius));
        theta = HOME.theta;
        phi = HOME.phi;
        dirty = true;
      };
      fitRef.current = fit;
      fit(); // smart initial framing — model prominent, plate in context

      const applyCamera = () => {
        camera.position.set(
          target.x + radius * Math.sin(phi) * Math.sin(theta),
          target.y + radius * Math.cos(phi),
          target.z + radius * Math.sin(phi) * Math.cos(theta),
        );
        camera.lookAt(target);
      };

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
        radius = Math.min(R_MAX, Math.max(R_MIN, radius * (e.deltaY < 0 ? 0.9 : 1 / 0.9)));
        dirty = true;
      };
      const onDbl = () => fit();
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('wheel', onWheel, { passive: false });
      el.addEventListener('dblclick', onDbl);

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
        state: () => ({ radius: Math.round(radius), theta: +theta.toFixed(2), phi: +phi.toFixed(2), targetY: Math.round(target.y), hasModel: Boolean(modelInfo) }),
      };

      return () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        el.removeEventListener('pointerdown', onDown);
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('wheel', onWheel);
        el.removeEventListener('dblclick', onDbl);
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
        fitRef.current = null;
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

  return (
    <div className={`relative min-h-0 w-full ${className}`}>
      <div ref={hostRef} className="h-full min-h-0 w-full" />
      <button
        type="button"
        onClick={() => fitRef.current?.()}
        className="absolute right-1.5 top-1.5 rounded-lg border border-white/10 bg-black/50 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-zinc-300 backdrop-blur transition hover:bg-black/70 active:scale-[0.99]"
      >
        Fit view
      </button>
    </div>
  );
}

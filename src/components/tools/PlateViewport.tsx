import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { sessionMeshCache } from '../../lib/stlThumb';
import { readStlMesh } from '../../lib/stl';
import {
  clampToPlate,
  effectiveGeom,
  filamentColor,
  flipFootprint,
  getShelfFile,
  layFlatFlip,
  normalizeScale,
  PLATE_SIZE,
  rotatedFootprint,
  saveShelfItem,
  type Orient,
  type PlateInstance,
  type Scale3,
  type ShelfItem,
} from '../../lib/stlHub';

/**
 * Bambu-style interactive build-plate scene (WebGL). Renders the plate plus
 * EVERY instance of the active plate's layout: click to select (emerald
 * footprint box, red on collision), drag to move across the plate (camera
 * orbit locked while moving), orbit on empty space, wheel zoom. Meshes are
 * vertex-shaded live with the chosen filament colors (secondary color shades
 * the upper layers in multi-color modes). If the session mesh cache misses
 * (page reload) the model is revived from the IndexedDB files store. Any
 * WebGL failure degrades to the stored 2D thumb — never a crash.
 */

const HOME = { theta: Math.PI / 4, phi: 0.95 };
const FOV = 40;
const R_MIN = 60, R_MAX = 1600;

export interface PlateViewApi {
  fit: () => void; // frame the active plate's contents
  reset: () => void; // home orientation + full-plate framing
}

export interface PlateColors {
  primary: string; // hex
  secondary: string | null; // hex — shades the upper layers when set
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
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    ctx.font = '600 22px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('STΔN A1 · 256×256mm PEI PLATE', 28, 988);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Per-face vertex colors: secondary filament above 55% of the model height. */
function applyFilamentColors(geo: THREE.BufferGeometry, primary: string, secondary: string | null): void {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const arr = new Float32Array(pos.count * 3);
  const cA = new THREE.Color(primary).convertSRGBToLinear();
  const cB = secondary ? new THREE.Color(secondary).convertSRGBToLinear() : cA;
  geo.computeBoundingBox();
  const maxY = geo.boundingBox?.max.y ?? 0;
  const split = maxY * 0.55;
  for (let t = 0; t < pos.count; t += 3) {
    const y = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3;
    const c = secondary && y > split ? cB : cA;
    for (let v = 0; v < 3; v++) {
      arr[(t + v) * 3] = c.r;
      arr[(t + v) * 3 + 1] = c.g;
      arr[(t + v) * 3 + 2] = c.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

/** Bake scale + orientation into a geometry clone: scaled on the RAW axes
 *  first (so non-uniform scale follows the file's axes), then flipped, then
 *  re-seated — bottom at y=0, centered XZ. */
function bakeFlip(base: THREE.BufferGeometry, flip: Orient, scale?: Scale3): THREE.BufferGeometry {
  const g = base.clone();
  const s = scale ?? { x: 1, y: 1, z: 1 };
  if (s.x !== 1 || s.y !== 1 || s.z !== 1) g.applyMatrix4(new THREE.Matrix4().makeScale(s.x, s.y, s.z));
  if (flip === 'x') g.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  if (flip === 'y') g.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2));
  g.computeBoundingBox();
  const bb = g.boundingBox;
  if (bb) g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  return g;
}

export default function PlateViewport({
  item,
  instances,
  activePlate,
  selectedInstanceId,
  collision,
  colors,
  interaction = 'move',
  scaleOverride,
  onSelectInstance,
  onMoveInstance,
  onRotateInstance,
  onGizmoScale,
  onReady,
  className = '',
}: {
  item: ShelfItem;
  instances: PlateInstance[];
  activePlate: number;
  selectedInstanceId: string | null;
  collision: boolean;
  colors: PlateColors;
  interaction?: 'move' | 'rotate' | 'scale'; // drives the on-model gizmo mode
  scaleOverride?: Scale3; // live typing preview — wins over item.scale
  onSelectInstance: (id: string | null) => void;
  onMoveInstance: (id: string, x: number, z: number) => void;
  onRotateInstance?: (id: string, rotY: number) => void;
  onGizmoScale?: (ratios: Scale3) => void; // gizmo scale-drag deltas → item factors
  onReady?: (api: PlateViewApi) => void;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef<((api: PlateViewApi) => void) | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [meshEpoch, setMeshEpoch] = useState(0); // bumps when the base mesh (re)builds

  // Mutable bridges between the stable scene and the React-driven state
  const sceneRef = useRef<THREE.Group | null>(null); // instance group
  const rawGeoRef = useRef<THREE.BufferGeometry | null>(null); // normalized, bottom-seated, centered
  const bakedRef = useRef<{ orient: Orient; scale: Scale3; geo: THREE.BufferGeometry } | null>(null);
  const orientRef = useRef<Orient>('none');
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const selBoxRef = useRef<THREE.LineSegments | null>(null);
  const dragModeRef = useRef<'none' | 'orbit' | 'move'>('none');
  const dragIdRef = useRef<string | null>(null);
  const grabOffsetRef = useRef({ x: 0, z: 0 });
  const modelRadiusRef = useRef<number | null>(null);
  const cbRef = useRef({ onSelectInstance, onMoveInstance, onRotateInstance, onGizmoScale });
  const propsRef = useRef({ instances, activePlate, item, interaction, scaleOverride });
  const tcRef = useRef<TransformControls | null>(null);
  const gizmoBusyRef = useRef(false);
  const kickRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    cbRef.current = { onSelectInstance, onMoveInstance, onRotateInstance, onGizmoScale };
    propsRef.current = { instances, activePlate, item, interaction, scaleOverride };
  });

  useEffect(() => {
    readyRef.current = onReady;
  }, [onReady]);

  // ── Scene init (once per item) ──
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

      const plateTex = makePlateTexture();
      const sideMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0f, roughness: 0.9 });
      const topMat = new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.82, metalness: 0.05 });
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(PLATE_SIZE, 6, PLATE_SIZE),
        [sideMat, sideMat, topMat, sideMat, sideMat, sideMat],
      );
      plate.position.y = -3;
      plate.receiveShadow = true;
      scene.add(plate);
      const axes = new THREE.AxesHelper(38);
      axes.position.set(-116, 0.5, -116);
      scene.add(axes);

      // Instance group + shared filament material (vertex-colored)
      const instGroup = new THREE.Group();
      scene.add(instGroup);
      sceneRef.current = instGroup;

      const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.03, vertexColors: true });
      materialRef.current = material;

      // Item-level orientation — ALL instances share one baked geometry
      const orient = item.orient ?? (item.geom ? layFlatFlip(item.geom.bbox) : 'none');

      // Selection footprint box (unit rect in XZ, scaled per instance)
      const selBox = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 6, 1)),
        new THREE.LineBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.95 }),
      );
      selBox.position.y = 3;
      selBox.visible = false;
      scene.add(selBox);
      selBoxRef.current = selBox;

      // Camera / orbit state
      const target = new THREE.Vector3(0, 24, 0);
      let theta = HOME.theta, phi = HOME.phi;
      let dirty = true;
      const halfFov = Math.tan((FOV * Math.PI) / 360);
      const plateFitDist = ((PLATE_SIZE * Math.SQRT2) / 2 / halfFov) * 1.04;
      let radius = plateFitDist;

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
        const mine = propsRef.current.instances.filter((i) => i.plate === propsRef.current.activePlate);
        if (mine.length === 1 && modelRadiusRef.current) {
          // single instance — frame it prominently, however small it is (a tiny
          // import must become visible; clampR's R_MIN is the only floor)
          const s = normalizeScale(propsRef.current.item);
          const so = propsRef.current.scaleOverride;
          const m = Math.max(s.x, s.y, s.z, ...(so ? [so.x, so.y, so.z] : []));
          const r = modelRadiusRef.current * m;
          radius = clampR((r / halfFov) * 1.5);
          target.y = 24;
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

      // Base geometry builder (session cache → IndexedDB revival)
      const buildBase = (tris: Float64Array, count: number): THREE.BufferGeometry | null => {
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
        modelRadiusRef.current = Math.hypot(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) / 2 || 1;
        geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
        return geo;
      };

      const cached = sessionMeshCache.get(item.id);
      orientRef.current = orient;
      if (cached && cached.count > 0) {
        const base = buildBase(cached.tris, cached.count);
        if (base) {
          rawGeoRef.current = base; // kept raw — orientation bakes lazily in the sync effect
          setMeshEpoch((e) => e + 1);
        }
      } else if (item.source === 'upload' && item.fileName) {
        // Revival — reload the binary from the IndexedDB files store
        void (async () => {
          try {
            const blob = await getShelfFile(item.id);
            if (!blob || disposed) return;
            const parsed = await readStlMesh(blob);
            if (disposed) return;
            sessionMeshCache.set(item.id, { tris: parsed.tris, count: parsed.count });
            // Self-heal: items imported before the volume-precision fix carry a
            // stored volumeMm3 of 0 (sub-0.05 mm³ round wipeout) — repair the
            // geom from the freshly parsed mesh so pricing works again
            if (item.geom && item.geom.volumeMm3 === 0 && parsed.volumeMm3 > 0) {
              void saveShelfItem({
                ...item,
                geom: { ...item.geom, volumeMm3: parsed.volumeMm3, surfaceMm2: parsed.surfaceMm2 },
                updatedAt: Date.now(),
              });
            }
            const base = buildBase(parsed.tris, parsed.count);
            if (base && !disposed) {
              rawGeoRef.current = base;
              setMeshEpoch((e) => e + 1);
            }
          } catch {
            /* best-effort — plate still renders */
          }
        })();
      }

      // ── Pointer interaction: pick instances, drag-move, orbit empty space ──
      const raycaster = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      const planeY0 = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const hit = new THREE.Vector3();

      const setNdc = (e: PointerEvent | WheelEvent) => {
        const r = el.getBoundingClientRect();
        ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
        ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      };
      const planePoint = (): THREE.Vector3 | null => {
        raycaster.setFromCamera(ndc, camera);
        return raycaster.ray.intersectPlane(planeY0, hit) ? hit.clone() : null;
      };

      let lastX = 0, lastY = 0;
      const onDown = (e: PointerEvent) => {
        // The on-model gizmo owns the pointer when a handle is hovered/dragged
        if (tcRef.current && (tcRef.current.dragging || tcRef.current.axis !== null)) return;
        el.setPointerCapture(e.pointerId);
        lastX = e.clientX; lastY = e.clientY;
        setNdc(e);
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(instGroup.children, false);
        if (hits.length > 0) {
          const mesh = hits[0].object as THREE.Mesh;
          const id = mesh.userData.instanceId as string;
          cbRef.current.onSelectInstance(id);
          const p = planePoint();
          const inst = propsRef.current.instances.find((i) => i.id === id);
          if (p && inst) {
            dragModeRef.current = 'move';
            dragIdRef.current = id;
            grabOffsetRef.current = { x: inst.x - p.x, z: inst.z - p.z };
            el.style.cursor = 'grabbing';
            return;
          }
        }
        dragModeRef.current = 'orbit';
        el.style.cursor = 'grabbing';
      };
      const onMove = (e: PointerEvent) => {
        if (dragModeRef.current === 'none' || gizmoBusyRef.current) return;
        if (dragModeRef.current === 'move') {
          if (propsRef.current.interaction === 'rotate') {
            // Rotate tool — horizontal drag spins the grabbed instance
            const dx = e.clientX - lastX;
            lastX = e.clientX;
            lastY = e.clientY;
            const inst = propsRef.current.instances.find((i) => i.id === dragIdRef.current);
            if (inst && dx !== 0) cbRef.current.onRotateInstance?.(inst.id, inst.rotY + dx * 0.4);
            return;
          }
          setNdc(e);
          const p = planePoint();
          const inst = propsRef.current.instances.find((i) => i.id === dragIdRef.current);
          if (p && inst) {
            const next = clampToPlate(
              { ...inst, x: p.x + grabOffsetRef.current.x, z: p.z + grabOffsetRef.current.z },
              propsRef.current.item.geom?.bbox ?? { x: 10, y: 10, z: 10 },
              orientRef.current,
            );
            cbRef.current.onMoveInstance(inst.id, next.x, next.z);
          }
          return;
        }
        // orbit
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        theta += dx * 0.005;
        phi = Math.min(1.45, Math.max(0.12, phi - dy * 0.005));
        dirty = true;
      };
      const onUp = (e: PointerEvent) => {
        dragModeRef.current = 'none';
        dragIdRef.current = null;
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

      // ── On-model gizmo (Bambu-style): translate arrows / rotation ring /
      //    scale handles on the selected instance ──
      const tc = new TransformControls(camera, el);
      tc.size = 0.85;
      const gizmoHelper = tc.getHelper();
      scene.add(gizmoHelper);
      tc.addEventListener('dragging-changed', (e) => {
        const active = Boolean((e as unknown as { value: boolean }).value);
        gizmoBusyRef.current = active;
        el.style.cursor = active ? 'grabbing' : 'grab';
        if (!active) {
          const mesh = tc.object as THREE.Mesh | null;
          // Scale drag ends here — convert the proxy deltas into item factors
          if (tc.mode === 'scale' && mesh) {
            const r = { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z };
            mesh.scale.set(1, 1, 1);
            if (Math.abs(r.x - 1) > 1e-4 || Math.abs(r.y - 1) > 1e-4 || Math.abs(r.z - 1) > 1e-4) {
              cbRef.current.onGizmoScale?.(r);
            }
            kick();
          }
        }
      });
      tc.addEventListener('objectChange', () => {
        const mesh = tc.object as THREE.Mesh | null;
        if (!mesh) return;
        const id = mesh.userData.instanceId as string;
        const cur = propsRef.current;
        const inst = cur.instances.find((i) => i.id === id);
        if (tc.mode === 'translate' && inst) {
          const bb = cur.item.geom ? effectiveGeom({ geom: cur.item.geom, scale: cur.scaleOverride ?? normalizeScale(cur.item) }).bbox : { x: 10, y: 10, z: 10 };
          const or = cur.item.orient ?? (cur.item.geom ? layFlatFlip(cur.item.geom.bbox) : 'none');
          const clamped = clampToPlate({ ...inst, x: mesh.position.x, z: mesh.position.z }, bb, or);
          mesh.position.x = clamped.x;
          mesh.position.z = clamped.z;
          cbRef.current.onMoveInstance(id, clamped.x, clamped.z);
        } else if (tc.mode === 'rotate' && inst) {
          const deg = Math.round((mesh.rotation.y * 180) / Math.PI);
          cbRef.current.onRotateInstance?.(id, ((deg % 360) + 360) % 360);
        }
        // scale mode: the mesh.scale itself is the live preview — committed on drag end
        kick();
      });
      tcRef.current = tc;

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

      let raf = 0;
      const tick = () => {
        raf = requestAnimationFrame(tick);
        if (!dirty) return;
        dirty = false;
        applyCamera();
        renderer.render(scene, camera);
      };
      tick();

      // Ensure a render happens whenever React syncs the scene
      const kick = () => {
        dirty = true;
      };
      kickRef.current = kick;

      readyRef.current?.({ fit, reset });

      // Debug handle (project convention) — lets probes read camera state
      (window as unknown as Record<string, unknown>).__stanPlateView = {
        fit,
        reset,
        state: () => ({
          radius: Math.round(radius),
          theta: +theta.toFixed(2),
          phi: +phi.toFixed(2),
          hasModel: Boolean(modelRadiusRef.current),
          instances: instGroup.children.length,
        }),
        instancesDetailed: () =>
          instGroup.children.map((m) => ({
            x: Math.round((m as THREE.Mesh).position.x * 100) / 100,
            z: Math.round((m as THREE.Mesh).position.z * 100) / 100,
            rotY: Math.round(((m as THREE.Mesh).rotation.y * 180) / Math.PI),
          })),
        // Real RENDERED mesh size in mm (post scale+orient bake) — reads the
        // geometry the instance meshes actually reference, so it proves the
        // MODEL resized, not just the numbers
        meshBBox: () => {
          const first = instGroup.children[0] as THREE.Mesh | undefined;
          const geo = first?.geometry ?? bakedRef.current?.geo;
          if (!geo) return null;
          geo.computeBoundingBox();
          const bb = geo.boundingBox;
          if (!bb) return null;
          return {
            x: Math.round((bb.max.x - bb.min.x) * 100) / 100,
            y: Math.round((bb.max.y - bb.min.y) * 100) / 100,
            z: Math.round((bb.max.z - bb.min.z) * 100) / 100,
          };
        },
        gizmo: () =>
          tcRef.current
            ? { mode: tcRef.current.mode, attached: Boolean(tcRef.current.object), axis: tcRef.current.axis, busy: gizmoBusyRef.current }
            : null,
        // Drives the same commit path a scale-handle drag uses (E2E)
        applyGizmoScale: (r: { x: number; y: number; z: number }) => {
          cbRef.current.onGizmoScale?.(r);
        },
      };

      return () => {
        disposed = true;
        kickRef.current = null;
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
        bakedRef.current?.geo.dispose();
        rawGeoRef.current?.dispose();
        plateTex.dispose();
        renderer.dispose();
        tcRef.current?.detach();
        tcRef.current?.dispose();
        gizmoHelper.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.geometry) m.geometry.dispose();
          const mat = m.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else mat?.dispose();
        });
        scene.remove(gizmoHelper);
        tcRef.current = null;
        el.remove();
        sceneRef.current = null;
        rawGeoRef.current = null;
        bakedRef.current = null;
        materialRef.current = null;
        selBoxRef.current = null;
        delete (window as unknown as Record<string, unknown>).__stanPlateView;
      };
    } catch {
      setFailed(true);
    }
  }, [item.id]);

  // ── React → scene sync: instances, selection box, filament colors ──
  useEffect(() => {
    const group = sceneRef.current;
    const material = materialRef.current;
    const selBox = selBoxRef.current;
    if (!group || !material || !selBox) return;

    // Lazy (re)bake — orientation AND scale are item-level; a change re-bakes
    // the shared geometry (scale applies on the raw axes, then the flip).
    const wantOrient: Orient = item.orient ?? (item.geom ? layFlatFlip(item.geom.bbox) : 'none');
    const wantScale = scaleOverride ?? normalizeScale(item);
    orientRef.current = wantOrient;
    let baked = bakedRef.current;
    const scaleChanged =
      !baked || baked.orient !== wantOrient ||
      baked.scale.x !== wantScale.x || baked.scale.y !== wantScale.y || baked.scale.z !== wantScale.z;
    if (rawGeoRef.current && scaleChanged) {
      baked?.geo.dispose();
      baked = { orient: wantOrient, scale: wantScale, geo: bakeFlip(rawGeoRef.current, wantOrient, wantScale) };
      bakedRef.current = baked;
    }
    if (!baked) return;
    const baseGeo = baked.geo;

    // Filament colors onto the shared baked geometry
    const prim = colors.primary || filamentColor(item.params.primaryColor).hex;
    const sec = colors.secondary;
    applyFilamentColors(baseGeo, prim, sec);

    // Sync instance meshes for the ACTIVE plate
    const keep = new Set<string>();
    for (const inst of instances) {
      if (inst.plate !== activePlate) continue;
      keep.add(inst.id);
      let mesh = group.children.find((c) => (c as THREE.Mesh).userData?.instanceId === inst.id) as THREE.Mesh | undefined;
      if (!mesh) {
        mesh = new THREE.Mesh(baseGeo, material);
        mesh.castShadow = true;
        mesh.userData.instanceId = inst.id;
        group.add(mesh);
      }
      // A rebake (orientation / scale change) produces a NEW shared geometry —
      // existing meshes MUST swap onto it or they keep rendering the old size
      if (mesh.geometry !== baseGeo) mesh.geometry = baseGeo;
      // The baked geometry already carries the item scale — gizmo scale-drag
      // previews live in mesh.scale and is reset once committed
      mesh.scale.set(1, 1, 1);
      mesh.position.set(inst.x, 0, inst.z);
      mesh.rotation.y = (inst.rotY * Math.PI) / 180;
    }
    // Remove meshes that vanished (deleted / other plate)
    for (const child of [...group.children]) {
      if (!keep.has((child as THREE.Mesh).userData?.instanceId)) group.remove(child);
    }

    // Selection footprint box (effective — scaled — bbox)
    const sel = instances.find((i) => i.id === selectedInstanceId && i.plate === activePlate);
    if (sel) {
      const bbox = effectiveGeom({ geom: item.geom, scale: scaleOverride ?? normalizeScale(item) }).bbox;
      const fp = flipFootprint(bbox, orientRef.current);
      const a = rotatedFootprint(fp.w, fp.d, sel.rotY);
      selBox.scale.set(Math.max(a.w + 3, 6), 1, Math.max(a.d + 3, 6));
      selBox.position.set(sel.x, 3, sel.z);
      selBox.userData.instanceId = sel.id;
      (selBox.material as THREE.LineBasicMaterial).color.set(collision ? 0xef4444 : 0x34d399);
      selBox.visible = true;
    } else {
      selBox.visible = false;
    }

    kickRef.current?.();
  }, [instances, activePlate, selectedInstanceId, collision, colors, meshEpoch, item, scaleOverride]);

  // ── Gizmo attach + mode: follows the active tool and instance selection ──
  useEffect(() => {
    const tc = tcRef.current;
    const group = sceneRef.current;
    if (!tc || !group) return;
    const mesh = selectedInstanceId
      ? (group.children.find((c) => (c as THREE.Mesh).userData?.instanceId === selectedInstanceId) as THREE.Mesh | undefined)
      : undefined;
    if (mesh) {
      tc.attach(mesh);
      tc.setMode(interaction === 'move' ? 'translate' : interaction);
      // Rotate = yaw only (single ring around the plate normal); move = plate
      // plane only; scale = all three axes
      tc.showX = interaction !== 'rotate';
      tc.showY = interaction === 'rotate' || interaction === 'scale';
      tc.showZ = interaction !== 'rotate';
    } else {
      tc.detach();
    }
    kickRef.current?.();
  }, [interaction, selectedInstanceId, instances, activePlate, meshEpoch]);

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

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { sessionMeshCache } from '../../lib/stlThumb';
import type { ShelfItem } from '../../lib/stlHub';

/**
 * Bambu-style 3D build-plate viewport (WebGL): perspective orbit camera,
 * textured 256×256 mm A1 plate as a real 3D object, the parsed mesh sitting
 * on it at true millimetre scale with real shadowing. Drag = orbit,
 * wheel = zoom, double-click = reset view. Renders on demand (dirty flag).
 */

const PLATE = 256;
const HOME = { theta: Math.PI / 4, phi: 0.95 };

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

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

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
    const camera = new THREE.PerspectiveCamera(40, 1, 1, 5000);

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
      } else {
        geo.dispose();
      }
    }

    // Orbit state + camera
    const target = new THREE.Vector3(0, 24, 0);
    let theta = HOME.theta, phi = HOME.phi;
    const fitDist = ((PLATE * Math.SQRT2) / 2 / Math.tan((40 * Math.PI) / 360)) * 1.22;
    let radius = Math.min(1400, Math.max(130, fitDist));
    let dirty = true;
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
      radius = Math.min(1400, Math.max(130, radius * (e.deltaY < 0 ? 0.9 : 1 / 0.9)));
      dirty = true;
    };
    const onDbl = () => {
      theta = HOME.theta;
      phi = HOME.phi;
      radius = Math.min(1400, Math.max(130, fitDist));
      dirty = true;
    };
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
    };
  }, [item.id]);

  return <div ref={hostRef} className={`min-h-0 w-full ${className}`} />;
}

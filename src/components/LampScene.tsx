import { useEffect, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Grid, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { LampConfig } from '../engine/types';
import type { BuiltLamp, ProcessedArtwork } from '../engine/lampPipeline';
import { computeEnclosureDims } from '../engine/enclosureSynthesizer';

/**
 * Dual-viewport scenes for the Shadow Lamp Studio, matching the reference
 * tool: a clean neutral CAD inspection view and an immersive darkroom wall
 * projection with amber leak rays, plus the flat print-bed layout.
 */

function trianglesToGeometry(tris: Float32Array): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(tris.slice(), 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function LampBody({ built, ledGlow, matte = false }: { built: BuiltLamp; ledGlow: boolean; matte?: boolean }) {
  const geometries = useMemo(
    () => built.enclosure.parts.map((part) => trianglesToGeometry(part.assembled)),
    [built],
  );
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);
  return (
    <group>
      {geometries.map((geometry, i) => (
        <mesh key={i} geometry={geometry}>
          {matte ? (
            <meshStandardMaterial color="#dcd9d2" roughness={0.95} metalness={0} flatShading />
          ) : (
            <meshStandardMaterial color="#ece9e1" roughness={0.86} metalness={0.02} />
          )}
        </mesh>
      ))}
      {ledGlow && (
        <>
          <mesh>
            <sphereGeometry args={[2.4, 16, 16]} />
            <meshBasicMaterial color="#ffe9c4" />
          </mesh>
          <pointLight intensity={0.55} decay={0} color="#ffd9a0" distance={0} />
        </>
      )}
    </group>
  );
}

function LeakRays({ built }: { built: BuiltLamp }) {
  const geometry = useMemo(() => {
    const rays = built.enclosure.leakRays;
    if (rays.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(rays.slice(), 3));
    return g;
  }, [built]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#ffb14d" transparent opacity={0.3} />
    </lineSegments>
  );
}

function ShadowProjector({
  artwork,
  zWall,
  wallSpan,
}: {
  artwork: ProcessedArtwork | null;
  zWall: number;
  wallSpan: number;
}) {
  const targetRef = useRef<THREE.Object3D>(new THREE.Object3D());
  const texture = useMemo(() => {
    if (!artwork) return null;
    const tex = new THREE.CanvasTexture(artwork.spotlightCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, [artwork]);
  useEffect(() => () => texture?.dispose(), [texture]);
  if (!texture) return null;
  return (
    <>
      <primitive object={targetRef.current} position={[0, 0, zWall]} />
      <spotLight
        position={[0, 0, 0]}
        target={targetRef.current}
        angle={Math.atan2(wallSpan * 0.62, zWall) + 0.08}
        penumbra={0.12}
        intensity={2.6}
        decay={0}
        distance={0}
        color="#ffdfae"
        map={texture}
      />
    </>
  );
}

/** Left card — clean CAD inspection: matte geometry, neutral even lighting. */
export function CadScene({ config, built }: { config: LampConfig; built: BuiltLamp }) {
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [190, 95, 235], fov: 38, near: 1, far: 4000 }} gl={{ antialias: true }}>
      <color attach="background" args={['#0d0d10']} />
      <hemisphereLight intensity={0.55} color="#ffffff" groundColor="#3a3a42" />
      <directionalLight position={[160, 240, 180]} intensity={1.05} color="#ffffff" />
      <directionalLight position={[-200, 90, -140]} intensity={0.45} color="#cfd6e4" />
      <directionalLight position={[0, -120, 120]} intensity={0.25} color="#9aa2b2" />
      <LampBody built={built} ledGlow={false} matte />
      <ContactShadows
        position={[0, -config.innerHeight / 2 - 0.5, 0]}
        opacity={0.28}
        scale={480}
        blur={2.8}
        far={200}
        color="#000000"
      />
      <OrbitControls makeDefault target={[0, -8, 0]} minDistance={80} maxDistance={900} enableDamping dampingFactor={0.08} />
    </Canvas>
  );
}

/** Real light mode — the printed box with its warm LED glowing, on black. */
export function RealLightScene({ config, built }: { config: LampConfig; built: BuiltLamp }) {
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [150, 70, 230], fov: 38, near: 1, far: 4000 }} gl={{ antialias: true }}>
      <color attach="background" args={['#070708']} />
      <ambientLight intensity={0.1} />
      <directionalLight position={[-140, 200, -120]} intensity={0.35} color="#cfd6e4" />
      <LampBody built={built} ledGlow />
      <pointLight position={[0, 0, 30]} intensity={0.5} decay={0} color="#ffbe6e" />
      <ContactShadows
        position={[0, -config.innerHeight / 2 - 0.5, 0]}
        opacity={0.45}
        scale={480}
        blur={2.6}
        far={200}
        color="#000000"
      />
      <OrbitControls makeDefault target={[0, -8, 0]} minDistance={80} maxDistance={900} enableDamping dampingFactor={0.08} />
    </Canvas>
  );
}

/** Right card — immersive darkroom: real light casting the silhouette onto the wall. */
export function WallScene({ config, built, artwork }: { config: LampConfig; built: BuiltLamp; artwork: ProcessedArtwork | null }) {
  const dims = useMemo(() => computeEnclosureDims(config), [config]);
  const wallSpan = Math.max(config.shadowWidth * 1.35, config.innerWidth * 2.4);
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [-430, 95, -355], fov: 38, near: 1, far: 6000 }} gl={{ antialias: true }}>
      <color attach="background" args={['#070708']} />
      <fog attach="fog" args={['#070708', 700, 1800]} />
      <ambientLight intensity={0.16} />
      <directionalLight position={[-160, 220, -140]} intensity={0.55} color="#ffffff" />
      <directionalLight position={[200, 80, 160]} intensity={0.3} color="#cfd6e4" />
      <mesh position={[0, 0, dims.zWall + 6]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[wallSpan * 2.6, wallSpan * 1.8]} />
        <meshStandardMaterial color="#151517" roughness={0.96} metalness={0} />
      </mesh>
      <ShadowProjector artwork={artwork} zWall={dims.zWall + 6} wallSpan={wallSpan} />
      <LeakRays built={built} />
      <LampBody built={built} ledGlow />
      <OrbitControls makeDefault target={[0, -25, dims.zWall * 0.35]} minDistance={60} maxDistance={900} enableDamping dampingFactor={0.08} />
    </Canvas>
  );
}

function FlatPlates({ built, bedSize }: { built: BuiltLamp; bedSize: number }) {
  const laid = useMemo(() => {
    const plates = built.enclosure.parts.map((part) => {
      const geometry = trianglesToGeometry(part.flat);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox as THREE.Box3;
      const s = 1; // printScale handled at pack time below
      return { name: part.name, geometry, w: (box.max.x - box.min.x) * s, d: (box.max.z - box.min.z) * s, box };
    });
    plates.sort((a, b) => b.w * b.d - a.w * a.d);
    const gap = 14;
    const bedW = bedSize - 24;
    let x = 0;
    let z = 0;
    let rowMaxD = 0;
    const placed: Array<{ geometry: THREE.BufferGeometry; x: number; z: number; box: THREE.Box3 }> = [];
    for (const plate of plates) {
      if (x + plate.w > bedW && x > 0) {
        x = 0;
        z += rowMaxD + gap;
        rowMaxD = 0;
      }
      placed.push({ geometry: plate.geometry, x: x + plate.w / 2 - plate.box.max.x, z: z + plate.d / 2 - plate.box.max.z, box: plate.box });
      x += plate.w + gap;
      rowMaxD = Math.max(rowMaxD, plate.d);
    }
    // Center the whole cluster on the bed so the camera frames it cleanly.
    const totalW = Math.min(bedW, Math.max(...placed.map((p) => p.x + p.box.max.x)));
    const totalD = z + rowMaxD;
    for (const p of placed) {
      p.x -= totalW / 2;
      p.z -= totalD / 2;
    }
    return placed;
  }, [built, bedSize]);
  return (
    <group>
      {laid.map((plate, i) => (
        <mesh key={i} geometry={plate.geometry} position={[plate.x, 0.5, plate.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <meshStandardMaterial color="#ece9e1" roughness={0.86} metalness={0.02} />
        </mesh>
      ))}
    </group>
  );
}

/** Print-bed layout view: plates flat, cutouts facing up, spread like the stock tool. */
export function FlatScene({ built, bedSize }: { built: BuiltLamp; bedSize: number }) {
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [40, 620, 300], fov: 40, near: 1, far: 4000 }} gl={{ antialias: true }}>
      <color attach="background" args={['#0d0d10']} />
      <hemisphereLight intensity={0.55} color="#ffffff" groundColor="#3a3a42" />
      <directionalLight position={[60, 420, 110]} intensity={1.35} color="#ffffff" />
      <directionalLight position={[-200, 120, -140]} intensity={0.35} color="#cfd6e4" />
      <Grid
        position={[0, 0, 0]}
        args={[bedSize, bedSize]}
        cellSize={10}
        cellThickness={0.5}
        cellColor="#232327"
        sectionSize={50}
        sectionThickness={1}
        sectionColor="#3a3a41"
        fadeDistance={1600}
        fadeStrength={1.2}
        infiniteGrid={false}
      />
      <FlatPlates built={built} bedSize={bedSize} />
      <OrbitControls makeDefault target={[0, 0, 0]} minDistance={80} maxDistance={1400} enableDamping dampingFactor={0.08} />
    </Canvas>
  );
}

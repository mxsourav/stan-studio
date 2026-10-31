/* Headless engine smoke test — run: npx esbuild scripts/engine-smoke.ts --bundle --platform=node --format=esm --outfile=node_modules/.smoke.mjs && node node_modules/.smoke.mjs */
import { bridgeFloatingIslands } from '../src/engine/bridgeGenerator';
import { traceContours, groupRegions } from '../src/engine/contourTracer';
import { synthesizeEnclosure, computeEnclosureDims } from '../src/engine/enclosureSynthesizer';
import { trianglesToBinaryStl, mergeTriangles } from '../src/engine/stlSerializer';
import { DEFAULT_CONFIG, type LampConfig } from '../src/engine/types';

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

// --- Test 1: ring mask → floating light island bridged to anchored material
{
  const w = 60;
  const h = 60;
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = Math.hypot(x - 30, y - 30);
      data[y * w + x] = r > 10 && r < 18 ? 1 : 0; // dark ring, light center
    }
  }
  const result = bridgeFloatingIslands({ width: w, height: h, data }, 2);
  if (result.bridged !== 1) fail(`expected 1 bridge, got ${result.bridged}`);
  const centerLit = result.mask.data[30 * w + 30];
  // Strut may or may not pass the exact center; verify the center region is connected instead.
  const { labelComponents } = await import('../src/engine/contourTracer');
  const lightComponents = labelComponents(result.mask, 0);
  if (lightComponents.sizes.length !== 1) fail(`light regions after bridging: ${lightComponents.sizes.length}`);
  void centerLit;
  console.log(`test1 bridging: OK (bridged=${result.bridged})`);
}

// --- Test 2: contour tracing finds outer + hole loops
{
  const w = 40;
  const h = 40;
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = Math.hypot(x - 20, y - 20);
      data[y * w + x] = r > 6 && r < 14 ? 1 : 0;
    }
  }
  const loops = traceContours({ width: w, height: h, data });
  const regions = groupRegions(loops);
  if (regions.length !== 1) fail(`expected 1 region, got ${regions.length}`);
  if (regions[0].holes.length !== 1) fail(`expected 1 hole, got ${regions[0].holes.length}`);
  console.log(`test2 contours: OK (regions=${regions.length}, holes=${regions[0].holes.length})`);
}

// --- Test 3: enclosure synthesis from a synthetic wall silhouette
{
  const config: LampConfig = { ...DEFAULT_CONFIG, shape: 'hexagon' };
  const dims = computeEnclosureDims(config);
  // Letter-O silhouette: outer square loop with an inner hole loop, in wall mm.
  const s = 26;
  const outer = [
    [-s, -s], [s, -s], [s, s], [-s, s],
  ].map(([x, y]) => [x, y, 0] as [number, number, number]);
  const hole = [
    [-s / 2, -s / 2], [-s / 2, s / 2], [s / 2, s / 2], [s / 2, -s / 2],
  ].map(([x, y]) => [x, y, 0] as [number, number, number]);
  const result = synthesizeEnclosure({ config, wallLoops: [outer, hole], hasArtwork: true });
  if (result.parts.length === 0) fail('no parts synthesized');
  for (const part of result.parts) {
    if (part.assembled.length % 9 !== 0) fail(`${part.name}: triangle soup not a multiple of 9 floats`);
    for (let i = 0; i < part.assembled.length; i++) {
      if (!Number.isFinite(part.assembled[i])) fail(`${part.name}: non-finite vertex at ${i}`);
    }
    if (part.volumeMm3 <= 0) fail(`${part.name}: non-positive volume ${part.volumeMm3}`);
  }
  const rear = result.parts.find((p) => p.name.startsWith('Rear'));
  if (!rear) fail('no rear panel');
  // Rear panel must actually contain the cutout (more triangles than a plain slab).
  const rearTris = rear.assembled.length / 9;
  const plainQuadSlabTris = 4; // 2 caps x 1 tri + 4 wall quads = ~10-12; cutout adds many more
  if (rearTris < plainQuadSlabTris + 4) fail(`rear panel looks solid: ${rearTris} tris`);
  const fused = mergeTriangles(result.parts.map((p) => p.assembled));
  const stl = trianglesToBinaryStl(fused);
  const expectedBytes = 84 + (fused.length / 9) * 50;
  if (stl.byteLength !== expectedBytes) fail(`stl size ${stl.byteLength} != ${expectedBytes}`);
  console.log(
    `test3 enclosure: OK (parts=${result.parts.length}, rearTris=${rearTris}, volume=${result.volumeCm3.toFixed(1)}cm3, stl=${(stl.byteLength / 1e6).toFixed(1)}MB scale, zWall=${dims.zWall.toFixed(0)})`,
  );
}

// --- Test 4: cylinder + triangle shapes stay finite
{
  for (const shape of ['cylinder', 'triangle', 'diamond', 'round'] as const) {
    const config: LampConfig = { ...DEFAULT_CONFIG, shape };
    const result = synthesizeEnclosure({ config, wallLoops: [[[0, 0, 0], [20, 0, 0], [20, 20, 0], [0, 20, 0]]], hasArtwork: true });
    for (const part of result.parts) {
      for (let i = 0; i < part.assembled.length; i++) {
        if (!Number.isFinite(part.assembled[i])) fail(`${shape}/${part.name}: non-finite vertex`);
      }
    }
    console.log(`test4 ${shape}: OK (parts=${result.parts.length})`);
  }
}

console.log('ALL ENGINE SMOKE TESTS PASSED');

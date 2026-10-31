import { ShapeUtils, Vector2, Vector3, Matrix4 } from 'three';
import type { BomResult, LampConfig, LampWarning, Point, Vec3 } from './types';
import { SHAPE_SIDES } from './types';
import { projectContourToPanel, type PanelPlane } from './rayProjector';

/**
 * Enclosure synthesizer. Turns a wall-space silhouette into a fully
 * parametric lamp body: perimeter panels with inverse-perspective cutouts,
 * a trenched base plate, the central hollow 5 mm LED wire-routing post, and
 * a rear keyhole wall-mount slot. Every part is emitted twice — once in its
 * flat print orientation, once assembled in world space.
 */

export interface LampPart {
  name: string;
  /** Print orientation: lies flat in XY, thickness along Z. */
  flat: Float32Array;
  /** Assembled world-space orientation. */
  assembled: Float32Array;
  volumeMm3: number;
}

export interface EnclosureResult {
  parts: LampPart[];
  warnings: LampWarning[];
  volumeCm3: number;
  /** % of wall silhouette samples whose rays clear every panel (light leak). */
  leakPct: number;
  /** Segments (LED → wall point) for rays that escape the panels, for the amber 3D overlay. */
  leakRays: Float32Array;
  dims: {
    depth: number;
    panelH: number;
    floorTopY: number;
    ledY: number;
    zWall: number;
    /** wall-mm → panel-mm scale factor for the rear panel. */
    scale: number;
    rearEdgeLen: number;
  };
}

const LED_POST_OUTER_R = 2.5;
const LED_POST_INNER_R = 1.6;
const TRENCH_HALF_WIDTH = 3;
const KEYHOLE_CIRCLE_R = 4;
const KEYHOLE_SLOT_HALF_W = 1.5;
const KEYHOLE_SLOT_LEN = 12;
const PANEL_CLIP_INSET = 1.5;

// ---------------------------------------------------------------- primitives

function shoelace(points: Point[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function ensureWinding(outline: Point[], holes: Point[][]): { outline: Point[]; holes: Point[][] } {
  const outer = shoelace(outline) < 0 ? [...outline].reverse() : outline;
  const fixedHoles = holes.map((h) => (shoelace(h) > 0 ? [...h].reverse() : h));
  return { outline: outer, holes: fixedHoles };
}

interface Slab {
  tris: Float32Array;
  volumeMm3: number;
}

/**
 * Builds a solid slab from an outline with holes, extruded `thickness` along
 * +Z. Outline must be simple; holes must not touch it (callers guarantee a
 * material margin around every hole).
 */
export function buildSlab(outlineIn: Point[], holesIn: Point[][], thickness: number): Slab | null {
  if (outlineIn.length < 3 || thickness <= 0) return null;
  const { outline, holes } = ensureWinding(outlineIn, holesIn);
  const contour = outline.map((p) => new Vector2(p.x, p.y));
  const holeVecs = holes.map((h) => h.map((p) => new Vector2(p.x, p.y)));
  let faces: number[][];
  try {
    faces = ShapeUtils.triangulateShape(
      contour.map((p) => p.clone()),
      holeVecs.map((h) => h.map((p) => p.clone())),
    );
  } catch {
    return null;
  }
  if (faces.length === 0) return null;

  const verts: Point[] = [...outline, ...holes.flat()];
  const tris: number[] = [];
  const pushTri = (a: Point, b: Point, c: Point): void => {
    tris.push(a.x, a.y, 0, b.x, b.y, 0, c.x, c.y, 0);
  };
  // Top cap (z = thickness): reuse the triangulation lifted in z.
  for (const [i, j, k] of faces) {
    const a = verts[i];
    const b = verts[j];
    const c = verts[k];
    tris.push(a.x, a.y, thickness, c.x, c.y, thickness, b.x, b.y, thickness);
  }
  // Bottom cap (z = 0), flipped.
  for (const [i, j, k] of faces) {
    const a = verts[i];
    const b = verts[j];
    const c = verts[k];
    pushTri(a, b, c);
  }
  // Side walls along the outline and every hole.
  const addWalls = (loop: Point[]): void => {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      tris.push(a.x, a.y, 0, b.x, b.y, 0, b.x, b.y, thickness);
      tris.push(a.x, a.y, 0, b.x, b.y, thickness, a.x, a.y, thickness);
    }
  };
  addWalls(outline);
  for (const h of holes) addWalls(h);

  const area = Math.abs(shoelace(outline)) - holes.reduce((s, h) => s + Math.abs(shoelace(h)), 0);
  return { tris: new Float32Array(tris), volumeMm3: area * thickness };
}

function applyMatrix(tris: Float32Array, m: Matrix4): Float32Array {
  const out = new Float32Array(tris.length);
  const e = m.elements;
  for (let i = 0; i < tris.length; i += 3) {
    const x = tris[i];
    const y = tris[i + 1];
    const z = tris[i + 2];
    out[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
    out[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    out[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
  }
  return out;
}

/** Sutherland–Hodgman clip keeping the half-plane ax + by <= c (convex result). */
function clipToHalfPlane(poly: Point[], a: number, b: number, c: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const dp = a * p.x + b * p.y - c;
    const dq = a * q.x + b * q.y - c;
    if (dp <= 0) out.push(p);
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
      const t = dp / (dp - dq);
      out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    }
  }
  return out;
}

// ----------------------------------------------------------------- footprint

export function footprintPolygon(shape: LampConfig['shape'], innerWidth: number): Point[] {
  const sides = SHAPE_SIDES[shape];
  if (shape === 'rectangle') {
    const depth = Math.round(Math.min(140, Math.max(45, innerWidth * 0.62)));
    const w = innerWidth / 2;
    const d = depth / 2;
    // CCW in the xz plane (x right, z up when viewed from above).
    return [
      { x: -w, y: -d },
      { x: w, y: -d },
      { x: w, y: d },
      { x: -w, y: d },
    ];
  }
  const apothem = innerWidth / 2;
  const radius = apothem / Math.cos(Math.PI / sides);
  const pts: Point[] = [];
  for (let k = 0; k < sides; k++) {
    const angle = Math.PI / 2 + Math.PI / sides + (2 * Math.PI * k) / sides;
    pts.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
  }
  return pts;
}

interface Edge {
  a: Point;
  b: Point;
  length: number;
  mid: Point;
  normal: [number, number]; // outward in xz
}

function footprintEdges(poly: Point[]): Edge[] {
  let cx = 0;
  let cy = 0;
  for (const p of poly) {
    cx += p.x;
    cy += p.y;
  }
  cx /= poly.length;
  cy /= poly.length;
  const edges: Edge[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    let nx = dy / len;
    let ny = -dx / len;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if ((mid.x - cx) * nx + (mid.y - cy) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    edges.push({ a, b, length: len, mid, normal: [nx, ny] });
  }
  return edges;
}

// ------------------------------------------------------------------- keyhole

function keyholePolygon(circleCY: number): Point[] {
  const pts: Point[] = [];
  const theta = Math.asin(KEYHOLE_SLOT_HALF_W / KEYHOLE_CIRCLE_R);
  // Slot bottom-right, arc up and over the circle, slot top-left, slot bottom.
  pts.push({ x: KEYHOLE_SLOT_HALF_W, y: circleCY - KEYHOLE_SLOT_LEN });
  pts.push({ x: KEYHOLE_SLOT_HALF_W, y: circleCY - KEYHOLE_CIRCLE_R * Math.cos(theta) });
  for (let s = 0; s <= 24; s++) {
    const a = theta + ((Math.PI - 2 * theta) * s) / 24;
    pts.push({ x: KEYHOLE_CIRCLE_R * Math.cos(a), y: circleCY + KEYHOLE_CIRCLE_R * Math.sin(a) });
  }
  pts.push({ x: -KEYHOLE_SLOT_HALF_W, y: circleCY - KEYHOLE_CIRCLE_R * Math.cos(theta) });
  pts.push({ x: -KEYHOLE_SLOT_HALF_W, y: circleCY - KEYHOLE_SLOT_LEN });
  return pts;
}

// ------------------------------------------------------------------ assembly

function panelBasis(normalXZ: [number, number]): { uAxis: Vec3; vAxis: Vec3; normal: Vec3 } {
  const n: Vec3 = [normalXZ[0], 0, normalXZ[1]];
  // Right-handed frame: u = up × n keeps uAxis × vAxis == normal.
  const u: Vec3 = [n[2], 0, -n[0]];
  return { uAxis: u, vAxis: [0, 1, 0], normal: n };
}

export interface EnclosureInput {
  config: LampConfig;
  /** Closed silhouette loops on the wall plane (mm, centered on the LED axis). */
  wallLoops: Vec3[][];
  hasArtwork: boolean;
}

export interface EnclosureDims {
  depth: number;
  panelH: number;
  floorTopY: number;
  ledY: number;
  zWall: number;
  /** wall-mm → panel-mm scale factor at the rear panel. */
  scale: number;
  rearEdgeLen: number;
}

export function computeEnclosureDims(config: LampConfig): EnclosureDims {
  const poly = footprintPolygon(config.shape, config.innerWidth);
  const edges = footprintEdges(poly);
  const depth =
    config.shape === 'rectangle'
      ? Math.round(Math.min(140, Math.max(45, config.innerWidth * 0.62)))
      : config.innerWidth;
  const panelH = Math.min(config.panelMaxHeight, config.innerHeight);
  // The LED point source always rides at least 6 mm above the panel rim so
  // the figure crests over the box onto the wall.
  const ledY = Math.min(Math.max(config.ledTubeHeight, panelH + 6), config.innerHeight - 2);
  const rearEdge = edges.reduce((best, e) => (e.mid.y > best.mid.y ? e : best), edges[0]);
  // Flush 90° wall mount: the rear panel stays parallel to the wall plane,
  // separated only by the configured mounting gap.
  const zWall = depth / 2 + Math.max(40, config.wallDistance);
  return {
    depth,
    panelH,
    floorTopY: -ledY,
    ledY,
    zWall,
    scale: depth / 2 / zWall,
    rearEdgeLen: rearEdge.length,
  };
}

export function synthesizeEnclosure(input: EnclosureInput): EnclosureResult {
  const { config, wallLoops, hasArtwork } = input;
  const warnings: LampWarning[] = [];
  const parts: LampPart[] = [];

  const poly = footprintPolygon(config.shape, config.innerWidth);
  const edges = footprintEdges(poly);
  const { depth, panelH, floorTopY, ledY, zWall, scale } = computeEnclosureDims(config);
  const rearEdge = edges.reduce((best, e) => (e.mid.y > best.mid.y ? e : best), edges[0]);
  const led: Vec3 = [0, 0, 0];

  // Wall loops as 3D points.
  const wallPoints: Vec3[][] = wallLoops.map((loop) =>
    loop.map((p) => [p[0], p[1], zWall] as Vec3),
  );

  // ---- panel planes (projection targets for every perimeter edge)
  const planes: PanelPlane[] = edges.map((edge) => {
    const basis = panelBasis(edge.normal);
    return {
      origin: [edge.mid.x, floorTopY, edge.mid.y],
      uAxis: basis.uAxis,
      vAxis: basis.vAxis,
      normal: basis.normal,
      uExtent: edge.length,
      vExtent: panelH,
    };
  });

  // ---- light-leak audit: a silhouette sample escapes when its ray from the
  // LED clears every panel (typically over the rim).
  let leakSamples = 0;
  let totalSamples = 0;
  const leakSegments: number[] = [];
  if (hasArtwork) {
    for (const loop of wallPoints) {
      for (let i = 0; i < loop.length; i += 6) {
        totalSamples++;
        const q = loop[i];
        let covered = false;
        for (const plane of planes) {
          const denom = q[0] * plane.normal[0] + q[1] * plane.normal[1] + q[2] * plane.normal[2];
          if (denom <= 1e-6) continue;
          const planeOffset =
            plane.normal[0] * plane.origin[0] +
            plane.normal[1] * plane.origin[1] +
            plane.normal[2] * plane.origin[2];
          const t = planeOffset / denom;
          if (t <= 0) continue;
          const px = q[0] * t - plane.origin[0];
          const py = q[1] * t - plane.origin[1];
          const pz = q[2] * t - plane.origin[2];
          const u = px * plane.uAxis[0] + py * plane.uAxis[1] + pz * plane.uAxis[2];
          const v = px * plane.vAxis[0] + py * plane.vAxis[1] + pz * plane.vAxis[2];
          if (u >= PANEL_CLIP_INSET && u <= plane.uExtent - PANEL_CLIP_INSET && v >= PANEL_CLIP_INSET && v <= plane.vExtent - PANEL_CLIP_INSET) {
            covered = true;
            break;
          }
        }
        if (!covered) {
          leakSamples++;
          leakSegments.push(0, 0, 0, q[0], q[1], zWall);
        }
      }
    }
  }
  const leakPct = totalSamples > 0 ? (leakSamples / totalSamples) * 100 : 0;
  const leakRays = new Float32Array(leakSegments);

  // ---- perimeter panels
  edges.forEach((edge, edgeIndex) => {
    const plane = planes[edgeIndex];
    const holes: Point[][] = [];
    if (hasArtwork) {
      for (const loop of wallPoints) {
        const res = projectContourToPanel(loop, plane, led, PANEL_CLIP_INSET);
        for (const h of res.holes) holes.push(h);
      }
    }
    // Drop degenerate slivers left by clipping.
    const solidHoles = holes.filter((h) => {
      let a = 0;
      for (let i = 0; i < h.length; i++) {
        const p = h[i];
        const q = h[(i + 1) % h.length];
        a += p.x * q.y - q.x * p.y;
      }
      return Math.abs(a / 2) > 1;
    });

    // Keyhole wall-mount slot on the rear panel's solid top margin.
    const isRear = edge === rearEdge;
    const panelName = isRear ? 'Rear panel (cutout)' : `Panel ${edgeIndex + 1}`;
    if (isRear && panelH >= 45 && edge.length >= 24) {
      const keyholeV = panelH - 10;
      const keyhole = keyholePolygon(keyholeV);
      const overlaps = solidHoles.some((h) =>
        h.some(
          (p) =>
            p.x > -KEYHOLE_CIRCLE_R - 2 &&
            p.x < KEYHOLE_CIRCLE_R + 2 &&
            p.y > keyholeV - KEYHOLE_SLOT_LEN - KEYHOLE_CIRCLE_R - 1 &&
            p.y < keyholeV + KEYHOLE_CIRCLE_R + 1,
        ),
      );
      if (!overlaps) solidHoles.push(keyhole);
      else warnings.push({ code: 'keyhole-skipped', message: 'Keyhole slot skipped — artwork overlaps the top margin.' });
    } else if (isRear) {
      warnings.push({ code: 'keyhole-skipped', message: 'Keyhole slot skipped — panel too small for a secure mount.' });
    }

    const outline: Point[] = [];
    const halfLen = edge.length / 2;
    outline.push({ x: -halfLen, y: 0 });
    outline.push({ x: halfLen, y: 0 });
    outline.push({ x: halfLen, y: panelH });
    outline.push({ x: -halfLen, y: panelH });

    const slab = buildSlab(outline, solidHoles, config.panelThickness);
    if (!slab) return;
    const m = new Matrix4().makeBasis(
      new Vector3(...plane.uAxis),
      new Vector3(...plane.vAxis),
      new Vector3(...plane.normal),
    );
    m.setPosition(plane.origin[0], plane.origin[1], plane.origin[2]);
    parts.push({
      name: panelName,
      flat: slab.tris,
      assembled: applyMatrix(slab.tris, m),
      volumeMm3: slab.volumeMm3,
    });
  });

  if (hasArtwork && leakPct > 0.5) {
    warnings.push({
      code: 'light-leak',
      message: `Figure lost above panel top: ${leakPct.toFixed(0)}% — raise Panel Max Height or shrink the Shadow Width.`,
    });
  }
  if (!hasArtwork) {
    warnings.push({ code: 'no-artwork', message: 'No artwork loaded — panels are solid; load an image in the Artwork tab.' });
  }

  // ---- base plate with a rear wire-exit trench (three convex tiles)
  // Trench: the open strip |x| <= 3 running from just behind the post to the
  // rear edge. The post-mount tile keeps material in front of the trench only.
  const zPostBase = LED_POST_OUTER_R + 0.5;
  const tiles: Array<{ pts: Point[]; name: string }> = [
    { pts: clipToHalfPlane(poly, 1, 0, -TRENCH_HALF_WIDTH), name: 'Base left' },
    { pts: clipToHalfPlane(poly, -1, 0, TRENCH_HALF_WIDTH), name: 'Base right' },
    {
      pts: clipToHalfPlane(clipToHalfPlane(poly, -1, 0, TRENCH_HALF_WIDTH), 0, -1, -zPostBase),
      name: 'Base post mount',
    },
  ];
  for (const tile of tiles) {
    if (tile.pts.length < 3) continue;
    const slab = buildSlab(tile.pts, [], config.floorThickness);
    if (!slab) continue;
    // Floor local frame: x -> world x, y -> world -z, z -> world +y (det + 1).
    const m = new Matrix4().makeBasis(
      new Vector3(1, 0, 0),
      new Vector3(0, 0, -1),
      new Vector3(0, 1, 0),
    );
    parts.push({
      name: tile.name,
      flat: slab.tris,
      assembled: applyMatrix(slab.tris, m),
      volumeMm3: slab.volumeMm3,
    });
  }

  // ---- central hollow LED post (open top and bottom for wiring)
  {
    const h = Math.max(10, ledY);
    const seg = 24;
    const tris: number[] = [];
    const ring = (r: number): Point[] =>
      Array.from({ length: seg }, (_, i) => {
        const a = (2 * Math.PI * i) / seg;
        return { x: r * Math.cos(a), y: r * Math.sin(a) };
      });
    const wall = (r: number, flip: boolean): void => {
      const bottom = ring(r);
      const top = ring(r);
      for (let i = 0; i < seg; i++) {
        const j = (i + 1) % seg;
        const a0 = bottom[i];
        const b0 = bottom[j];
        const a1 = top[i];
        const b1 = top[j];
        if (!flip) {
          tris.push(a0.x, 0, a0.y, b0.x, 0, b0.y, b1.x, h, b1.y);
          tris.push(a0.x, 0, a0.y, b1.x, h, b1.y, a1.x, h, a1.y);
        } else {
          tris.push(a0.x, 0, a0.y, b1.x, h, b1.y, b0.x, 0, b0.y);
          tris.push(a0.x, 0, a0.y, a1.x, h, a1.y, b1.x, h, b1.y);
        }
      }
    };
    wall(LED_POST_OUTER_R, false);
    wall(LED_POST_INNER_R, true);
    const outer = ring(LED_POST_OUTER_R);
    const inner = ring(LED_POST_INNER_R);
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      // Top annulus ring cap.
      tris.push(
        outer[i].x, h, outer[i].y,
        outer[j].x, h, outer[j].y,
        inner[j].x, h, inner[j].y,
      );
      tris.push(
        outer[i].x, h, outer[i].y,
        inner[j].x, h, inner[j].y,
        inner[i].x, h, inner[i].y,
      );
    }
    const flat = new Float32Array(tris.length);
    // Flat orientation: lay the tube down (cyclic axis swap keeps winding).
    for (let i = 0; i < tris.length; i += 3) {
      flat[i] = tris[i + 1];
      flat[i + 1] = tris[i + 2];
      flat[i + 2] = tris[i];
    }
    const volume =
      Math.PI * (LED_POST_OUTER_R ** 2 - LED_POST_INNER_R ** 2) * h;
    // Local tube base y=0 sits on the floor: shift to floorTopY in world.
    const place = new Matrix4().makeTranslation(0, floorTopY, 0);
    parts.push({
      name: 'LED wire post',
      flat,
      assembled: applyMatrix(new Float32Array(tris), place),
      volumeMm3: volume,
    });
  }

  const volumeMm3 = parts.reduce((s, p) => s + p.volumeMm3, 0);
  return {
    parts,
    warnings,
    volumeCm3: volumeMm3 / 1000,
    leakPct,
    leakRays,
    dims: {
      depth,
      panelH,
      floorTopY,
      ledY,
      zWall,
      scale,
      rearEdgeLen: rearEdge.length,
    },
  };
}

export function computeBom(
  volumeCm3: number,
  ratePerGram: number,
  ledCost: number,
  baseFee: number,
  materialLabel: string,
): BomResult {
  const grams = volumeCm3 * 1.24; // solid PLA density, conservative for BOM
  const filamentCost = grams * ratePerGram;
  const lines = [
    { label: 'Base manufacturing fee', detail: 'Machine prep, post-processing & QA', amount: baseFee },
    {
      label: `Filament (${materialLabel})`,
      detail: `${grams.toFixed(0)} g estimated × ₹${ratePerGram.toFixed(2)}/g`,
      amount: filamentCost,
    },
    { label: 'LED hardware kit', detail: 'Warm-white LED strip, wiring, switch', amount: ledCost },
  ];
  return {
    lines,
    total: lines.reduce((s, l) => s + l.amount, 0),
    filamentGrams: grams,
    volumeCm3,
  };
}

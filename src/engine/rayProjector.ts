import type { Point, Vec3 } from './types';

/**
 * Inverse perspective projection. Rays are cast backward from silhouette
 * points on the wall plane toward the central LED point light; each perimeter
 * panel reports the region of itself that the ray fan crosses, which becomes
 * the panel's cutout.
 */

export interface PanelPlane {
  /** UV origin (u = 0, v = 0) in world millimeters. */
  origin: Vec3;
  /** Unit u axis (along the panel edge). */
  uAxis: Vec3;
  /** Unit v axis (panel up direction). */
  vAxis: Vec3;
  /** Unit outward normal. */
  normal: Vec3;
  /** Usable panel span along u. */
  uExtent: number;
  /** Usable panel span along v. */
  vExtent: number;
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export interface ProjectionResult {
  /** Closed polygons in panel UV coordinates (may be empty). */
  holes: Point[][];
}

/** Sutherland–Hodgman clip of a polygon against an axis-aligned rect. */
export function clipPolygonToRect(poly: Point[], minU: number, minV: number, maxU: number, maxV: number): Point[] {
  const clipEdge = (
    input: Point[],
    inside: (p: Point) => boolean,
    intersect: (a: Point, b: Point) => Point,
  ): Point[] => {
    const out: Point[] = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i];
      const b = input[(i + 1) % input.length];
      const aIn = inside(a);
      const bIn = inside(b);
      if (aIn) out.push(a);
      if (aIn !== bIn) out.push(intersect(a, b));
    }
    return out;
  };
  const lerp = (a: Point, b: Point, t: number): Point => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  });
  let p = poly;
  p = clipEdge(p, (q) => q.x >= minU, (a, b) => lerp(a, b, (minU - a.x) / (b.x - a.x)));
  if (p.length === 0) return p;
  p = clipEdge(p, (q) => q.x <= maxU, (a, b) => lerp(a, b, (maxU - a.x) / (b.x - a.x)));
  if (p.length === 0) return p;
  p = clipEdge(p, (q) => q.y >= minV, (a, b) => lerp(a, b, (minV - a.y) / (b.y - a.y)));
  if (p.length === 0) return p;
  p = clipEdge(p, (q) => q.y <= maxV, (a, b) => lerp(a, b, (maxV - a.y) / (b.y - a.y)));
  return p;
}

/**
 * Projects a closed wall-space contour (points on the wall plane, given in 3D
 * millimeters) onto a panel plane and clips the result to the panel rect.
 * Points whose ray runs parallel to or away from the plane are pushed to a
 * large finite distance so the clipped region still forms closed polygons.
 */
export function projectContourToPanel(
  wallPoints: Vec3[],
  plane: PanelPlane,
  led: Vec3,
  inset: number,
): ProjectionResult {
  const planeOffset = dot(plane.normal, plane.origin);
  const ledOffset = dot(plane.normal, led);
  const projected: Point[] = [];
  for (const q of wallPoints) {
    const dir = sub(q, led);
    const denom = dot(dir, plane.normal);
    let t: number;
    if (Math.abs(denom) < 1e-6 || denom < 0) {
      t = 1e5; // parallel or backwards: send to the horizon, clip decides
    } else {
      t = (planeOffset - ledOffset) / denom;
      if (t <= 0 || t > 1e5) t = 1e5;
    }
    const p: Vec3 = [led[0] + dir[0] * t, led[1] + dir[1] * t, led[2] + dir[2] * t];
    const rel = sub(p, plane.origin);
    projected.push({ x: dot(rel, plane.uAxis), y: dot(rel, plane.vAxis) });
  }

  const minU = inset;
  const minV = inset;
  const maxU = plane.uExtent - inset;
  const maxV = plane.vExtent - inset;
  const outside = projected.filter(
    (p) => p.x < -1e4 || p.x > 1e4 || p.y < -1e4 || p.y > 1e4,
  ).length;
  const holes: Point[][] = [];
  if (outside === projected.length) {
    return { holes };
  }
  const clipped = clipPolygonToRect(projected, minU, minV, maxU, maxV);
  if (clipped.length >= 3) holes.push(clipped);
  return { holes };
}

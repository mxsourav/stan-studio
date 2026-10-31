/** Shared geometry types for the shadow-lamp engine. All linear units are millimeters. */

export interface Point {
  x: number;
  y: number;
}

export type Vec3 = [number, number, number];

export const SHAPE_KINDS = [
  'rectangle',
  'cylinder',
  'round',
  'hexagon',
  'octagon',
  'triangle',
  'diamond',
] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  rectangle: 'Rectangle',
  cylinder: 'Cylinder',
  round: 'Round',
  hexagon: 'Hexagon',
  octagon: 'Octagon',
  triangle: 'Triangle',
  diamond: 'Diamond',
};

/** Number of perimeter facets used to approximate each shell. Cylinder stays smooth-ish. */
export const SHAPE_SIDES: Record<ShapeKind, number> = {
  rectangle: 4,
  cylinder: 36,
  round: 12,
  hexagon: 6,
  octagon: 8,
  triangle: 3,
  diamond: 4,
};

export type PrintMaterial = 'pla' | 'petg' | 'abs' | 'asa' | 'tpu';

export const MATERIAL_RATES: Record<PrintMaterial, number> = {
  pla: 3.5,
  petg: 4.2,
  abs: 4.0,
  asa: 4.8,
  tpu: 5.5,
};

export const MATERIAL_LABELS: Record<PrintMaterial, string> = {
  pla: 'PLA',
  petg: 'PETG',
  abs: 'ABS',
  asa: 'ASA',
  tpu: 'TPU',
};

export interface LampConfig {
  shape: ShapeKind;
  /** Inner cavity span across X (60–200). */
  innerWidth: number;
  /** Inner cavity vertical span (60–220). */
  innerHeight: number;
  /** Max height of the perimeter panels (20–200). */
  panelMaxHeight: number;
  /** Panel wall thickness (1.2–3.0). */
  panelThickness: number;
  /** Base slab thickness (2.0–25.0). */
  floorThickness: number;
  /** Height of the central LED carrier tube (30–220); auto-raised to clear panels by 6 mm. */
  ledTubeHeight: number;
  /** Desired silhouette width on the wall, in mm (50–2500). */
  shadowWidth: number;
  /** Desired silhouette height on the wall, in mm (50–2500). */
  shadowHeight: number;
  /** Lamp rear panel to wall gap in mm (100–600); rear panel stays parallel (flush 90° mount). */
  wallDistance: number;
  /** Box center over the figure, % (0–100, stock default 50). */
  boxCenterX: number;
  boxCenterY: number;
  /** Figure scale, % of the shadow size (40–110, stock default 100). */
  figureScale: number;
  /** Print-layout plate size, % (40–100). */
  printScale: number;
  /** 0–255 luminance cut. */
  threshold: number;
  /** Structural strut width (0.6–3.0). */
  strutWidth: number;
  /** Drop silhouette islands smaller than this many pixels. */
  noiseFilter: number;
  /** Chaikin corner-rounding passes over traced contours (0–4). */
  smoothing: number;
  /** Ramer–Douglas–Peucker tolerance in px (0.2–3). */
  pathSimplify: number;
  invert: boolean;
  mirror: boolean;
  material: PrintMaterial;
}

export const DEFAULT_CONFIG: LampConfig = {
  shape: 'rectangle',
  innerWidth: 110,
  innerHeight: 150,
  panelMaxHeight: 48,
  panelThickness: 1.6,
  floorThickness: 3,
  ledTubeHeight: 62,
  shadowWidth: 500,
  shadowHeight: 500,
  wallDistance: 380,
  boxCenterX: 50,
  boxCenterY: 50,
  figureScale: 100,
  printScale: 100,
  threshold: 110,
  strutWidth: 0.8,
  noiseFilter: 24,
  smoothing: 2,
  pathSimplify: 1,
  invert: false,
  mirror: false,
  material: 'pla',
};

export interface BomLine {
  label: string;
  detail: string;
  amount: number;
}

export interface BomResult {
  lines: BomLine[];
  total: number;
  filamentGrams: number;
  volumeCm3: number;
}

export interface LampWarning {
  code: 'light-leak' | 'keyhole-skipped' | 'cutout-clipped' | 'no-artwork';
  message: string;
}

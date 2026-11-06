/**
 * Custom STL Hub — zero-login shelf.
 * One tunable config (materials, infill presets, ₹4–₹4.5/g band, color-mode
 * multipliers + setup floors), the estimate engine (same physics as
 * PrintEstimator), a hand-rolled IndexedDB store (shelf / log / files),
 * hub ticket IDs and WhatsApp commission builders.
 */

// ─── Tunable pricing config ─────────────────────────────────────────────────

export const MATERIALS = [
  { id: 'PLA', density: 1.24 },
  { id: 'PETG', density: 1.27 },
  { id: 'ABS', density: 1.04 },
  { id: 'ASA', density: 1.07 },
  { id: 'TPU', density: 1.21 },
] as const;

export type MaterialId = (typeof MATERIALS)[number]['id'];

export const INFILL_PRESETS = [15, 25, 50, 100] as const;

export interface ColorMode {
  id: string;
  label: string;
  mult: number;
  floor: number; // flat ₹ setup floor, once per line item
}

export const COLOR_MODES: ColorMode[] = [
  { id: 'single', label: 'Single Color', mult: 1.0, floor: 0 },
  { id: 'dual-swap', label: 'Dual-Tone Layer Swap', mult: 1.15, floor: 25 },
  { id: 'split-diy', label: 'Multi-Color DIY Kit', mult: 1.2, floor: 40 },
  { id: 'split-bonded', label: 'Multi-Color Studio Bonded', mult: 1.3, floor: 40 },
];

export const PRICE_PER_G: [number, number] = [4.0, 4.5];
export const FREE_DELIVERY_MIN = 999;
export const MAX_FILE_MB = 30;
export const WA_NUMBER = '918509986008';

// ─── Filament colors (curated maker-studio swatches) ─────────────────────────

export interface FilamentColor {
  id: string;
  name: string;
  hex: string;
}

export const FILAMENT_COLORS: FilamentColor[] = [
  { id: 'matte-charcoal', name: 'Matte Charcoal', hex: '#27272a' },
  { id: 'polar-white', name: 'Polar White', hex: '#f4f4f5' },
  { id: 'industrial-silver', name: 'Industrial Silver', hex: '#a1a1aa' },
  { id: 'signal-red', name: 'Signal Red', hex: '#ef4444' },
  { id: 'bambu-emerald', name: 'Bambu Emerald', hex: '#10b981' },
  { id: 'cobalt-blue', name: 'Cobalt Blue', hex: '#3b82f6' },
  { id: 'cyber-amber', name: 'Cyber Amber', hex: '#f59e0b' },
  { id: 'sunset-orange', name: 'Sunset Orange', hex: '#f97316' },
  { id: 'royal-purple', name: 'Royal Purple', hex: '#8b5cf6' },
  { id: 'silk-gold', name: 'Silk Gold', hex: '#eab308' },
];

export function filamentColor(id: string | null | undefined, fallbackId = 'polar-white'): FilamentColor {
  return FILAMENT_COLORS.find((c) => c.id === id) ?? FILAMENT_COLORS.find((c) => c.id === fallbackId) ?? FILAMENT_COLORS[1];
}

// ─── Build-plate layout engine (multi-plate packing) ─────────────────────────

export const PLATE_SIZE = 256; // A1 build plate edge, mm
export const PLATE_USABLE = 244; // safe printable area inside the clips, mm
export const INSTANCE_GAP = 6; // mandatory brim/nozzle clearance, mm
export const EXTRA_PLATE_FEE = 35; // ₹ per additional build plate

/** One printable instance of a shelf item, placed on a plate. */
export interface PlateInstance {
  id: string;
  plate: number; // 0-based plate index
  x: number; // center X on the plate (mm, plate-centered coords)
  z: number; // center Z on the plate
  rotY: number; // individual yaw in degrees 0–360
  rotX?: number; // individual pitch in degrees 0–360
  rotZ?: number; // individual roll in degrees 0–360
}

/** Item-level orientation: Flip X 90° / Flip Y 90° applied to ALL instances. */
export type Orient = 'none' | 'x' | 'y';

/** Grounded footprint (w × d) and height for an orientation of a bbox — mm. */
export function flipFootprint(bbox: { x: number; y: number; z: number }, orient: Orient | undefined): { w: number; d: number; h: number } {
  const o = orient ?? 'none';
  if (o === 'x') return { w: bbox.x, d: bbox.y, h: bbox.z }; // rotX 90°: depth becomes height
  if (o === 'y') return { w: bbox.z, d: bbox.x, h: bbox.y }; // rotY 90°: width/depth swap
  return { w: bbox.x, d: bbox.z, h: bbox.y };
}

/** Auto-orient: the flip that puts the largest face on the plate (min height). */
export function layFlatFlip(bbox: { x: number; y: number; z: number }): Orient {
  return bbox.z < bbox.y ? 'x' : 'none';
}

/** AABB footprint of a (w × d) rect rotated by rotY degrees. */
export function rotatedFootprint(w: number, d: number, rotY: number): { w: number; d: number } {
  const r = (rotY * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return { w: w * c + d * s, d: w * s + d * c };
}

/** 3D AABB footprint of an instance including full X (pitch), Y (yaw), Z (roll) rotation. */
export function instanceFootprint(
  inst: PlateInstance,
  bbox: { x: number; y: number; z: number },
  orient: Orient | undefined,
): { w: number; d: number } {
  const fp = flipFootprint(bbox, orient);
  const rx = ((inst.rotX ?? 0) * Math.PI) / 180;
  const ry = ((inst.rotY ?? 0) * Math.PI) / 180;
  const rz = ((inst.rotZ ?? 0) * Math.PI) / 180;
  if (!inst.rotX && !inst.rotZ) {
    return rotatedFootprint(fp.w, fp.d, inst.rotY);
  }
  const hx = fp.w / 2, hy = fp.h / 2, hz = fp.d / 2;
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (const vx of [-hx, hx]) {
    for (const vy of [-hy, hy]) {
      for (const vz of [-hz, hz]) {
        const y1 = vy * cx - vz * sx;
        const z1 = vy * sx + vz * cx;
        const x2 = vx * cy + z1 * sy;
        const z2 = -vx * sy + z1 * cy;
        const x3 = x2 * cz - y1 * sz;
        if (x3 < minX) minX = x3;
        if (x3 > maxX) maxX = x3;
        if (z2 < minZ) minZ = z2;
        if (z2 > maxZ) maxZ = z2;
      }
    }
  }
  return { w: Math.max(1, maxX - minX), d: Math.max(1, maxZ - minZ) };
}

/** Auto-size imported models so they land properly sized on the 256×256 plate. */
export function autoProperScale(bbox: { x: number; y: number; z: number }): Scale3 {
  const maxDim = Math.max(bbox.x, bbox.y, bbox.z);
  if (!Number.isFinite(maxDim) || maxDim <= 0) return { x: 1, y: 1, z: 1 };
  if (maxDim > 200) {
    const factor = Math.min(1, 140 / maxDim);
    const r = Math.round(factor * 100) / 100;
    return { x: r, y: r, z: r };
  }
  if (maxDim < 25) {
    const factor = 100 / maxDim;
    const r = Math.round(factor * 10) / 10;
    return { x: r, y: r, z: r };
  }
  return { x: 1, y: 1, z: 1 };
}

/**
 * RETIRED heuristic — parse-time Y-up normalization in stl.ts already lands
 * Z-up models upright (statues stand, plates lie flat), so the old rotX-270
 * guess now mis-rotates wide/low idols (e.g. Nataraja's ring: z-depth > y
 * height would lie the statue forward). Kept as a no-op for call-site
 * compatibility.
 */
export function autoProperOrientation(_bbox: { x: number; y: number; z: number }): { rotX: number; rotY: number; rotZ: number } {
  return { rotX: 0, rotY: 0, rotZ: 0 };
}

export interface PackGrid {
  cols: number;
  rows: number;
  maxPerPlate: number;
  swapped: boolean; // winning grid uses the 90° orientation of the footprint
}

/**
 * How many (foot + 6mm gap) cells fit on one 244×244 mm usable build area.
 * Tests BOTH grid orientations (0° w×d and 90° d×w) and picks the denser one;
 * ties keep 0°. Oversized parts clamp to 1 per plate.
 */
export function packInstancesOnPlates(footW: number, footD: number, gap = INSTANCE_GAP): PackGrid {
  const cellW = footW + gap;
  const cellD = footD + gap;
  const colsA = Math.max(1, Math.floor(PLATE_USABLE / cellW));
  const rowsA = Math.max(1, Math.floor(PLATE_USABLE / cellD));
  const nA = colsA * rowsA;
  const colsB = Math.max(1, Math.floor(PLATE_USABLE / cellD));
  const rowsB = Math.max(1, Math.floor(PLATE_USABLE / cellW));
  const nB = colsB * rowsB;
  if (nB > nA) return { cols: colsB, rows: rowsB, maxPerPlate: nB, swapped: true };
  return { cols: colsA, rows: rowsA, maxPerPlate: nA, swapped: false };
}

/** Centered slot grid for one plate (mm coords, plate-centered) at real cell size. */
export function plateSlots(cols: number, rows: number, cellW: number, cellD: number): Array<{ x: number; z: number }> {
  const slots: Array<{ x: number; z: number }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      slots.push({
        x: (c - (cols - 1) / 2) * cellW,
        z: (r - (rows - 1) / 2) * cellD,
      });
    }
  }
  return slots;
}

/** Full auto layout: qty instances packed plate-by-plate, centered grids. */
export function buildAutoLayout(
  qty: number,
  footW: number,
  footD: number,
  defaultRot?: { rotX?: number; rotY?: number; rotZ?: number },
): PlateInstance[] {
  const { cols, rows, maxPerPlate } = packInstancesOnPlates(footW, footD);
  const cellW = footW + INSTANCE_GAP;
  const cellD = footD + INSTANCE_GAP;
  const slots = plateSlots(cols, rows, cellW, cellD);
  const out: PlateInstance[] = [];
  for (let i = 0; i < qty; i++) {
    out.push({
      id: uid(),
      plate: Math.floor(i / maxPerPlate),
      x: slots[i % maxPerPlate].x,
      z: slots[i % maxPerPlate].z,
      rotY: defaultRot?.rotY ?? 0,
      rotX: defaultRot?.rotX ?? 0,
      rotZ: defaultRot?.rotZ ?? 0,
    });
  }
  return out;
}

/** Collision test between one instance and the others on its plate (2D AABB + clearance). */
export function instanceCollides(
  inst: PlateInstance,
  others: PlateInstance[],
  bbox: { x: number; y: number; z: number },
  orient: Orient | undefined,
  clearance = 2,
): boolean {
  const a = instanceFootprint(inst, bbox, orient);
  for (const o of others) {
    if (o.plate !== inst.plate || o.id === inst.id) continue;
    const b = instanceFootprint(o, bbox, orient);
    const dx = Math.abs(inst.x - o.x);
    const dz = Math.abs(inst.z - o.z);
    if (dx < (a.w + b.w) / 2 + clearance && dz < (a.d + b.d) / 2 + clearance) return true;
  }
  return false;
}

/** Clamp an instance position fully inside the plate bounds for its footprint. */
export function clampToPlate(
  inst: PlateInstance,
  bbox: { x: number; y: number; z: number },
  orient: Orient | undefined,
): { x: number; z: number } {
  const a = instanceFootprint(inst, bbox, orient);
  const hw = Math.min(a.w / 2, PLATE_SIZE / 2);
  const hd = Math.min(a.d / 2, PLATE_SIZE / 2);
  return {
    x: Math.min(PLATE_SIZE / 2 - hw, Math.max(-PLATE_SIZE / 2 + hw, inst.x)),
    z: Math.min(PLATE_SIZE / 2 - hd, Math.max(-PLATE_SIZE / 2 + hd, inst.z)),
  };
}

export function materialDensity(id: string): number {
  return MATERIALS.find((m) => m.id === id)?.density ?? MATERIALS[0].density;
}

export function colorMode(id: string): ColorMode {
  return COLOR_MODES.find((c) => c.id === id) ?? COLOR_MODES[0];
}

// ─── Estimate engine ─────────────────────────────────────────────────────────

export interface Estimate {
  gramsPerUnit: number;
  gramsTotal: number;
  perUnitLow: number;
  perUnitHigh: number;
  low: number;
  high: number;
  floorApplied: number;
  plates: number; // number of A1 build plates the layout needs
  extraPlateFee: number; // (plates - 1) × EXTRA_PLATE_FEE
  freeDelivery: boolean;
  toFreePost: number; // ₹ away from the unlock (0 when unlocked)
}

export interface EstimateInput {
  volumeMm3: number;
  material: string;
  infill: number; // %
  colorMode: string;
  qty: number;
  plates?: number; // defaults to 1
}

/** printed = vol × (0.2 walls + 0.8·infill) — identical model to PrintEstimator. */
export function estimatePrint(inp: EstimateInput): Estimate {
  const density = materialDensity(inp.material);
  const mode = colorMode(inp.colorMode);
  const qty = Math.max(1, Math.round(inp.qty));
  const plates = Math.max(1, Math.round(inp.plates ?? 1));
  const extraPlateFee = (plates - 1) * EXTRA_PLATE_FEE;
  const printedMm3 = inp.volumeMm3 * (0.2 + 0.8 * (inp.infill / 100));
  const gramsPerUnit = (printedMm3 / 1000) * density;
  const line = gramsPerUnit * qty * mode.mult;
  const low = PRICE_PER_G[0] * line + mode.floor + extraPlateFee;
  const high = PRICE_PER_G[1] * line + mode.floor + extraPlateFee;
  return {
    gramsPerUnit,
    gramsTotal: gramsPerUnit * qty,
    perUnitLow: PRICE_PER_G[0] * gramsPerUnit * mode.mult + mode.floor,
    perUnitHigh: PRICE_PER_G[1] * gramsPerUnit * mode.mult + mode.floor,
    low,
    high,
    floorApplied: mode.floor,
    plates,
    extraPlateFee,
    freeDelivery: low >= FREE_DELIVERY_MIN,
    toFreePost: low >= FREE_DELIVERY_MIN ? 0 : Math.max(0, FREE_DELIVERY_MIN - low),
  };
}

// ─── Persistence (IndexedDB; graceful in-memory fallback) ────────────────────

export interface ShelfParams {
  material: MaterialId;
  infill: number;
  colorMode: string;
  qty: number;
  primaryColor?: string; // FilamentColor id
  secondaryColor?: string; // FilamentColor id — used when colorMode !== 'single'
}

export interface ShelfGeom {
  triangles: number;
  bbox: { x: number; y: number; z: number }; // mm
  volumeMm3: number;
  surfaceMm2: number;
}

export interface ShelfItem {
  id: string;
  name: string;
  addedAt: number;
  updatedAt: number;
  source: 'upload' | 'library';
  libId?: string;
  fileName?: string;
  geom: ShelfGeom | null; // library items carry volumeCm3 via geom.volumeMm3
  thumb: string; // PNG dataURL ('' → house-glyph fallback)
  params: ShelfParams;
  orient?: Orient; // item-level orientation — applies to ALL instances (default: lay-flat)
  scale?: Scale3; // per-axis scale factors — undefined = {1,1,1} (100% imported size)
  placement?: PlateInstance[]; // per-instance plate layout (persisted)
  history: Array<{ at: number; material: string; infill: number; colorMode: string; qty: number }>;
  lastTicketId?: string;
  fileStored?: boolean; // blob uploaded to Supabase storage at least once
  syncState?: 'syncing' | 'synced' | 'local-only';
}

/** Per-axis scale factors — 1 = 100% of the imported size. */
export type Scale3 = { x: number; y: number; z: number };

/** Scale of an item, normalized AND hardened — a present-but-broken scale
 *  (0, negative, NaN from a corrupted write) heals to 1 instead of zeroing
 *  the volume, so already-poisoned IndexedDB items self-repair on load. */
export function normalizeScale(item: Pick<ShelfItem, 'scale'>): Scale3 {
  const s = item.scale;
  const fix = (v: unknown): number => {
    const n = typeof v === 'number' ? v : Number(v);
    // below 0.01 (1%) is unreachable through the UI (its floor IS 0.01) —
    // anything smaller is a corrupted write and heals to 100%
    return Number.isFinite(n) && n >= 0.01 && n <= 1000 ? n : 1;
  };
  return { x: fix(s?.x), y: fix(s?.y), z: fix(s?.z) };
}

/**
 * Geometry AS RENDERED AND PRINTED: the stored mesh scaled by the item's
 * factors. Volume is exact (×sx·sy·sz); surface uses the pairwise-mean
 * approximation for non-uniform scales (exact s² when uniform). Everything
 * that displays dims, prices, packs plates or composes tickets reads THIS,
 * never the raw stored geom.
 */
export function effectiveGeom(item: Pick<ShelfItem, 'geom' | 'scale'>): ShelfGeom {
  const g = item.geom ?? { triangles: 0, bbox: { x: 10, y: 10, z: 10 }, volumeMm3: 0, surfaceMm2: 0 };
  const s = normalizeScale(item);
  const pairSum = s.x * s.y + s.y * s.z + s.z * s.x;
  const r2 = (n: number) => Number(n.toFixed(2));
  return {
    triangles: g.triangles,
    bbox: { x: r2(g.bbox.x * s.x), y: r2(g.bbox.y * s.y), z: r2(g.bbox.z * s.z) },
    volumeMm3: Number((g.volumeMm3 * s.x * s.y * s.z).toFixed(1)),
    surfaceMm2: Number((g.surfaceMm2 * (pairSum / 3)).toFixed(1)),
  };
}

export interface LogEntry {
  id: string;
  at: number;
  kind: 'commission' | 'sourcing';
  ticketId: string;
  summary: Record<string, unknown>;
  sync: 'syncing' | 'synced' | 'local-only';
}

interface MemoryFallback {
  shelf: Map<string, ShelfItem>;
  log: Map<string, LogEntry>;
  files: Map<string, Blob>;
}

const memory: MemoryFallback = { shelf: new Map(), log: new Map(), files: new Map() };
let degraded = false;
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open('stan-stl-hub', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('shelf')) db.createObjectStore('shelf', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('log')) db.createObjectStore('log', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    } catch (e) {
      reject(e instanceof Error ? e : new Error('IndexedDB unavailable'));
    }
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
      }),
  );
}

async function viaMemory<T>(fn: () => T | Promise<T>, fb: () => T): Promise<T> {
  try {
    return await fn();
  } catch {
    degraded = true;
    return fb();
  }
}

export function storageDegraded(): boolean {
  return degraded;
}

export function listShelf(): Promise<ShelfItem[]> {
  return viaMemory(
    async () => {
      const rows = await tx<ShelfItem[]>('shelf', 'readonly', (s) => s.getAll() as IDBRequest<ShelfItem[]>);
      return rows.sort((a, b) => b.addedAt - a.addedAt);
    },
    () => [...memory.shelf.values()].sort((a, b) => b.addedAt - a.addedAt),
  );
}

export function saveShelfItem(item: ShelfItem): Promise<void> {
  return viaMemory(
    () => tx('shelf', 'readwrite', (s) => s.put(item)).then(() => undefined),
    () => {
      memory.shelf.set(item.id, item);
    },
  );
}

export function removeShelfItem(id: string): Promise<void> {
  return viaMemory(
    async () => {
      await tx('shelf', 'readwrite', (s) => s.delete(id)).then(() => undefined);
      await tx('files', 'readwrite', (s) => s.delete(id)).then(() => undefined);
    },
    () => {
      memory.shelf.delete(id);
      memory.files.delete(id);
    },
  );
}

export function getShelfFile(id: string): Promise<Blob | undefined> {
  return viaMemory(
    async () => (await tx<Blob | undefined>('files', 'readonly', (s) => s.get(id) as IDBRequest<Blob | undefined>)) ?? undefined,
    () => memory.files.get(id),
  );
}

export function putShelfFile(id: string, blob: Blob): Promise<void> {
  return viaMemory(
    () => tx('files', 'readwrite', (s) => s.put(blob, id)).then(() => undefined),
    () => {
      memory.files.set(id, blob);
    },
  );
}

export function listLog(): Promise<LogEntry[]> {
  return viaMemory(
    async () => {
      const rows = await tx<LogEntry[]>('log', 'readonly', (s) => s.getAll() as IDBRequest<LogEntry[]>);
      return rows.sort((a, b) => b.at - a.at);
    },
    () => [...memory.log.values()].sort((a, b) => b.at - a.at),
  );
}

export function addLogEntry(entry: LogEntry): Promise<void> {
  return viaMemory(
    () => tx('log', 'readwrite', (s) => s.put(entry)).then(() => undefined),
    () => {
      memory.log.set(entry.id, entry);
    },
  );
}

// ─── Ticket IDs & WhatsApp builders ──────────────────────────────────────────

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function generateHubTicketId(kind: 'STL' | 'SRC', existing: string[] = []): string {
  let id = '';
  do {
    id = `STAN-${kind}-${Math.floor(1000 + Math.random() * 9000)}`;
  } while (existing.includes(id));
  return id;
}

const fmt = (n: number, digits = 1) =>
  n.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

const rupees = (n: number) => `₹${fmt(n, 0)}`;

export function buildCommissionMessage(item: ShelfItem, est: Estimate, ticketId: string): string {
  const g = effectiveGeom(item);
  const s = normalizeScale(item);
  const scaled = s.x !== 1 || s.y !== 1 || s.z !== 1;
  const scaleLine = !scaled
    ? null
    : s.x === s.y && s.y === s.z
      ? `Scale: ${Math.round(s.x * 100)}% (uniform)`
      : `Scale: X ${Math.round(s.x * 100)}% · Y ${Math.round(s.y * 100)}% · Z ${Math.round(s.z * 100)}%`;
  const volCm3 = g.volumeMm3 / 1000;
  const lines = [
    `Build Request: #${ticketId}`,
    `Item: ${item.name}`,
    g
      ? `File: ${item.fileName ?? item.name}${g.triangles ? ` | ${g.triangles.toLocaleString('en-IN')} tris` : ''}`
      : `Source: Studio Library`,
    g ? `Size: ${g.bbox.x} × ${g.bbox.y} × ${g.bbox.z} mm | Vol: ${fmt(volCm3, 1)} cm³` : null,
    scaleLine,
    `Material: ${item.params.material} | Infill: ${item.params.infill}% | Qty: ${item.params.qty}`,
    `Color: ${colorMode(item.params.colorMode).label}`,
    item.params.primaryColor || item.params.secondaryColor
      ? `Filament: ${filamentColor(item.params.primaryColor).name}${
          item.params.colorMode !== 'single' && item.params.secondaryColor
            ? ` (primary) + ${filamentColor(item.params.secondaryColor).name} (accent)`
            : ''
        }`
      : null,
    est.plates > 1
      ? `Build plates: ${est.plates} × A1 256×256mm (incl. +${rupees(est.extraPlateFee)} extra plate setup)`
      : null,
    `Weight: ${fmt(est.gramsPerUnit, 1)} g/unit · ${fmt(est.gramsTotal, 1)} g total`,
    `Estimate: ${rupees(est.low)}–${rupees(est.high)}${est.floorApplied ? ` (incl. ${rupees(est.floorApplied)} setup)` : ''}`,
    est.freeDelivery ? `Free Standard India Post Delivery + 15g Micro-Print unlocked (net > ₹999).` : null,
    item.fileStored && item.lastTicketId ? `STL on record: #${item.lastTicketId}` : null,
    !item.fileStored && item.source === 'upload' ? `I will send the STL file here on WhatsApp.` : null,
    `Saved in my Custom STL Hub shelf on-device.`,
  ].filter(Boolean);
  return lines.join('\n');
}

export function commissionWhatsAppUrl(item: ShelfItem, est: Estimate, ticketId: string): string {
  return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(buildCommissionMessage(item, est, ticketId))}`;
}

// ─── Model Sourcing ──────────────────────────────────────────────────────────

export const SOURCING_CATEGORIES = [
  'Electronics Enclosure',
  'Robotics & Mechanical',
  'College Project Prototype',
  'Custom Prop or Figurine',
  'Replacement Part',
] as const;

export const ASSEMBLY_MODES = COLOR_MODES.map((c) => c.label);

export const DELIVERY_MODES = [
  'Self-Pickup (Maniktala)',
  'Standard India Post (Free >₹999)',
  'India Post Speed Post',
  'Kolkata/Howrah 5-Hr Express (Porter/Rapido)',
] as const;

export interface SourcingRequest {
  what: string;
  category: string;
  sizeNotes: string;
  assembly: string;
  delivery: string;
}

export function buildSourcingMessage(req: SourcingRequest, ticketId: string): string {
  const lines = [
    `Sourcing Request: #${ticketId}`,
    `Looking for: ${req.what.trim()}`,
    `Category: ${req.category}`,
    req.sizeNotes.trim() ? `Size / Reference: ${req.sizeNotes.trim()}` : null,
    `Assembly: ${req.assembly}`,
    `Delivery: ${req.delivery}`,
    `Please hunt down a valid printable 3D model and share the preview here.`,
  ].filter(Boolean);
  return lines.join('\n');
}

export function sourcingWhatsAppUrl(req: SourcingRequest, ticketId: string): string {
  return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(buildSourcingMessage(req, ticketId))}`;
}

// ─── Studio Library — ready-to-print maker essentials ────────────────────────

export interface LibraryItem {
  id: string;
  name: string;
  category: 'Electronics' | 'Robotics' | 'Desk & Utility';
  dims: { x: number; y: number; z: number }; // mm
  volumeCm3: number; // solid mesh volume — grams derive from the same formula
  recMaterial: MaterialId;
  recInfill: number;
  blurb: string;
}

export const LIBRARY: LibraryItem[] = [
  {
    id: 'esp32-enclosure',
    name: 'ESP32 / NodeMCU V3 Snap Enclosure',
    category: 'Electronics',
    dims: { x: 60, y: 30, z: 15 },
    volumeCm3: 16.8,
    recMaterial: 'PLA',
    recInfill: 15,
    blurb: 'Snap-fit lid, USB/micro-USB cutout, vent slots. Boards drop straight in.',
  },
  {
    id: 'arduino-baseplate',
    name: 'Arduino Uno + Breadboard Baseplate',
    category: 'Electronics',
    dims: { x: 105, y: 62, z: 4 },
    volumeCm3: 18.2,
    recMaterial: 'PLA',
    recInfill: 15,
    blurb: 'Mounts an Uno and a full-size breadboard with friction posts — no screws.',
  },
  {
    id: 'sg90-bracket',
    name: 'SG90 Servo Bracket',
    category: 'Robotics',
    dims: { x: 42, y: 25, z: 22 },
    volumeCm3: 9.6,
    recMaterial: 'PETG',
    recInfill: 25,
    blurb: 'Micro-servo bracket with horn clearance and 3mm tie holes.',
  },
  {
    id: 'mg996r-bracket',
    name: 'MG996R Heavy Servo Bracket',
    category: 'Robotics',
    dims: { x: 55, y: 35, z: 30 },
    volumeCm3: 21.4,
    recMaterial: 'PETG',
    recInfill: 25,
    blurb: 'Standard-size servo clip frame for robotic arms and gimbals.',
  },
  {
    id: '18650-sled',
    name: '18650 Battery Sled (x1)',
    category: 'Electronics',
    dims: { x: 78, y: 24, z: 22 },
    volumeCm3: 16.2,
    recMaterial: 'PETG',
    recInfill: 15,
    blurb: 'Single-cell holder with solder tabs and strap slot.',
  },
  {
    id: 'nema17-mount',
    name: 'NEMA 17 Stepper Mount',
    category: 'Robotics',
    dims: { x: 43, y: 43, z: 8 },
    volumeCm3: 13.9,
    recMaterial: 'PETG',
    recInfill: 50,
    blurb: '31mm pilot bore, M3 hole pattern, flange base for frames.',
  },
  {
    id: 'keychain-blank',
    name: 'Custom Keychain / Badge Blank',
    category: 'Desk & Utility',
    dims: { x: 50, y: 25, z: 4 },
    volumeCm3: 3.2,
    recMaterial: 'PLA',
    recInfill: 15,
    blurb: 'Blank plate with ring hole — your name or logo engraved on request.',
  },
];

/** Library grams at recommended settings, from the same estimate engine. */
export function libraryGrams(item: LibraryItem): number {
  return estimatePrint({
    volumeMm3: item.volumeCm3 * 1000,
    material: item.recMaterial,
    infill: item.recInfill,
    colorMode: 'single',
    qty: 1,
  }).gramsPerUnit;
}

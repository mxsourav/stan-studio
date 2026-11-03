import { useCallback, useEffect, useRef, useState } from 'react';
import { IconCube, IconUpload, IconWhatsApp } from '../icons';
import { drawMeshOnCanvas, renderStlThumb, sessionMeshCache } from '../../lib/stlThumb';
import { readStlMesh } from '../../lib/stl';
import PlateViewport from './PlateViewport';
import {
  ASSEMBLY_MODES,
  COLOR_MODES,
  DELIVERY_MODES,
  EXTRA_PLATE_FEE,
  FILAMENT_COLORS,
  INFILL_PRESETS,
  LIBRARY,
  MATERIALS,
  MAX_FILE_MB,
  SOURCING_CATEGORIES,
  addLogEntry,
  buildAutoLayout,
  clampToPlate,
  colorMode,
  commissionWhatsAppUrl,
  estimatePrint,
  filamentColor,
  flipFootprint,
  generateHubTicketId,
  getShelfFile,
  instanceCollides,
  layFlatFlip,
  libraryGrams,
  listLog,
  listShelf,
  packInstancesOnPlates,
  plateSlots,
  putShelfFile,
  removeShelfItem,
  rotatedFootprint,
  saveShelfItem,
  sourcingWhatsAppUrl,
  storageDegraded,
  uid,
  type Estimate,
  type LibraryItem,
  type LogEntry,
  type PlateInstance,
  type ShelfItem,
  type SourcingRequest,
} from '../../lib/stlHub';
import { submitHubRequest, uploadStlFile } from '../../lib/hubPipeline';
import WorkspaceChrome from './WorkspaceChrome';
import { type PlateViewApi } from './PlateViewport';

/**
 * Custom STL Hub — zero-login commissioning workspace, rendered inside the
 * /tools/stl-hub fullscreen shell. Single centered column (max-w-5xl): content
 * flows top-to-bottom like a modern web app. Modes: Private Shelf, Studio
 * Library, Model Sourcing. Every ticket opens WhatsApp immediately; the DB
 * sync completes in background.
 */

const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

type SyncState = NonNullable<ShelfItem['syncState']>;

export type HubTab = 'shelf' | 'library' | 'sourcing';

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-1.5 text-[11.5px] font-medium transition active:scale-[0.99] ${
        active
          ? 'border-white/25 bg-white/[0.12] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]'
          : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20 hover:bg-white/[0.06] hover:text-zinc-100'
      }`}
    >
      {children}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">{children}</p>;
}

function PrimaryAction({ onClick, children, wide }: { onClick: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-black transition hover:bg-white/90 active:scale-[0.99] ${
        wide ? 'w-full' : ''
      }`}
    >
      {children}
    </button>
  );
}

function GhostAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-zinc-200 transition hover:bg-white/[0.1] active:scale-[0.99]"
    >
      {children}
    </button>
  );
}

/** Rounded group card — one visual block per form/param section. */
function Group({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 ${className}`}>{children}</div>;
}

function FreeDeliveryChip({ est }: { est: Estimate }) {
  if (est.freeDelivery) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/25 bg-emerald-300/[0.08] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-emerald-200/90">
        <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-300" />
        Free India Post + 15g micro-print
      </span>
    );
  }
  return (
    <span className="font-mono text-[9.5px] uppercase tracking-wider text-white/35">
      {rupees(est.toFreePost)} to free post
    </span>
  );
}

function SyncPill({ state }: { state: SyncState }) {
  if (state === 'synced') return <span className="font-mono text-[9px] uppercase tracking-wider text-emerald-300/80">Synced</span>;
  if (state === 'local-only') return <span className="font-mono text-[9px] uppercase tracking-wider text-amber-200/70">Local only</span>;
  return <span className="font-mono text-[9px] uppercase tracking-wider text-white/40">Syncing…</span>;
}

// ─── Shared commission flow ──────────────────────────────────────────────────

type CommissionFn = (item: ShelfItem, est: Estimate) => void;

function useCommission(refresh: () => void): CommissionFn {
  return useCallback(
    (item: ShelfItem, est: Estimate) => {
      const ticketId = generateHubTicketId('STL');
      // Popup first, synchronously — never behind an await (popup blockers).
      window.open(commissionWhatsAppUrl(item, est, ticketId), '_blank', 'noopener');

      const logEntry: LogEntry = {
        id: uid(),
        at: Date.now(),
        kind: 'commission',
        ticketId,
        summary: {
          item: item.name,
          file: item.fileName ?? null,
          material: item.params.material,
          infill: item.params.infill,
          colorMode: item.params.colorMode,
          qty: item.params.qty,
          low: Math.round(est.low),
          high: Math.round(est.high),
          grams: Number(est.gramsTotal.toFixed(1)),
        },
        sync: 'syncing',
      };
      void addLogEntry(logEntry);

      const finish = async (sync: SyncState, storagePath: string | null) => {
        await addLogEntry({ ...logEntry, sync });
        await saveShelfItem({
          ...item,
          lastTicketId: ticketId,
          syncState: sync,
          fileStored: item.fileStored || Boolean(storagePath),
        });
        refresh();
      };

      void (async () => {
        try {
          let storagePath: string | null = null;
          if (item.source === 'upload' && !item.fileStored && item.fileName) {
            const blob = await getShelfFile(item.id);
            if (blob) {
              // File upload is isolated — a storage failure still syncs the ticket.
              try {
                storagePath = await uploadStlFile(ticketId, item.fileName, blob);
              } catch {
                storagePath = null;
              }
            }
          }
          await submitHubRequest({
            ticket_id: ticketId,
            kind: 'commission',
            item_name: item.name,
            file_name: item.fileName ?? null,
            specs: item.geom ? (item.geom as unknown as Record<string, unknown>) : null,
            params: {
              ...item.params,
              filamentPrimary: filamentColor(item.params.primaryColor).name,
              filamentSecondary:
                item.params.colorMode !== 'single' && item.params.secondaryColor
                  ? filamentColor(item.params.secondaryColor).name
                  : null,
            },
            estimate: { low: Math.round(est.low), high: Math.round(est.high), grams: Number(est.gramsTotal.toFixed(1)) },
            note: null,
            storage_path: storagePath,
          });
          await finish('synced', storagePath);
        } catch {
          await finish('local-only', null);
        }
      })();
    },
    [refresh],
  );
}

/** Persists a parameter patch and appends a remix-history snapshot. */
async function patchItem(item: ShelfItem, patch: Partial<ShelfItem>, params: ShelfItem['params']): Promise<ShelfItem> {
  const updated: ShelfItem = {
    ...item,
    ...patch,
    params,
    updatedAt: Date.now(),
    history: [...item.history, { at: Date.now(), ...params }].slice(-12),
  };
  await saveShelfItem(updated);
  return updated;
}

// ─── Mesh thumbnail (drag-to-rotate when the parsed mesh is in session memory) ──

function MeshView({ item, size = 72 }: { item: ShelfItem; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef({ yaw: Math.PI / 4, pitch: Math.atan(1 / Math.SQRT2) });
  const dragging = useRef(false);
  const mesh = sessionMeshCache.get(item.id);

  const draw = useCallback(() => {
    const c = canvasRef.current;
    const m = sessionMeshCache.get(item.id);
    if (!c || !m) return;
    c.width = size * 2; // crisp on hi-dpi
    c.height = size * 2;
    drawMeshOnCanvas(c, m, view.current.yaw, view.current.pitch);
  }, [item.id, size]);

  useEffect(() => {
    draw();
  }, [draw]);

  if (!mesh) {
    return item.thumb ? (
      <img src={item.thumb} alt={item.name} width={size} height={size} className="rounded-xl border border-white/[0.08] bg-black/40 object-cover" />
    ) : (
      <div className="flex items-center justify-center rounded-xl border border-white/[0.08] bg-black/40" style={{ width: size, height: size }}>
        <IconCube size={Math.round(size * 0.4)} className="text-white/30" />
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={size * 2}
      height={size * 2}
      style={{ width: size, height: size, touchAction: 'none' }}
      title="Drag to rotate"
      className="cursor-grab rounded-xl border border-white/[0.08] bg-black/40 active:cursor-grabbing"
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        view.current.yaw += e.movementX * 0.01;
        view.current.pitch = Math.max(-1.2, Math.min(1.2, view.current.pitch + e.movementY * 0.01));
        draw();
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
    />
  );
}

// ─── Shelf strip card (horizontal object list, slicer-style) ─────────────────

function ShelfStripCard({ item, selected, onSelect }: { item: ShelfItem; selected: boolean; onSelect: () => void }) {
  const est = estimatePrint({ volumeMm3: item.geom?.volumeMm3 ?? 0, ...item.params });
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-[158px] shrink-0 items-center gap-2.5 rounded-xl border p-2 text-left transition active:scale-[0.99] ${
        selected ? 'border-white/30 bg-white/[0.08]' : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
      }`}
    >
      <MeshView item={item} size={38} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11.5px] font-semibold text-zinc-100">{item.name}</span>
        <span className="mt-0.5 block font-mono text-[9.5px] tabular-nums text-zinc-400">
          {rupees(est.low)}–{rupees(est.high)} · {est.gramsTotal.toFixed(1)} g
        </span>
      </span>
    </button>
  );
}

// ─── Tune editor (right rail) ────────────────────────────────────────────────

function ItemEditor({ item, onSetParams }: { item: ShelfItem; onSetParams: (next: Partial<ShelfItem['params']>) => void }) {
  const est = estimatePrint({ volumeMm3: item.geom?.volumeMm3 ?? 0, ...item.params });
  const mode = colorMode(item.params.colorMode);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel>Material</SectionLabel>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {MATERIALS.map((m) => (
            <Chip key={m.id} active={item.params.material === m.id} onClick={() => onSetParams({ material: m.id })}>
              {m.id}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <SectionLabel>Infill</SectionLabel>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {INFILL_PRESETS.map((p) => (
            <Chip key={p} active={item.params.infill === p} onClick={() => onSetParams({ infill: p })}>
              {p}%
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <SectionLabel>Color mode</SectionLabel>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {COLOR_MODES.map((c) => (
            <Chip key={c.id} active={item.params.colorMode === c.id} onClick={() => onSetParams({ colorMode: c.id })}>
              {c.label}
              {c.mult !== 1 ? <span className="ml-1 text-zinc-500">×{c.mult}</span> : null}
            </Chip>
          ))}
        </div>
      </div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <SectionLabel>Quantity</SectionLabel>
          <div className="mt-2 flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onSetParams({ qty: Math.max(1, item.params.qty - 1) })}
              className="h-8 w-8 rounded-xl border border-white/10 bg-white/[0.05] font-mono text-[13px] text-zinc-100 transition hover:bg-white/[0.1] active:scale-[0.99]"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="w-8 text-center font-mono text-[13px] tabular-nums text-zinc-100">{item.params.qty}</span>
            <button
              type="button"
              onClick={() => onSetParams({ qty: Math.min(99, item.params.qty + 1) })}
              className="h-8 w-8 rounded-xl border border-white/10 bg-white/[0.05] font-mono text-[13px] text-zinc-100 transition hover:bg-white/[0.1] active:scale-[0.99]"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
        </div>
        <div className="text-right">
          <SectionLabel>Per unit</SectionLabel>
          <p className="mt-2 font-mono text-[12px] tabular-nums text-zinc-300">
            {rupees(est.perUnitLow)}–{rupees(est.perUnitHigh)}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-1 border-t border-white/[0.08] pt-3">
        {est.floorApplied > 0 && (
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500">
            Includes {rupees(est.floorApplied)} setup floor · {mode.label} ×{mode.mult}
          </p>
        )}
        <p className="font-mono text-[10px] tabular-nums text-zinc-500">
          {est.gramsPerUnit.toFixed(2)} g/unit at {item.params.material} · remixes saved: {item.history.length}
        </p>
        <p className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-zinc-600">Changes auto-save on-device</p>
      </div>
    </div>
  );
}

// ─── Mode 1: Private Shelf workspace ─────────────────────────────────────────

function ShelfWorkspace({
  items,
  selectedId,
  onSelect,
  reload,
  onCommission,
}: {
  items: ShelfItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  reload: () => void;
  onCommission: CommissionFn;
}) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [layout, setLayout] = useState<PlateInstance[]>([]);
  const [activePlate, setActivePlate] = useState(0);
  const [tool, setTool] = useState<'move' | 'rotate'>('move');
  const [clipboard, setClipboard] = useState<Omit<PlateInstance, 'id'> | null>(null);
  const [overflow, setOverflow] = useState<{ numPlates: number; maxPerPlate: number; leftover: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const paramsScrollRef = useRef<HTMLDivElement>(null);
  const persistTimer = useRef<number | undefined>(undefined);
  const selected = items.find((i) => i.id === selectedId) ?? null;

  const handleFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      setBusy(true);
      setError(null);
      try {
        const mesh = await readStlMesh(file);
        const thumb = renderStlThumb(mesh.tris, mesh.count);
        const id = uid();
        sessionMeshCache.set(id, { tris: mesh.tris, count: mesh.count });
        const item: ShelfItem = {
          id,
          name: file.name.replace(/\.stl$/i, ''),
          addedAt: Date.now(),
          updatedAt: Date.now(),
          source: 'upload',
          fileName: file.name,
          geom: { triangles: mesh.triangles, bbox: mesh.bbox, volumeMm3: mesh.volumeMm3, surfaceMm2: mesh.surfaceMm2 },
          thumb,
          params: { material: 'PLA', infill: 15, colorMode: 'single', qty: 1 },
          history: [],
        };
        if (file.size <= MAX_FILE_MB * 1024 * 1024) await putShelfFile(id, file);
        await saveShelfItem(item);
        reload();
        onSelect(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not read that file');
      } finally {
        setBusy(false);
      }
    },
    [reload, onSelect],
  );

  const duplicate = useCallback(
    async (item: ShelfItem) => {
      const id = uid();
      const cached = sessionMeshCache.get(item.id);
      if (cached) sessionMeshCache.set(id, cached);
      const blob = item.source === 'upload' && !item.fileStored ? await getShelfFile(item.id) : undefined;
      if (blob) await putShelfFile(id, blob);
      await saveShelfItem({
        ...item,
        id,
        name: `${item.name} (remix)`,
        addedAt: Date.now(),
        updatedAt: Date.now(),
        lastTicketId: undefined,
        syncState: undefined,
        history: [],
      });
      reload();
      onSelect(id);
    },
    [reload, onSelect],
  );

  const remove = useCallback(
    async (item: ShelfItem) => {
      await removeShelfItem(item.id);
      reload();
      setConfirmDelete(false);
      if (selectedId === item.id) onSelect(null);
    },
    [reload, selectedId, onSelect],
  );

  const viewportApi = useRef<PlateViewApi | null>(null);
  // INSTANCE selection is separate from ITEM selection (selectedId prop):
  // instance ids live in the plate layout, never in the shelf.
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const selectedInstance = layout.find((i) => i.id === selectedInstanceId) ?? null;

  // Layout init on selection change — persisted placements win, else auto-pack.
  // Params scroll resets to the very top (anti-clipping: MATERIAL/INFILL first).
  useEffect(() => {
    if (!selected) {
      setLayout([]);
      setActivePlate(0);
      return;
    }
    const fp = flipFootprint(selected.geom?.bbox ?? { x: 10, y: 10, z: 10 }, 'none');
    const next = selected.placement?.length ? selected.placement : buildAutoLayout(selected.params.qty, fp.w, fp.d);
    setLayout(next);
    setActivePlate(0);
    setSelectedInstanceId((cur) => (cur && next.some((i) => i.id === cur) ? cur : (next[0]?.id ?? null)));
    if (paramsScrollRef.current) paramsScrollRef.current.scrollTop = 0;
    if (paramsScrollRef.current) paramsScrollRef.current.scrollTop = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const bbox = selected?.geom?.bbox ?? null;
  const plateIndices = [...new Set(layout.map((i) => i.plate))].sort((a, b) => a - b);
  const numPlates = plateIndices.length || 1;
  const plateCounts = plateIndices.map((p) => layout.filter((i) => i.plate === p).length);
  const collision = selectedInstance && bbox ? instanceCollides(selectedInstance, layout, bbox) : false;
  const selFp = bbox ? flipFootprint(bbox, selectedInstance?.flip ?? 'none') : null;
  const packGrid = bbox && selFp ? packInstancesOnPlates(selFp.w, selFp.d) : null;
  const est = selected
    ? estimatePrint({
        volumeMm3: selected.geom?.volumeMm3 ?? 0,
        ...selected.params,
        qty: layout.length || selected.params.qty,
        plates: numPlates,
      })
    : null;

  /** Persist the layout + synced qty WITHOUT a remix-history entry. */
  const persistLayout = useCallback(
    (item: ShelfItem, next: PlateInstance[], params?: Partial<ShelfItem['params']>) => {
      void saveShelfItem({
        ...item,
        placement: next,
        params: { ...item.params, ...params, qty: next.length },
        updatedAt: Date.now(),
      }).then(reload);
    },
    [reload],
  );

  /** Live drag-move — instant state, debounced persistence. */
  const handleMove = useCallback(
    (id: string, x: number, z: number) => {
      setLayout((cur) => {
        const next = cur.map((i) => (i.id === id ? { ...i, x, z } : i));
        window.clearTimeout(persistTimer.current);
        const item = items.find((it) => it.id === selectedId);
        if (item) persistTimer.current = window.setTimeout(() => persistLayout(item, next), 600);
        return next;
      });
    },
    [items, selectedId, persistLayout],
  );

  /** Live drag-rotate (Rotate tool) — degrees, wrapped 0–360. */
  const handleRotate = useCallback(
    (id: string, rotY: number) => {
      setLayout((cur) => {
        const next = cur.map((i) => (i.id === id ? { ...i, rotY: ((Math.round(rotY) % 360) + 360) % 360 } : i));
        window.clearTimeout(persistTimer.current);
        const item = items.find((it) => it.id === selectedId);
        if (item) persistTimer.current = window.setTimeout(() => persistLayout(item, next), 600);
        return next;
      });
    },
    [items, selectedId, persistLayout],
  );

  /** Grow/shrink the layout to a target qty, filling free slots, opening plates. */
  const syncLayoutToQty = useCallback((item: ShelfItem, target: number, cur: PlateInstance[]): PlateInstance[] => {
    const bb = item.geom?.bbox ?? { x: 10, y: 10, z: 10 };
    if (target <= cur.length) return cur.slice(0, Math.max(1, target));
    const fp = flipFootprint(bb, 'none');
    const { cols, rows } = packInstancesOnPlates(fp.w, fp.d);
    const slots = plateSlots(cols, rows, fp.w, fp.d);
    const next = [...cur];
    while (next.length < target) {
      let pushed = false;
      for (let p = 0; p < 60 && !pushed; p++) {
        for (let s = 0; s < slots.length && !pushed; s++) {
          const cand: PlateInstance = { id: uid(), plate: p, x: slots[s].x, z: slots[s].z, rotY: 0, flip: 'none' };
          if (!instanceCollides(cand, next, bb)) {
            next.push(cand);
            pushed = true;
          }
        }
      }
      if (!pushed) break; // physically impossible — keep qty as-is
    }
    return next;
  }, []);

  const setParams = (next: Partial<ShelfItem['params']>) => {
    if (!selected) return;
    const params = { ...selected.params, ...next };
    if (next.qty !== undefined && next.qty !== layout.length) {
      const nextLayout = syncLayoutToQty(selected, next.qty, layout);
      setLayout(nextLayout);
      persistLayout(selected, nextLayout, params);
      return;
    }
    void patchItem(selected, {}, params).then(() => reload());
  };

  const switchPlate = (p: number) => {
    setActivePlate(p);
    viewportApi.current?.fit();
  };

  const cloneInstance = () => {
    if (!selected || !bbox) return;
    const next = syncLayoutToQty(selected, layout.length + 1, layout);
    setLayout(next);
    persistLayout(selected, next);
    setSelectedInstanceId(next[next.length - 1]?.id ?? null);
  };

  const copyInstance = () => {
    if (!selectedInstance) return;
    const { id: _id, ...rest } = selectedInstance;
    void _id;
    setClipboard(rest);
  };

  const pasteInstance = () => {
    if (!selected || !bbox || !clipboard) return;
    const cand: PlateInstance = { id: uid(), ...clipboard };
    const safe = { ...cand, ...clampToPlate(cand, bbox) };
    if (!instanceCollides(safe, layout, bbox)) {
      const next = [...layout, safe];
      setLayout(next);
      persistLayout(selected, next);
      setSelectedInstanceId(safe.id);
    } else {
      cloneInstance(); // pasted spot is taken — drop into the next free slot
    }
  };

  const deleteInstance = () => {
    if (!selected) return;
    if (layout.length <= 1) {
      setConfirmDelete(true); // last instance — offer removing the shelf item
      return;
    }
    const idx = layout.findIndex((i) => i.id === selectedInstanceId);
    const next = layout.filter((i) => i.id !== selectedInstanceId);
    const plates = [...new Set(next.map((i) => i.plate))].sort((a, b) => a - b);
    const remap = new Map(plates.map((p, ix) => [p, ix]));
    const compact = next.map((i) => ({ ...i, plate: remap.get(i.plate) ?? 0 }));
    setLayout(compact);
    persistLayout(selected, compact);
    setSelectedInstanceId(compact[Math.max(0, Math.min(idx, compact.length - 1))]?.id ?? null);
    if (activePlate >= plates.length) switchPlate(Math.max(0, plates.length - 1));
  };

  const cutInstance = () => {
    copyInstance();
    deleteInstance();
  };

  /** Re-pack every plate's instances into centered, collision-free grids. */
  const autoAlign = () => {
    if (!selected || !bbox) return;
    const perPlate = new Map<number, PlateInstance[]>();
    for (const i of layout) {
      const arr = perPlate.get(i.plate) ?? [];
      arr.push(i);
      perPlate.set(i.plate, arr);
    }
    const next: PlateInstance[] = [];
    for (const [p, arr] of [...perPlate.entries()].sort((a, b) => a[0] - b[0])) {
      const cells = arr.map((i) => {
        const fp = flipFootprint(bbox, i.flip);
        const r = rotatedFootprint(fp.w, fp.d, i.rotY);
        return { w: r.w, d: r.d };
      });
      const cw = Math.max(...cells.map((c) => c.w)) + 2;
      const cd = Math.max(...cells.map((c) => c.d)) + 2;
      const cols = Math.max(1, Math.floor(250 / cw));
      const rows = Math.max(1, Math.ceil(arr.length / cols));
      for (let k = 0; k < arr.length; k++) {
        next.push({
          ...arr[k],
          plate: p,
          x: ((k % cols) - (cols - 1) / 2) * cw,
          z: (Math.floor(k / cols) - (rows - 1) / 2) * cd,
        });
      }
    }
    setLayout(next);
    persistLayout(selected, next);
  };

  const applyFlipToSelected = (flip: PlateInstance['flip']) => {
    if (!selected || !bbox || !selectedInstance) return;
    const updated = { ...selectedInstance, flip };
    const safe = { ...updated, ...clampToPlate(updated, bbox) };
    setLayout((cur) => cur.map((i) => (i.id === safe.id ? safe : i)));
    persistLayout(selected, layout.map((i) => (i.id === safe.id ? safe : i)));
  };

  const rotateSelectedBy = (delta: number) => {
    if (!selected || !bbox || !selectedInstance) return;
    const rotY = ((Math.round(selectedInstance.rotY + delta) % 360) + 360) % 360;
    const updated = { ...selectedInstance, rotY };
    const safe = { ...updated, ...clampToPlate(updated, bbox) };
    setLayout((cur) => cur.map((i) => (i.id === safe.id ? safe : i)));
    persistLayout(selected, layout.map((i) => (i.id === safe.id ? safe : i)));
  };

  const layFlat = () => {
    if (!bbox) return;
    applyFlipToSelected(layFlatFlip(bbox));
  };

  // Overflow popup — fires only when an ADDITIONAL build plate becomes necessary
  const prevPlatesRef = useRef(0);
  useEffect(() => {
    if (numPlates > prevPlatesRef.current && prevPlatesRef.current > 0) {
      setOverflow({
        numPlates,
        maxPerPlate: packGrid?.maxPerPlate ?? layout.length,
        leftover: plateCounts[plateCounts.length - 1] ?? 0,
      });
    }
    prevPlatesRef.current = numPlates;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPlates]);

  // Keyboard shortcuts — viewport-scoped (skips typing targets)
  const onViewportKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const meta = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (meta && k === 'c') copyInstance();
    else if (meta && k === 'v') pasteInstance();
    else if (meta && k === 'x') cutInstance();
    else if (meta && k === 'd') {
      e.preventDefault();
      cloneInstance();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteInstance();
    } else if (!meta && k === 'm') setTool('move');
    else if (!meta && k === 'r') setTool('rotate');
    else if (!meta && k === 'f') layFlat();
    else if (!meta && k === 'a') autoAlign();
  };

  return (
    <div className="grid min-h-0 flex-1 grid-rows-[auto_300px] overflow-visible lg:grid-cols-[360px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
      {/* ── LEFT SLICER SIDEBAR ── */}
      <aside className="flex min-h-0 flex-col bg-[#0c0c0f] lg:col-start-1 lg:h-full lg:row-start-1 lg:border-r lg:border-white/10">
        {/* Top: compact upload + object strip */}
        <div className="shrink-0 border-b border-white/[0.08] p-3">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void handleFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
            }}
            className={`flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed text-[12px] font-medium text-zinc-100 transition ${
              dragging
                ? 'border-white/50 bg-white/[0.08]'
                : 'border-white/15 bg-white/[0.02] hover:border-white/30 hover:bg-white/[0.05]'
            }`}
          >
            <input ref={inputRef} type="file" accept=".stl" className="hidden" onChange={(e) => void handleFile(e.target.files?.[0])} />
            <IconUpload size={14} className="text-zinc-400" />
            {busy ? 'Parsing mesh…' : 'Upload / Drop .stl'}
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-500">≤{MAX_FILE_MB}MB · on-device</span>
          </div>
          {items.length > 0 ? (
            <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-0.5">
              {items.map((item) => (
                <ShelfStripCard key={item.id} item={item} selected={item.id === selectedId} onSelect={() => onSelect(item.id)} />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-center font-mono text-[9.5px] uppercase tracking-[0.1em] text-zinc-600">
              Shelf is empty — parts stay on this device
            </p>
          )}
          {error && <p className="mt-2 rounded-xl bg-red-500/10 px-3 py-2 font-mono text-[10.5px] text-red-300">{error}</p>}
        </div>

        {/* Middle: process parameters — top-aligned (scrollTop=0), scrollable, never clipped */}
        <div ref={paramsScrollRef} className="no-scrollbar flex min-h-0 flex-1 flex-col items-stretch justify-start overflow-y-auto p-4">
          {selected ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-[14px] font-semibold leading-snug text-zinc-100">{selected.name}</p>
                  {selected.geom && (
                    <p className="mt-0.5 font-mono text-[10px] tabular-nums text-zinc-400">
                      {selected.geom.bbox.x} × {selected.geom.bbox.y} × {selected.geom.bbox.z} mm
                      {` · ${(selected.geom.volumeMm3 / 1000).toFixed(1)} cm³`}
                    </p>
                  )}
                </div>
                {confirmDelete ? (
                  <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-300">
                    Delete?
                    <button
                      type="button"
                      onClick={() => void remove(selected)}
                      className="rounded-lg bg-red-500/15 px-2.5 py-1.5 text-red-300 transition hover:bg-red-500/25"
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="rounded-lg bg-white/[0.06] px-2.5 py-1.5 transition hover:bg-white/[0.12]"
                    >
                      No
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    aria-label="Delete"
                    className="shrink-0 rounded-lg p-2 text-zinc-500 transition hover:bg-white/[0.08] hover:text-red-300"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M4.5 6.5h15M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5M6.5 6.5l1 12a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-12" />
                    </svg>
                  </button>
                )}
              </div>
              <ItemEditor item={selected} onSetParams={setParams} />

              {/* Filament color — live-shades the 3D meshes */}
              <div>
                <SectionLabel>
                  Filament color{selected.params.primaryColor ? ` — ${filamentColor(selected.params.primaryColor).name}` : ''}
                </SectionLabel>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {FILAMENT_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      aria-label={`Filament color ${c.name}`}
                      title={c.name}
                      onClick={() => setParams({ primaryColor: c.id })}
                      className={`h-8 w-8 rounded-full border transition active:scale-[0.95] ${
                        (selected.params.primaryColor ?? 'polar-white') === c.id
                          ? 'border-white shadow-[0_0_0_2px_rgba(255,255,255,0.35)]'
                          : 'border-white/20 hover:border-white/50'
                      }`}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>
                {selected.params.colorMode !== 'single' && (
                  <div className="mt-3">
                    <SectionLabel>
                      Secondary / Accent Color{selected.params.secondaryColor ? ` — ${filamentColor(selected.params.secondaryColor).name}` : ''}
                    </SectionLabel>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {FILAMENT_COLORS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          aria-label={`Accent color ${c.name}`}
                          title={c.name}
                          onClick={() => setParams({ secondaryColor: c.id })}
                          className={`h-8 w-8 rounded-full border transition active:scale-[0.95] ${
                            selected.params.secondaryColor === c.id
                              ? 'border-white shadow-[0_0_0_2px_rgba(255,255,255,0.35)]'
                              : 'border-white/20 hover:border-white/50'
                          }`}
                          style={{ backgroundColor: c.hex }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Orientation — flip / lay flat / yaw */}
              {selectedInstance && bbox && (
                <div>
                  <SectionLabel>Orientation</SectionLabel>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Chip active={false} onClick={layFlat}>
                      Lay Flat
                    </Chip>
                    <Chip active={selectedInstance.flip === 'x'} onClick={() => applyFlipToSelected('x')}>
                      Flip X 90°
                    </Chip>
                    <Chip active={selectedInstance.flip === 'y'} onClick={() => applyFlipToSelected('y')}>
                      Flip Y 90°
                    </Chip>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Chip active={false} onClick={() => rotateSelectedBy(-45)}>
                      −45°
                    </Chip>
                    <Chip active={false} onClick={() => rotateSelectedBy(45)}>
                      +45°
                    </Chip>
                    <Chip active={false} onClick={() => rotateSelectedBy(90)}>
                      +90°
                    </Chip>
                    <input
                      type="range"
                      min={0}
                      max={360}
                      value={selectedInstance.rotY}
                      onChange={(e) => handleRotate(selectedInstance.id, Number(e.target.value))}
                      aria-label="Rotate Z"
                      className="h-1 min-w-16 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-white"
                    />
                    <span className="w-9 shrink-0 text-right font-mono text-[10px] tabular-nums text-zinc-400">{selectedInstance.rotY}°</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[12px] leading-relaxed text-zinc-500">
              Add or select a model to tune material, infill, color mode and quantity.
            </p>
          )}
        </div>

        {/* Bottom: pinned action footer */}
        <div className="shrink-0 border-t border-white/[0.08] bg-zinc-950/90 p-3">
          {selected && est ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[14px] font-semibold tabular-nums text-zinc-100">
                  {rupees(est.low)}–{rupees(est.high)}
                </span>
                <span className="font-mono text-[10px] text-zinc-400">
                  {est.gramsTotal.toFixed(1)} g · ×{selected.params.qty} {selected.params.material} {selected.params.infill}%
                </span>
                <FreeDeliveryChip est={est} />
                {selected.syncState && <SyncPill state={selected.syncState} />}
              </div>
              {est.plates > 1 && (
                <p className="mt-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-amber-200/80">
                  {est.plates} PLATES ({plateCounts.join(' + ')} PCS) · INCLUDES +₹{est.extraPlateFee} EXTRA PLATE SETUP
                </p>
              )}
              <div className="mt-2.5 flex gap-2 [&>button]:flex-1">
                <GhostAction onClick={() => void duplicate(selected)}>Remix</GhostAction>
                <PrimaryAction onClick={() => onCommission(selected, est)}>
                  <IconWhatsApp size={13} />
                  Commission
                </PrimaryAction>
              </div>
            </>
          ) : (
            <p className="py-1 text-center font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500">
              Select an item to commission
            </p>
          )}
        </div>
      </aside>

      {/* ── RIGHT 3D BUILD-PLATE VIEWPORT ── */}
      <section
        className="relative min-h-0 bg-[#141418] outline-none lg:col-start-2 lg:row-start-1 lg:h-full"
        tabIndex={0}
        onKeyDown={onViewportKey}
      >
        {selected ? (
          <>
            <PlateViewport
              item={selected}
              instances={layout}
              activePlate={activePlate}
              selectedInstanceId={selectedInstanceId}
              collision={collision}
              interaction={tool}
              colors={{
                primary: filamentColor(selected.params.primaryColor).hex,
                secondary:
                  selected.params.colorMode !== 'single' && selected.params.secondaryColor
                    ? filamentColor(selected.params.secondaryColor).hex
                    : null,
              }}
              onSelectInstance={setSelectedInstanceId}
              onMoveInstance={handleMove}
              onRotateInstance={handleRotate}
              onReady={(api) => (viewportApi.current = api)}
              className="absolute inset-0"
            />
            {/* HUD — slicer toolbar (top-center) */}
            <div className="no-scrollbar absolute left-1/2 top-3 flex max-w-[96%] -translate-x-1/2 gap-1 overflow-x-auto rounded-xl border border-white/10 bg-black/55 p-1 backdrop-blur">
              {(
                [
                  ['move', `Select/Move (M)`, tool === 'move'],
                  ['rotate', `Rotate (R)`, tool === 'rotate'],
                ] as Array<[string, string, boolean]>
              ).map(([t, label, active]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTool(t as 'move' | 'rotate')}
                  className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-wider transition ${
                    active ? 'bg-white/20 text-white' : 'text-zinc-400 hover:bg-white/10 hover:text-zinc-100'
                  }`}
                >
                  {label}
                </button>
              ))}
              <span aria-hidden className="mx-0.5 w-px shrink-0 bg-white/15" />
              {(
                [
                  ['Lay Flat (F)', layFlat],
                  ['Clone (D)', cloneInstance],
                  ['Copy', copyInstance],
                  ['Cut', cutInstance],
                  ['Paste', pasteInstance],
                  ['Delete', deleteInstance],
                  ['Auto-Align (A)', autoAlign],
                ] as Array<[string, () => void]>
              ).map(([label, fn]) => (
                <button
                  key={label}
                  type="button"
                  onClick={fn}
                  className="shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-wider text-zinc-300 transition hover:bg-white/10 hover:text-white active:scale-[0.99]"
                >
                  {label}
                </button>
              ))}
            </div>
            {/* HUD — collision warning */}
            {collision && (
              <button
                type="button"
                onClick={autoAlign}
                className="absolute left-1/2 top-[54px] -translate-x-1/2 whitespace-nowrap rounded-lg border border-red-400/40 bg-red-500/20 px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-red-200 backdrop-blur transition hover:bg-red-500/30"
              >
                Collision detected — click Auto-Align to fix
              </button>
            )}
            {/* HUD — part telemetry (top-left) */}
            {selected.geom && (
              <div className="pointer-events-none absolute left-3 top-[54px] max-w-[70%] rounded-lg border border-white/10 bg-black/55 px-2.5 py-1.5 font-mono text-[10px] tabular-nums text-zinc-300 backdrop-blur">
                {selected.geom.bbox.x} × {selected.geom.bbox.y} × {selected.geom.bbox.z} mm
                {selected.geom.triangles > 0
                  ? ` · ${selected.geom.triangles.toLocaleString('en-IN')} tris`
                  : ' · library'}
                {` · ${(selected.geom.volumeMm3 / 1000).toFixed(1)} cm³`}
              </div>
            )}
            {/* HUD — view controls (top-right) */}
            <div className="absolute right-3 top-3 flex gap-1.5">
              <button
                type="button"
                onClick={() => viewportApi.current?.fit()}
                className="rounded-lg border border-white/10 bg-black/55 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-wider text-zinc-200 backdrop-blur transition hover:bg-black/75 active:scale-[0.99]"
              >
                Fit view
              </button>
              <button
                type="button"
                onClick={() => viewportApi.current?.reset()}
                className="rounded-lg border border-white/10 bg-black/55 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-wider text-zinc-200 backdrop-blur transition hover:bg-black/75 active:scale-[0.99]"
              >
                Reset orbit
              </button>
            </div>
            {/* HUD — plate switcher (bottom-center) */}
            {numPlates > 1 && (
              <div className="absolute bottom-12 left-1/2 flex -translate-x-1/2 gap-1 rounded-xl border border-white/10 bg-black/55 p-1 backdrop-blur">
                {plateIndices.map((p, ix) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => switchPlate(p)}
                    className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-wider transition ${
                      activePlate === p ? 'bg-white/20 text-white' : 'text-zinc-400 hover:bg-white/10 hover:text-zinc-100'
                    }`}
                  >
                    Plate {p + 1} ({plateCounts[ix]} pcs)
                  </button>
                ))}
              </div>
            )}
            {/* HUD — interaction hint (bottom-left) */}
            <p className="pointer-events-none absolute bottom-3 left-3 font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-500">
              Drag to orbit · scroll to zoom · 256×256 mm A1 plate
            </p>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <IconCube size={36} className="text-zinc-600" />
            <p className="mt-3 text-[13px] font-semibold text-zinc-300">The A1 build plate is empty</p>
            <p className="mt-1.5 max-w-xs text-[12px] leading-relaxed text-zinc-500">
              Drop an .stl or pick a saved part — it lands on the 256 × 256 mm plate at true scale.
            </p>
          </div>
        )}
      </section>

      {/* Multi-plate overflow popup — VisionOS glass */}
      {overflow && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="liquid-glass w-full max-w-md rounded-3xl p-6">
            <p className="text-[15px] font-semibold text-zinc-100">New Build Plate Required (Plate {overflow.numPlates})</p>
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-zinc-400">
              Only {overflow.maxPerPlate} pcs fit on a single 256×256mm A1 plate without overlapping. The remaining{' '}
              {overflow.leftover} pcs have been placed onto Plate {overflow.numPlates}. Each additional plate adds +₹
              {EXTRA_PLATE_FEE} for build-plate prep &amp; print setup.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row [&>button]:flex-1">
              <PrimaryAction
                onClick={() => {
                  switchPlate(overflow.numPlates - 1);
                  setOverflow(null);
                }}
              >
                Switch to Plate {overflow.numPlates}
              </PrimaryAction>
              <GhostAction
                onClick={() => {
                  switchPlate(0);
                  setOverflow(null);
                }}
              >
                Stay on Plate 1
              </GhostAction>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Mode 2: Studio Library workspace ────────────────────────────────────────

function libToShelfItem(lib: LibraryItem): ShelfItem {
  return {
    id: uid(),
    name: lib.name,
    addedAt: Date.now(),
    updatedAt: Date.now(),
    source: 'library',
    libId: lib.id,
    geom: { triangles: 0, bbox: lib.dims, volumeMm3: lib.volumeCm3 * 1000, surfaceMm2: 0 },
    thumb: '',
    params: { material: lib.recMaterial, infill: lib.recInfill, colorMode: 'single', qty: 1 },
    history: [],
  };
}

function LibraryWorkspace({
  onAdded,
  onCommission,
}: {
  onAdded: (item: ShelfItem) => void;
  onCommission: CommissionFn;
}) {
  const categories = ['All', 'Electronics', 'Robotics', 'Desk & Utility'] as const;
  const [cat, setCat] = useState<(typeof categories)[number]>('All');
  const [libId, setLibId] = useState<string | null>(null);
  const selected = LIBRARY.find((l) => l.id === libId) ?? null;
  const list = LIBRARY.filter((i) => cat === 'All' || i.category === cat);
  const est = selected
    ? estimatePrint({ volumeMm3: selected.volumeCm3 * 1000, material: selected.recMaterial, infill: selected.recInfill, colorMode: 'single', qty: 1 })
    : null;

  const addToShelf = (lib: LibraryItem) => {
    const item = libToShelfItem(lib);
    void saveShelfItem(item).then(() => onAdded(item));
  };

  const oneTapOrder = (lib: LibraryItem) => {
    const item = libToShelfItem(lib);
    void saveShelfItem(item);
    onCommission(item, estimatePrint({ volumeMm3: lib.volumeCm3 * 1000, material: lib.recMaterial, infill: lib.recInfill, colorMode: 'single', qty: 1 }));
  };

  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <SectionLabel>Filter</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
                {c}
              </Chip>
            ))}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((lib) => {
            const grams = libraryGrams(lib);
            return (
              <button
                key={lib.id}
                type="button"
                onClick={() => setLibId(lib.id)}
                className={`flex flex-col rounded-2xl border p-4 text-left transition active:scale-[0.995] ${
                  libId === lib.id
                    ? 'border-white/30 bg-white/[0.08]'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-black/40">
                    <IconCube size={20} className="text-zinc-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold leading-snug text-zinc-100">{lib.name}</p>
                    <p className="mt-1 font-mono text-[10px] tabular-nums text-zinc-400">
                      {lib.dims.x} × {lib.dims.y} × {lib.dims.z} mm · ≈{grams.toFixed(1)} g · {lib.recMaterial} {lib.recInfill}%
                    </p>
                  </div>
                </div>
                <p className="mt-2.5 text-[11.5px] leading-relaxed text-zinc-400">{lib.blurb}</p>
              </button>
            );
          })}
        </div>

        {/* Selected item — detail + actions in flow, directly under the grid */}
        {selected && est ? (
          <Group className="mt-5">
            <p className="text-[15px] font-semibold text-zinc-100">{selected.name}</p>
            <p className="mt-1 font-mono text-[10px] tabular-nums text-zinc-400">
              {selected.dims.x} × {selected.dims.y} × {selected.dims.z} mm · {selected.volumeCm3.toFixed(1)} cm³ solid
            </p>
            <p className="mt-2.5 text-[12px] leading-relaxed text-zinc-400">{selected.blurb}</p>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500">
              Recommended: {selected.recMaterial} · {selected.recInfill}% infill
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-white/[0.08] pt-4">
              <span className="font-mono text-[14px] font-semibold tabular-nums text-zinc-100">
                EST {rupees(est.low)}–{rupees(est.high)}
              </span>
              <span className="font-mono text-[10px] text-zinc-400">≈{libraryGrams(selected).toFixed(1)} g</span>
              <FreeDeliveryChip est={est} />
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <GhostAction onClick={() => addToShelf(selected)}>Add to shelf</GhostAction>
              <PrimaryAction onClick={() => oneTapOrder(selected)}>
                <IconWhatsApp size={13} />
                1-Tap order
              </PrimaryAction>
            </div>
          </Group>
        ) : (
          <p className="mt-5 text-center text-[12px] leading-relaxed text-zinc-500">
            Select a library item for details and ordering.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Mode 3: Model Sourcing workspace ────────────────────────────────────────

function SourcingWorkspace({ onChanged }: { onChanged: () => void }) {
  const [what, setWhat] = useState('');
  const [category, setCategory] = useState<string>(SOURCING_CATEGORIES[0]);
  const [sizeNotes, setSizeNotes] = useState('');
  const [assembly, setAssembly] = useState<string>(ASSEMBLY_MODES[0]);
  const [delivery, setDelivery] = useState<string>(DELIVERY_MODES[0]);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<LogEntry[]>([]);

  const loadRecent = useCallback(() => {
    void listLog().then((rows) => setRecent(rows.filter((r) => r.kind === 'sourcing').slice(0, 5)));
  }, []);
  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  const submit = () => {
    if (what.trim().length < 10) {
      setError('Describe the part in at least 10 characters.');
      return;
    }
    setError(null);
    const req: SourcingRequest = { what, category, sizeNotes, assembly, delivery };
    const ticketId = generateHubTicketId('SRC');
    // Popup first, synchronously — never behind an await (popup blockers).
    window.open(sourcingWhatsAppUrl(req, ticketId), '_blank', 'noopener');

    void (async () => {
      const entry: LogEntry = {
        id: uid(),
        at: Date.now(),
        kind: 'sourcing',
        ticketId,
        summary: { what: req.what.slice(0, 120), category, assembly, delivery, sizeNotes: req.sizeNotes || null },
        sync: 'syncing',
      };
      await addLogEntry(entry);
      try {
        await submitHubRequest({
          ticket_id: ticketId,
          kind: 'sourcing',
          item_name: req.what.slice(0, 80),
          file_name: null,
          specs: null,
          params: { category, assembly, delivery },
          estimate: null,
          note: req.sizeNotes || null,
          storage_path: null,
        });
        await addLogEntry({ ...entry, sync: 'synced' });
      } catch {
        await addLogEntry({ ...entry, sync: 'local-only' });
      }
      loadRecent();
      onChanged();
    })();

    setWhat('');
    setSizeNotes('');
  };

  const inputCls =
    'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-[13px] text-zinc-100 placeholder:text-zinc-500 outline-none transition focus:border-white/30 focus:bg-white/[0.06]';

  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6 sm:py-6">
        {/* Request builder — one grouped card, submit at the bottom */}
        <Group>
          <div className="flex flex-col gap-5">
            <div>
              <SectionLabel>What are you building / looking for?</SectionLabel>
              <textarea
                value={what}
                onChange={(e) => setWhat(e.target.value)}
                rows={4}
                placeholder="e.g. A snap enclosure for a soil-moisture sensor node — two boards, USB-C cutout"
                className={`${inputCls} mt-2 resize-none leading-relaxed`}
              />
            </div>
            <div>
              <SectionLabel>Category</SectionLabel>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SOURCING_CATEGORIES.map((c) => (
                  <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
                    {c}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <SectionLabel>Size / reference link / notes (optional)</SectionLabel>
              <input
                value={sizeNotes}
                onChange={(e) => setSizeNotes(e.target.value)}
                placeholder="e.g. ~60 × 30 mm, or a product link"
                className={`${inputCls} mt-2`}
              />
            </div>
            <div>
              <SectionLabel>Assembly preference</SectionLabel>
              <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {ASSEMBLY_MODES.map((a) => (
                  <Chip key={a} active={assembly === a} onClick={() => setAssembly(a)}>
                    {a}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <SectionLabel>Delivery / pickup</SectionLabel>
              <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {DELIVERY_MODES.map((d) => (
                  <Chip key={d} active={delivery === d} onClick={() => setDelivery(d)}>
                    {d}
                  </Chip>
                ))}
              </div>
            </div>
            {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 font-mono text-[11px] text-red-300">{error}</p>}

            {/* Primary action — bottom of the form, full-width on mobile */}
            <div className="border-t border-white/[0.08] pt-4">
              <PrimaryAction onClick={submit} wide>
                <IconWhatsApp size={14} />
                Request file discovery
              </PrimaryAction>
              <p className="mt-2.5 text-center font-mono text-[9.5px] uppercase tracking-[0.1em] text-zinc-500">
                Zero-login ticket · STAN-SRC-XXXX · we reply with a model preview on WhatsApp
              </p>
            </div>
          </div>
        </Group>

        {/* Recent tickets — quiet history below the form */}
        {recent.length > 0 && (
          <section className="mt-4">
            <SectionLabel>Recent sourcing tickets</SectionLabel>
            <div className="mt-2 flex flex-col gap-1.5">
              {recent.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                >
                  <span className="truncate font-mono text-[10.5px] text-zinc-400">
                    #{r.ticketId} · {String(r.summary.what ?? '').slice(0, 44)}
                  </span>
                  <SyncPill state={r.sync} />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ─── Shell ───────────────────────────────────────────────────────────────────

export default function CustomStlHub({ title }: { title: string }) {
  const [mode, setMode] = useState<HubTab>(() => {
    try {
      const t = localStorage.getItem('stan-hub-tab');
      if (t === 'shelf' || t === 'library' || t === 'sourcing') return t;
    } catch {
      /* private mode */
    }
    return 'shelf';
  });
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const reload = useCallback(() => {
    void listShelf().then((rows) => {
      setItems(rows);
      setSelectedId((cur) => cur ?? rows[0]?.id ?? null);
    });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const commission = useCommission(reload);

  // Mode tabs live INSIDE the workspace chrome bar (Bambu Prepare/Preview style)
  const tabSwitcher = (
    <div role="tablist" className="no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
      {(
        [
          ['shelf', 'Private Shelf', items.length],
          ['library', 'Studio Library', null],
          ['sourcing', 'Model Sourcing', null],
        ] as Array<[HubTab, string, number | null]>
      ).map(([key, label, count]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={mode === key}
          onClick={() => {
            setMode(key);
            try {
              localStorage.setItem('stan-hub-tab', key);
            } catch {
              /* private mode */
            }
          }}
          className={`shrink-0 whitespace-nowrap rounded-lg px-2 py-1.5 font-mono text-[9.5px] tracking-wider transition sm:px-3 sm:text-[10.5px] ${
            mode === key ? 'bg-white/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]' : 'text-zinc-400 hover:text-zinc-100'
          }`}
        >
          {label}
          {count !== null && count > 0 ? <span className="ml-1 text-white/35">{count}</span> : null}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WorkspaceChrome title={title} center={tabSwitcher} />

      {storageDegraded() && (
        <p className="mx-4 mt-2 rounded-xl bg-amber-400/10 px-3 py-2 font-mono text-[10.5px] text-amber-200/80 sm:mx-6">
          On-device storage unavailable — shelf lasts this session only.
        </p>
      )}

      <div key={mode} className="animate-in fade-in flex min-h-0 flex-1 flex-col duration-300">
        {mode === 'shelf' && (
          <ShelfWorkspace items={items} selectedId={selectedId} onSelect={setSelectedId} reload={reload} onCommission={commission} />
        )}
        {mode === 'library' && (
          <LibraryWorkspace
            onAdded={(item) => {
              reload();
              setMode('shelf');
              setSelectedId(item.id);
            }}
            onCommission={commission}
          />
        )}
        {mode === 'sourcing' && <SourcingWorkspace onChanged={reload} />}
      </div>
    </div>
  );
}

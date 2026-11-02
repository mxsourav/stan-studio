import { useCallback, useEffect, useRef, useState } from 'react';
import { IconCube, IconUpload, IconWhatsApp } from '../icons';
import { drawMeshOnCanvas, renderStlThumb, sessionMeshCache } from '../../lib/stlThumb';
import { readStlMesh } from '../../lib/stl';
import {
  ASSEMBLY_MODES,
  COLOR_MODES,
  DELIVERY_MODES,
  INFILL_PRESETS,
  LIBRARY,
  MATERIALS,
  MAX_FILE_MB,
  SOURCING_CATEGORIES,
  addLogEntry,
  colorMode,
  commissionWhatsAppUrl,
  estimatePrint,
  generateHubTicketId,
  getShelfFile,
  libraryGrams,
  listLog,
  listShelf,
  putShelfFile,
  removeShelfItem,
  saveShelfItem,
  sourcingWhatsAppUrl,
  storageDegraded,
  uid,
  type Estimate,
  type LibraryItem,
  type LogEntry,
  type ShelfItem,
  type SourcingRequest,
} from '../../lib/stlHub';
import { submitHubRequest, uploadStlFile } from '../../lib/hubPipeline';

/**
 * Custom STL Hub — zero-login commissioning workspace, rendered inside the
 * /tools/stl-hub fullscreen shell (left shelf rail, central preview viewport,
 * right parameter rail, bottom telemetry bar). Modes: Private Shelf, Studio
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
      className={`rounded-lg px-2.5 py-1 font-mono text-[10.5px] transition active:scale-[0.99] ${
        active
          ? 'bg-white/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]'
          : 'text-white/45 hover:bg-white/[0.06] hover:text-white/85'
      }`}
    >
      {children}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[9.5px] uppercase tracking-wider text-white/35">{children}</p>;
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
            params: { ...item.params },
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

// ─── Mesh preview (drag-to-rotate when the parsed mesh is in session memory) ──

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

// ─── Shelf rail row ──────────────────────────────────────────────────────────

function ShelfRow({ item, selected, onSelect }: { item: ShelfItem; selected: boolean; onSelect: () => void }) {
  const est = estimatePrint({ volumeMm3: item.geom?.volumeMm3 ?? 0, ...item.params });
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-2.5 rounded-xl border p-2 text-left transition ${
        selected ? 'border-white/25 bg-white/[0.08]' : 'border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06]'
      }`}
    >
      <MeshView item={item} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-white">{item.name}</span>
        <span className="mt-0.5 block font-mono text-[9.5px] tabular-nums text-white/40">
          {rupees(est.low)}–{rupees(est.high)} · {est.gramsTotal.toFixed(1)} g
        </span>
      </span>
      {item.syncState && <SyncPill state={item.syncState} />}
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
        <div className="mt-1.5 flex flex-wrap gap-1">
          {MATERIALS.map((m) => (
            <Chip key={m.id} active={item.params.material === m.id} onClick={() => onSetParams({ material: m.id })}>
              {m.id}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <SectionLabel>Infill</SectionLabel>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {INFILL_PRESETS.map((p) => (
            <Chip key={p} active={item.params.infill === p} onClick={() => onSetParams({ infill: p })}>
              {p}%
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <SectionLabel>Color mode</SectionLabel>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {COLOR_MODES.map((c) => (
            <Chip key={c.id} active={item.params.colorMode === c.id} onClick={() => onSetParams({ colorMode: c.id })}>
              {c.label}
              {c.mult !== 1 ? <span className="ml-1 text-white/35">×{c.mult}</span> : null}
            </Chip>
          ))}
        </div>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <SectionLabel>Quantity</SectionLabel>
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSetParams({ qty: Math.max(1, item.params.qty - 1) })}
              className="h-7 w-7 rounded-lg border border-white/[0.1] bg-white/[0.05] font-mono text-[13px] text-white/80 transition hover:bg-white/[0.1] active:scale-[0.99]"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="w-8 text-center font-mono text-[13px] tabular-nums text-white">{item.params.qty}</span>
            <button
              type="button"
              onClick={() => onSetParams({ qty: Math.min(99, item.params.qty + 1) })}
              className="h-7 w-7 rounded-lg border border-white/[0.1] bg-white/[0.05] font-mono text-[13px] text-white/80 transition hover:bg-white/[0.1] active:scale-[0.99]"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
        </div>
        <div className="text-right">
          <SectionLabel>Per unit</SectionLabel>
          <p className="mt-1 font-mono text-[11px] tabular-nums text-white/70">
            {rupees(est.perUnitLow)}–{rupees(est.perUnitHigh)}
          </p>
        </div>
      </div>
      {est.floorApplied > 0 && (
        <p className="font-mono text-[9.5px] uppercase tracking-wider text-white/35">
          Includes {rupees(est.floorApplied)} setup floor · {mode.label} ×{mode.mult}
        </p>
      )}
      <p className="font-mono text-[9.5px] text-white/30">
        {est.gramsPerUnit.toFixed(2)} g/unit at {item.params.material} · remixes saved: {item.history.length}
      </p>
      <p className="font-mono text-[9px] uppercase tracking-wider text-white/25">Changes auto-save on-device</p>
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
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = items.find((i) => i.id === selectedId) ?? null;
  const previewSize = typeof window !== 'undefined' && window.innerWidth < 640 ? 260 : 420;

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

  const setParams = (next: Partial<ShelfItem['params']>) => {
    if (!selected) return;
    const params = { ...selected.params, ...next };
    void patchItem(selected, {}, params).then(() => reload());
  };

  const est = selected ? estimatePrint({ volumeMm3: selected.geom?.volumeMm3 ?? 0, ...selected.params }) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {/* Left rail — vault list */}
      <aside className="liquid-glass no-scrollbar flex w-full shrink-0 flex-col gap-2 overflow-y-auto rounded-none border-b border-white/[0.06] p-3 lg:w-[280px] lg:border-b-0 lg:border-r">
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
          className={`min-h-[44px] cursor-pointer rounded-xl border border-dashed px-3 py-3 text-center transition ${
            dragging
              ? 'border-white/50 bg-white/[0.08]'
              : 'border-white/[0.18] bg-white/[0.03] hover:border-white/35 hover:bg-white/[0.06]'
          }`}
        >
          <input ref={inputRef} type="file" accept=".stl" className="hidden" onChange={(e) => void handleFile(e.target.files?.[0])} />
          <p className="flex items-center justify-center gap-2 font-mono text-[11px] text-white/80">
            <IconUpload size={13} className="text-white/50" />
            {busy ? 'Parsing mesh…' : 'Drop .stl or tap'}
          </p>
        </div>
        {items.length === 0 ? (
          <p className="py-6 text-center font-mono text-[10.5px] text-white/35">Shelf is empty.</p>
        ) : (
          items.map((item) => (
            <ShelfRow key={item.id} item={item} selected={item.id === selectedId} onSelect={() => onSelect(item.id)} />
          ))
        )}
        <p className="mt-auto pt-2 text-center font-mono text-[9px] uppercase tracking-wider text-white/25">
          {items.length} item{items.length === 1 ? '' : 's'} · on-device vault
        </p>
      </aside>

      {/* Central preview viewport */}
      <section
        className="frosted-viewport no-scrollbar relative flex min-h-[300px] flex-1 flex-col items-center justify-center gap-3 overflow-y-auto rounded-none p-4 sm:p-8"
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
      >
        {selected ? (
          <>
            <MeshView item={selected} size={previewSize} />
            <div className="text-center">
              <p className="text-[13px] font-semibold text-white">{selected.name}</p>
              {selected.geom && (
                <p className="mt-1 font-mono text-[10px] tabular-nums text-white/45">
                  {selected.geom.bbox.x} × {selected.geom.bbox.y} × {selected.geom.bbox.z} mm
                  {selected.geom.triangles > 0
                    ? ` · ${selected.geom.triangles.toLocaleString('en-IN')} tris`
                    : ' · library'}
                  {` · ${(selected.geom.volumeMm3 / 1000).toFixed(1)} cm³`}
                </p>
              )}
              {sessionMeshCache.has(selected.id) && (
                <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-white/25">Drag to rotate</p>
              )}
            </div>
          </>
        ) : (
          <div className="text-center">
            <IconCube size={40} className="mx-auto text-white/20" />
            <p className="mt-3 max-w-xs font-mono text-[11px] leading-relaxed text-white/40">
              Drop an .stl here or use the shelf rail — parsed and vaulted on-device.
            </p>
          </div>
        )}
        {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 font-mono text-[11px] text-red-300">{error}</p>}
      </section>

      {/* Right rail — remix parameters */}
      <aside className="liquid-glass no-scrollbar w-full shrink-0 overflow-y-auto rounded-none border-t border-white/[0.06] p-4 lg:w-[320px] lg:border-l lg:border-t-0">
        {selected ? (
          <>
            <div className="mb-3 flex items-center justify-between gap-2">
              <SectionLabel>Remix parameters</SectionLabel>
              {confirmDelete ? (
                <span className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-wider text-white/60">
                  Delete?
                  <button
                    type="button"
                    onClick={() => void remove(selected)}
                    className="rounded-lg bg-red-500/15 px-2 py-1 text-red-300 transition hover:bg-red-500/25"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-lg bg-white/[0.06] px-2 py-1 transition hover:bg-white/[0.12]"
                  >
                    No
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  aria-label="Delete"
                  className="rounded-lg p-1.5 text-white/35 transition hover:bg-white/[0.08] hover:text-red-300"
                >
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M4.5 6.5h15M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5M6.5 6.5l1 12a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-12" />
                  </svg>
                </button>
              )}
            </div>
            <ItemEditor item={selected} onSetParams={setParams} />
          </>
        ) : (
          <p className="font-mono text-[10.5px] leading-relaxed text-white/35">
            Select a shelf item to tune material, infill, color mode and quantity.
          </p>
        )}
      </aside>

      {/* Bottom telemetry bar */}
      <footer className="liquid-glass sticky bottom-0 z-20 flex shrink-0 items-center justify-between gap-3 overflow-x-auto rounded-none border-x-0 border-b-0 px-4 py-2 sm:px-6">
        {selected && est ? (
          <>
            <span className="flex items-center gap-2.5 whitespace-nowrap">
              <span className="font-mono text-[13px] font-semibold tabular-nums text-white">
                {rupees(est.low)}–{rupees(est.high)}
              </span>
              <span className="font-mono text-[10px] text-white/40">
                {est.gramsTotal.toFixed(1)} g · ×{selected.params.qty} {selected.params.material} {selected.params.infill}%
              </span>
              <FreeDeliveryChip est={est} />
              {selected.syncState && <SyncPill state={selected.syncState} />}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => void duplicate(selected)}
                className="rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-white/70 transition hover:bg-white/[0.1] active:scale-[0.99]"
              >
                Remix
              </button>
              <button
                type="button"
                onClick={() => onCommission(selected, est)}
                className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-black transition hover:bg-white/90 active:scale-[0.99]"
              >
                <IconWhatsApp size={12} />
                Commission
              </button>
            </span>
          </>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-wider text-white/35">Select an item to commission</span>
        )}
      </footer>
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
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {/* Central library grid */}
      <section className="no-scrollbar min-h-0 flex-1 overflow-y-auto rounded-none p-4 sm:p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <SectionLabel>Filter</SectionLabel>
          <div className="flex flex-wrap gap-1">
            {categories.map((c) => (
              <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
                {c}
              </Chip>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((lib) => {
            const grams = libraryGrams(lib);
            return (
              <button
                key={lib.id}
                type="button"
                onClick={() => setLibId(lib.id)}
                className={`flex flex-col rounded-2xl border p-3 text-left transition ${
                  libId === lib.id ? 'border-white/25 bg-white/[0.08]' : 'border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-black/40">
                    <IconCube size={20} className="text-white/35" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold leading-snug text-white">{lib.name}</p>
                    <p className="mt-0.5 font-mono text-[9.5px] tabular-nums text-white/40">
                      {lib.dims.x} × {lib.dims.y} × {lib.dims.z} mm · ≈{grams.toFixed(1)} g · {lib.recMaterial} {lib.recInfill}%
                    </p>
                  </div>
                </div>
                <p className="mt-1.5 text-[10.5px] leading-snug text-white/45">{lib.blurb}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Right rail — selected item detail */}
      <aside className="liquid-glass no-scrollbar w-full shrink-0 overflow-y-auto rounded-none border-t border-white/[0.06] p-4 lg:w-[320px] lg:border-l lg:border-t-0">
        {selected ? (
          <div className="flex flex-col gap-3">
            <SectionLabel>Item detail</SectionLabel>
            <p className="text-[13px] font-semibold text-white">{selected.name}</p>
            <p className="font-mono text-[10px] tabular-nums text-white/45">
              {selected.dims.x} × {selected.dims.y} × {selected.dims.z} mm · {selected.volumeCm3.toFixed(1)} cm³ solid
            </p>
            <p className="text-[11px] leading-snug text-white/45">{selected.blurb}</p>
            <p className="font-mono text-[9.5px] uppercase tracking-wider text-white/35">
              Recommended: {selected.recMaterial} · {selected.recInfill}% infill
            </p>
          </div>
        ) : (
          <p className="font-mono text-[10.5px] leading-relaxed text-white/35">Select a library item for details and ordering.</p>
        )}
      </aside>

      {/* Bottom telemetry bar */}
      <footer className="liquid-glass sticky bottom-0 z-20 flex shrink-0 items-center justify-between gap-3 overflow-x-auto rounded-none border-x-0 border-b-0 px-4 py-2 sm:px-6">
        {selected && est ? (
          <>
            <span className="flex items-center gap-2.5 whitespace-nowrap">
              <span className="font-mono text-[13px] font-semibold tabular-nums text-white">
                {rupees(est.low)}–{rupees(est.high)}
              </span>
              <span className="font-mono text-[10px] text-white/40">EST · {libraryGrams(selected).toFixed(1)} g</span>
              <FreeDeliveryChip est={est} />
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => addToShelf(selected)}
                className="rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-white/70 transition hover:bg-white/[0.1] active:scale-[0.99]"
              >
                Add to shelf
              </button>
              <button
                type="button"
                onClick={() => oneTapOrder(selected)}
                className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-black transition hover:bg-white/90 active:scale-[0.99]"
              >
                <IconWhatsApp size={12} />
                1-Tap order
              </button>
            </span>
          </>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-wider text-white/35">Select an item to order</span>
        )}
      </footer>
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
    'w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-2.5 text-[12.5px] text-white placeholder:text-white/30 outline-none transition focus:border-white/30';

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {/* Central request builder */}
      <section className="no-scrollbar min-h-0 flex-1 overflow-y-auto rounded-none p-4 sm:p-6 lg:p-8">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          <div>
            <SectionLabel>What are you building / looking for?</SectionLabel>
            <textarea
              value={what}
              onChange={(e) => setWhat(e.target.value)}
              rows={3}
              placeholder="e.g. A snap enclosure for a soil-moisture sensor node — two boards, USB-C cutout"
              className={`${inputCls} mt-1.5 resize-none`}
            />
          </div>
          <div>
            <SectionLabel>Category</SectionLabel>
            <div className="mt-1.5 flex flex-wrap gap-1">
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
              className={`${inputCls} mt-1.5`}
            />
          </div>
          <div>
            <SectionLabel>Assembly preference</SectionLabel>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {ASSEMBLY_MODES.map((a) => (
                <Chip key={a} active={assembly === a} onClick={() => setAssembly(a)}>
                  {a}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <SectionLabel>Delivery / pickup</SectionLabel>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {DELIVERY_MODES.map((d) => (
                <Chip key={d} active={delivery === d} onClick={() => setDelivery(d)}>
                  {d}
                </Chip>
              ))}
            </div>
          </div>
          {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 font-mono text-[11px] text-red-300">{error}</p>}
        </div>
      </section>

      {/* Right rail — recent sourcing tickets */}
      <aside className="liquid-glass no-scrollbar w-full shrink-0 overflow-y-auto rounded-none border-t border-white/[0.06] p-4 lg:w-[320px] lg:border-l lg:border-t-0">
        {recent.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <SectionLabel>Recent sourcing tickets</SectionLabel>
            {recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[10.5px] text-white/60">
                  #{r.ticketId} · {String(r.summary.what ?? '').slice(0, 44)}
                </span>
                <SyncPill state={r.sync} />
              </div>
            ))}
          </div>
        ) : (
          <p className="font-mono text-[10.5px] leading-relaxed text-white/35">
            Describe the part — the studio hunts down a valid printable model and shares the preview on WhatsApp.
          </p>
        )}
      </aside>

      {/* Bottom telemetry bar */}
      <footer className="liquid-glass sticky bottom-0 z-20 flex shrink-0 items-center justify-between gap-3 rounded-none border-x-0 border-b-0 px-4 py-2 sm:px-6">
        <span className="truncate font-mono text-[10px] uppercase tracking-wider text-white/35">
          Zero-login ticket · STAN-SRC-XXXX
        </span>
        <button
          type="button"
          onClick={submit}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-white px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-black transition hover:bg-white/90 active:scale-[0.99]"
        >
          <IconWhatsApp size={12} />
          Request file discovery
        </button>
      </footer>
    </div>
  );
}

// ─── Shell ───────────────────────────────────────────────────────────────────

export default function CustomStlHub() {
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Workspace mode switcher — pinned under the shell header */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5 sm:px-6">
        <div role="tablist" className="flex gap-1 rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
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
              className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider transition sm:text-[10.5px] ${
                mode === key ? 'bg-white/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]' : 'text-white/45 hover:text-white/80'
              }`}
            >
              {label}
              {count !== null && count > 0 ? <span className="ml-1 text-white/35">{count}</span> : null}
            </button>
          ))}
        </div>
        <span className="hidden font-mono text-[9px] uppercase tracking-wider text-white/30 lg:block">
          Zero-login · on-device vault · WhatsApp commission
        </span>
      </div>

      {storageDegraded() && (
        <p className="mx-4 mt-2 rounded-xl bg-amber-400/10 px-3 py-2 font-mono text-[10.5px] text-amber-200/80 sm:mx-6">
          On-device storage unavailable — shelf lasts this session only.
        </p>
      )}

      <div className="animate-in fade-in flex min-h-0 flex-1 flex-col duration-300">
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

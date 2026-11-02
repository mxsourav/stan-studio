import { useCallback, useEffect, useRef, useState } from 'react';
import { IconCheckmark, IconCube, IconUpload, IconWhatsApp, IconXmark } from '../icons';
import { drawMeshOnCanvas, sessionMeshCache } from '../../lib/stlThumb';
import { renderStlThumb } from '../../lib/stlThumb';
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
 * Custom STL Hub — zero-login commissioning workspace.
 * Three tabs: Private Shelf (IndexedDB STL vault + estimates + 1-tap reorder),
 * Studio Library (curated maker essentials), Model Sourcing (request builder).
 * Every ticket opens WhatsApp immediately; the DB sync completes in background.
 */

const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const COLOR_SHORT: Record<string, string> = {
  single: 'SINGLE',
  'dual-swap': '2-TONE SWAP',
  'split-diy': 'DIY KIT',
  'split-bonded': 'STUDIO BONDED',
};

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

// ─── Tab 1: Private Shelf ────────────────────────────────────────────────────

function ShelfTab({
  items,
  reload,
  onCommission,
  onExpand,
  expandedId,
}: {
  items: ShelfItem[];
  reload: () => void;
  onCommission: CommissionFn;
  onExpand: (id: string | null) => void;
  expandedId: string | null;
}) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
        onExpand(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not read that file');
      } finally {
        setBusy(false);
      }
    },
    [reload, onExpand],
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
        fileStored: item.fileStored,
        history: [],
      });
      reload();
      onExpand(id);
    },
    [reload, onExpand],
  );

  const remove = useCallback(
    async (item: ShelfItem) => {
      await removeShelfItem(item.id);
      reload();
      setConfirmId(null);
      if (expandedId === item.id) onExpand(null);
    },
    [reload, expandedId, onExpand],
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Drop & validate */}
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
        className={`min-h-[44px] cursor-pointer rounded-2xl border border-dashed px-4 py-3.5 text-center transition ${
          dragging
            ? 'border-white/50 bg-white/[0.08]'
            : 'border-white/[0.18] bg-white/[0.03] hover:border-white/35 hover:bg-white/[0.06]'
        }`}
      >
        <input ref={inputRef} type="file" accept=".stl" className="hidden" onChange={(e) => void handleFile(e.target.files?.[0])} />
        <p className="flex items-center justify-center gap-2 font-mono text-[11.5px] text-white/80">
          <IconUpload size={14} className="text-white/50" />
          {busy ? 'Parsing mesh…' : 'Drop an .stl or tap to validate'}
        </p>
        <p className="mt-1 font-mono text-[9.5px] uppercase tracking-wider text-white/35">
          On-device vault · nothing leaves the browser until you commission
        </p>
      </div>
      {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 font-mono text-[11px] text-red-300">{error}</p>}

      {/* Shelf grid */}
      {items.length === 0 ? (
        <p className="py-6 text-center font-mono text-[11px] text-white/35">Shelf is empty.</p>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {items.map((item) => (
            <ShelfCard
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              confirmDelete={confirmId === item.id}
              onToggle={() => onExpand(expandedId === item.id ? null : item.id)}
              onCommission={onCommission}
              onDuplicate={() => void duplicate(item)}
              onAskDelete={() => setConfirmId(item.id)}
              onCancelDelete={() => setConfirmId(null)}
              onDelete={() => void remove(item)}
              reload={reload}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Drag-to-rotate canvas when the parsed mesh is in session memory; else stored thumb. */
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

function ShelfCard({
  item,
  expanded,
  confirmDelete,
  onToggle,
  onCommission,
  onDuplicate,
  onAskDelete,
  onCancelDelete,
  onDelete,
  reload,
}: {
  item: ShelfItem;
  expanded: boolean;
  confirmDelete: boolean;
  onToggle: () => void;
  onCommission: CommissionFn;
  onDuplicate: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  reload: () => void;
}) {
  const volCm3 = item.geom ? item.geom.volumeMm3 / 1000 : 0;
  const est = estimatePrint({ volumeMm3: item.geom?.volumeMm3 ?? 0, ...item.params });

  const setParams = (next: Partial<ShelfItem['params']>) => {
    const params = { ...item.params, ...next };
    void patchItem(item, {}, params).then(() => reload());
  };

  return (
    <div className={`rounded-2xl border bg-white/[0.04] p-3 transition ${expanded ? 'border-white/25' : 'border-white/[0.1]'}`}>
      <div className="flex items-start gap-2.5">
        <MeshView item={item} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <button type="button" onClick={onToggle} className="min-w-0 text-left">
              <p className="truncate text-[13px] font-semibold text-white">{item.name}</p>
              {item.geom && (
                <p className="mt-0.5 font-mono text-[9.5px] tabular-nums text-white/40">
                  {item.geom.bbox.x} × {item.geom.bbox.y} × {item.geom.bbox.z} mm
                  {item.geom.triangles > 0 ? ` · ${item.geom.triangles.toLocaleString('en-IN')} tris` : ' · library'}
                </p>
              )}
            </button>
            {item.syncState && <SyncPill state={item.syncState} />}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <span className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9px] text-white/45">{item.params.material}</span>
            <span className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9px] text-white/45">{item.params.infill}%</span>
            <span className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9px] text-white/45">{COLOR_SHORT[item.params.colorMode] ?? item.params.colorMode}</span>
            <span className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9px] text-white/45">×{item.params.qty}</span>
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2.5">
        <div className="min-w-0">
          <p className="font-mono text-[13px] font-semibold tabular-nums text-white">
            {rupees(est.low)}–{rupees(est.high)}
            <span className="ml-1.5 text-[10px] font-normal text-white/40">{est.gramsTotal.toFixed(1)} g</span>
          </p>
          <div className="mt-0.5">
            <FreeDeliveryChip est={est} />
          </div>
        </div>
        {confirmDelete ? (
          <span className="flex shrink-0 items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-wider text-white/60">
            Delete?
            <button type="button" onClick={onDelete} className="rounded-lg bg-red-500/15 px-2 py-1 text-red-300 transition hover:bg-red-500/25">
              Yes
            </button>
            <button type="button" onClick={onCancelDelete} className="rounded-lg bg-white/[0.06] px-2 py-1 transition hover:bg-white/[0.12]">
              No
            </button>
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={onAskDelete} aria-label="Delete" className="rounded-lg p-1.5 text-white/35 transition hover:bg-white/[0.08] hover:text-red-300">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M4.5 6.5h15M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5M6.5 6.5l1 12a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-12" />
              </svg>
            </button>
            <button type="button" onClick={onDuplicate} className="rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-white/70 transition hover:bg-white/[0.1] active:scale-[0.99]">
              Remix
            </button>
            <button
              type="button"
              onClick={() => onCommission(item, est)}
              className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-black transition hover:bg-white/90 active:scale-[0.99]"
            >
              <IconWhatsApp size={12} />
              Commission
            </button>
          </span>
        )}
      </div>

      {expanded && (
        <ItemEditor item={item} onSetParams={setParams} volCm3={volCm3} onToggle={onToggle} />
      )}
    </div>
  );
}

function ItemEditor({
  item,
  onSetParams,
  volCm3,
  onToggle,
}: {
  item: ShelfItem;
  onSetParams: (next: Partial<ShelfItem['params']>) => void;
  volCm3: number;
  onToggle: () => void;
}) {
  const est = estimatePrint({ volumeMm3: item.geom?.volumeMm3 ?? 0, ...item.params });
  return (
    <div className="mt-3 flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-black/30 p-3">
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
      <div className="flex items-center justify-between gap-3">
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
          Includes {rupees(est.floorApplied)} setup floor · {colorMode(item.params.colorMode).label} ×{colorMode(item.params.colorMode).mult}
        </p>
      )}
      <p className="font-mono text-[9.5px] text-white/30">
        {volCm3 > 0 ? `${volCm3.toFixed(1)} cm³ solid mesh · ` : ''}
        {est.gramsPerUnit.toFixed(2)} g/unit at {item.params.material} · remixes saved: {item.history.length}
      </p>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-fit items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-wider text-white/40 transition hover:text-white/80"
      >
        <IconCheckmark size={11} />
        Done tuning
      </button>
    </div>
  );
}

// ─── Tab 2: Studio Library ───────────────────────────────────────────────────

function LibraryTab({ onAdded, onCommission }: { onAdded: (name: string) => void; onCommission: CommissionFn }) {
  const categories = ['All', 'Electronics', 'Robotics', 'Desk & Utility'] as const;
  const [cat, setCat] = useState<(typeof categories)[number]>('All');
  const [added, setAdded] = useState<string | null>(null);
  const list = LIBRARY.filter((i) => cat === 'All' || i.category === cat);

  const addToShelf = (lib: LibraryItem) => {
    const item: ShelfItem = {
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
    void saveShelfItem(item).then(() => {
      setAdded(lib.id);
      onAdded(lib.name);
      setTimeout(() => setAdded((cur) => (cur === lib.id ? null : cur)), 2400);
    });
  };

  const oneTapOrder = (lib: LibraryItem) => {
    const item: ShelfItem = {
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
    void saveShelfItem(item);
    onCommission(item, estimatePrint({ volumeMm3: lib.volumeCm3 * 1000, material: lib.recMaterial, infill: lib.recInfill, colorMode: 'single', qty: 1 }));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1">
        <SectionLabel>Filter</SectionLabel>
        <div className="flex flex-wrap gap-1">
          {categories.map((c) => (
            <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
              {c}
            </Chip>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {list.map((lib) => {
          const grams = libraryGrams(lib);
          const est = estimatePrint({ volumeMm3: lib.volumeCm3 * 1000, material: lib.recMaterial, infill: lib.recInfill, colorMode: 'single', qty: 1 });
          return (
            <div key={lib.id} className="flex flex-col rounded-2xl border border-white/[0.1] bg-white/[0.04] p-3">
              <div className="flex items-start gap-2.5">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-black/40">
                  <IconCube size={22} className="text-white/35" />
                </div>
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold leading-snug text-white">{lib.name}</p>
                  <p className="mt-0.5 font-mono text-[9.5px] tabular-nums text-white/40">
                    {lib.dims.x} × {lib.dims.y} × {lib.dims.z} mm · ≈{grams.toFixed(1)} g · {lib.recMaterial} {lib.recInfill}%
                  </p>
                </div>
              </div>
              <p className="mt-1.5 text-[10.5px] leading-snug text-white/45">{lib.blurb}</p>
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2.5">
                <span className="font-mono text-[11px] tabular-nums text-white/70">
                  {rupees(est.low)}–{rupees(est.high)} <span className="text-[9px] text-white/35">EST</span>
                </span>
                <span className="flex items-center gap-1">
                  {added === lib.id ? (
                    <span className="flex items-center gap-1 rounded-lg border border-emerald-300/25 bg-emerald-300/[0.08] px-2 py-1.5 font-mono text-[9.5px] uppercase tracking-wider text-emerald-300">
                      <IconCheckmark size={11} />
                      On shelf
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => addToShelf(lib)}
                      className="rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-white/70 transition hover:bg-white/[0.1] active:scale-[0.99]"
                    >
                      Add to shelf
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => oneTapOrder(lib)}
                    className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-black transition hover:bg-white/90 active:scale-[0.99]"
                  >
                    <IconWhatsApp size={12} />
                    Order
                  </button>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tab 3: Model Sourcing ───────────────────────────────────────────────────

function SourcingTab({ onChanged }: { onChanged: () => void }) {
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
    <div className="flex flex-col gap-3">
      <div>
        <SectionLabel>What are you building / looking for?</SectionLabel>
        <textarea
          value={what}
          onChange={(e) => setWhat(e.target.value)}
          rows={2}
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
      <button
        type="button"
        onClick={submit}
        className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-black transition hover:bg-white/90 active:scale-[0.99]"
      >
        <IconWhatsApp size={14} />
        Request file discovery on WhatsApp
      </button>

      {recent.length > 0 && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
          <SectionLabel>Recent sourcing tickets</SectionLabel>
          <div className="mt-2 flex flex-col gap-1.5">
            {recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[10.5px] text-white/60">
                  #{r.ticketId} · {String(r.summary.what ?? '').slice(0, 48)}
                </span>
                <SyncPill state={r.sync} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shell ───────────────────────────────────────────────────────────────────

export default function CustomStlHub() {
  const [tab, setTab] = useState<HubTab>(() => {
    try {
      const t = localStorage.getItem('stan-hub-tab');
      if (t === 'shelf' || t === 'library' || t === 'sourcing') return t;
    } catch {
      /* private mode */
    }
    return 'shelf';
  });
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const reload = useCallback(() => {
    void listShelf().then(setItems);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const commission = useCommission(reload);

  return (
    <div className="flex flex-col gap-3">
      {storageDegraded() && (
        <p className="rounded-xl bg-amber-400/10 px-3 py-2 font-mono text-[10.5px] text-amber-200/80">
          On-device storage unavailable — shelf lasts this session only.
        </p>
      )}
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
            aria-selected={tab === key}
            onClick={() => {
              setTab(key);
              setExpandedId(null);
              try {
                localStorage.setItem('stan-hub-tab', key);
              } catch {
                /* private mode */
              }
            }}
            className={`flex-1 whitespace-nowrap rounded-lg px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider transition sm:text-[10.5px] ${
              tab === key ? 'bg-white/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]' : 'text-white/45 hover:text-white/80'
            }`}
          >
            {label}
            {count !== null && count > 0 ? <span className="ml-1 text-white/35">{count}</span> : null}
          </button>
        ))}
      </div>

      <div className="animate-in fade-in duration-300">
        {tab === 'shelf' && (
          <ShelfTab items={items} reload={reload} onCommission={commission} expandedId={expandedId} onExpand={setExpandedId} />
        )}
        {tab === 'library' && (
          <LibraryTab
            onAdded={() => {
              reload();
              setTab('shelf');
            }}
            onCommission={commission}
          />
        )}
        {tab === 'sourcing' && <SourcingTab onChanged={reload} />}
      </div>

      <p className="flex items-center justify-center gap-1.5 border-t border-white/[0.06] pt-3 font-mono text-[9px] uppercase tracking-wider text-white/25">
        <IconXmark size={9} />
        No accounts · shelf lives in this browser only
      </p>
    </div>
  );
}

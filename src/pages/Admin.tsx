import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Wordmark, { BrandBadge } from '../components/Wordmark';
import {
  adminApiConfigured,
  adminFetchOrders,
  adminUpdateStatus,
  type AdminOrder,
} from '../lib/orderPipeline';
import { IS_ADMIN_HOST } from '../lib/host';
import {
  adminFetchEmailBody,
  adminFetchEmails,
  adminMarkEmailRead,
  adminSendEmail,
  adminSyncEmails,
  type MailListItem,
  type MailMessage,
} from '../lib/mail';
import { mountShadowTool, type ToolBridge } from '../utils/shadowToolLoader';

/**
 * STΔN studio. — Print Floor (admin).
 * Passkey gate → orders from the dedicated backend (x-admin-key) → per-order
 * design SVG downloads and a production ZIP rebuilt by the stock engine from
 * the stored deterministic recipe.
 */

const PASSKEY = (import.meta.env.VITE_ADMIN_PASSKEY as string | undefined) || 'stan-admin-2026';
const SESSION_KEY = 'stan-admin-unlocked';

const STATUS_OPTIONS = ['pending', 'confirmed', 'printing', 'shipped', 'cancelled'] as const;
type Status = (typeof STATUS_OPTIONS)[number];

declare global {
  interface Window {
    __stanLoadSvg?: (text: string, name?: string) => void;
    __stanLoadPlate?: (text: string, name?: string) => void;
    __stanOrderZip?: () => Blob | null;
  }
}

function saveBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function waReplyLink(order: AdminOrder): string {
  const digits = order.customer_phone.replace(/\D/g, '');
  const full = digits.length === 10 ? `91${digits}` : digits;
  const text = `Hi ${order.customer_name}! Regarding your STΔN studio. order #${order.order_id} —`;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Admin() {
  const [unlocked, setUnlocked] = useState<boolean>(() => sessionStorage.getItem(SESSION_KEY) === '1');
  const [passkey, setPasskey] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  if (!unlocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070708] p-6 text-white">
        <div className="w-[340px] rounded-[28px] border border-white/[0.16] border-t-white/[0.35] bg-white/[0.04] p-7 shadow-[0_24px_60px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.22)] backdrop-blur-2xl">
          <div className="mb-5 flex flex-col items-center gap-1.5 text-center">
            <BrandBadge size={40} />
            <h1 className="mt-1 text-[16px] font-semibold">Print Floor</h1>
            <p className="text-[12px] text-white/45">Enter the studio passkey</p>
          </div>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (passkey === PASSKEY) {
                sessionStorage.setItem(SESSION_KEY, '1');
                setUnlocked(true);
              } else {
                setAuthError('Wrong passkey');
              }
            }}
          >
            <input
              type="password"
              required
              value={passkey}
              onChange={(e) => setPasskey(e.target.value)}
              placeholder="passkey"
              autoComplete="current-password"
              className="rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2.5 text-center font-mono text-[13px] tracking-widest text-white placeholder-white/25 focus:border-white/30 focus:outline-none"
            />
            {authError && <p className="text-center text-[12px] text-red-300">{authError}</p>}
            <button
              type="submit"
              className="rounded-2xl bg-white px-4 py-2.5 text-[13px] font-semibold text-black transition hover:bg-white/90"
            >
              Unlock
            </button>
            {!IS_ADMIN_HOST && (
              <Link to="/" className="text-center text-[12px] text-white/40 transition hover:text-white/70">
                Back to site
              </Link>
            )}
          </form>
        </div>
      </div>
    );
  }
  return <AdminDashboard />;
}

function AdminDashboard() {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminOrder | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<'orders' | 'mailbox'>('orders');
  const configured = adminApiConfigured();

  const reload = useCallback(async () => {
    setLoadError(null);
    try {
      setOrders(await adminFetchOrders());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load orders');
      setOrders([]);
    }
  }, []);

  useEffect(() => {
    if (configured) void reload();
  }, [configured, reload]);

  const setStatus = useCallback(async (order: AdminOrder, status: Status) => {
    setOrders((prev) => prev?.map((o) => (o.order_id === order.order_id ? { ...o, status } : o)) ?? null);
    try {
      await adminUpdateStatus(order.order_id, status);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Status update failed');
      void reload();
    }
  }, [reload]);

  return (
    <div className="min-h-screen bg-[#070708] text-white">
      <header className="sticky top-4 z-30 mx-4 flex items-center justify-between rounded-2xl border border-white/[0.12] bg-[#0a0a0c]/70 px-5 py-3 backdrop-blur-2xl">
        <span className="flex items-center gap-2.5">
          <BrandBadge size={22} />
          <Wordmark size={14} />
          <span className="text-[12px] font-medium text-white/40">Print Floor</span>
        </span>
        <div className="flex items-center gap-2 text-[12.5px]">
          <Link to="/studio" className="rounded-xl px-3 py-1.5 text-white/55 transition hover:text-white/85">
            Studio
          </Link>
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem(SESSION_KEY);
              location.reload();
            }}
            className="rounded-xl border border-white/[0.12] bg-white/[0.06] px-3.5 py-1.5 font-medium text-white/85 transition hover:bg-white/[0.12]"
          >
            Lock
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-16 pt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.02em]">
              {tab === 'orders' ? 'Order recipes' : 'Mailbox'}
            </h1>
            <p className="mt-1 text-[13px] text-white/45">
              {tab === 'orders'
                ? 'Every row is a deterministic recipe — rebuild the exact production ZIP from the stored design.'
                : 'stanstudio@mxsourav.dev — synced from Titan Mail. Replies send straight from the studio address.'}
            </p>
          </div>
          <div className="flex gap-1 rounded-2xl border border-white/10 bg-black/40 p-1">
            {([
              ['orders', 'Orders'],
              ['mailbox', 'Mailbox'],
            ] as Array<['orders' | 'mailbox', string]>).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`rounded-xl px-4 py-2 text-[12px] font-medium transition ${
                  tab === key ? 'bg-white/15 text-white shadow-sm' : 'text-white/55 hover:text-white/85'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {!configured && (
          <div className="mt-5 rounded-[22px] border border-amber-200/25 bg-amber-200/[0.06] p-5 text-[13px] leading-relaxed text-amber-100/85">
            <p className="font-semibold">Backend not configured</p>
            <p className="mt-1.5 text-white/60">
              Orders are served by the dedicated backend (anon clients cannot read Supabase directly). Set{' '}
              <code className="font-mono text-amber-100">VITE_API_BASE</code> to the deployed{' '}
              <code className="font-mono text-amber-100">server/</code> URL (Vercel env), deploy the backend with{' '}
              <code className="font-mono text-amber-100">ADMIN_SECRET_KEY</code>, and run{' '}
              <code className="font-mono text-amber-100">supabase/schema.sql</code> once in the Supabase SQL editor.
            </p>
          </div>
        )}

        {configured && tab === 'orders' && loadError && (
          <p className="mt-4 rounded-2xl bg-red-500/10 px-4 py-3 text-[13px] text-red-300">{loadError}</p>
        )}

        {configured && tab === 'orders' && (
          <div className="mt-5 overflow-hidden rounded-[24px] border border-white/[0.12] border-t-white/[0.22] bg-white/[0.03] shadow-[0_24px_60px_rgba(0,0,0,0.6)]">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
              <h2 className="text-[12.5px] font-semibold text-white/85">Incoming</h2>
              <span className="flex items-center gap-3">
                {orders && <span className="font-mono text-[11px] text-white/40">{orders.length} ORDERS</span>}
                <button
                  type="button"
                  onClick={() => void reload()}
                  className="rounded-lg border border-white/[0.12] bg-white/[0.06] px-2.5 py-1 text-[11px] text-white/70 transition hover:bg-white/[0.12]"
                >
                  Refresh
                </button>
              </span>
            </div>
            {orders === null ? (
              <p className="px-5 pb-6 pt-4 text-[13px] text-white/40">Loading orders…</p>
            ) : orders.length === 0 ? (
              <p className="px-5 pb-6 pt-4 text-[13px] text-white/40">
                No orders yet — locked designs from the studio land here instantly.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-white/40">
                      <th className="px-5 py-2.5 font-medium">Preview</th>
                      <th className="px-3 py-2.5 font-medium">Order</th>
                      <th className="px-3 py-2.5 font-medium">Customer</th>
                      <th className="px-3 py-2.5 font-medium">Specs</th>
                      <th className="px-3 py-2.5 font-medium">Total</th>
                      <th className="px-3 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => {
                      const bom = (order.bom_json ?? {}) as Record<string, string>;
                      return (
                        <tr
                          key={order.id}
                          onClick={() => setSelected(order)}
                          className="cursor-pointer border-b border-white/[0.04] transition hover:bg-white/[0.04]"
                        >
                          <td className="px-5 py-3">
                            {order.preview_data_url ? (
                              <img
                                src={order.preview_data_url}
                                alt=""
                                className="h-11 w-11 rounded-lg border border-white/[0.12] object-cover"
                              />
                            ) : (
                              <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-[10px] text-white/30">
                                —
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <span className="font-mono text-[12.5px] text-white/90">#{order.order_id}</span>
                            <span className="block text-[11px] text-white/35">
                              {new Date(order.created_at).toLocaleString()}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            {order.customer_name}
                            <span className="ml-2 font-mono text-[11.5px] text-white/40">{order.customer_phone}</span>
                            <a
                              href={waReplyLink(order)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="mt-0.5 block w-fit text-[11px] font-medium text-emerald-300/85 underline-offset-2 transition hover:text-emerald-200 hover:underline"
                            >
                              Reply on WhatsApp
                            </a>
                          </td>
                          <td className="px-3 py-3 text-[12px] text-white/65">
                            {String((order.recipe_json as Record<string, unknown>)?.shape ?? '—')}
                            <span className="block text-[11px] text-white/35">
                              {[bom.box_outer_size, bom.material, bom.weight_g ? `${bom.weight_g.replace(/\s*g$/, '')}g` : '']
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </td>
                          <td className="px-3 py-3 font-mono tabular-nums text-white/85">₹{order.total_inr}</td>
                          <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={order.status}
                              onChange={(e) => void setStatus(order, e.target.value as Status)}
                              className="rounded-lg border border-white/[0.12] bg-[#121216] px-2 py-1.5 text-[11.5px] capitalize text-white focus:border-white/30 focus:outline-none"
                            >
                              {STATUS_OPTIONS.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {configured && tab === 'mailbox' && <MailboxPane notify={(m) => setToast(m)} />}
      </main>

      {selected && (
        <Inspector
          order={selected}
          onClose={() => setSelected(null)}
          onStatus={(status) => void setStatus(selected, status)}
          notify={(m) => setToast(m)}
        />
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl border border-red-400/25 bg-red-500/15 px-5 py-3 text-[13px] text-red-200">
          {toast}
        </div>
      )}
    </div>
  );
}

type EnginePhase = 'idle' | 'booting' | 'building' | 'error';

function Inspector({
  order,
  onClose,
  onStatus,
  notify,
}: {
  order: AdminOrder;
  onClose: () => void;
  onStatus: (status: Status) => void;
  notify: (message: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef<ToolBridge | null>(null);
  const [phase, setPhase] = useState<EnginePhase>('idle');
  const bom = (order.bom_json ?? {}) as Record<string, string>;
  const recipe = (order.recipe_json ?? {}) as Record<string, unknown>;

  const downloadSvg = useCallback(
    (svg: string, name: string) => {
      if (!svg) return notify('No design stored on this order');
      saveBlob(new Blob([svg], { type: 'image/svg+xml' }), name);
    },
    [notify],
  );

  /** Boots the stock engine offscreen once, then resolves the bridge. */
  const ensureEngine = useCallback(async (): Promise<ToolBridge> => {
    if (bridgeRef.current) return bridgeRef.current;
    setPhase('booting');
    const bridge = await new Promise<ToolBridge>((resolve, reject) => {
      const host = hostRef.current;
      if (!host) return reject(new Error('Engine host missing'));
      mountShadowTool(host, resolve).catch(reject);
    });
    bridgeRef.current = bridge;
    await sleep(600); // first sample build settles
    setPhase('idle');
    return bridge;
  }, []);

  /** Applies the stored recipe, loads the design, exports the production ZIP. */
  const rebuildZip = useCallback(async () => {
    try {
      const bridge = await ensureEngine();
      setPhase('building');

      const shape = String(recipe.shape ?? 'rect');
      const stockShape = shape === 'rect2' ? 'rect' : shape;
      if (shape === 'rect2') {
        const iw = bridge.get('iw');
        const ih = bridge.get('ih');
        if (iw && ih) {
          bridge.set('iw', ih);
          bridge.set('ih', iw);
        }
      }
      const shapeBtn = document.querySelector(`#shapes button[data-s="${stockShape}"]`) as HTMLElement | null;
      shapeBtn?.click();

      for (const k of ['bx', 'by', 'size', 'iw', 'ih', 'floor', 'pt', 'ph', 'led', 'strut', 'plSize', 'plThick']) {
        if (recipe[k] !== undefined && recipe[k] !== null) bridge.set(k, recipe[k] as string | number);
      }
      if (recipe.res !== undefined) bridge.set('res', String(recipe.res));
      if (recipe.mirror !== undefined) bridge.set('mirror', recipe.mirror === true);
      if (recipe.invert !== undefined) bridge.set('invert', recipe.invert === true);
      if (recipe.plMode !== undefined) bridge.set('plMode', String(recipe.plMode));
      if (recipe.plInvert !== undefined) bridge.set('plInvert', recipe.plInvert === true);

      if (order.plate_svg && recipe.plOn) {
        window.__stanLoadPlate?.(order.plate_svg, 'plate.svg');
      } else {
        bridge.click('plClear');
      }
      window.__stanLoadSvg?.(order.design_svg, order.design_name || 'design.svg');

      await sleep(2400); // debounced rebuild + contour + STL generation
      const blob = window.__stanOrderZip?.();
      if (!blob) throw new Error('The engine could not build the ZIP');
      saveBlob(blob, `${order.order_id}-production-parts.zip`);
      setPhase('idle');
    } catch (error) {
      setPhase('error');
      notify(error instanceof Error ? error.message : 'Rebuild failed');
    }
  }, [ensureEngine, notify, order, recipe]);

  const busy = phase === 'booting' || phase === 'building';

  return (
    <div className="fixed inset-0 z-40 flex items-stretch justify-end">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      {/* Offscreen host for the verbatim stock engine (real size so WebGL inits) */}
      <div
        ref={hostRef}
        aria-hidden
        style={{ position: 'fixed', left: -12000, top: 0, width: 1280, height: 800 }}
      />

      <aside className="slim-scroll relative z-10 m-6 flex w-[440px] flex-col gap-3.5 overflow-y-auto rounded-[28px] border border-white/[0.16] border-t-white/[0.35] bg-[#0d0d10]/90 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.22)] backdrop-blur-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-mono text-[15px] font-semibold">#{order.order_id}</h2>
            <p className="mt-0.5 text-[12px] text-white/50">
              {order.customer_name} &middot; {order.customer_phone}
            </p>
            <p className="mt-0.5 text-[11.5px] text-white/35">
              {new Date(order.created_at).toLocaleString()} &middot; ₹{order.total_inr}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-[12px] text-white/40 transition hover:text-white">
            Close
          </button>
        </div>

        {order.preview_data_url && (
          <img
            src={order.preview_data_url}
            alt="Wall shadow preview"
            className="w-full rounded-2xl border border-white/[0.1] object-cover"
          />
        )}

        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/45">Status</p>
          <select
            value={order.status}
            onChange={(e) => onStatus(e.target.value as Status)}
            className="w-full rounded-xl border border-white/[0.12] bg-[#121216] px-3 py-2 text-[12.5px] capitalize text-white focus:border-white/30 focus:outline-none"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/45">Recipe</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-[11.5px]">
            {[
              ['Shape', String(recipe.shape ?? '—')],
              ['Inner', `${recipe.iw ?? '?'} × ${recipe.ih ?? '?'} mm`],
              ['Panel h', `${recipe.ph ?? '?'} mm`],
              ['LED h', `${recipe.led ?? '?'} mm`],
              ['Floor', `${recipe.floor ?? '?'} mm`],
              ['Thickness', `${recipe.pt ?? '?'} mm`],
              ['Resolution', `${recipe.pitch ?? recipe.res ?? '?'} mm`],
              ['Material', bom.material ?? '—'],
              ['Box outer', bom.box_outer_size ?? '—'],
              ['Shadow', bom.shadow_size ?? '—'],
              ['Weight', bom.weight_g ? `${bom.weight_g} g` : '—'],
              ['Panels', bom.panels_count ?? '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="text-white/40">{k}</dt>
                <dd className="truncate text-white/85">{v}</dd>
              </div>
            ))}
          </dl>
          {order.customer_address && (
            <p className="mt-2.5 border-t border-white/[0.06] pt-2 text-[11.5px] leading-snug text-white/55">
              <span className="text-white/40">Address:</span> {order.customer_address}
            </p>
          )}
          {order.customer_notes && (
            <p className="mt-1.5 text-[11.5px] leading-snug text-white/55">
              <span className="text-white/40">Notes:</span> {order.customer_notes}
            </p>
          )}
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/45">Production</p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void rebuildZip()}
              className="w-full rounded-2xl bg-white px-4 py-3 text-[13px] font-semibold text-black shadow-[0_10px_40px_rgba(255,255,255,0.16)] transition hover:bg-white/90 disabled:cursor-wait disabled:opacity-60"
            >
              {phase === 'booting'
                ? 'Booting the studio engine…'
                : phase === 'building'
                  ? 'Rebuilding parts from recipe…'
                  : 'Load in Studio / Rebuild Production ZIP'}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => downloadSvg(order.design_svg, `${order.order_id}-design.svg`)}
                className="rounded-2xl border border-white/[0.14] bg-white/[0.05] px-4 py-2.5 text-[12px] font-medium text-white/75 transition hover:bg-white/[0.1]"
              >
                Design SVG
              </button>
              <button
                type="button"
                onClick={() => downloadSvg(order.plate_svg ?? '', `${order.order_id}-plate.svg`)}
                className="rounded-2xl border border-white/[0.14] bg-white/[0.05] px-4 py-2.5 text-[12px] font-medium text-white/75 transition hover:bg-white/[0.1] disabled:opacity-40"
                disabled={!order.plate_svg}
                title={order.plate_svg ? 'Floor inlay SVG' : 'No floor inlay on this order'}
              >
                Plate SVG
              </button>
            </div>
            <a
              href={waReplyLink(order)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-2xl border border-emerald-300/25 bg-emerald-400/[0.08] px-4 py-2.5 text-center text-[12px] font-medium text-emerald-200/90 transition hover:bg-emerald-400/[0.14]"
            >
              Reply to {order.customer_name.split(' ')[0]} on WhatsApp
            </a>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-white/35">
            The ZIP holds every part as STL, order-details.txt and the design — rebuilt by the stock engine from the
            stored recipe, exactly as ordered.
          </p>
        </div>
      </aside>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Mailbox — Titan Mail inbox (IMAP sync) + reply via the studio SMTP address
   ═══════════════════════════════════════════════════════════════════════════ */

const nameOf = (s: string): string => {
  const m = s.match(/^(.*?)\s*</);
  return (m ? m[1] : s).replace(/"/g, '').trim() || s;
};
const addrOf = (s: string): string => {
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim();
};
const shortTime = (iso: string): string =>
  new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function MailboxPane({ notify }: { notify: (message: string) => void }) {
  const [list, setList] = useState<MailListItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MailMessage | null>(null);
  const [loadingBody, setLoadingBody] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyTo, setReplyTo] = useState('');
  const [replySubject, setReplySubject] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      setList(await adminFetchEmails());
      setListError(null);
    } catch (error) {
      setListError(error instanceof Error ? error.message : 'Could not load the mailbox');
      setList([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await adminSyncEmails(30);
      setLastSync(new Date().toLocaleTimeString());
      notify(`${result.synced} message${result.synced === 1 ? '' : 's'} synced from Titan`);
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'IMAP sync failed');
    } finally {
      setSyncing(false);
    }
  }, [load, notify]);

  const open = useCallback(
    async (item: MailListItem) => {
      setLoadingBody(true);
      setReplyOpen(false);
      try {
        const full = await adminFetchEmailBody(item.message_id);
        setSelected(full);
        setReplyTo(addrOf(full.sender));
        setReplySubject(full.subject.startsWith('Re:') ? full.subject : `Re: ${full.subject}`);
        setReplyBody('');
        if (!full.is_read) {
          setList((prev) => prev?.map((m) => (m.message_id === full.message_id ? { ...m, is_read: true } : m)) ?? null);
          void adminMarkEmailRead(full.message_id).catch(() => {});
        }
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Could not open the message');
      } finally {
        setLoadingBody(false);
      }
    },
    [notify],
  );

  const send = useCallback(async () => {
    setSending(true);
    try {
      await adminSendEmail(replyTo, replySubject, replyBody);
      notify(`Reply sent to ${replyTo}`);
      setReplyOpen(false);
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }, [load, notify, replyBody, replySubject, replyTo]);

  const readerHtml =
    selected?.body_html ||
    (selected?.body_text ? `<pre style="white-space:pre-wrap;font:13px ui-monospace,monospace;padding:16px;">${selected.body_text.replace(/</g, '&lt;')}</pre>` : '');

  return (
    <div className="mt-1">
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void sync()}
          disabled={syncing}
          className="rounded-2xl bg-white px-4 py-2.5 text-[12.5px] font-semibold text-black shadow-[0_10px_40px_rgba(255,255,255,0.16)] transition hover:bg-white/90 disabled:cursor-wait disabled:opacity-60"
        >
          {syncing ? 'Syncing via IMAP…' : 'Sync Inbox'}
        </button>
        <span className="font-mono text-[11px] text-white/40">
          {list ? `${list.filter((m) => !m.is_read).length} unread · ${list.length} total` : '—'}
          {lastSync ? ` · last sync ${lastSync}` : ''}
        </span>
      </div>

      {listError && (
        <p className="mb-3 rounded-2xl bg-red-500/10 px-4 py-3 text-[13px] text-red-300">{listError}</p>
      )}

      {/* Split pane */}
      <div className="flex h-[68vh] gap-3 overflow-hidden rounded-[24px] border border-white/[0.12] border-t-white/[0.22] bg-white/[0.03]">
        {/* Left: message list */}
        <div className="w-[320px] shrink-0 overflow-y-auto border-r border-white/[0.06] p-2">
          {list === null ? (
            <p className="p-4 text-[13px] text-white/40">Loading mailbox…</p>
          ) : list.length === 0 ? (
            <p className="p-4 text-[13px] leading-relaxed text-white/40">
              No messages yet — press <span className="font-semibold text-white/70">Sync Inbox</span> to pull the
              latest from Titan.
            </p>
          ) : (
            list.map((m) => (
              <button
                key={m.message_id}
                type="button"
                onClick={() => void open(m)}
                className={`mb-1 flex w-full flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-left transition ${
                  selected?.message_id === m.message_id
                    ? 'border-white/40 bg-white/[0.1]'
                    : 'border-transparent hover:bg-white/[0.05]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      m.is_read ? 'bg-white/15' : 'bg-[#FF2D55] shadow-[0_0_8px_rgba(255,45,85,0.7)]'
                    }`}
                  />
                  <span className={`truncate text-[12.5px] ${m.is_read ? 'text-white/65' : 'font-semibold text-white'}`}>
                    {nameOf(m.sender) || m.sender}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-white/35">
                    {shortTime(m.received_at)}
                  </span>
                </span>
                <span className={`ml-3.5 truncate text-[12px] ${m.is_read ? 'text-white/45' : 'text-white/80'}`}>
                  {m.subject}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Right: reader + reply */}
        <div className="flex min-w-0 flex-1 flex-col p-3">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-[13px] text-white/35">
              {loadingBody ? 'Opening message…' : 'Select a message to read it here.'}
            </div>
          ) : (
            <>
              <div className="mb-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-[15px] font-semibold text-white">{selected.subject}</h3>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-white/45">
                    {selected.sender} → {selected.recipient} · {new Date(selected.received_at).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyOpen((v) => !v)}
                  className="shrink-0 rounded-xl border border-white/[0.14] bg-white/[0.06] px-3.5 py-1.5 text-[12px] font-medium text-white/85 transition hover:bg-white/[0.12]"
                >
                  {replyOpen ? 'Close reply' : 'Reply'}
                </button>
              </div>

              <iframe
                title="Email body"
                sandbox=""
                srcDoc={readerHtml}
                className="min-h-0 w-full flex-1 rounded-2xl border border-white/10 bg-white"
              />

              {replyOpen && (
                <div className="mt-2.5 flex flex-col gap-2 rounded-2xl border border-white/[0.12] bg-white/[0.04] p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={replyTo}
                      onChange={(e) => setReplyTo(e.target.value)}
                      placeholder="To"
                      className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[12px] text-white placeholder-white/30 focus:border-white/30 focus:outline-none"
                    />
                    <input
                      value={replySubject}
                      onChange={(e) => setReplySubject(e.target.value)}
                      placeholder="Subject"
                      className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[12px] text-white placeholder-white/30 focus:border-white/30 focus:outline-none"
                    />
                  </div>
                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    rows={4}
                    placeholder={`Reply to ${nameOf(selected.sender)}…`}
                    className="resize-none rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[12.5px] text-white placeholder-white/30 focus:border-white/30 focus:outline-none"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[10.5px] text-white/35">Sends from stanstudio@mxsourav.dev via Titan SMTP</span>
                    <button
                      type="button"
                      onClick={() => void send()}
                      disabled={sending || !replyTo.trim() || !replySubject.trim() || !replyBody.trim()}
                      className="rounded-xl bg-white px-4 py-2 text-[12px] font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {sending ? 'Sending…' : 'Send reply'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
       

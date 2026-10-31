/**
 * STΔN studio. — dark checkout inside the stock #ordModal.
 * Drives the stock engine's live globals (params()/lastSvg/wallCanvas/BOM)
 * through a page-level snapshot bridge, submits to our order pipeline
 * (backend + Supabase fallback), then hands off on WhatsApp.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { submitOrder, type OrderPayload } from '../lib/orderPipeline';

interface CheckoutPortalProps {
  /** The stock modal's .sheet element (portal target). */
  sheet: HTMLElement;
  /** Clicking this opens the stock Download STL sheet (optional local copy). */
  onStockZip: () => void;
}

interface EngineSnapshot {
  recipe: Record<string, unknown>;
  designSvg: string;
  designName: string;
  plateSvg: string | null;
  preview: string;
  bom: Record<string, string>;
  totalInr: number;
}

/** Page-level snapshot of the stock engine's live order data. */
function snapshotEngine(): EngineSnapshot {
  // The engine's params()/lastSvg/plSrc are top-level lexical bindings — never
  // on window. The loader exposes them via an engine-scoped closure hook.
  const w = window as unknown as {
    __stanSnapshot?: () => {
      recipe: Record<string, unknown>;
      designSvg: string;
      designName: string;
      plateSvg: string | null;
    } | null;
  };
  const snap = w.__stanSnapshot ? w.__stanSnapshot() : null;
  const recipe = snap?.recipe ?? {};
  const designSvg = snap?.designSvg || '';
  const designName = snap?.designName || 'design.svg';
  const plateSvg = snap?.plateSvg ?? null;
  const canvas = document.getElementById('wallCanvas') as HTMLCanvasElement | null;
  let preview = '';
  try {
    preview = canvas ? canvas.toDataURL('image/webp', 0.8) : '';
  } catch {
    preview = '';
  }
  const text = (id: string) => document.getElementById(id)?.textContent ?? '';
  const bom = {
    shadow_size: text('s_size'),
    box_outer_size: text('s_box'),
    figure_lost: text('s_lost'),
    floating_detail: text('s_float'),
    weight_g: text('s_wt'),
    material: (document.getElementById('mat') as HTMLSelectElement | null)?.selectedOptions?.[0]?.text ?? 'PLA',
    print_cost: text('s_costNote'),
    total: text('s_cost'),
  };
  const totalInr = parseInt((text('s_cost') || '0').replace(/[^\d]/g, ''), 10) || 0;
  return { recipe, designSvg, designName, plateSvg, preview, bom, totalInr };
}

export default function CheckoutPortal({ sheet, onStockZip }: CheckoutPortalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState('Copy');
  const openedRef = useRef(false);

  // Fire the WhatsApp handoff once, after the confirmation state renders.
  useEffect(() => {
    if (!orderId || openedRef.current) return;
    openedRef.current = true;
    const url = (
      window as unknown as { __stanWaUrl?: string }
    ).__stanWaUrl;
    if (url) window.setTimeout(() => window.open(url, '_blank'), 900);
  }, [orderId]);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const snap = snapshotEngine();
      const payload: OrderPayload = {
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        customer_address: address.trim() || undefined,
        customer_notes: notes.trim() || undefined,
        recipe_json: snap.recipe,
        design_svg: snap.designSvg,
        design_name: snap.designName,
        plate_svg: snap.plateSvg,
        preview_data_url: snap.preview,
        bom_json: snap.bom,
        total_inr: snap.totalInr,
      };
      const result = await submitOrder(payload);
      (window as unknown as { __stanWaUrl?: string }).__stanWaUrl = result.whatsappUrl;
      setOrderId(result.orderId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Order submission failed');
    } finally {
      setBusy(false);
    }
  };

  const phoneValid = /^[6-9]\d{9}$/.test(phone.replace(/\s|-/g, '')) || /^\+?\d{10,14}$/.test(phone.replace(/\s|-/g, ''));
  const canSubmit = name.trim().length >= 2 && phoneValid && !busy && !orderId;

  return createPortal(
    <div className="stan-checkout">
      {!orderId ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-white/70">Full name</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[13px] text-white placeholder-white/30 focus:border-white/30 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-white/70">WhatsApp / phone number</span>
            <input
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="10-digit mobile"
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[13px] text-white placeholder-white/30 focus:border-white/30 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-white/70">Delivery address / pin code</span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Optional — address or pin code"
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[13px] text-white placeholder-white/30 focus:border-white/30 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-white/70">Notes</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional — custom requests"
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[13px] text-white placeholder-white/30 focus:border-white/30 focus:outline-none"
            />
          </label>
          {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-[11.5px] text-red-200">{error}</p>}
          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-1 w-full rounded-2xl bg-white px-4 py-3 text-[13px] font-semibold text-black shadow-[0_10px_40px_rgba(255,255,255,0.16)] transition hover:bg-white/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Submitting order to STΔN studio…' : 'Submit Order & Send on WhatsApp →'}
          </button>
          <button
            type="button"
            onClick={onStockZip}
            className="w-full rounded-2xl border border-white/[0.14] bg-white/[0.05] px-4 py-2.5 text-[12px] font-medium text-white/75 transition hover:bg-white/[0.1]"
          >
            Download STL ZIP Copy (Optional)
          </button>
        </form>
      ) : (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/[0.08]">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#7ee2a8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.5 12.8l4.6 4.4L19.5 6.8" />
            </svg>
          </div>
          <p className="text-[13px] font-semibold text-white">Order locked</p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(orderId);
              setCopyLabel('Copied');
              window.setTimeout(() => setCopyLabel('Copy'), 1500);
            }}
            className="group flex items-center gap-2 rounded-full border border-white/[0.16] bg-white/[0.08] px-4 py-1.5 font-mono text-[13px] text-white transition hover:bg-white/[0.14]"
          >
            #{orderId}
            <span className="text-[10px] uppercase tracking-wide text-white/50 group-hover:text-white/80">{copyLabel}</span>
          </button>
          <p className="text-[11.5px] leading-snug text-white/50">
            Your 3D design &amp; recipe are saved. WhatsApp is opening with your
            order summary — just press send.
          </p>
          <button
            type="button"
            onClick={onStockZip}
            className="mt-1 rounded-2xl border border-white/[0.14] bg-white/[0.05] px-4 py-2.5 text-[12px] font-medium text-white/75 transition hover:bg-white/[0.1]"
          >
            Download STL ZIP Copy (Optional)
          </button>
        </div>
      )}
    </div>,
    sheet,
  );
}

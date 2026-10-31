import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import Wordmark, { BrandBadge } from '../components/Wordmark';
import CheckoutPortal from '../components/CheckoutPortal';
import { mountShadowTool, type ToolBridge } from '../utils/shadowToolLoader';
import '../vendor/stan-skin.css';

/**
 * Shadow Lamp Studio — the stock tool engine driven by our original glass UI.
 * The engine runs verbatim in-document; this dock is a pure control surface
 * that drives the stock inputs through a tiny bridge (set + dispatch).
 */

type Tab = 'artwork' | 'optics' | 'export';
type ViewKey = 'asm' | 'lay' | 'real';

const VIEWS: Array<{ key: ViewKey; target: string; label: string }> = [
  { key: 'asm', target: 'vAsm', label: '3D Enclosure' },
  { key: 'lay', target: 'vLay', label: 'Flat Nesting' },
  { key: 'real', target: 'vReal', label: 'Raytraced Lit' },
];

const SHAPES: Array<{ s: string; label: string }> = [
  { s: 'rect', label: 'Rect L×W' },
  { s: 'rect2', label: 'Rect W×L' },
  { s: 'cyl', label: 'Cylinder' },
  { s: 'round', label: 'Round' },
  { s: 'hex', label: 'Hexagon' },
  { s: 'oct', label: 'Octagon' },
  { s: 'tri', label: 'Triangle' },
  { s: 'diamond', label: 'Diamond' },
];

export default function Studio() {
  const containerRef = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef<ToolBridge | null>(null);
  const columnRef = useRef<HTMLElement | null>(null);
  const bootedRef = useRef(false);
  const [booted, setBooted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('artwork');
  const [view, setView] = useState<ViewKey>('asm');
  const [shape, setShape] = useState('rect');
  const [figName, setFigName] = useState('Sample (swordsman)');
  const [status, setStatus] = useState('');
  const [mirror, setMirror] = useState(false);
  const [invert, setInvert] = useState(false);
  const [plInvert, setPlInvert] = useState(false);
  const [telemetry, setTelemetry] = useState<Record<string, string>>({});
  const [ordSheet, setOrdSheet] = useState<HTMLElement | null>(null);

  // Mirror live readouts from the stock engine into our glass tiles.
  useEffect(() => {
    if (!booted) return;
    const read = () => {
      const b = bridgeRef.current;
      if (!b) return;
      setFigName(b.text('figName') || 'Sample (swordsman)');
      setStatus(b.text('status'));
      setTelemetry((prev) => {
        const next: Record<string, string> = { ...prev };
        for (const id of ['s_size', 's_lost', 's_float', 's_box', 's_wt', 's_cost', 's_costNote']) {
          const t = b.text(id);
          if (t !== (next[id] ?? '')) next[id] = t;
        }
        return next;
      });
    };
    read();
    const timer = window.setInterval(read, 400);
    return () => window.clearInterval(timer);
  }, [booted]);

  useEffect(() => {
    if (bootedRef.current || !containerRef.current) return;
    bootedRef.current = true;
    mountShadowTool(containerRef.current, (bridge) => {
      bridgeRef.current = bridge;
      columnRef.current = bridge.column;
      setBooted(true);
      // Adopt the stock order sheet: the ZIP handoff steps are superseded by
      // our dark checkout portal; header (title + live price) and the order
      // summary stay.
      const sheet = document.querySelector('#ordModal .sheet') as HTMLElement | null;
      if (sheet) {
        for (const sel of ['.sub', '.osteps', '.ordmain']) {
          const el = sheet.querySelector(sel) as HTMLElement | null;
          if (el) el.style.display = 'none';
        }
        setOrdSheet(sheet);
      }
    }).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Tool failed to load');
    });
  }, []);

  const grams = parseFloat((telemetry.s_wt || '').replace(/[^\d.]/g, '')) || 0;
  const build = {
    volume: grams > 0 ? `${(grams / 1.24).toFixed(1)} cm³` : '—',
    filament: telemetry.s_wt || '—',
    time: grams > 0 ? `~${(grams / 12).toFixed(1)} h` : '—',
  };

  const set = useCallback((id: string, value: string | number | boolean) => {
    bridgeRef.current?.set(id, value);
  }, []);
  const click = useCallback((id: string) => {
    bridgeRef.current?.click(id);
  }, []);

  const pickView = (v: ViewKey) => {
    setView(v);
    const target = VIEWS.find((x) => x.key === v);
    if (target) click(target.target);
  };
  const pickShape = (s: string) => {
    setShape(s);
    if (s === 'rect' || s === 'rect2') {
      // Two rectangle orientations: L×W keeps the current inner values,
      // W×L swaps inner width/height before selecting the rect shape.
      if (s === 'rect2') {
        const b = bridgeRef.current;
        if (b) {
          const iw = b.get('iw');
          const ih = b.get('ih');
          if (iw && ih) {
            b.set('iw', ih);
            b.set('ih', iw);
          }
        }
      }
      const btn = document.querySelector('#shapes button[data-s="rect"]') as HTMLElement | null;
      btn?.click();
      return;
    }
    const btn = document.querySelector(`#shapes button[data-s="${s}"]`) as HTMLElement | null;
    btn?.click();
  };

  return (
    <div className="h-screen overflow-hidden bg-[#070708] text-white">
      {/* Left frosted glass dock — our original UI driving the stock engine */}
      <aside className="stan-dock slim-scroll fixed bottom-4 left-4 top-4 z-[5] flex w-[450px] min-w-[440px] flex-col gap-3 overflow-y-auto p-5 bg-gradient-to-b from-white/[0.08] via-white/[0.02] to-transparent bg-[#0a0a0c]/60 backdrop-blur-3xl backdrop-saturate-[200%] border border-white/[0.16] border-t-white/[0.35] rounded-[28px] shadow-[0_24px_60px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.22),inset_0_0_20px_rgba(255,255,255,0.03)]">
        <div className="flex items-center justify-between px-1 pb-1">
          <span className="flex items-center gap-2.5">
            <BrandBadge size={26} />
            <Wordmark size={14} />
          </span>
          <Link to="/" viewTransition className="text-[11.5px] font-medium text-white/50 transition hover:text-white/85">
            Home
          </Link>
        </div>

        {/* View switcher */}
        <div className="rounded-2xl bg-black/40 p-1 border border-white/10">
          <div className="flex gap-1">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => pickView(v.key)}
                className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-[12px] font-medium transition ${
                  view === v.key ? 'bg-white/15 text-white shadow-sm' : 'text-white/55 hover:text-white/85'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="rounded-2xl bg-black/40 p-1 border border-white/10">
          <div className="flex gap-1">
            {([
              ['artwork', 'Artwork'],
              ['optics', 'Optics & Box'],
              ['export', 'Export & Order'],
            ] as Array<[Tab, string]>).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-[12px] font-medium transition ${
                  tab === key ? 'bg-white/15 text-white shadow-sm' : 'text-white/55 hover:text-white/85'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'artwork' && (
          <>
          <section className="rounded-[24px] border border-white/[0.1] border-t-white/[0.22] bg-white/[0.04] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-[12.5px] font-semibold text-white/90">Primary Stencil Mask</h2>
              <button
                type="button"
                onClick={() => click('sample')}
                className="rounded-full border border-white/[0.16] bg-white/[0.08] px-3 py-1.5 text-[11.5px] font-semibold text-white transition hover:bg-white/[0.16]"
              >
                Load Katana Preset
              </button>
            </div>
            <button
              type="button"
              onClick={() => click('file')}
              className="w-full rounded-2xl border border-dashed border-white/[0.18] bg-white/[0.03] px-4 py-5 text-center transition hover:border-white/[0.35] hover:bg-white/[0.06]"
            >
              <span className="block truncate text-[13px] font-semibold text-white/90">
                {figName || 'Drop an image or click to choose'}
              </span>
              <span className="mt-1 block text-[11px] text-white/40">
                Any image. We convert it to SVG for you.
              </span>
            </button>
            <div className="mt-2 flex flex-col gap-1">
              <Toggle label="Mirror horizontally" checked={mirror} onChange={(v) => { setMirror(v); set('mirror', v); }} />
              <Toggle label="Use the background as the figure" checked={invert} onChange={(v) => { setInvert(v); set('invert', v); }} />
            </div>
          </section>

          <section className="rounded-[24px] border border-white/[0.1] border-t-white/[0.22] bg-white/[0.04] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <h2 className="text-[12.5px] font-semibold text-white/90">Baseplate Inlay</h2>
              <span className="rounded-full border border-white/[0.12] bg-white/[0.05] px-2.5 py-0.5 text-[10px] text-white/45">optional</span>
            </div>
            <button
              type="button"
              onClick={() => click('plInput')}
              className="w-full rounded-2xl border border-dashed border-white/[0.18] bg-white/[0.03] px-4 py-3.5 text-center transition hover:border-white/[0.35] hover:bg-white/[0.06]"
            >
              <span className="block text-[12px] font-semibold text-white/85">Drop an image or click to choose</span>
              <span className="mt-0.5 block text-[10.5px] text-white/40">Printed on the box floor. Leave empty for a plain box.</span>
            </button>
            <div className="mt-3 flex flex-col gap-2.5">
              <label className="flex items-center justify-between gap-3 text-[12px] text-white/70">
                Style
                <select
                  onChange={(e) => set('plMode', e.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-white focus:border-white/30 focus:outline-none"
                  defaultValue="sil"
                >
                  <option value="sil">Black silhouette (light floor)</option>
                  <option value="cut">Cut-out (light on black)</option>
                </select>
              </label>
              <ToolSlider bridgeSet={set} id="plSize" label="Size" unit="%" min={40} max={100} step={1} />
              <ToolSlider bridgeSet={set} id="plThick" label="Thickness" unit=" mm" min={0.8} max={3} step={0.2} />
              <Toggle label="Invert this picture" checked={plInvert} onChange={(v) => { setPlInvert(v); set('plInvert', v); }} />
              <button
                type="button"
                onClick={() => click('plClear')}
                className="rounded-xl border border-white/[0.14] bg-white/[0.06] px-3 py-2 text-[11.5px] font-semibold text-white/85 transition hover:bg-white/[0.12]"
              >
                Remove box picture
              </button>
            </div>
          </section>
          </>
        )}

        {tab === 'optics' && (
          <>
            <section className="rounded-[24px] border border-white/[0.1] border-t-white/[0.22] bg-white/[0.04] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
              <h2 className="mb-2.5 text-[12.5px] font-semibold text-white/90">Box shape</h2>
              <div className="grid grid-cols-4 gap-1.5">
                {SHAPES.map((s) => (
                  <button
                    key={s.s}
                    type="button"
                    onClick={() => pickShape(s.s)}
                    className={`rounded-xl border px-2 py-2.5 text-[11.5px] font-medium transition ${
                      shape === s.s
                        ? 'border-white/60 bg-white/15 text-white'
                        : 'border-white/[0.08] bg-white/[0.04] text-white/60 hover:text-white/85'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-[24px] border border-white/[0.1] border-t-white/[0.22] bg-white/[0.04] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
              <h2 className="mb-1 text-[12.5px] font-semibold text-white/90">Shadow &amp; Figure</h2>
              <ToolSlider bridgeSet={set} id="shW" label="Shadow Width on Wall" unit=" mm" min={50} max={2500} step={10} />
              <ToolSlider bridgeSet={set} id="shH" label="Shadow Length" unit=" mm" min={50} max={2500} step={10} />
              <ToolSlider bridgeSet={set} id="size" label="Figure size (of max reach)" unit="%" min={40} max={110} step={1} />
              <ToolSlider bridgeSet={set} id="bx" label="Box centre X" unit="%" min={0} max={100} step={1} />
              <ToolSlider bridgeSet={set} id="by" label="Box centre Y" unit="%" min={0} max={100} step={1} />
            </section>

            <section className="rounded-[24px] border border-white/[0.1] border-t-white/[0.22] bg-white/[0.04] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
              <h2 className="mb-1 text-[12.5px] font-semibold text-white/90">Enclosure Geometry</h2>
              <ToolSlider bridgeSet={set} id="iw" label="Inner Width" unit=" mm" min={60} max={200} step={1} />
              <ToolSlider bridgeSet={set} id="ih" label="Inner Height" unit=" mm" min={60} max={220} step={1} />
              <ToolSlider bridgeSet={set} id="ph" label="Panel Max Height" unit=" mm" min={20} max={200} step={1} />
              <ToolSlider bridgeSet={set} id="pt" label="Panel Thickness" unit=" mm" min={1.2} max={3} step={0.1} />
              <ToolSlider bridgeSet={set} id="floor" label="Floor Thickness" unit=" mm" min={2} max={25} step={0.5} />
              <ToolSlider bridgeSet={set} id="led" label="LED Tube Height" unit=" mm" min={30} max={220} step={1} />
              <ToolSlider bridgeSet={set} id="strut" label="Strut / Bridge Width" unit=" mm" min={0.6} max={3} step={0.1} />
              <label className="mt-3 flex items-center justify-between gap-3 text-[12px] text-white/70">
                Resolution
                <select
                  onChange={(e) => set('res', e.target.value)}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-white focus:border-white/30 focus:outline-none"
                  defaultValue="0.15"
                >
                  <option value="0.3">Draft 0.3 mm</option>
                  <option value="0.2">Good 0.2 mm</option>
                  <option value="0.15">Fine 0.15 mm</option>
                  <option value="0.1">Ultra 0.1 mm</option>
                </select>
              </label>
            </section>
          </>
        )}

        {tab === 'export' && (
          <section className="rounded-[24px] border border-white/[0.1] border-t-white/[0.22] bg-white/[0.04] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
            <h2 className="mb-2.5 text-[12.5px] font-semibold text-white/90">Material</h2>
            <label className="flex items-center justify-between gap-3 text-[12px] text-white/70">
              Filament
              <select
                onChange={(e) => set('mat', e.target.value)}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-white focus:border-white/30 focus:outline-none"
                defaultValue="1.24"
              >
                <option value="1.24">PLA</option>
                <option value="1.27">PETG</option>
                <option value="1.04">ABS</option>
                <option value="1.07">ASA</option>
                <option value="1.21">TPU</option>
              </select>
            </label>
            <h2 className="mb-2.5 mt-4 text-[12.5px] font-semibold text-white/90">Export &amp; Order</h2>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => click('dlOpen')}
                className="w-full rounded-2xl bg-white px-4 py-3 text-[13px] font-semibold text-black shadow-[0_10px_40px_rgba(255,255,255,0.16)] transition hover:bg-white/90 active:scale-[0.99]"
              >
                Download STL
              </button>
              <button
                type="button"
                onClick={() => click('orderBtn')}
                className="w-full rounded-2xl border border-white/[0.16] bg-white/[0.08] px-4 py-3 text-[13px] font-semibold text-white transition hover:bg-white/[0.14] active:scale-[0.99]"
              >
                Order Custom Print
              </button>
            </div>
            <p className="mt-2.5 text-center text-[10.5px] leading-snug text-white/35">
              Opens the engine's export sheet and order flow — print bed, filament
              and part selection included.
            </p>
          </section>
        )}

        <div className="mt-auto flex items-center gap-2.5 px-1 pb-1">
          <BrandBadge size={20} />
          <span className="text-[10.5px] leading-snug text-white/35">
            Engine runs 100% locally — the sample figure loads automatically.
          </span>
        </div>

        {error && (
          <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl border border-red-400/25 bg-red-500/15 px-5 py-3 text-[13px] text-red-200">
            {error}
          </div>
        )}
      </aside>

      {/* Tool host: styles, DOM and scripts are injected here */}
      <main className="fixed bottom-4 left-[466px] right-4 top-4 z-10 h-[calc(100vh-32px)] overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#070708]">
        <div ref={containerRef} />
      </main>

      {/* Build Data card — portaled into the tool column, flowing under the viewports */}
      {booted && columnRef.current &&
        createPortal(
          <div className="stan-build-card rounded-[22px] border border-white/[0.16] border-t-white/[0.35] bg-[#0d0d10]/70 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.22),inset_0_0_20px_rgba(255,255,255,0.03)] backdrop-blur-2xl backdrop-saturate-[180%]">
            <div className="mb-2.5 flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Build Data</h2>
              <span className="rounded-full bg-white/[0.08] px-2 py-0.5 font-mono text-[9.5px] text-white/50">LIVE</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <BuildStat label="Volume" value={build.volume} />
              <BuildStat label="Filament" value={build.filament} />
              <BuildStat label="Est. time" value={build.time} />
            </div>
            <div className="mt-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2">
              <div className="flex items-baseline justify-between">
                <span className="text-[10.5px] uppercase tracking-wide text-white/45">BOM total</span>
                <span className="font-mono text-[14px] font-semibold text-white">{telemetry.s_cost || '—'}</span>
              </div>
              <p className="mt-0.5 text-[10px] leading-snug text-white/40">{telemetry.s_costNote}</p>
              {status && <p className="mt-2 border-t border-white/[0.06] pt-2 text-[10px] leading-snug text-white/45">{status}</p>}
            </div>
          </div>,
          columnRef.current,
        )}

      {/* Dark checkout — portaled into the stock order sheet */}
      {ordSheet && <CheckoutPortal sheet={ordSheet} onStockZip={() => click('ordZip')} />}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between py-1.5 text-left">
      <span className="text-[12px] font-medium text-white/70">{label}</span>
      <span
        className={`relative h-[24px] w-[42px] rounded-full border transition-colors duration-200 ${
          checked ? 'border-white/40 bg-white/85' : 'border-white/[0.1] bg-white/[0.1]'
        }`}
      >
        <span
          className={`absolute top-[2px] h-[18px] w-[18px] rounded-full shadow-md transition-all duration-200 ${
            checked ? 'left-[21px] bg-black/75' : 'left-[2px] bg-white/85'
          }`}
        />
      </span>
    </button>
  );
}


/** Platinum slider that drives a stock input through the bridge. */
function ToolSlider({
  bridgeSet,
  id,
  label,
  unit,
  min,
  max,
  step,
}: {
  bridgeSet: (id: string, value: string | number | boolean) => void;
  id: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}) {
  const [value, setValue] = useState<number | null>(null);

  // Initialize from the stock input once the engine has booted.
  useEffect(() => {
    const t = window.setInterval(() => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el && el.value) {
        setValue(Number(el.value));
        window.clearInterval(t);
      }
    }, 250);
    return () => window.clearInterval(t);
  }, [id]);

  const current = value ?? min;
  const fill = ((current - min) / (max - min)) * 100;

  return (
    <label className="block select-none py-2">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[12.5px] font-medium text-white/75">{label}</span>
        <span className="font-mono text-[12px] tabular-nums text-white/85">
          {step < 1 ? current.toFixed(1) : Math.round(current)}
          {unit}
        </span>
      </div>
      <input
        type="range"
        className="stan-slider"
        style={{ ['--fill' as string]: `${fill}%` }}
        min={min}
        max={max}
        step={step}
        value={current}
        onChange={(e) => {
          const v = Number(e.target.value);
          setValue(v);
          bridgeSet(id, v);
        }}
      />
    </label>
  );
}


function BuildStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-2.5 py-2">
      <p className="text-[9.5px] uppercase tracking-wide text-white/45">{label}</p>
      <p className="mt-0.5 truncate font-mono text-[11.5px] text-white/90">{value}</p>
    </div>
  );
}

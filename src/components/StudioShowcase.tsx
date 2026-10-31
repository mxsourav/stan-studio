import { useCallback, useEffect, useState } from 'react';
import { IconArrowRight, IconBoxSealedFill, IconGridFill, IconRulerFill, IconSparkle } from './icons';
import FilamentCalculator from './tools/FilamentCalculator';
import PrintEstimator from './tools/PrintEstimator';

/**
 * "Inside the studio" — compact asymmetric bento.
 * Spotlight cursor glow follows the mouse on every card (no tilt, no
 * wobble); the live hero warps straight into /studio, working tools open
 * their calculators in a glass modal, queued tools show their status.
 */

type ToolMode = 'studio' | 'calc' | 'estimator' | 'queue';

interface Tool {
  id: string;
  title: string;
  tagline: string;
  body: string;
  icon: React.ReactNode;
  mode: ToolMode;
  specs: string[];
}

const TOOLS: Tool[] = [
  {
    id: 'shadow-lamp',
    title: 'Shadow Lamp Studio',
    tagline: 'Photo → wall-projected lantern',
    body: 'Upload any image and the silhouette engine cuts a parametric lantern that casts it onto your wall in warm light.',
    icon: <IconSparkle size={18} className="text-white" />,
    mode: 'studio',
    specs: ['silhouette engine', 'wall projection', 'parametric box'],
  },
  {
    id: 'filament-calc',
    title: 'Filament Calculator',
    tagline: 'Spool math without the spreadsheet',
    body: 'Convert between meters, grams and rupees across every material in the drawer — tuned to real 1.75mm spool weights.',
    icon: <IconBoxSealedFill size={17} className="text-white" />,
    mode: 'calc',
    specs: ['m ⇄ g', '5 materials', 'live ₹'],
  },
  {
    id: 'print-estimator',
    title: '3D Print Estimator',
    tagline: 'Cost & time before the slice',
    body: 'Drop an STL and get material volume, print hours and machine-rate pricing across PLA, PETG, ABS and ASA.',
    icon: <IconRulerFill size={17} className="text-white" />,
    mode: 'estimator',
    specs: ['mesh volume', 'hours', '₹ pricing'],
  },
  {
    id: 'stl-hub',
    title: 'Custom STL Hub',
    tagline: 'Your prints, organized',
    body: 'A private shelf for validated models, remix history and one-tap reorders from the print floor.',
    icon: <IconGridFill size={17} className="text-white" />,
    mode: 'queue',
    specs: ['private shelf', 'remix history', 'reorders'],
  },
];

/** Spotlight only: tracks the cursor into CSS vars for the radial glow. */
function useSpotlight<T extends HTMLElement>() {
  const ref = useCallback((el: T | null) => {
    if (!el) return;
    el.addEventListener('mousemove', (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  }, []);
  return ref;
}

function StatusBadge({ mode }: { mode: ToolMode }) {
  if (mode === 'studio') {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-white/[0.08] px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-white/85">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff2d55] shadow-[0_0_8px_rgba(255,45,85,0.9)]" />
        Live
      </span>
    );
  }
  if (mode === 'queue') {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-white/40">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300/80 [animation-duration:2.4s]" />
        Queued
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-emerald-200/90">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.8)]" />
      Active
    </span>
  );
}

export default function StudioShowcase({ onLaunchStudio }: { onLaunchStudio: (el: HTMLElement | null) => void }) {
  const [modalTool, setModalTool] = useState<Tool | null>(null);
  const heroRef = useSpotlight<HTMLElement>();
  const calcRef = useSpotlight<HTMLElement>();
  const estRef = useSpotlight<HTMLElement>();
  const hubRef = useSpotlight<HTMLElement>();

  useEffect(() => {
    if (!modalTool) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalTool(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalTool]);

  const card = (
    tool: Tool,
    ref: (el: HTMLElement | null) => void,
    className: string,
  ) => (
    <article
      ref={ref}
      onClick={() => (tool.mode === 'studio' ? onLaunchStudio(document.getElementById(tool.id)) : setModalTool(tool))}
      id={tool.id}
      className={`group relative cursor-pointer overflow-hidden rounded-2xl border border-white/[0.12] border-t-white/[0.3] bg-[#0d0d10]/80 backdrop-blur-2xl transition-[border-color,box-shadow] duration-300 hover:border-white/25 hover:shadow-[0_20px_50px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.35)] ${className}`}
    >
      {/* spotlight cursor glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: 'radial-gradient(280px circle at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.08), transparent 65%)' }}
      />
      {tool.id === 'shadow-lamp' && (
        <>
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-[#ff2d55]/[0.14] blur-[80px]" />
          <svg aria-hidden viewBox="0 0 200 120" className="pointer-events-none absolute -right-4 bottom-0 h-28 w-44 opacity-[0.13]">
            <path d="M30 118 C40 60 70 30 100 24 C130 30 158 58 170 118 Z" fill="#fff" />
            <circle cx="100" cy="52" r="15" fill="#070708" />
            <path d="M76 118 C82 84 90 68 100 66 C110 68 118 84 124 118 Z" fill="#070708" opacity="0.8" />
          </svg>
        </>
      )}
      <div className="relative flex h-full flex-col p-4">
        <div className="mb-2.5 flex items-start justify-between gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.1] border-t-white/[0.25] bg-white/[0.06]">
            {tool.icon}
          </div>
          <StatusBadge mode={tool.mode} />
        </div>

        {tool.mode === 'studio' && (
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/35">[Toolchain: active]</p>
        )}
        <h3 className={`mt-0.5 font-semibold tracking-[-0.015em] text-white ${tool.mode === 'studio' ? 'text-[19px]' : 'text-[14.5px]'}`}>
          {tool.title}
        </h3>
        <p className={`mt-0.5 font-medium text-white/55 ${tool.mode === 'studio' ? 'max-w-md text-[12.5px]' : 'text-[11.5px]'}`}>
          {tool.tagline}
        </p>
        <p className={`mt-1.5 leading-relaxed text-white/40 ${tool.mode === 'studio' ? 'max-w-md text-[12px]' : 'text-[11px]'}`}>
          {tool.body}
        </p>

        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <span className="flex flex-wrap gap-1">
            {tool.specs.map((s) => (
              <span key={s} className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9px] text-white/45">
                {s}
              </span>
            ))}
          </span>
          <IconArrowRight size={14} className="shrink-0 text-white/40 transition-transform duration-300 group-hover:translate-x-1.5 group-hover:text-white" />
        </div>
      </div>
    </article>
  );

  return (
    <section className="relative z-40 bg-[#070708] px-6 pb-10 pt-14">
      {/* ambient orbs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-16 h-80 w-[560px] -translate-x-1/2 rounded-full bg-[#ff2d55]/[0.05] blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-6xl">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-[20px] font-bold tracking-[-0.02em]">Inside the studio</h2>
          <span className="font-mono text-[11px] uppercase tracking-widest text-white/35">Toolchain</span>
        </div>

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-12">
          {card(TOOLS[0], heroRef, 'md:col-span-8 min-h-[210px]')}
          {card(TOOLS[1], calcRef, 'md:col-span-4')}
          {card(TOOLS[2], estRef, 'md:col-span-5')}
          {card(TOOLS[3], hubRef, 'md:col-span-7')}
        </div>
      </div>

      {/* Tool modal */}
      {modalTool && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalTool(null);
          }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
          <div className="modal-in relative w-full max-w-lg overflow-hidden rounded-[28px] border border-white/[0.16] border-t-white/[0.35] bg-[#0d0d10]/95 p-6 shadow-[0_40px_90px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.25)]">
            <button
              type="button"
              onClick={() => setModalTool(null)}
              className="absolute right-5 top-5 rounded-lg p-1.5 text-white/40 transition hover:bg-white/[0.08] hover:text-white"
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
            <div className="mb-1 flex items-center gap-3 pr-8">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.06]">
                {modalTool.icon}
              </div>
              <StatusBadge mode={modalTool.mode} />
            </div>
            <h3 className="mt-2 text-[18px] font-semibold tracking-[-0.015em] text-white">{modalTool.title}</h3>
            <p className="text-[12px] font-medium text-white/55">{modalTool.tagline}</p>

            <div className="mt-4">
              {modalTool.mode === 'calc' && <FilamentCalculator />}
              {modalTool.mode === 'estimator' && <PrintEstimator />}
              {modalTool.mode === 'queue' && (
                <div className="rounded-2xl border border-white/[0.1] bg-white/[0.04] p-4">
                  <p className="text-[13px] leading-relaxed text-white/60">{modalTool.body}</p>
                  <p className="mt-3 font-mono text-[10.5px] uppercase tracking-wider text-amber-200/70">In the queue — next release</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

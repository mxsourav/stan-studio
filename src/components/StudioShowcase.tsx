import { useCallback } from 'react';
import { IconArrowRight, IconBoxSealedFill, IconGridFill, IconRulerFill, IconSparkle } from './icons';

/**
 * "Inside the studio" — compact asymmetric bento.
 * Spotlight cursor glow follows the mouse on every card (no tilt, no
 * wobble); the live hero warps straight into /studio, every working tool
 * opens its dedicated fullscreen workspace route (/tools/:toolId).
 */

export type ToolMode = 'studio' | 'calc' | 'estimator' | 'hub';

export interface Tool {
  id: string;
  title: string;
  tagline: string;
  body: string;
  icon: React.ReactNode;
  mode: ToolMode;
  specs: string[];
}

/** Shared tool registry — consumed by ToolWorkspace for titles/badges. */
export const TOOLS: Tool[] = [
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
    mode: 'hub',
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
      <span className="flex items-center gap-1 sm:gap-1.5 rounded-full border border-white/[0.12] bg-white/[0.08] px-1.5 sm:px-2 py-0.5 font-mono text-[8px] sm:text-[9.5px] uppercase tracking-wider text-white/85">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff2d55] shadow-[0_0_8px_rgba(255,45,85,0.9)]" />
        Live
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 sm:gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-1.5 sm:px-2 py-0.5 font-mono text-[8px] sm:text-[9.5px] uppercase tracking-wider text-emerald-200/90">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.8)]" />
      Active
    </span>
  );
}

export default function StudioShowcase({
  onLaunchStudio,
  onOpenTool,
}: {
  onLaunchStudio: (el: HTMLElement | null) => void;
  onOpenTool: (toolId: string, el: HTMLElement | null) => void;
}) {
  const heroRef = useSpotlight<HTMLElement>();
  const calcRef = useSpotlight<HTMLElement>();
  const estRef = useSpotlight<HTMLElement>();
  const hubRef = useSpotlight<HTMLElement>();

  const card = (
    tool: Tool,
    ref: (el: HTMLElement | null) => void,
    className: string,
  ) => (
    <article
      ref={ref}
      onClick={() => {
        if (tool.mode === 'studio') {
          onLaunchStudio(document.getElementById(tool.id));
        } else {
          onOpenTool(tool.id, document.getElementById(tool.id));
        }
      }}
      id={tool.id}
      className={`group relative cursor-pointer overflow-hidden rounded-[18px] sm:rounded-2xl border border-white/[0.12] border-t-white/[0.3] bg-[#0d0d10]/80 backdrop-blur-2xl transition-[border-color,box-shadow] duration-300 hover:border-white/25 hover:shadow-[0_20px_50px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.35)] ${className}`}
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
          <svg aria-hidden viewBox="0 0 200 120" className="pointer-events-none absolute -right-4 bottom-0 h-20 sm:h-28 w-32 sm:w-44 opacity-[0.13]">
            <path d="M30 118 C40 60 70 30 100 24 C130 30 158 58 170 118 Z" fill="#fff" />
            <circle cx="100" cy="52" r="15" fill="#070708" />
            <path d="M76 118 C82 84 90 68 100 66 C110 68 118 84 124 118 Z" fill="#070708" opacity="0.8" />
          </svg>
        </>
      )}
      <div className="relative flex h-full flex-col p-2.5 sm:p-4">
        <div className="mb-2 sm:mb-2.5 flex items-start justify-between gap-1.5 sm:gap-3">
          <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg border border-white/[0.1] border-t-white/[0.25] bg-white/[0.06]">
            {tool.icon}
          </div>
          <StatusBadge mode={tool.mode} />
        </div>

        {tool.mode === 'studio' && (
          <p className="hidden sm:block font-mono text-[9px] uppercase tracking-[0.18em] text-white/35">[Toolchain: active]</p>
        )}
        <h3 className={`mt-0.5 font-semibold tracking-[-0.015em] text-white line-clamp-1 ${tool.mode === 'studio' ? 'text-[13.5px] sm:text-[16px] md:text-[19px]' : 'text-[12px] sm:text-[13.5px] md:text-[14.5px]'}`}>
          {tool.title}
        </h3>
        <p className={`mt-0.5 font-medium text-white/55 line-clamp-1 ${tool.mode === 'studio' ? 'max-w-md text-[10.5px] sm:text-[11.5px] md:text-[12.5px]' : 'text-[10px] sm:text-[11px] md:text-[11.5px]'}`}>
          {tool.tagline}
        </p>
        <p className={`mt-1 sm:mt-1.5 leading-snug sm:leading-relaxed text-white/40 line-clamp-2 sm:line-clamp-none ${tool.mode === 'studio' ? 'max-w-md text-[9.5px] sm:text-[11px] md:text-[12px]' : 'text-[9.5px] sm:text-[10.5px] md:text-[11px]'}`}>
          {tool.body}
        </p>

        <div className="mt-auto flex items-center justify-between gap-1 sm:gap-2 pt-2 sm:pt-3">
          <span className="flex min-w-0 flex-wrap gap-1">
            {tool.specs.map((s) => (
              <span key={s} className="rounded border border-white/[0.08] bg-white/[0.04] px-1 sm:px-1.5 py-0.5 font-mono text-[8px] sm:text-[9px] text-white/45">
                {s}
              </span>
            ))}
          </span>
          <IconArrowRight size={12} className="shrink-0 text-white/40 transition-transform duration-300 group-hover:translate-x-1.5 group-hover:text-white sm:h-3.5 sm:w-3.5" />
        </div>
      </div>
    </article>
  );

  return (
    <section className="relative z-40 bg-[#070708] px-3 sm:px-6 pb-8 sm:pb-12 pt-12 sm:pt-14">
      {/* Apple-grade seamless multi-stop progressive scrim veil from 3D hero into studio showcase */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-48 sm:-top-80 inset-x-0 h-48 sm:h-80"
        style={{
          background: `linear-gradient(
            to bottom,
            rgba(7, 7, 8, 0) 0%,
            rgba(7, 7, 8, 0.003) 8.1%,
            rgba(7, 7, 8, 0.012) 15.5%,
            rgba(7, 7, 8, 0.035) 22.5%,
            rgba(7, 7, 8, 0.08) 29%,
            rgba(7, 7, 8, 0.15) 35.3%,
            rgba(7, 7, 8, 0.25) 41.2%,
            rgba(7, 7, 8, 0.38) 47.1%,
            rgba(7, 7, 8, 0.52) 52.9%,
            rgba(7, 7, 8, 0.67) 58.8%,
            rgba(7, 7, 8, 0.80) 64.7%,
            rgba(7, 7, 8, 0.90) 71%,
            rgba(7, 7, 8, 0.96) 77.5%,
            rgba(7, 7, 8, 0.99) 84.5%,
            #070708 100%
          )`,
        }}
      />
      {/* Progressive depth diffusion veil */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-36 sm:-top-56 inset-x-0 h-36 sm:h-56"
        style={{
          maskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.6) 65%, black 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.6) 65%, black 100%)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
      />

      {/* ambient orbs — strictly clamped inside showcase bounds to avoid bleeding into 3D scene */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-36 h-80 w-[560px] -translate-x-1/2 rounded-full bg-[#ff2d55]/[0.035] blur-[140px]" />
      </div>

      {/* Downward-facing Apple-grade seamless multi-stop progressive scrim veil from showcase into frosted glass stage */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 sm:-bottom-48 inset-x-0 h-32 sm:h-48 z-40"
        style={{
          background: `linear-gradient(
            to bottom,
            #070708 0%,
            rgba(7, 7, 8, 0.99) 15.5%,
            rgba(7, 7, 8, 0.96) 22.5%,
            rgba(7, 7, 8, 0.90) 29%,
            rgba(7, 7, 8, 0.80) 35.3%,
            rgba(7, 7, 8, 0.67) 41.2%,
            rgba(7, 7, 8, 0.52) 47.1%,
            rgba(7, 7, 8, 0.38) 52.9%,
            rgba(7, 7, 8, 0.25) 58.8%,
            rgba(7, 7, 8, 0.15) 64.7%,
            rgba(7, 7, 8, 0.08) 71%,
            rgba(7, 7, 8, 0.035) 77.5%,
            rgba(7, 7, 8, 0.012) 84.5%,
            rgba(7, 7, 8, 0.003) 91.9%,
            rgba(7, 7, 8, 0) 100%
          )`,
        }}
      />

      <div className="relative mx-auto max-w-6xl">
        <div className="mb-3 sm:mb-4 flex items-end justify-between">
          <h2 className="text-[17px] sm:text-[20px] font-bold tracking-[-0.02em]">Inside the studio</h2>
          <span className="font-mono text-[10px] sm:text-[11px] uppercase tracking-widest text-white/35">Toolchain</span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-2.5 md:grid-cols-12">
          {card(TOOLS[0], heroRef, 'md:col-span-8 min-h-[160px] sm:min-h-[180px] md:min-h-[210px]')}
          {card(TOOLS[1], calcRef, 'md:col-span-4')}
          {card(TOOLS[2], estRef, 'md:col-span-5')}
          {card(TOOLS[3], hubRef, 'md:col-span-7')}
        </div>
      </div>
    </section>
  );
}

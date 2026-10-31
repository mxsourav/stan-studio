import { useCallback, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import RepoHero from '../components/RepoHero';
import Wordmark, { BrandBadge } from '../components/Wordmark';
import { IconArrowRight, IconBoxSealedFill, IconGridFill, IconRulerFill, IconSparkle } from '../components/icons';

/** Showcase cards — the studio's tool lineup (Apple visionOS frosted glass). */
const TOOLS = [
  {
    id: 'shadow-lamp',
    title: 'Shadow Lamp Studio',
    tagline: 'Photo → wall-projected lantern',
    body: 'Upload any image and the silhouette engine cuts a parametric lantern that casts it onto your wall in warm light.',
    icon: <IconSparkle size={20} className="text-white" />,
    live: true,
  },
  {
    id: 'filament-calc',
    title: 'Filament Calculator',
    tagline: 'Spool math without the spreadsheet',
    body: 'Convert between meters, grams and rupees across every material in the drawer — tuned to real spool weights.',
    icon: <IconBoxSealedFill size={20} className="text-white" />,
    live: false,
  },
  {
    id: 'print-estimator',
    title: '3D Print Estimator',
    tagline: 'Cost & time before the slice',
    body: 'Drop an STL and get material volume, print hours and machine-rate pricing across PLA, PETG, ABS and ASA.',
    icon: <IconRulerFill size={20} className="text-white" />,
    live: false,
  },
  {
    id: 'stl-hub',
    title: 'Custom STL Hub',
    tagline: 'Your prints, organized',
    body: 'A private shelf for validated models, remix history and one-tap reorders from the print floor.',
    icon: <IconGridFill size={20} className="text-white" />,
    live: false,
  },
];

export default function Home() {
  const navigate = useNavigate();
  const [warp, setWarp] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const warpingRef = useRef(false);

  const warpToStudio = useCallback((cardEl: HTMLElement | null) => {
    if (warpingRef.current) return;
    warpingRef.current = true;
    const rect = cardEl?.getBoundingClientRect();
    setWarp(
      rect
        ? { x: rect.left, y: rect.top, w: rect.width, h: rect.height }
        : { x: window.innerWidth / 2 - 40, y: window.innerHeight / 2 - 40, w: 80, h: 80 },
    );
    sessionStorage.setItem('stan-warp', '1');
    setTimeout(() => navigate('/studio', { viewTransition: true }), 520);
  }, []);

  const runWarp = (overlay: HTMLDivElement | null) => {
    if (!overlay || !warp) return;
    const sx = warp.w / window.innerWidth;
    const sy = warp.h / window.innerHeight;
    overlay.animate(
      [
        {
          transform: `translate(${warp.x + warp.w / 2 - window.innerWidth / 2}px, ${warp.y + warp.h / 2 - window.innerHeight / 2}px) scale(${sx}, ${sy})`,
          borderRadius: '24px',
          opacity: 0.55,
        },
        { transform: 'translate(0px, 0px) scale(1, 1)', borderRadius: '0px', opacity: 1 },
      ],
      { duration: 500, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
    );
  };

  return (
    <div className="min-h-screen bg-[#070708] text-white">
      {/* Top navigation */}
      <header className="glass-subtle fixed inset-x-4 top-4 z-40 flex items-center justify-between rounded-2xl px-5 py-3">
        <span className="flex items-center gap-3">
          <BrandBadge size={30} />
          <Wordmark size={18} />
        </span>
        <nav className="flex items-center gap-1 text-[13px] font-medium">
          <button
            type="button"
            onClick={(e) => warpToStudio(e.currentTarget)}
            className="segment-pill px-4 py-1.5"
          >
            Shadow Lamp Studio
          </button>
          <Link to="/admin" className="rounded-xl px-4 py-1.5 text-white/55 transition hover:text-white/85">
            Admin
          </Link>
        </nav>
      </header>

      {/* Verbatim repo landing hero — spool stage, dust evaporation, roll physics */}
      <RepoHero />

      {/* Showcase cards — glide over the stage once the brand has dissolved */}
      <section className="relative z-40 bg-[#070708] px-6 pb-10 pt-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-5 flex items-end justify-between">
            <h2 className="text-[22px] font-bold tracking-[-0.02em]">Inside the studio</h2>
            <span className="font-mono text-[11px] uppercase tracking-widest text-white/35">Toolchain</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {TOOLS.map((tool) => (
              <ToolCard key={tool.id} tool={tool} onOpen={tool.live ? warpToStudio : undefined} />
            ))}
          </div>
        </div>
      </section>

      <footer className="relative z-40 border-t border-white/[0.06] bg-[#070708] px-6 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <span className="flex items-center gap-2.5">
            <BrandBadge size={24} />
            <Wordmark size={15} />
          </span>
          <p className="text-[12px] text-white/35">Precision 3D print studio · India</p>
        </div>
      </footer>

      {/* Cinematic warp overlay into the studio */}
      {warp && (
        <div
          ref={runWarp}
          className="warp-overlay"
          style={{
            left: 0,
            top: 0,
            width: '100vw',
            height: '100vh',
            transformOrigin: 'center',
          }}
        />
      )}
    </div>
  );
}

function ToolCard({
  tool,
  onOpen,
}: {
  tool: (typeof TOOLS)[number];
  onOpen?: (el: HTMLElement | null) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  return (
    <article
      ref={ref}
      className={`glass-card group relative overflow-hidden p-6 ${tool.live ? 'cursor-pointer' : ''}`}
      onClick={tool.live ? () => onOpen?.(ref.current) : undefined}
    >
      <div className="mb-4 flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.1] border-t-white/[0.2] bg-white/[0.06]">
          {tool.icon}
        </div>
        {tool.live ? (
          <span className="flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-white/[0.08] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-white/80">
            <span className="h-1.5 w-1.5 rounded-full bg-[#ff2d55] shadow-[0_0_8px_rgba(255,45,85,0.9)]" />
            Live preview
          </span>
        ) : (
          <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-white/35">
            In the queue
          </span>
        )}
      </div>
      <h3 className="text-[16px] font-semibold tracking-[-0.01em]">{tool.title}</h3>
      <p className="mt-0.5 text-[12px] font-medium text-white/45">{tool.tagline}</p>
      <p className="mt-2.5 text-[13px] leading-relaxed text-white/55">{tool.body}</p>
      {tool.live && (
        <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-white transition group-hover:gap-2.5">
          Open Studio <IconArrowRight size={15} />
        </span>
      )}
    </article>
  );
}

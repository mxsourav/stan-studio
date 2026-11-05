import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import RepoHero from '../components/RepoHero';
import StudioShowcase from '../components/StudioShowcase';
import Wordmark from '../components/Wordmark';
import Footer from '../components/Footer';
import WhyChooseStudio from '../components/WhyChooseStudio';
import SpoolCalibrator from '../components/SpoolCalibrator';
import { usePWAInstall } from '../hooks/usePWAInstall';

export default function Home() {
  const navigate = useNavigate();
  const [warp, setWarp] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const warpingRef = useRef(false);
  const { canInstall, installApp } = usePWAInstall();

  // Restore scroll position when returning from Studio or a tool workspace
  useEffect(() => {
    const returnScroll = sessionStorage.getItem('stan-return-scroll');
    if (returnScroll !== null) {
      sessionStorage.removeItem('stan-return-scroll');
      const targetY = Number(returnScroll);
      const restore = () => {
        window.scrollTo({ top: targetY, behavior: 'instant' });
      };
      restore();
      requestAnimationFrame(restore);
      const t1 = setTimeout(restore, 60);
      const t2 = setTimeout(restore, 180);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, []);

  const warpTo = useCallback(
    (dest: string, cardEl: HTMLElement | null) => {
      if (warpingRef.current) return;
      warpingRef.current = true;
      // Remember current scroll position so returning brings user right back here
      sessionStorage.setItem('stan-return-scroll', String(window.scrollY));
      const rect = cardEl?.getBoundingClientRect();
      setWarp(
        rect
          ? { x: rect.left, y: rect.top, w: rect.width, h: rect.height }
          : { x: window.innerWidth / 2 - 40, y: window.innerHeight / 2 - 40, w: 80, h: 80 },
      );
      setTimeout(() => navigate(dest, { viewTransition: true }), 520);
    },
    [navigate],
  );

  const warpToStudio = useCallback((cardEl: HTMLElement | null) => warpTo('/studio', cardEl), [warpTo]);

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
      {/* Top navigation — fixed at topmost z-50 */}
      <header className="glass-subtle fixed inset-x-2.5 sm:inset-x-4 top-2.5 sm:top-4 z-50 flex items-center justify-between rounded-xl sm:rounded-2xl px-3.5 sm:px-5 py-2 sm:py-3">
        <span className="flex items-center">
          <Wordmark size={16} />
        </span>
        <nav className="flex items-center gap-2 text-[12px] sm:text-[13px] font-medium">
          {canInstall && (
            <button
              type="button"
              onClick={() => installApp()}
              className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 sm:px-3 py-1 text-xs text-white hover:bg-white/20 transition-all"
              title="Download STΔN studio as an app"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span className="hidden sm:inline">Download App</span>
              <span className="sm:hidden">App</span>
            </button>
          )}
          <Link
            to="/about"
            viewTransition
            className="text-zinc-400 hover:text-white transition-colors px-2 py-1"
          >
            About
          </Link>
          <button
            type="button"
            onClick={(e) => warpToStudio(e.currentTarget)}
            className="segment-pill px-3 sm:px-4 py-1.5"
          >
            <span className="hidden sm:inline">Shadow Lamp Studio</span>
            <span className="sm:hidden">Studio</span>
          </button>
        </nav>
      </header>

      {/* Verbatim repo landing hero — spool stage, dust evaporation, roll physics */}
      <RepoHero />

      {/* Showcase — bento portfolio, spotlight; tools warp into their workspace routes */}
      <div id="inside-the-studio">
        <StudioShowcase onLaunchStudio={warpToStudio} onOpenTool={(id, el) => warpTo(`/tools/${id}`, el)} />
      </div>

      {/* Why Choose STΔN studio? — Refined subtle glass stage with reduced background blur */}
      <section
        id="why-choose-section"
        className="frosted-glass-stage relative z-30 bg-[#070708]/65 sm:bg-[#070708]/70 backdrop-blur-[8px] sm:backdrop-blur-[10px] backdrop-saturate-[120%]"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-12 sm:pb-16">
          <WhyChooseStudio />
        </div>
      </section>

      {/* Industrial studio-grade footer with interactive VisionOS legal reader */}
      <Footer onOpenStudio={() => warpToStudio(null)} onOpenToolModal={(id) => warpTo('/tools/' + id, null)} />

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
      {/* Interactive 3D Spool Position & Angle Calibrator Tool */}
      <SpoolCalibrator />
    </div>
  );
}

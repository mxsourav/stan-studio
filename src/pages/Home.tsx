import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import RepoHero from '../components/RepoHero';
import StudioShowcase from '../components/StudioShowcase';
import Wordmark from '../components/Wordmark';
import Footer from '../components/Footer';
import WhyChooseStudio from '../components/WhyChooseStudio';

export default function Home() {
  const navigate = useNavigate();
  const [warp, setWarp] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const warpingRef = useRef(false);

  // Restore scroll position when returning from Studio
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

  const warpToStudio = useCallback((cardEl: HTMLElement | null) => {
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
    sessionStorage.setItem('stan-warp', '1');
    setTimeout(() => navigate('/studio', { viewTransition: true }), 520);
  }, [navigate]);

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

      {/* Showcase — bento portfolio, spotlight + tilt, live tools in glass modals */}
      <div id="inside-the-studio">
        <StudioShowcase onLaunchStudio={warpToStudio} />
      </div>

      {/* Why Choose STΔN studio? — Frosted Glass Layer over the filament roll stage extending till footer */}
      <section className="relative z-30 border-t border-white/[0.08] bg-[#070708]/80 backdrop-blur-2xl backdrop-saturate-[180%] shadow-[0_-24px_60px_rgba(0,0,0,0.85)]">
        {/* Soft ambient blur veil extending seamlessly above the section header */}
        <div className="pointer-events-none absolute inset-x-0 -top-24 h-24 bg-gradient-to-t from-[#070708]/80 to-transparent backdrop-blur-md" />
        
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16 pb-12 sm:pb-16">
          <WhyChooseStudio />
        </div>
      </section>

      {/* Industrial studio-grade footer with interactive VisionOS legal reader */}
      <Footer onOpenStudio={() => warpToStudio(null)} />

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

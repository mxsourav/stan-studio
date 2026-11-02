import { useEffect } from 'react';
import * as THREE from 'three';
import { initRepoHeroStage } from '../vendor/hero-stage.js';

/**
 * Verbatim repo landing hero: the exact DOM attachment points
 * (#webgl-canvas, #hero-dispersion-canvas, #hero-brand with .hero-stan /
 * .hero-studio / .hero-scroll-cue) that the repo's stage engine and
 * HeroDispersion particle module expect, wrapped in permanent dark mode.
 * Zero physics modification — see src/vendor/hero-stage.js.
 */

declare global {
  interface Window {
    THREE?: unknown;
    HeroDispersion?: {
      init?: (opts: { canvasId: string; heroId: string }) => void;
      setTheme?: (isDark: boolean) => void;
      destroy?: () => void;
    };
    applyTheme?: (isDark: boolean, persist: boolean) => void;
    animateRollTo?: (destP: number, duration?: number) => void;
  }
}

export default function RepoHero() {
  useEffect(() => {
    let disposed = false;
    let cleanupStage: (() => void) | undefined;

    const bootDispersion = () => {
      window.HeroDispersion?.init?.({ canvasId: 'hero-dispersion-canvas', heroId: 'hero-brand' });
      window.HeroDispersion?.setTheme?.(true);
    };

    // Wrapper hook: a tool workspace dispatches this on back-navigation so the
    // dust canvas re-initializes pristine — the blast re-arms without a refresh.
    // (Primary mechanism is the route remount itself; this is the guarantee.)
    const onResetDust = () => {
      window.HeroDispersion?.destroy?.();
      bootDispersion();
    };
    window.addEventListener('stan:reset-dust-canvas', onResetDust);

    (async () => {
      window.THREE = THREE;
      // UMD module: registers window.HeroDispersion against window.THREE.
      await import('../vendor/hero-dispersion.js');
      if (disposed) return;
      // The vendored stage performs the repo's own init sequence, including
      // HeroDispersion.init({ canvasId: 'hero-dispersion-canvas', heroId: 'hero-brand' }).
      try {
        cleanupStage = initRepoHeroStage();
      } catch (error) {
        (window as unknown as { __stanHeroError?: string }).__stanHeroError =
          error instanceof Error ? error.stack : String(error);
        return;
      }
      // Force the permanent obsidian dark theme over the repo's persistence.
      window.applyTheme?.(true, false);
      bootDispersion();
    })();

    return () => {
      disposed = true;
      window.removeEventListener('stan:reset-dust-canvas', onResetDust);
      cleanupStage?.();
      window.HeroDispersion?.destroy?.();
    };
  }, []);

  return (
    <>
      <canvas id="webgl-canvas" />
      <canvas id="hero-dispersion-canvas" />
      <div className="hero-brand" id="hero-brand">
        <div className="hero-stan">STΔN</div>
        <div className="hero-studio">
          <span className="hero-studio-text">studio</span><span className="crimson-dot">.</span>
        </div>
        <button
          type="button"
          className="hero-scroll-cue"
          onClick={() => window.animateRollTo?.(1.0, 2600)}
          title="Scroll to unroll filament"
          aria-label="Scroll down"
        >
          <svg viewBox="0 0 24 24">
            <polyline points="7 10 12 15 17 10" />
          </svg>
        </button>
      </div>
      <div className="scroll-spacer" />
    </>
  );
}

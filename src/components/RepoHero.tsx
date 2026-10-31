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
      window.HeroDispersion?.setTheme?.(true);
    })();

    return () => {
      disposed = true;
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
          studio<span className="crimson-dot">.</span>
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

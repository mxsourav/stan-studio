import { useCallback, useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import Wordmark from '../components/Wordmark';
import FilamentCalculator from '../components/tools/FilamentCalculator';
import PrintEstimator from '../components/tools/PrintEstimator';
import CustomStlHub from '../components/tools/CustomStlHub';
import { TOOLS } from '../components/StudioShowcase';

/**
 * Dedicated fullscreen tool workspace (Fusion 360-style). Rendered at
 * /tools/:toolId — the landing page (and its navbar) is fully unmounted by
 * routing, so the workspace owns 100% of the viewport: liquid-glass header
 * with breadcrumb + Back, central content surface, bottom telemetry bar.
 * Unmount dispatches 'stan:reset-dust-canvas' so the landing hero's dust
 * canvas re-initializes pristine on return.
 */

const TELEMETRY: Record<string, string[]> = {
  calc: ['1.75mm real filament geometry', '5 materials', 'bidirectional m ⇄ g ⇄ ₹'],
  estimator: ['signed-tetrahedron volume', '6 mm³/s effective flow + 15% travel', 'rough estimate'],
};

function TelemetryBar({ facts }: { facts: string[] }) {
  return (
    <footer className="liquid-glass sticky bottom-0 z-20 flex shrink-0 items-center gap-4 overflow-x-auto rounded-none border-x-0 border-b-0 px-4 py-2 sm:px-6">
      {facts.map((f) => (
        <span key={f} className="whitespace-nowrap font-mono text-[9.5px] uppercase tracking-wider text-white/35">
          {f}
        </span>
      ))}
    </footer>
  );
}

export default function ToolWorkspace() {
  const { toolId } = useParams();
  const navigate = useNavigate();
  const tool = TOOLS.find((t) => t.id === toolId);

  // Back-navigation dust reset: fires as this workspace unmounts; RepoHero
  // (freshly mounted on Home) destroys + re-inits the particle canvas.
  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent('stan:reset-dust-canvas'));
    };
  }, []);

  const handleBack = useCallback(() => {
    // History-aware: browser Back returns to the exact landing scroll position;
    // direct deep-links (no history) go home through a view transition.
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/', { viewTransition: true });
    }
  }, [navigate]);

  if (!tool) return <Navigate to="/" replace />;
  if (tool.mode === 'studio') return <Navigate to="/studio" replace />;

  return (
    <div className="flex min-h-screen flex-col bg-[#070708] text-white lg:h-screen lg:w-screen lg:overflow-hidden">
      {/* Workspace header — replaces the site navbar entirely (route isolation) */}
      <header className="liquid-glass sticky top-0 z-30 flex shrink-0 items-center justify-between gap-3 rounded-none border-x-0 border-t-0 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <Wordmark size={14} />
          <span aria-hidden className="font-mono text-[10px] text-white/30">
            //
          </span>
          <span className="truncate text-[13px] font-semibold tracking-[-0.01em] text-white">{tool.title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="hidden items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-emerald-200/90 sm:flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.8)]" />
            Toolchain: active
          </span>
          <button
            type="button"
            onClick={handleBack}
            className="rounded-lg bg-white px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-black transition hover:bg-white/90 active:scale-[0.99]"
          >
            Back to Studio
          </button>
        </div>
      </header>

      {/* Tool surface */}
      <div className="flex min-h-0 flex-1 flex-col">
        {tool.mode === 'hub' && <CustomStlHub />}
        {tool.mode === 'calc' && (
          <>
            <div className="no-scrollbar flex min-h-0 flex-1 items-start justify-center overflow-y-auto p-4 sm:p-8">
              <div className="liquid-glass w-full max-w-xl rounded-[24px] p-5 sm:p-6">
                <h1 className="text-[16px] font-semibold tracking-[-0.015em] text-white">{tool.title}</h1>
                <p className="mt-0.5 text-[11.5px] font-medium text-white/55">{tool.tagline}</p>
                <div className="mt-4">
                  <FilamentCalculator />
                </div>
              </div>
            </div>
            <TelemetryBar facts={TELEMETRY.calc} />
          </>
        )}
        {tool.mode === 'estimator' && (
          <>
            <div className="no-scrollbar flex min-h-0 flex-1 items-start justify-center overflow-y-auto p-4 sm:p-8">
              <div className="liquid-glass w-full max-w-xl rounded-[24px] p-5 sm:p-6">
                <h1 className="text-[16px] font-semibold tracking-[-0.015em] text-white">{tool.title}</h1>
                <p className="mt-0.5 text-[11.5px] font-medium text-white/55">{tool.tagline}</p>
                <div className="mt-4">
                  <PrintEstimator />
                </div>
              </div>
            </div>
            <TelemetryBar facts={TELEMETRY.estimator} />
          </>
        )}
      </div>
    </div>
  );
}

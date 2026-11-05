import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import FilamentCalculator from '../components/tools/FilamentCalculator';
import PrintEstimator from '../components/tools/PrintEstimator';
import CustomStlHub from '../components/tools/CustomStlHub';
import Forge from '../components/tools/Forge';
import WorkspaceChrome from '../components/tools/WorkspaceChrome';
import { TOOLS } from '../components/StudioShowcase';

/**
 * Dedicated fullscreen tool workspace (Bambu-Studio-style). Rendered at
 * /tools/:toolId — the landing page (and its navbar) is fully unmounted by
 * routing, so the workspace owns 100% of the viewport. One compact chrome
 * bar (WorkspaceChrome), then the tool surface. The STL Hub renders its own
 * chrome with the mode tabs merged into the bar; calculators keep the plain
 * chrome + telemetry bar. Unmount dispatches 'stan:reset-dust-canvas' so the
 * landing hero's dust canvas re-initializes pristine on return.
 */

const TELEMETRY: Record<string, string[]> = {
  calc: ['1.75mm real filament geometry', '5 materials', 'bidirectional m ⇄ g ⇄ ₹'],
  estimator: ['signed-tetrahedron volume', '6 mm³/s effective flow + 15% travel', 'rough estimate'],
  forge: ['groq llama-3.3 prompt sculpting', 'pollinations statue drafts', 'hunyuan3d shape → stl export'],
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
  const tool = TOOLS.find((t) => t.id === toolId);

  // Back-navigation dust reset: fires as this workspace unmounts; RepoHero
  // (freshly mounted on Home) destroys + re-inits the particle canvas.
  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent('stan:reset-dust-canvas'));
    };
  }, []);

  if (!tool) return <Navigate to="/" replace />;
  if (tool.mode === 'studio') return <Navigate to="/studio" replace />;

  return (
    <div className="flex min-h-screen flex-col bg-[#070708] text-white lg:h-screen lg:w-screen lg:overflow-hidden">
      {tool.mode === 'hub' ? (
        // The hub owns its chrome — mode tabs live INSIDE the top bar.
        <CustomStlHub title={tool.title} />
      ) : (
        <>
          <WorkspaceChrome title={tool.title} />
          <div className="flex min-h-0 flex-1 flex-col">
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
            {tool.mode === 'forge' && (
              <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
                <Forge />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

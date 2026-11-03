import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Wordmark from '../Wordmark';

/**
 * Single compact top bar for the /tools/:toolId fullscreen workspace —
 * breadcrumb left, tool-provided tabs centered, telemetry chip + Back right.
 * Bambu-Studio-style: one bar, h-14, zero stacked chrome rows.
 */
export default function WorkspaceChrome({ title, center }: { title: string; center?: React.ReactNode }) {
  const navigate = useNavigate();

  const handleBack = useCallback(() => {
    // History-aware: browser Back returns to the exact landing scroll position;
    // direct deep-links (no history) go home through a view transition.
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/', { viewTransition: true });
    }
  }, [navigate]);

  return (
    <header className="liquid-glass sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-2 rounded-none border-x-0 border-t-0 px-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <Wordmark size={14} />
        <span aria-hidden className="hidden font-mono text-[10px] text-white/30 sm:inline">
          //
        </span>
        <span className="hidden truncate text-[13px] font-semibold tracking-[-0.01em] text-white sm:inline">{title}</span>
      </div>
      {center != null && <div className="flex min-w-0 items-center justify-center">{center}</div>}
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
  );
}

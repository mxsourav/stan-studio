import { useState, useEffect, useCallback } from 'react';

export interface SpoolCoords {
  posX: number;
  posY: number;
  posZ: number;
  rotXDeg: number;
  rotYDeg: number;
  rotZDeg: number;
  scale: number;
}

declare global {
  interface Window {
    __spoolCalib?: {
      getDesktopStart: () => SpoolCoords;
      getPhoneStart: () => SpoolCoords;
      setDesktopStart: (cfg: Partial<SpoolCoords>) => void;
      setPhoneStart: (cfg: Partial<SpoolCoords>) => void;
      resetDesktopStart: () => void;
      resetPhoneStart: () => void;
    };
  }
}

type ParamKey = keyof SpoolCoords;

interface ParamMeta {
  key: ParamKey;
  label: string;
  shortLabel: string;
  min: number;
  max: number;
  step: number;
  precision: number;
  unit: string;
}

const PARAMS: ParamMeta[] = [
  { key: 'posX', label: 'Position X (Left / Right)', shortLabel: 'Pos X', min: -8.0, max: 4.0, step: 0.01, precision: 2, unit: '' },
  { key: 'posY', label: 'Position Y (Up / Down)', shortLabel: 'Pos Y', min: -4.0, max: 4.0, step: 0.01, precision: 2, unit: '' },
  { key: 'posZ', label: 'Position Z (Depth)', shortLabel: 'Pos Z', min: -4.0, max: 4.0, step: 0.01, precision: 2, unit: '' },
  { key: 'rotXDeg', label: 'Pitch X Angle (Tilt)', shortLabel: 'Tilt X', min: -180.0, max: 180.0, step: 0.1, precision: 1, unit: '°' },
  { key: 'rotYDeg', label: 'Yaw Y Angle (Spin)', shortLabel: 'Spin Y', min: -180.0, max: 180.0, step: 0.1, precision: 1, unit: '°' },
  { key: 'rotZDeg', label: 'Roll Z Angle (Turn)', shortLabel: 'Turn Z', min: -180.0, max: 180.0, step: 0.1, precision: 1, unit: '°' },
  { key: 'scale', label: 'Spool Scale', shortLabel: 'Scale', min: 0.3, max: 2.5, step: 0.01, precision: 2, unit: '' },
];

export default function SpoolCalibrator() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false); // Compact Bottom Strip by default!
  const [isGhost, setIsGhost] = useState(false); // Peek / Ghost mode for 100% visibility
  const [device, setDevice] = useState<'phone' | 'desktop'>('phone');
  const [activeParam, setActiveParam] = useState<ParamKey>('posX');
  const [coords, setCoords] = useState<SpoolCoords>({
    posX: -3.75,
    posY: -0.14,
    posZ: -1.78,
    rotXDeg: 15.5,
    rotYDeg: 31.0,
    rotZDeg: 1.6,
    scale: 1.48,
  });
  const [copied, setCopied] = useState(false);

  // Initialize with device detection and bridge values
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    const initialDevice = isMobile ? 'phone' : 'desktop';
    setDevice(initialDevice);

    if (window.__spoolCalib) {
      const initialCoords =
        initialDevice === 'phone'
          ? window.__spoolCalib.getPhoneStart()
          : window.__spoolCalib.getDesktopStart();
      setCoords(initialCoords);
    }
  }, []);

  // Update coordinate in state and bridge
  const updateCoord = useCallback(
    (field: ParamKey, val: number) => {
      setCoords((prev) => {
        const next = { ...prev, [field]: val };
        if (window.__spoolCalib) {
          if (device === 'phone') {
            window.__spoolCalib.setPhoneStart({ [field]: val });
          } else {
            window.__spoolCalib.setDesktopStart({ [field]: val });
          }
        }
        return next;
      });
    },
    [device]
  );

  // Switch between Phone and Desktop calibration targets
  const switchDevice = useCallback((targetDevice: 'phone' | 'desktop') => {
    setDevice(targetDevice);
    if (window.__spoolCalib) {
      const targetCoords =
        targetDevice === 'phone'
          ? window.__spoolCalib.getPhoneStart()
          : window.__spoolCalib.getDesktopStart();
      setCoords(targetCoords);
    }
  }, []);

  // Reset to default
  const handleReset = useCallback(() => {
    if (window.__spoolCalib) {
      if (device === 'phone') {
        window.__spoolCalib.resetPhoneStart();
        setCoords(window.__spoolCalib.getPhoneStart());
      } else {
        window.__spoolCalib.resetDesktopStart();
        setCoords(window.__spoolCalib.getDesktopStart());
      }
    }
  }, [device]);

  // Jump to start frame (0% scroll)
  const jumpToStart = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Copy coordinates JSON to clipboard
  const handleCopy = useCallback(async () => {
    const exportData = {
      device,
      frame: 'start_frame_0%',
      posX: Number(coords.posX.toFixed(2)),
      posY: Number(coords.posY.toFixed(2)),
      posZ: Number(coords.posZ.toFixed(2)),
      rotXDeg: Number(coords.rotXDeg.toFixed(1)),
      rotYDeg: Number(coords.rotYDeg.toFixed(1)),
      rotZDeg: Number(coords.rotZDeg.toFixed(1)),
      scale: Number(coords.scale.toFixed(2)),
    };
    const jsonStr = JSON.stringify(exportData, null, 2);

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(jsonStr);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = jsonStr;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.error('Clipboard copy failed', e);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }, [device, coords]);

  const activeMeta = PARAMS.find((p) => p.key === activeParam) || PARAMS[0];

  return (
    <>
      {/* Floating Trigger Pill (When completely closed) */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            jumpToStart();
          }}
          className="fixed bottom-4 right-4 z-[999] flex items-center gap-2 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-full bg-zinc-900/90 hover:bg-zinc-800 text-white border border-white/20 shadow-2xl backdrop-blur-xl transition-all duration-200 active:scale-95"
          title="Open 3D Spool Position & Angle Calibrator"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[12px] sm:text-[13px] font-semibold tracking-wide">
            🎯 Calibrate Spool
          </span>
          <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-white/10 text-zinc-300">
            0% Frame
          </span>
        </button>
      )}

      {/* Floating Calibration Interface */}
      {isOpen && (
        <div
          className={`fixed z-[999] transition-opacity duration-150 select-none ${
            isGhost ? 'opacity-10 pointer-events-none' : 'opacity-100'
          } ${
            isExpanded
              ? 'bottom-2 right-2 sm:bottom-4 sm:right-4 w-[calc(100vw-16px)] sm:w-[390px] max-h-[82vh] overflow-y-auto rounded-2xl bg-[#0c0d10]/90 backdrop-blur-2xl border border-white/15 shadow-[0_20px_60px_rgba(0,0,0,0.85)] p-4 text-white text-[12px]'
              : 'bottom-0 inset-x-0 sm:bottom-4 sm:right-4 sm:inset-x-auto sm:w-[410px] rounded-t-2xl sm:rounded-2xl bg-[#0c0d10]/85 backdrop-blur-2xl border-t sm:border border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.9)] p-3 sm:p-4 text-white text-[12px]'
          }`}
        >
          {/* Header Row */}
          <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2 mb-2.5">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">🎯</span>
              <span className="font-bold text-[12px] sm:text-[13px] tracking-tight text-white">
                Spool Calibrator
              </span>
              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                0% FRAME
              </span>
            </div>

            <div className="flex items-center gap-1">
              {/* Peek Button: Hold or click to temporarily hide card to inspect spool */}
              <button
                type="button"
                onMouseDown={() => setIsGhost(true)}
                onMouseUp={() => setIsGhost(false)}
                onTouchStart={() => setIsGhost(true)}
                onTouchEnd={() => setIsGhost(false)}
                className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] text-zinc-300 active:bg-blue-600 transition-colors"
                title="Hold to see spool clearly"
              >
                👁️ Peek
              </button>

              {/* Expand / Compact View Toggle */}
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] text-zinc-300 transition-colors"
                title={isExpanded ? 'Switch to Compact Bottom Strip' : 'Expand All Sliders'}
              >
                {isExpanded ? '↕ Compact' : '↕ All Sliders'}
              </button>

              {/* Close */}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors ml-1 text-sm"
                title="Minimize Calibrator"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Device Switcher (Mobile vs Desktop) */}
          <div className="grid grid-cols-2 gap-1 bg-black/50 p-1 rounded-xl border border-white/10 mb-2.5">
            <button
              type="button"
              onClick={() => switchDevice('phone')}
              className={`flex items-center justify-center gap-1 py-1 rounded-lg font-semibold text-[11px] transition-all ${
                device === 'phone'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              📱 Mobile
            </button>
            <button
              type="button"
              onClick={() => switchDevice('desktop')}
              className={`flex items-center justify-center gap-1 py-1 rounded-lg font-semibold text-[11px] transition-all ${
                device === 'desktop'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              💻 Desktop
            </button>
          </div>

          {/* ─────────────────────────────────────────────────────────────
              MODE A: COMPACT BOTTOM STRIP (Spool is 100% visible above!)
             ───────────────────────────────────────────────────────────── */}
          {!isExpanded && (
            <div className="space-y-2">
              {/* Parameter Selection Chips (Horizontally Scrollable) */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
                {PARAMS.map((p) => {
                  const isActive = activeParam === p.key;
                  const val = coords[p.key];
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setActiveParam(p.key)}
                      className={`flex-shrink-0 px-2 py-1 rounded-lg font-mono text-[10px] sm:text-[11px] transition-all ${
                        isActive
                          ? 'bg-blue-600 text-white font-bold ring-2 ring-blue-400/40 shadow-sm'
                          : 'bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/5'
                      }`}
                    >
                      <span className="text-zinc-400 mr-1">{p.shortLabel}:</span>
                      <span>
                        {val.toFixed(p.precision)}
                        {p.unit}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Active Parameter Dedicated Big Touch Slider */}
              <div className="bg-black/50 p-2 sm:p-2.5 rounded-xl border border-white/10">
                <div className="flex items-center justify-between text-[11px] text-zinc-300 font-medium mb-1.5">
                  <span className="text-blue-400 font-bold">{activeMeta.label}</span>
                  <span className="font-mono text-white text-[12px]">
                    {coords[activeMeta.key].toFixed(activeMeta.precision)}
                    {activeMeta.unit}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateCoord(
                        activeMeta.key,
                        Math.max(activeMeta.min, coords[activeMeta.key] - activeMeta.step * 5)
                      )
                    }
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-zinc-200 text-sm font-bold active:scale-95 transition-all"
                    title="Decrease by 5x step"
                  >
                    -
                  </button>
                  <input
                    type="range"
                    min={activeMeta.min}
                    max={activeMeta.max}
                    step={activeMeta.step}
                    value={coords[activeMeta.key]}
                    onChange={(e) => updateCoord(activeMeta.key, parseFloat(e.target.value))}
                    className="flex-1 h-3 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      updateCoord(
                        activeMeta.key,
                        Math.min(activeMeta.max, coords[activeMeta.key] + activeMeta.step * 5)
                      )
                    }
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-zinc-200 text-sm font-bold active:scale-95 transition-all"
                    title="Increase by 5x step"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Bottom Quick Action Bar */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl font-bold text-[12px] shadow-lg transition-all ${
                    copied
                      ? 'bg-emerald-500 text-white shadow-emerald-500/30'
                      : 'bg-white hover:bg-zinc-100 text-zinc-950 active:scale-[0.98]'
                  }`}
                >
                  {copied ? '✅ Copied to Clipboard!' : '📋 Copy Coordinates'}
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  className="py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-300 font-medium text-[11px] transition-colors"
                  title="Reset to default starting pose"
                >
                  ↺ Reset
                </button>
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              MODE B: EXPANDED FULL VIEW (All 7 sliders visible)
             ───────────────────────────────────────────────────────────── */}
          {isExpanded && (
            <div className="space-y-2 pr-0.5">
              {PARAMS.map((p) => (
                <CalibRow
                  key={p.key}
                  label={p.label}
                  value={coords[p.key]}
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  precision={p.precision}
                  unit={p.unit}
                  onChange={(v) => updateCoord(p.key, v)}
                />
              ))}

              {/* Realtime Code Output Box */}
              <div className="mt-3 bg-black/60 rounded-xl p-2 border border-white/10 font-mono text-[10px] text-zinc-300">
                <div className="flex items-center justify-between text-[9px] text-zinc-500 mb-1">
                  <span>ACTIVE COORD SNIPPET</span>
                  <span className="uppercase text-blue-400 font-bold">{device}</span>
                </div>
                <pre className="overflow-x-auto select-all text-emerald-400">
                  {JSON.stringify(
                    {
                      device,
                      posX: Number(coords.posX.toFixed(2)),
                      posY: Number(coords.posY.toFixed(2)),
                      posZ: Number(coords.posZ.toFixed(2)),
                      rotXDeg: Number(coords.rotXDeg.toFixed(1)),
                      rotYDeg: Number(coords.rotYDeg.toFixed(1)),
                      rotZDeg: Number(coords.rotZDeg.toFixed(1)),
                      scale: Number(coords.scale.toFixed(2)),
                    },
                    null,
                    2
                  )}
                </pre>
              </div>

              {/* Action Buttons */}
              <div className="mt-2.5 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`col-span-2 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl font-bold text-[12px] shadow-lg transition-all ${
                    copied
                      ? 'bg-emerald-500 text-white shadow-emerald-500/25'
                      : 'bg-white hover:bg-zinc-100 text-zinc-950 active:scale-[0.98]'
                  }`}
                >
                  {copied ? '✅ Copied to Clipboard!' : '📋 Copy Coordinates'}
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  className="col-span-1 py-2 px-2 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-300 font-medium text-[11px] transition-colors text-center"
                >
                  ↺ Reset
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

interface CalibRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  precision: number;
  unit?: string;
  onChange: (v: number) => void;
}

function CalibRow({
  label,
  value,
  min,
  max,
  step,
  precision,
  unit = '',
  onChange,
}: CalibRowProps) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[10px] text-zinc-400">
        <span>{label}</span>
        <span className="font-mono text-zinc-200">
          {value.toFixed(precision)}
          {unit}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="flex-1 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onChange(Math.max(min, value - step * 5))}
            className="w-5 h-5 flex items-center justify-center rounded bg-white/10 hover:bg-white/20 text-zinc-300 text-[10px]"
            title="Step down"
          >
            -
          </button>
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value.toFixed(precision)}
            onChange={(e) => {
              const parsed = parseFloat(e.target.value);
              if (!isNaN(parsed)) onChange(parsed);
            }}
            className="w-13 px-1 py-0.5 bg-black/60 border border-white/10 rounded font-mono text-right text-[11px] text-zinc-200 focus:outline-none focus:border-blue-500"
          />
          <button
            type="button"
            onClick={() => onChange(Math.min(max, value + step * 5))}
            className="w-5 h-5 flex items-center justify-center rounded bg-white/10 hover:bg-white/20 text-zinc-300 text-[10px]"
            title="Step up"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

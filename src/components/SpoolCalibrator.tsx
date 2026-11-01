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

export default function SpoolCalibrator() {
  const [isOpen, setIsOpen] = useState(false);
  const [device, setDevice] = useState<'phone' | 'desktop'>('phone');
  const [coords, setCoords] = useState<SpoolCoords>({
    posX: -1.55,
    posY: -0.05,
    posZ: 0.25,
    rotXDeg: 2.4,
    rotYDeg: 89.8,
    rotZDeg: 8.0,
    scale: 1.36,
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

  // Update bridge and state when a coordinate changes
  const updateCoord = useCallback(
    (field: keyof SpoolCoords, val: number) => {
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
        // Fallback for non-secure context or older mobile browsers
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
      setTimeout(() => setCopied(false), 2800);
    } catch (e) {
      console.error('Clipboard copy failed', e);
      setCopied(true);
      setTimeout(() => setCopied(false), 2800);
    }
  }, [device, coords]);

  return (
    <>
      {/* Floating Trigger Pill */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            jumpToStart();
          }}
          className="fixed bottom-4 right-4 z-[999] flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-zinc-900/95 hover:bg-zinc-800 text-white border border-white/20 shadow-2xl backdrop-blur-xl transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
          title="Open 3D Spool Position & Angle Calibrator"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[12px] sm:text-[13px] font-semibold tracking-wide">
            🎯 Calibrate Spool
          </span>
          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-white/10 text-zinc-300">
            0% Frame
          </span>
        </button>
      )}

      {/* Floating Calibration Drawer / Inspector Card */}
      {isOpen && (
        <div className="fixed bottom-3 right-3 sm:bottom-5 sm:right-5 z-[999] w-[calc(100vw-24px)] sm:w-[380px] max-h-[88vh] overflow-y-auto flex flex-col rounded-2xl bg-[#0c0d10]/95 backdrop-blur-2xl border border-white/15 shadow-[0_20px_60px_rgba(0,0,0,0.85)] text-white text-[12px] sm:text-[13px] select-none p-4 animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-base">🎯</span>
              <div>
                <div className="font-bold text-[13px] tracking-tight text-white flex items-center gap-1.5">
                  Spool Calibrator
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    LIVE
                  </span>
                </div>
                <div className="text-[10px] text-zinc-400">First Frame (0% Scroll)</div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={jumpToStart}
                className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-[10px] font-medium text-zinc-300 transition-colors"
                title="Scroll to 0% start"
              >
                🎬 0%
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                title="Minimize Calibrator"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Device Target Switcher */}
          <div className="grid grid-cols-2 gap-1.5 bg-black/40 p-1 rounded-xl border border-white/10 mb-3.5">
            <button
              type="button"
              onClick={() => switchDevice('phone')}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-semibold text-[11px] sm:text-[12px] transition-all ${
                device === 'phone'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>📱</span> Mobile / Phone
            </button>
            <button
              type="button"
              onClick={() => switchDevice('desktop')}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-semibold text-[11px] sm:text-[12px] transition-all ${
                device === 'desktop'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>💻</span> Desktop
            </button>
          </div>

          {/* Sliders & Numeric Steppers */}
          <div className="space-y-2.5 pr-0.5">
            {/* Position X */}
            <CalibRow
              label="Position X (Left / Right)"
              value={coords.posX}
              min={-9.0}
              max={5.0}
              step={0.01}
              precision={2}
              onChange={(v) => updateCoord('posX', v)}
            />

            {/* Position Y */}
            <CalibRow
              label="Position Y (Up / Down)"
              value={coords.posY}
              min={-4.0}
              max={4.0}
              step={0.01}
              precision={2}
              onChange={(v) => updateCoord('posY', v)}
            />

            {/* Position Z */}
            <CalibRow
              label="Position Z (Depth)"
              value={coords.posZ}
              min={-4.0}
              max={4.0}
              step={0.01}
              precision={2}
              onChange={(v) => updateCoord('posZ', v)}
            />

            <div className="pt-1 border-t border-white/5"></div>

            {/* Rotation Pitch X */}
            <CalibRow
              label="Pitch X Angle (Tilt Deg)"
              value={coords.rotXDeg}
              min={-180.0}
              max={180.0}
              step={0.1}
              precision={1}
              unit="°"
              onChange={(v) => updateCoord('rotXDeg', v)}
            />

            {/* Rotation Yaw Y */}
            <CalibRow
              label="Yaw Y Angle (Spin Deg)"
              value={coords.rotYDeg}
              min={-180.0}
              max={180.0}
              step={0.1}
              precision={1}
              unit="°"
              onChange={(v) => updateCoord('rotYDeg', v)}
            />

            {/* Rotation Roll Z */}
            <CalibRow
              label="Roll Z Angle (Turn Deg)"
              value={coords.rotZDeg}
              min={-180.0}
              max={180.0}
              step={0.1}
              precision={1}
              unit="°"
              onChange={(v) => updateCoord('rotZDeg', v)}
            />

            <div className="pt-1 border-t border-white/5"></div>

            {/* Scale */}
            <CalibRow
              label="Spool Scale"
              value={coords.scale}
              min={0.3}
              max={2.5}
              step={0.01}
              precision={2}
              onChange={(v) => updateCoord('scale', v)}
            />
          </div>

          {/* Realtime Code Output Box */}
          <div className="mt-3.5 bg-black/60 rounded-xl p-2.5 border border-white/10 font-mono text-[10px] text-zinc-300">
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
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className={`col-span-2 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-bold text-[12px] shadow-lg transition-all ${
                copied
                  ? 'bg-emerald-500 text-white shadow-emerald-500/25 scale-[1.02]'
                  : 'bg-white hover:bg-zinc-100 text-zinc-950 shadow-white/10 active:scale-[0.98]'
              }`}
            >
              {copied ? '✅ Copied to Clipboard!' : '📋 Copy Coordinates'}
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="col-span-1 py-2.5 px-2 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-300 font-medium text-[11px] transition-colors text-center"
              title="Reset active frame back to calibrated defaults"
            >
              ↺ Reset
            </button>
          </div>
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
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-zinc-400">
        <span>{label}</span>
        <span className="font-mono text-zinc-200">
          {value.toFixed(precision)}
          {unit}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="flex-1 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
        <div className="flex items-center gap-1">
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
            className="w-14 px-1 py-0.5 bg-black/60 border border-white/10 rounded font-mono text-right text-[11px] text-zinc-200 focus:outline-none focus:border-blue-500"
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

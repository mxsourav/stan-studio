import { useCallback, useRef, useState } from 'react';
import { readStl, type StlGeometry } from '../../lib/stl';

/**
 * 3D Print Estimator — drop an STL, get weight / hours / cost live.
 * Rough slicing model: walls ≈ surface-driven, infill % of the hollow core,
 * effective extrusion flow ~6 mm³/s (+15% travel) at 0.4mm nozzle / 0.2mm layers.
 */

const MATERIALS = [
  { id: 'PLA', density: 1.24 },
  { id: 'PETG', density: 1.27 },
  { id: 'ABS', density: 1.04 },
  { id: 'ASA', density: 1.07 },
] as const;

const FLOW_MM3_S = 6;
const TRAVEL_FACTOR = 1.15;

const fmt = (n: number, digits = 1) =>
  n.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export default function PrintEstimator() {
  const [geom, setGeom] = useState<StlGeometry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [matIdx, setMatIdx] = useState(0);
  const [infill, setInfill] = useState(20);
  const [machineRate, setMachineRate] = useState('60');
  const [rate, setRate] = useState('999');
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = useCallback(async (file: File | undefined | null) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setGeom(await readStl(file));
    } catch (e) {
      setGeom(null);
      setError(e instanceof Error ? e.message : 'Could not read that file');
    } finally {
      setBusy(false);
    }
  }, []);

  const mat = MATERIALS[matIdx];
  const infillPct = infill / 100;
  const machine = Math.max(0, Number(machineRate) || 0);
  const rateNum = Math.max(0, Number(rate) || 0);

  const printedMm3 = geom ? geom.volumeMm3 * (0.2 + 0.8 * infillPct) : 0;
  const grams = geom ? (printedMm3 / 1000) * mat.density : 0;
  const hours = geom ? (printedMm3 * TRAVEL_FACTOR) / (FLOW_MM3_S * 3600) : 0;
  const cost = geom ? hours * machine + (grams / 1000) * rateNum : 0;
  const timeLabel = hours >= 1 ? `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m` : `${Math.max(1, Math.round(hours * 60))}m`;

  return (
    <div className="flex flex-col gap-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handle(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border border-dashed px-4 py-5 text-center transition ${
          dragging ? 'border-white/50 bg-white/[0.08]' : 'border-white/[0.18] bg-white/[0.03] hover:border-white/35 hover:bg-white/[0.06]'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".stl"
          className="hidden"
          onChange={(e) => void handle(e.target.files?.[0])}
        />
        <p className="font-mono text-[12px] text-white/80">
          {busy ? 'Parsing mesh…' : geom ? geom.fileName : 'Drop an .stl or click to choose'}
        </p>
        {geom && (
          <p className="mt-1 font-mono text-[10.5px] text-white/40">
            {geom.triangles.toLocaleString('en-IN')} triangles · {geom.bbox.x} × {geom.bbox.y} × {geom.bbox.z} mm
          </p>
        )}
      </div>

      {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 font-mono text-[11px] text-red-300">{error}</p>}

      {/* Parameters */}
      <div className="flex flex-wrap gap-1.5">
        {MATERIALS.map((m, i) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMatIdx(i)}
            className={`rounded-lg px-3 py-1.5 font-mono text-[11px] transition ${
              i === matIdx ? 'bg-white/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]' : 'text-white/45 hover:text-white/80'
            }`}
          >
            {m.id}
          </button>
        ))}
      </div>

      <label className="block select-none">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">Infill</span>
          <span className="font-mono text-[12px] tabular-nums text-white/85">{infill}%</span>
        </div>
        <input
          type="range"
          min={5}
          max={100}
          step={5}
          value={infill}
          onChange={(e) => setInfill(Number(e.target.value))}
          className="stan-slider w-full"
          style={{ ['--fill' as string]: `${((infill - 5) / 95) * 100}%` }}
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">₹/kg</span>
          <input
            inputMode="numeric"
            value={rate}
            onChange={(e) => setRate(e.target.value.replace(/[^\d]/g, ''))}
            className="w-full bg-transparent font-mono text-[13px] tabular-nums text-white outline-none"
          />
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">₹/h</span>
          <input
            inputMode="numeric"
            value={machineRate}
            onChange={(e) => setMachineRate(e.target.value.replace(/[^\d]/g, ''))}
            className="w-full bg-transparent font-mono text-[13px] tabular-nums text-white outline-none"
          />
        </label>
      </div>

      {/* Readouts */}
      {geom && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['Weight', `${fmt(grams)} g`],
              ['Time', timeLabel],
              ['Cost', `₹${fmt(cost, 0)}`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl border border-white/[0.12] bg-white/[0.05] px-3 py-2.5 text-center">
                <p className="font-mono text-[9.5px] uppercase tracking-wider text-white/40">{k}</p>
                <p className="mt-0.5 font-mono text-[16px] font-semibold tabular-nums text-white">{v}</p>
              </div>
            ))}
          </div>
          <p className="font-mono text-[10.5px] text-white/35">
            {fmt(printedMm3 / 1000, 1)} cm³ extruded · rough estimate · 0.4mm nozzle, 0.2mm layers
          </p>
        </>
      )}
    </div>
  );
}

import { useState } from 'react';

/**
 * Filament Calculator — bidirectional meters ⇄ grams ⇄ rupees converter
 * for 1.75mm filament across the studio's material set.
 */

const MATERIALS = [
  { id: 'PLA', density: 1.24, rate: 999 },
  { id: 'PETG', density: 1.27, rate: 1100 },
  { id: 'ABS', density: 1.04, rate: 950 },
  { id: 'ASA', density: 1.07, rate: 1150 },
  { id: 'TPU', density: 1.21, rate: 1300 },
] as const;

// 1.75mm filament: cross-section π·0.875² ≈ 2.4053 mm² → 2.4053 cm³ per meter.
const CM3_PER_METER = 2.4053;

const SPOOL_PRESETS = [250, 500, 1000, 2000] as const;

const fmt = (n: number, digits = 1) =>
  n.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export default function FilamentCalculator() {
  const [matIdx, setMatIdx] = useState(0);
  const [rate, setRate] = useState<string>(String(MATERIALS[0].rate));
  const [meters, setMeters] = useState('100');
  const [source, setSource] = useState<'m' | 'g'>('m');

  const mat = MATERIALS[matIdx];
  const gPerM = CM3_PER_METER * mat.density;
  const rateNum = Math.max(0, Number(rate) || 0);

  const m = source === 'm' ? Math.max(0, Number(meters) || 0) : 0;
  const grams = source === 'm' ? m * gPerM : Math.max(0, Number(meters) || 0);
  const lengthM = source === 'm' ? m : grams / gPerM;
  const rupees = (grams / 1000) * rateNum;

  const setFromMeters = (v: string) => {
    setSource('m');
    setMeters(v);
  };
  const setFromGrams = (v: string) => {
    setSource('g');
    setMeters(v);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Material chips */}
      <div className="flex flex-wrap gap-1.5">
        {MATERIALS.map((m, i) => (
          <button
            key={m.id}
            type="button"
            onClick={() => {
              setMatIdx(i);
              setRate(String(m.rate));
            }}
            className={`rounded-lg px-3 py-1.5 font-mono text-[11px] transition ${
              i === matIdx
                ? 'bg-white/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]'
                : 'text-white/45 hover:text-white/80'
            }`}
          >
            {m.id} · {m.density}
          </button>
        ))}
      </div>

      {/* Linked converter */}
      <div className="grid grid-cols-2 gap-2">
        <label className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 focus-within:border-white/30">
          <span className="block font-mono text-[10px] uppercase tracking-wider text-white/40">Length (m)</span>
          <input
            inputMode="decimal"
            value={source === 'm' ? meters : lengthM ? fmt(lengthM, 2) : ''}
            onChange={(e) => setFromMeters(e.target.value)}
            placeholder="0"
            className="mt-1 w-full bg-transparent font-mono text-[17px] tabular-nums text-white outline-none placeholder-white/20"
          />
        </label>
        <label className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 focus-within:border-white/30">
          <span className="block font-mono text-[10px] uppercase tracking-wider text-white/40">Weight (g)</span>
          <input
            inputMode="decimal"
            value={source === 'g' ? meters : grams ? fmt(grams, 1) : ''}
            onChange={(e) => setFromGrams(e.target.value)}
            placeholder="0"
            className="mt-1 w-full bg-transparent font-mono text-[17px] tabular-nums text-white outline-none placeholder-white/20"
          />
        </label>
      </div>

      {/* Spool presets */}
      <div className="flex items-center gap-1.5">
        <span className="mr-1 font-mono text-[10px] uppercase tracking-wider text-white/35">Spool</span>
        {SPOOL_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setFromGrams(String(p))}
            className="rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1 font-mono text-[11px] text-white/65 transition hover:bg-white/[0.12] hover:text-white"
          >
            {p >= 1000 ? `${p / 1000}kg` : `${p}g`}
          </button>
        ))}
      </div>

      {/* Rate + cost */}
      <div className="flex items-center gap-2">
        <label className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">₹/kg</span>
          <input
            inputMode="numeric"
            value={rate}
            onChange={(e) => setRate(e.target.value.replace(/[^\d]/g, ''))}
            className="w-full bg-transparent font-mono text-[13px] tabular-nums text-white outline-none"
          />
        </label>
        <div className="flex flex-1 items-baseline justify-end gap-1.5 rounded-xl border border-white/[0.14] bg-white/[0.06] px-3 py-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">Cost</span>
          <span className="font-mono text-[17px] font-semibold tabular-nums text-white">₹{fmt(rupees, 0)}</span>
        </div>
      </div>

      <p className="font-mono text-[10.5px] leading-relaxed text-white/35">
        1.75mm · {gPerM.toFixed(2)} g/m in {mat.id} · {fmt(lengthM, 1)} m on the spool
      </p>
    </div>
  );
}

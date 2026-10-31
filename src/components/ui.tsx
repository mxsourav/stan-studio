import type { ReactNode, InputHTMLAttributes } from 'react';

/** Apple visionOS glass primitives shared across the platform. */

export function GlassCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`glass-card ${className}`}>{children}</section>;
}

export function CardTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 pt-4 pb-2">
      <h2 className="text-[13px] font-semibold tracking-wide text-white/90">{children}</h2>
      {aside}
    </div>
  );
}

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
  icon?: ReactNode;
  iconActive?: ReactNode;
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  className = '',
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={`segment-track flex w-full ${className}`} role="tablist">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-[7px] text-[12px] font-medium transition-all duration-200 ${
              active ? 'segment-pill' : 'text-white/55 hover:text-white/80'
            }`}
          >
            {active ? (opt.iconActive ?? opt.icon) : (opt.icon ?? opt.iconActive)}
            <span className="truncate">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <label className="block select-none py-1.5">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[12.5px] font-medium text-white/75">{label}</span>
        <span className="font-mono text-[12px] tabular-nums text-white/80">
          {Number.isInteger(step) ? Math.round(value) : value.toFixed(1)}
          {unit}
        </span>
      </div>
      <input
        type="range"
        className="stan-slider"
        style={{ ['--fill' as string]: `${fill}%` }}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between py-2 text-left"
    >
      <span className="text-[12.5px] font-medium text-white/75">{label}</span>
      <span
        className={`relative h-[26px] w-[44px] rounded-full transition-colors duration-200 ${
          checked ? 'bg-white/85' : 'bg-white/[0.12]'
        } border ${checked ? 'border-white/40' : 'border-white/[0.08]'}`}
      >
        <span
          className={`absolute top-[2px] h-[20px] w-[20px] rounded-full shadow-md transition-all duration-200 ${
            checked ? 'left-[21px] bg-black/75' : 'left-[2px] bg-white/85'
          }`}
        />
      </span>
    </button>
  );
}

export function GlassButton({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  className = '',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'destructive';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}) {
  const styles =
    variant === 'primary'
      ? 'bg-white text-black hover:bg-white/90 shadow-[0_6px_20px_rgba(255,255,255,0.12)]'
      : variant === 'destructive'
        ? 'bg-red-500/15 text-red-300 border border-red-400/25 hover:bg-red-500/25'
        : 'bg-white/[0.08] text-white border border-white/[0.14] border-t-white/[0.2] hover:bg-white/[0.14]';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-[13px] font-semibold transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function GlassInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return (
    <input
      {...rest}
      className={`w-full rounded-xl border border-white/[0.1] border-t-white/[0.16] bg-black/40 px-3.5 py-2.5 text-[13px] text-white placeholder-white/30 outline-none transition focus:border-white/25 focus:bg-black/55 ${className}`}
    />
  );
}

export function Modal({
  open,
  onClose,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="glass-card relative w-full max-w-sm rise-in">{children}</div>
    </div>
  );
}

export function Toast({ message, tone = 'info' }: { message: string; tone?: 'info' | 'error' }) {
  return (
    <div
      className={`glass-card fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 px-5 py-3 text-[13px] font-medium rise-in ${
        tone === 'error' ? 'text-red-300' : 'text-white/90'
      }`}
      role="status"
    >
      {message}
    </div>
  );
}

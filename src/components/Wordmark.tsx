import { BRAND } from '../config';

/** Companion round badge: white Δ on carbon, signal-red dot at the corner. */
export function BrandBadge({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="24" cy="24" r="22.6" fill="#101013" stroke="rgba(255,255,255,0.28)" strokeWidth="1.6" />
      <path
        d="M24 12.5 L35.5 33.5 H12.5 Z"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3.4"
        strokeLinejoin="round"
      />
      <circle cx="37.4" cy="37.4" r="4.2" fill="#FF2D55" />
    </svg>
  );
}

/**
 * Official lockup: STΔN studio. — Antapani Extra Bold, crisp white, with the
 * trailing period in signal red. The A is the Greek capital Delta. `studio.`
 * scales as an elegant subtitle: 0.5× of STΔN stacked, 0.74× inline.
 */
export default function Wordmark({
  size = 17,
  stacked = false,
  className = '',
}: {
  size?: number;
  /** Two-line stacked lockup: STΔN above, smaller studio. below. */
  stacked?: boolean;
  className?: string;
}) {
  const period = <span className="wordmark-period">.</span>;
  if (stacked) {
    return (
      <span
        className={`wordmark inline-flex flex-col ${className}`}
        style={{ fontSize: size, lineHeight: 0.95 }}
        aria-label="STAN studio"
      >
        <span>{BRAND.stan.replace('A', '\u0394')}</span>
        <span style={{ fontSize: size * 0.5, marginTop: size * 0.1 }}>
          {BRAND.studio}
          {period}
        </span>
      </span>
    );
  }
  return (
    <span className={`wordmark inline-flex items-baseline gap-[0.42em] ${className}`} style={{ fontSize: size }} aria-label="STAN studio">
      <span>{BRAND.stan.replace('A', '\u0394')}</span>
      <span style={{ fontSize: size * 0.74 }}>
        {BRAND.studio}
        {period}
      </span>
    </span>
  );
}

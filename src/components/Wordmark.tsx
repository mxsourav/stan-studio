import { BRAND } from '../config';

/** Companion round badge is permanently disabled — our logo is STΔN studio. itself */
export function BrandBadge(_props?: { size?: number; className?: string }) {
  return null;
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
        aria-label="STΔN studio"
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
    <span className={`wordmark inline-flex items-baseline gap-[0.42em] ${className}`} style={{ fontSize: size }} aria-label="STΔN studio">
      <span>{BRAND.stan.replace('A', '\u0394')}</span>
      <span style={{ fontSize: size * 0.74 }}>
        {BRAND.studio}
        {period}
      </span>
    </span>
  );
}

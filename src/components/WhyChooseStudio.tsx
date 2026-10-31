import { useCallback } from 'react';

/** Spotlight hook: tracks the cursor into CSS vars for the radial glow */
function useSpotlight<T extends HTMLElement>() {
  const ref = useCallback((el: T | null) => {
    if (!el) return;
    el.addEventListener('mousemove', (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  }, []);
  return ref;
}

interface WhyItem {
  title: string;
  desc: string;
  icon: React.ReactNode;
}

function SpotlightCard({ item }: { item: WhyItem }) {
  const ref = useSpotlight<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className="group relative h-full overflow-hidden rounded-[18px] sm:rounded-2xl border border-white/[0.12] border-t-white/[0.3] bg-[#0d0d10]/80 p-5 backdrop-blur-2xl transition-[border-color,box-shadow] duration-300 hover:border-white/25 hover:shadow-[0_20px_50px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.35)] flex items-start gap-4 cursor-default select-none"
    >
      {/* spotlight cursor glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            'radial-gradient(280px circle at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.08), transparent 65%)',
        }}
      />
      <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.1] border-t-white/[0.25] bg-white/[0.06] text-white">
        {item.icon}
      </div>
      <div className="relative z-10 space-y-1">
        <h3 className="text-sm sm:text-base font-semibold text-white leading-snug">
          {item.title}
        </h3>
        <p className="text-xs text-zinc-400 leading-relaxed">
          {item.desc}
        </p>
      </div>
    </div>
  );
}

export default function WhyChooseStudio({ className = '' }: { className?: string }) {
  const items: WhyItem[] = [
    {
      title: 'Genuine Maker-Grade Quality',
      desc: 'Clean layer adhesion, verified tolerances, and meticulous post-print inspection on every commissioned part.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      ),
    },
    {
      title: 'Zero MOQ & Student Pricing',
      desc: 'Student-friendly per-gram rates (₹4–₹4.5/g) with zero minimum order quantity. From a single 5-gram token to custom hobby builds.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      ),
    },
    {
      title: '100% Client-Side Privacy',
      desc: 'Local browser-based calculators and STL tools. No persistent user accounts, no tracking databases, and zero data selling.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      ),
    },
    {
      title: 'Fast Pan-India Delivery & Pickup',
      desc: 'Free studio pickup at Maniktala, 5-hr Kolkata hyperlocal courier, and Pan-India Speed Post delivery.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="3" width="15" height="13" />
          <polygon points="16 8 20 8 23 11 23 16 16 16 8" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      ),
    },
    {
      title: 'Direct Maker Consultation',
      desc: 'Direct WhatsApp connection to our maker desk for file checks, print feasibility, material advice, and custom project guidance.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
          <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
        </svg>
      ),
    },
    {
      title: '7-Day Replacement Guarantee',
      desc: '100% replacement guarantee for transit breakage or manufacturing defects, verified via continuous unboxing video within 48 hours.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.42 4.58a5.4 5.4 0 0 0-7.65 0l-.77.78-.77-.78a5.4 5.4 0 0 0-7.65 7.65l.77.78L12 20.66l7.65-7.65.77-.78a5.4 5.4 0 0 0 0-7.65z" />
        </svg>
      ),
    },
  ];

  return (
    <section className={`space-y-8 ${className}`}>
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <h2 className="font-['Playfair_Display',serif] text-3xl sm:text-4xl font-normal tracking-tight text-white">
          Why Choose ST&Delta;N studio?
        </h2>
        <p className="text-base sm:text-lg text-zinc-400 leading-relaxed">
          We are committed to powering student and independent maker builds across India by focusing on what matters most:
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-6xl mx-auto items-stretch">
        {items.map((item, idx) => (
          <SpotlightCard key={idx} item={item} />
        ))}
      </div>

      <p className="text-sm sm:text-base text-zinc-400 leading-relaxed max-w-3xl mx-auto text-center font-medium pt-2">
        Backed by our physical maker presence in Maniktala, Kolkata, we combine hands-on additive manufacturing with the accessibility of modern browser-based CAD tools, making precision digital fabrication frictionless for every learner.
      </p>
    </section>
  );
}
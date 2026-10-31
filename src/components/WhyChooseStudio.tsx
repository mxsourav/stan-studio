export default function WhyChooseStudio({ className = '' }: { className?: string }) {
  const items = [
    {
      title: 'Genuine Maker-Grade Quality',
      desc: 'Precision calibration, checked tolerances, and structural test slicing on verified hardware.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      ),
    },
    {
      title: 'Zero MOQ & Student Pricing',
      desc: 'Fair direct rates with zero arbitrary minimum order caps. Whether 1 piece or a small batch.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      ),
    },
    {
      title: '100% Client-Side Privacy',
      desc: 'In-browser parametric slicing with zero tracking databases, zero user accounts, and zero data selling.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      ),
    },
    {
      title: 'Fast Pan-India Delivery & Pickup',
      desc: 'Free Kolkata studio pickup at Maniktala, 5-hr hyperlocal courier, and Pan-India Speed Post.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="3" width="15" height="13" />
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      ),
    },
    {
      title: 'Direct Engineer Consultation',
      desc: 'Direct WhatsApp line to our engineering desk for CAD advice, print feasibility, and material choice.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
          <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
        </svg>
      ),
    },
    {
      title: '7-Day Replacement Guarantee',
      desc: 'Hassle-free reprint replacement or credit for any transit damage or verifiable print defect.',
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
          We are committed to powering student and independent engineering builds across India by focusing on what matters most:
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-6xl mx-auto">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="flex items-center p-5 rounded-2xl bg-zinc-950/70 border border-white/[0.08] hover:border-white/20 hover:bg-zinc-900/60 transition-all group backdrop-blur-xl"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] border border-white/10 text-white mr-4 group-hover:scale-105 transition-transform">
              {item.icon}
            </div>
            <div className="space-y-0.5">
              <h3 className="text-sm sm:text-base font-semibold text-white leading-snug">
                {item.title}
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {item.desc}
              </p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-sm sm:text-base text-zinc-400 leading-relaxed max-w-3xl mx-auto text-center font-medium pt-2">
        Backed by our physical maker presence in Maniktala, Kolkata, we combine hands-on additive engineering with the accessibility of modern browser-based CAD tools, making precision digital fabrication frictionless for every learner.
      </p>
    </section>
  );
}
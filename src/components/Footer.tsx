import { useState } from 'react';
import { Link } from 'react-router-dom';
import Wordmark, { BrandBadge } from './Wordmark';
import LegalModal, { type LegalTabKey } from './LegalModal';

interface FooterProps {
  onOpenStudio?: () => void;
  onOpenToolModal?: (toolId: string) => void;
}

export default function Footer({ onOpenStudio, onOpenToolModal }: FooterProps) {
  const [legalModalOpen, setLegalModalOpen] = useState(false);
  const [activeLegalTab, setActiveLegalTab] = useState<LegalTabKey>('terms');

  const openLegal = (tab: LegalTabKey) => {
    setActiveLegalTab(tab);
    setLegalModalOpen(true);
  };

  const handleToolClick = (toolId: string) => {
    if (toolId === 'shadow-lamp') {
      if (onOpenStudio) onOpenStudio();
      else window.location.href = '/studio';
    } else if (onOpenToolModal) {
      onOpenToolModal(toolId);
    } else {
      const el = document.getElementById(toolId);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <>
      <footer className="w-full mt-16 sm:mt-24 border-t border-white/[0.08] bg-[#070708] text-zinc-300 font-['Plus_Jakarta_Sans',sans-serif]">
        {/* Top Tier: Main Navigation & Studio Details */}
        <div className="mx-auto grid max-w-7xl grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-8 lg:gap-12 px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
          {/* Col 1: Brand, Studio Identity & Contact (span 4) */}
          <div className="col-span-1 sm:col-span-2 lg:col-span-4 space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5">
                <BrandBadge size={28} />
                <Wordmark size={18} />
              </div>
              <p className="text-[11px] font-medium tracking-wide text-zinc-400">
                Registered Digital Fabrication Studio &bull; Maniktala, Kolkata
              </p>
            </div>

            <div className="text-sm leading-relaxed text-zinc-400 space-y-1">
              <span className="block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Studio Location
              </span>
              <p>
                Wann Hostel, C/O Scottish Church College, 32/8 Abhedananda Rd, Beadon St, Maniktala, Kolkata, WB 700006
              </p>
            </div>

            <div className="space-y-1.5 text-sm text-zinc-300">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-zinc-400">Call / WhatsApp:</span>
                <a
                  href="https://wa.me/918509986008"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-white hover:underline transition-colors"
                >
                  +91 8509986008
                </a>
              </div>
              <div className="text-xs text-zinc-500">
                Mon &ndash; Sat, 3:00 PM &ndash; 8:00 PM &bull; Sun, 10 AM &ndash; 1 PM &amp; 2 &ndash; 8 PM IST
              </div>
              <div className="pt-0.5 text-xs text-zinc-400">
                <a href="mailto:stanstudio@mxsourav.dev" className="hover:text-white transition-colors">
                  stanstudio@mxsourav.dev
                </a>
              </div>
            </div>

            {/* Payment & Logistics Badges */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <div className="flex h-7 items-center justify-center rounded border border-white/10 bg-white/[0.04] px-2.5 text-[10px] font-mono font-medium text-zinc-300">
                UPI
              </div>
              <div className="flex h-7 items-center justify-center rounded border border-white/10 bg-white/[0.04] px-2.5 text-[10px] font-mono font-medium text-zinc-300">
                SPEED POST
              </div>
              <div className="flex h-7 items-center justify-center rounded border border-white/10 bg-white/[0.04] px-2.5 text-[10px] font-mono font-medium text-zinc-300">
                KOLKATA EXPRESS
              </div>
              <div className="flex h-7 items-center justify-center rounded border border-white/10 bg-white/[0.04] px-2.5 text-[10px] font-mono font-medium text-zinc-300">
                ZERO MOQ
              </div>
            </div>
          </div>

          {/* Col 2: Workspace / Useful Links (span 2) */}
          <div className="col-span-1 sm:col-span-1 lg:col-span-2">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Workspace
            </h3>
            <ul className="space-y-2.5 text-sm text-zinc-400">
              <li>
                <Link to="/about" className="hover:text-white transition-colors block text-left">
                  About Us
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleToolClick('shadow-lamp')}
                  className="hover:text-white transition-colors text-left"
                >
                  Shadow Lamp Studio
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleToolClick('filament-calc')}
                  className="hover:text-white transition-colors text-left"
                >
                  Filament Calculator
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleToolClick('estimator')}
                  className="hover:text-white transition-colors text-left"
                >
                  3D Print Estimator
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleToolClick('stl-hub')}
                  className="hover:text-white transition-colors text-left"
                >
                  Custom STL Hub
                </button>
              </li>
            </ul>
          </div>

          {/* Col 3: Policies & Legal (span 3) */}
          <div className="col-span-1 sm:col-span-1 lg:col-span-3">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Policies &amp; Legal
            </h3>
            <ul className="space-y-2.5 text-sm text-zinc-400">
              <li>
                <button
                  type="button"
                  onClick={() => openLegal('terms')}
                  className="hover:text-white transition-colors text-left block w-full"
                >
                  Commissioning &amp; Payments
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => openLegal('fabrication')}
                  className="hover:text-white transition-colors text-left block w-full"
                >
                  Fabrication &amp; Multi-Color Scope
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => openLegal('warranty')}
                  className="hover:text-white transition-colors text-left block w-full"
                >
                  7-Day Replacement Policy
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => openLegal('shipping')}
                  className="hover:text-white transition-colors text-left block w-full"
                >
                  Shipping &amp; Kolkata Express
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => openLegal('privacy')}
                  className="hover:text-white transition-colors text-left block w-full"
                >
                  Privacy &amp; Zero-Account Data
                </button>
              </li>
            </ul>
          </div>

          {/* Col 4: Studio Office & Maker Desk (span 3) */}
          <div className="col-span-1 sm:col-span-2 lg:col-span-3 space-y-3.5">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Studio Office &amp; Desk
            </h3>
            <p className="text-sm leading-relaxed text-zinc-400">
              Private parametric engineering and additive digital fabrication studio. We design and manufacture bespoke optical enclosures, shadow lanterns, and precision functional parts ex-studio in Kolkata.
            </p>
            <p className="text-xs leading-relaxed text-zinc-500 pt-1">
              General feasibility inquiries welcome without purchase. In-person pickups and 1-on-1 CAD consultations by prior appointment.
            </p>
            <div className="pt-2">
              <a
                href="https://wa.me/918509986008"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-medium text-zinc-300 hover:border-white/20 hover:bg-white/[0.08] hover:text-white transition-all"
              >
                <span>WhatsApp Consultation Desk</span>
                <span>&rarr;</span>
              </a>
            </div>
          </div>
        </div>

        {/* Bottom Tier: Full-Width Copyright & Disclaimer */}
        <div className="border-t border-white/[0.06] bg-[#040405]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-5 flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Left: Copyright & Statutory Disclaimer */}
            <div className="flex flex-col items-center md:items-start gap-1 text-center md:text-left">
              <span className="text-[11px] font-bold tracking-[0.08em] text-zinc-400 uppercase">
                &copy; {new Date().getFullYear()} ST&Delta;N studio<span className="text-[#ff2d55]">.</span> All rights reserved.
              </span>
              <span className="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
                Official Digital Fabrication Studio &bull; Maniktala, Kolkata
              </span>
              <span className="text-[10px] text-zinc-500 max-w-xl leading-normal mt-0.5">
                *Ex-studio fabrication rates. Free Standard India Post delivery automatically included for net fabrication cart value &gt; &#8377;999. Custom builds non-refundable once printing commences.
              </span>
            </div>

            {/* Right: Studio / Parametric Engine Badge */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-[11px] font-mono text-zinc-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Parametric Engine</span>
                <span className="text-zinc-600">&bull;</span>
                <span>Custom Digital Fabrication</span>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Interactive VisionOS Legal Reader Modal */}
      <LegalModal
        isOpen={legalModalOpen}
        activeTab={activeLegalTab}
        onTabChange={setActiveLegalTab}
        onClose={() => setLegalModalOpen(false)}
      />
    </>
  );
}
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
      <footer className="relative z-40 px-4 sm:px-6 pb-12 pt-16 font-['Plus_Jakarta_Sans',sans-serif]">
        <div className="max-w-6xl mx-auto rounded-3xl border border-white/[0.08] bg-zinc-950/70 backdrop-blur-xl p-6 sm:p-10 lg:p-12 shadow-[0_24px_60px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.08)]">
          {/* Main 4-Column Desktop Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8 lg:gap-10">
            {/* Col 1 (span 4): Brand & Studio Identity */}
            <div className="lg:col-span-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2.5 mb-4">
                  <BrandBadge size={28} />
                  <Wordmark size={18} />
                </div>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Private parametric engineering and additive digital fabrication studio. We design and manufacture bespoke optical enclosures, shadow lanterns, and precision functional parts ex-studio in Kolkata.
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-white/[0.06]">
                <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-1.5">
                  Studio Hours
                </div>
                <div className="text-xs text-zinc-400 space-y-0.5">
                  <div>Mon–Sat: 3:00 PM – 8:00 PM IST</div>
                  <div>Sun: 10:00 AM – 1:00 PM · 2:00 PM – 8:00 PM IST</div>
                </div>
              </div>
            </div>

            {/* Col 2 (span 2): Workspace */}
            <div className="lg:col-span-2">
              <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-4">
                Workspace
              </h4>
              <ul className="space-y-2.5">
                <li>
                  <Link
                    to="/about"
                    className="text-sm text-zinc-400 hover:text-white transition-colors text-left block"
                  >
                    About Us
                  </Link>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => handleToolClick('shadow-lamp')}
                    className="text-sm text-zinc-400 hover:text-white transition-colors text-left"
                  >
                    Shadow Lamp Studio
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => handleToolClick('filament-calc')}
                    className="text-sm text-zinc-400 hover:text-white transition-colors text-left"
                  >
                    Filament Calculator
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => handleToolClick('estimator')}
                    className="text-sm text-zinc-400 hover:text-white transition-colors text-left"
                  >
                    3D Print Estimator
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => handleToolClick('stl-hub')}
                    className="text-sm text-zinc-400 hover:text-white transition-colors text-left"
                  >
                    Custom STL Hub
                  </button>
                </li>
              </ul>
            </div>

            {/* Col 3 (span 3): Policies */}
            <div className="lg:col-span-3">
              <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-4">
                Policies
              </h4>
              <ul className="space-y-2.5">
                <li>
                  <button
                    type="button"
                    onClick={() => openLegal('terms')}
                    className="text-sm text-zinc-400 hover:text-white transition-colors text-left block w-full"
                  >
                    Commissioning &amp; Payments
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => openLegal('fabrication')}
                    className="text-sm text-zinc-400 hover:text-white transition-colors text-left block w-full"
                  >
                    Fabrication &amp; Multi-Color Scope
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => openLegal('warranty')}
                    className="text-sm text-zinc-400 hover:text-white transition-colors text-left block w-full"
                  >
                    7-Day Replacement Policy
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => openLegal('shipping')}
                    className="text-sm text-zinc-400 hover:text-white transition-colors text-left block w-full"
                  >
                    Shipping &amp; Kolkata Express
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => openLegal('privacy')}
                    className="text-sm text-zinc-400 hover:text-white transition-colors text-left block w-full"
                  >
                    Privacy &amp; Zero-Account Data
                  </button>
                </li>
              </ul>
            </div>

            {/* Col 4 (span 3): Kolkata Studio Office */}
            <div className="lg:col-span-3">
              <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-4">
                Studio Office
              </h4>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Wann Hostel, C/O Scottish Church College, 32/8 Abhedananda Rd, Beadon St, Maniktala, Kolkata 700006
              </p>
              <div className="mt-3 space-y-1.5 text-sm">
                <div>
                  <a
                    href="https://wa.me/918509986008"
                    target="_blank"
                    rel="noreferrer"
                    className="text-zinc-300 hover:text-white transition-colors"
                  >
                    WhatsApp / Call: +91 8509986008
                  </a>
                </div>
                <div>
                  <a
                    href="mailto:stanstudio@mxsourav.dev"
                    className="text-zinc-300 hover:text-white transition-colors"
                  >
                    stanstudio@mxsourav.dev
                  </a>
                </div>
              </div>
              <p className="text-xs text-zinc-500 mt-3 leading-relaxed">
                General inquiries welcome without purchase. 1-on-1 engineering consultations by prior appointment.
              </p>
            </div>
          </div>

          {/* Minimal Bottom Bar */}
          <div className="border-t border-white/[0.06] mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
            <div>
              &copy; 2026 ST&Delta;N studio<span className="text-[#ff2d55]">.</span> Kolkata, India.
            </div>
            <div className="flex items-center gap-3">
              <Link to="/about" className="text-zinc-500 hover:text-zinc-300 transition-colors">
                About
              </Link>
              <span>&middot;</span>
              <span>Client-side parametric engine &middot; Custom digital fabrication</span>
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

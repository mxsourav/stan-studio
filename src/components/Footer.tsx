import { useState } from 'react';
import { Link } from 'react-router-dom';
import Wordmark from './Wordmark';
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
      <footer className="relative z-40 mt-6 border-t border-white/10 bg-[#070708] text-stone-300 font-['Plus_Jakarta_Sans',sans-serif]">
        {/* Top Tier: Compact 4-column layout */}
        <div className="mx-auto grid max-w-7xl grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-6 px-4 sm:px-6 py-6 sm:py-7">
          
          {/* Col 1: Brand & Contact (lg:col-span-4) */}
          <div className="col-span-1 sm:col-span-2 lg:col-span-4 space-y-2.5">
            <div className="space-y-0.5">
              <div>
                <Wordmark size={15} />
              </div>
              <p className="text-[10.5px] text-stone-400">Maniktala, Kolkata</p>
            </div>
            <div className="text-[11.5px] leading-relaxed text-stone-400">
              <p>
                Wann Hostel, C/O Scottish Church College, 32/8 Abhedananda Rd, Beadon St, Maniktala, Kolkata, WB 700006
              </p>
            </div>
            <div className="text-[12px] font-semibold text-stone-300">
              <div className="leading-snug">
                <span>Call Us : </span>
                <a
                  href="https://wa.me/918509986008"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline hover:text-white transition-colors"
                >
                  +91 8509986008
                </a>
                <span className="text-[11px] font-normal text-stone-400 block sm:inline sm:ml-1.5">
                  &bull; Mon &ndash; Sat, 10 AM &ndash; 8 PM
                </span>
              </div>
            </div>
            
            {/* Payment / Dispatch Badges */}
            <div className="flex items-center gap-1.5 pt-0.5">
              <div className="flex h-5 w-10 items-center justify-center rounded border border-white/10 bg-white/5 text-[8.5px] font-bold text-stone-300">
                UPI
              </div>
              <div className="flex h-5 w-12 items-center justify-center rounded border border-white/10 bg-white/5 text-[9px] font-bold text-stone-300">
                POST
              </div>
              <div className="flex h-5 w-14 items-center justify-center rounded border border-white/10 bg-white/5 text-[9px] font-bold text-stone-300">
                PORTER
              </div>
            </div>
          </div>

          {/* Col 2 & 3: Useful Links & Policies Legal (Side by Side, lg:col-span-5) */}
          <div className="col-span-1 sm:col-span-1 lg:col-span-5 grid grid-cols-2 gap-4">
            {/* Useful Links */}
            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-300">Useful Links</h3>
              <ul className="space-y-1.5 text-[11.5px] sm:text-[12px] text-stone-400">
                <li>
                  <Link to="/about" className="hover:text-white transition-colors">
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

            {/* Policies & Legal */}
            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-300">Policies &amp; Legal</h3>
              <ul className="space-y-1.5 text-[11.5px] sm:text-[12px] text-stone-400">
                <li>
                  <button
                    type="button"
                    onClick={() => openLegal('shipping')}
                    className="hover:text-white transition-colors text-left"
                  >
                    Shipping Policy
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => openLegal('warranty')}
                    className="hover:text-white transition-colors text-left"
                  >
                    Cancellation &amp; Replacement
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => openLegal('privacy')}
                    className="hover:text-white transition-colors text-left"
                  >
                    Privacy Policy
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => openLegal('terms')}
                    className="hover:text-white transition-colors text-left"
                  >
                    Terms of Service
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => openLegal('fabrication')}
                    className="hover:text-white transition-colors text-left"
                  >
                    Fabrication Scope
                  </button>
                </li>
              </ul>
            </div>
          </div>

          {/* Col 4 & 5: Support Desk & Follow Us (lg:col-span-3) */}
          <div className="col-span-1 sm:col-span-1 lg:col-span-3 grid grid-cols-2 gap-4">
            {/* Quick Desk */}
            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-300">Support Desk</h3>
              <ul className="space-y-1.5 text-[11.5px] sm:text-[12px] text-stone-400">
                <li>
                  <a
                    href="https://wa.me/918509986008"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-white transition-colors"
                  >
                    WhatsApp Support
                  </a>
                </li>
                <li>
                  <a
                    href="mailto:stanstudio@mxsourav.dev"
                    className="hover:text-white transition-colors"
                  >
                    Contact Desk
                  </a>
                </li>
                <li>
                  <Link to="/about" className="hover:text-white transition-colors">
                    Maker Manifesto
                  </Link>
                </li>
              </ul>
            </div>

            {/* Follow Us */}
            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-300">Follow Us</h3>
              <ul className="space-y-1.5 text-[11.5px] sm:text-[12px] text-stone-400">
                <li>
                  <a
                    href="https://instagram.com"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-white transition-colors"
                  >
                    Instagram
                  </a>
                </li>
                <li>
                  <a
                    href="https://facebook.com"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-white transition-colors"
                  >
                    Facebook
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/mxsourav/stan-studio"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-white transition-colors"
                  >
                    GitHub
                  </a>
                </li>
              </ul>
            </div>
          </div>

        </div>

        {/* Bottom Tier: Simple Copyright Line (Zero Buttons / Clutter) */}
        <div className="border-t border-white/5 bg-[#030A07]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-3">
              <span className="text-[10px] font-bold tracking-[0.08em] text-stone-400 uppercase">
                &copy; {new Date().getFullYear()} ST&Delta;N STUDIO. ALL RIGHTS RESERVED.
              </span>
              <span className="hidden sm:inline text-stone-600">&bull;</span>
              <span className="text-[9.5px] text-stone-500 uppercase tracking-wider">
                Official Digital Fabrication Studio &bull; College Street &amp; Maniktala, Kolkata
              </span>
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
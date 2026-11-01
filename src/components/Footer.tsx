import { useState } from 'react';
import { Link } from 'react-router-dom';
import Wordmark from './Wordmark';
import LegalModal, { type LegalTabKey } from './LegalModal';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface FooterProps {
  onOpenStudio?: () => void;
  onOpenToolModal?: (toolId: string) => void;
}

export default function Footer({ onOpenStudio, onOpenToolModal }: FooterProps) {
  const [legalModalOpen, setLegalModalOpen] = useState(false);
  const [activeLegalTab, setActiveLegalTab] = useState<LegalTabKey>('terms');
  const [installInfoOpen, setInstallInfoOpen] = useState(false);
  const { canInstall, isStandalone, installApp } = usePWAInstall();

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

  const handleDownloadApp = async () => {
    if (canInstall) {
      const outcome = await installApp();
      if (outcome === 'accepted') return;
    }
    setInstallInfoOpen(true);
  };

  return (
    <>
      <footer className="relative z-40 -mt-px border-t border-white/10 bg-[#070708] text-zinc-300 font-['Plus_Jakarta_Sans',sans-serif]">
        {/* Top Tier: Compact 4-column layout */}
        <div className="mx-auto grid max-w-7xl grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-6 px-4 sm:px-6 py-6 sm:py-7">
          
          {/* Col 1: Brand & Contact (lg:col-span-4) */}
          <div className="col-span-1 sm:col-span-2 lg:col-span-4 space-y-2.5">
            <div className="space-y-0.5">
              <div>
                <Wordmark size={15} />
              </div>
              <p className="text-[10.5px] text-zinc-400">Maniktala, Kolkata</p>
            </div>
            <div className="text-[11.5px] leading-relaxed text-zinc-400">
              <p>
                Wann Hostel, C/O Scottish Church College, 32/8 Abhedananda Rd, Beadon St, Maniktala, Kolkata, WB 700006
              </p>
            </div>
            <div className="text-[12px] font-semibold text-zinc-300">
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
                <span className="text-[11px] font-normal text-zinc-400 block sm:inline sm:ml-1.5">
                  &bull; Mon &ndash; Sat, 10 AM &ndash; 8 PM
                </span>
              </div>
            </div>
            
            {/* Payment / Dispatch Badges */}
            <div className="flex items-center gap-1.5 pt-0.5">
              <div className="flex h-5 w-10 items-center justify-center rounded border border-white/10 bg-white/5 text-[8.5px] font-bold text-zinc-300">
                UPI
              </div>
              <div className="flex h-5 w-12 items-center justify-center rounded border border-white/10 bg-white/5 text-[9px] font-bold text-zinc-300">
                POST
              </div>
              <div className="flex h-5 w-14 items-center justify-center rounded border border-white/10 bg-white/5 text-[9px] font-bold text-zinc-300">
                PORTER
              </div>
            </div>
          </div>

          {/* Col 2 & 3: Useful Links & Policies Legal (Side by Side, lg:col-span-5) */}
          <div className="col-span-1 sm:col-span-1 lg:col-span-5 grid grid-cols-2 gap-4">
            {/* Useful Links */}
            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">Useful Links</h3>
              <ul className="space-y-1.5 text-[11.5px] sm:text-[12px] text-zinc-400">
                <li>
                  <Link to="/about" viewTransition className="hover:text-white transition-colors">
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
                <li className="pt-1">
                  <button
                    type="button"
                    onClick={handleDownloadApp}
                    className="group inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-zinc-300 hover:border-white/20 hover:bg-white/[0.08] hover:text-white transition-all text-left font-medium"
                    title="Install STΔN studio as a progressive web app"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400 group-hover:text-white transition-colors">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>Download as App</span>
                    <span className="rounded bg-emerald-400/10 px-1 py-0.2 text-[9px] font-mono uppercase text-emerald-400 border border-emerald-400/20">
                      PWA
                    </span>
                  </button>
                </li>
              </ul>
            </div>

            {/* Policies & Legal */}
            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">Policies &amp; Legal</h3>
              <ul className="space-y-1.5 text-[11.5px] sm:text-[12px] text-zinc-400">
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
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">Support Desk</h3>
              <ul className="space-y-1.5 text-[11.5px] sm:text-[12px] text-zinc-400">
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
                  <Link to="/about" viewTransition className="hover:text-white transition-colors">
                    Maker Manifesto
                  </Link>
                </li>
              </ul>
            </div>

            {/* Follow Us */}
            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">Follow Us</h3>
              <ul className="space-y-1.5 text-[11.5px] sm:text-[12px] text-zinc-400">
                <li>
                  <a
                    href="https://instagram.com/bystanstudio"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-white transition-colors"
                  >
                    Instagram (@bystanstudio)
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
        <div className="border-t border-white/5 bg-[#040405]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-3">
              <span className="text-[10px] font-bold tracking-[0.08em] text-zinc-400 uppercase">
                &copy; {new Date().getFullYear()} ST&Delta;N STUDIO. ALL RIGHTS RESERVED.
              </span>
              <span className="hidden sm:inline text-zinc-600">&bull;</span>
              <span className="text-[9.5px] text-zinc-500 uppercase tracking-wider">
                Digital Fabrication Studio &bull; College Street &amp; Maniktala, Kolkata
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

      {/* PWA App Installation Guidance Modal */}
      {installInfoOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={() => setInstallInfoOpen(false)}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl border border-white/15 bg-[#0e0e12] p-5 shadow-2xl text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <img src="/icon-192.png" alt="STΔN studio" className="h-11 w-11 rounded-xl border border-white/10" />
                <div>
                  <h4 className="font-semibold text-white text-[15px]">ST&Delta;N studio. App</h4>
                  <p className="text-[11.5px] text-zinc-400">Standalone Progressive Web App</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInstallInfoOpen(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3 text-[12.5px] text-zinc-300">
              {isStandalone ? (
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-emerald-300 text-xs">
                  ✓ ST&Delta;N studio is already running in standalone app mode!
                </div>
              ) : (
                <>
                  <p className="leading-relaxed">
                    Install ST&Delta;N studio directly to your home screen or desktop for fast offline launching and full-screen experience:
                  </p>
                  <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs">
                    <p className="font-semibold text-white">How to install:</p>
                    <ol className="list-decimal pl-4 space-y-1 text-zinc-400">
                      <li>
                        <strong className="text-zinc-200">Chrome / Android:</strong> Tap the three dots <span className="font-mono text-white">⋮</span> in top-right &rarr; select <strong className="text-white">&ldquo;Install app&rdquo;</strong> or <strong className="text-white">&ldquo;Download app&rdquo;</strong>.
                      </li>
                      <li>
                        <strong className="text-zinc-200">Safari / iPhone:</strong> Tap the Share button <span className="font-mono text-white">⎋</span> &rarr; select <strong className="text-white">&ldquo;Add to Home Screen&rdquo;</strong>.
                      </li>
                      <li>
                        <strong className="text-zinc-200">Desktop Edge / Chrome:</strong> Click the install icon in the URL bar &rarr; <strong className="text-white">&ldquo;Install&rdquo;</strong>.
                      </li>
                    </ol>
                  </div>
                </>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setInstallInfoOpen(false)}
                className="rounded-xl border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
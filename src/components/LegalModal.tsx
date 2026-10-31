import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { IconXmark } from './icons';
import Wordmark from './Wordmark';

export type LegalTabKey = 'terms' | 'fabrication' | 'warranty' | 'shipping' | 'privacy';

interface LegalModalProps {
  isOpen: boolean;
  activeTab: LegalTabKey;
  onTabChange: (tab: LegalTabKey) => void;
  onClose: () => void;
}

const TABS: { key: LegalTabKey; label: string }[] = [
  { key: 'terms', label: 'Commissioning & Payment' },
  { key: 'fabrication', label: 'Fabrication & Multi-Color' },
  { key: 'warranty', label: '7-Day Replacement' },
  { key: 'shipping', label: 'Shipping & Logistics' },
  { key: 'privacy', label: 'Zero-Account Privacy' },
];

export default function LegalModal({ isOpen, activeTab, onTabChange, onClose }: LegalModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xl animate-[fadeIn_180ms_cubic-bezier(0.22,1,0.36,1)]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex flex-col w-full max-w-3xl max-h-[90vh] sm:max-h-[85vh] rounded-3xl border border-white/10 bg-[#111113]/95 backdrop-blur-2xl shadow-[0_32px_90px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.15)] overflow-hidden font-['Plus_Jakarta_Sans',sans-serif]">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 sm:px-7 py-4 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <Wordmark size={15} />
            <span className="hidden sm:inline-block text-xs text-zinc-500 font-medium pl-2 border-l border-white/10">
              Operational Governance
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close governance reader"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.05] text-zinc-400 transition hover:border-white/20 hover:bg-white/[0.1] hover:text-white"
          >
            <IconXmark size={14} />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar border-b border-white/[0.08] px-4 sm:px-7 py-2.5 bg-black/30">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onTabChange(tab.key)}
                className={`whitespace-nowrap rounded-xl px-3.5 py-1.5 text-xs font-medium transition shrink-0 ${
                  isActive
                    ? 'border border-white/25 bg-white/15 text-white shadow-sm'
                    : 'border border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-6 sm:p-8 space-y-6 text-zinc-300 text-sm leading-relaxed">
          {activeTab === 'terms' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-['Playfair_Display',serif] text-xl sm:text-2xl font-normal text-white tracking-tight">
                  Commissioning Workflow &amp; Payment Policy
                </h3>
                <p className="text-xs text-zinc-500 mt-1">Direct maker settlement via WhatsApp</p>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-3">
                <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                  Direct Commissioning Model
                </div>
                <p className="text-zinc-300 text-sm leading-relaxed">
                  <span className="text-white font-medium">studio.mxsourav.dev</span> operates as an interactive parametric design workbench and estimation suite rather than an automated retail checkout cart. Submitting a build on the web app generates a unique <strong className="text-white font-semibold">Build Request ID</strong>. To finalize the commission, the client messages our official desk on WhatsApp (<strong className="text-white">+91 8509986008</strong>) with their request ID for maker verification and payment settlement.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-['Playfair_Display',serif] text-base font-normal text-zinc-100">Strict No-COD Policy</h4>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  Cash on Delivery (COD) is strictly disabled across all orders. Because every piece is custom-fabricated to client parameters and cannot be restocked or resold, print queues are allocated strictly upon verified prepayment.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="font-['Playfair_Display',serif] text-base font-normal text-zinc-100">Payment Tiers &amp; Queue Locking</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="rounded-2xl border border-white/[0.08] bg-black/40 p-4 space-y-1.5">
                    <div className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Orders &le; ₹999 Net</div>
                    <div className="text-sm font-semibold text-white">100% Upfront Prepayment</div>
                    <p className="text-xs text-zinc-400 leading-normal">
                      The ₹999 threshold refers strictly to net fabrication value (excluding delivery). 100% advance via UPI or direct transfer locks your queue slot.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/[0.08] bg-black/40 p-4 space-y-1.5">
                    <div className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Orders &gt; ₹999 Net</div>
                    <div className="text-sm font-semibold text-white">50% Advance · 50% Post-QC Balance</div>
                    <p className="text-xs text-zinc-400 leading-normal">
                      Minimum 50% non-refundable advance initiates file prep and printing. The remaining 50% balance + shipping is settled after post-print QC proof and before dispatch.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-2.5">
                <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                  Perks for Orders Above ₹999 Net Fabrication Value
                </div>
                <ul className="space-y-2 text-sm text-zinc-300">
                  <li className="flex items-start gap-2">
                    <span className="text-zinc-500 font-mono mt-0.5">&bull;</span>
                    <span>
                      <strong className="text-white font-medium">Free Standard India Post Delivery:</strong> Every order with a net fabrication cart value above ₹999 automatically includes free standard India Post shipping across India (at ₹0 delivery cost to the client). Expedited Speed Post or Kolkata Hyperlocal Express (Porter/Rapido) carries applicable rider tariffs.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-zinc-500 font-mono mt-0.5">&bull;</span>
                    <span>
                      <strong className="text-white font-medium">Complimentary Studio Micro-Print:</strong> Every build above ₹999 net includes a precision micro-print (up to 15g filament—such as a custom keychain, emblem, or badge) included free.
                    </span>
                  </li>
                </ul>
              </div>

              <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                <h4 className="font-['Playfair_Display',serif] text-base font-normal text-zinc-100">Visiting Hours &amp; Inquiries</h4>
                <div className="text-xs text-zinc-400 space-y-1">
                  <div>Mon–Sat: 3:00 PM – 8:00 PM IST · Sun: 10:00 AM – 1:00 PM, 2:00 PM – 8:00 PM IST</div>
                  <p className="pt-1 text-zinc-400">
                    <strong className="text-zinc-200 font-medium">Free General Inquiries:</strong> You are welcome to call, WhatsApp (+91 8509986008), or drop by during operating hours for general queries, filament samples, or feasibility questions—no purchase is mandatory.
                  </p>
                  <p className="text-zinc-500">
                    Paid consultation fees apply exclusively when booking dedicated 1-on-1 CAD modeling or prototyping sessions.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'fabrication' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-['Playfair_Display',serif] text-xl sm:text-2xl font-normal text-white tracking-tight">
                  Fabrication Specifications, Multi-Color Scope &amp; QC
                </h3>
                <p className="text-xs text-zinc-500 mt-1">Material tolerances, split-part assembly, and cancellation cutoff</p>
              </div>

              <div className="space-y-2">
                <h4 className="font-['Playfair_Display',serif] text-base font-normal text-zinc-100">Material &amp; Chromatic Configurations</h4>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  Standard commissions are fabricated in single-material precision filament or <strong className="text-white font-medium">Dual-Tone (2-color manual layer or component swap)</strong> configurations.
                </p>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-3">
                <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                  Split-Part Multi-Color Fabrication &amp; Modular Kits
                </div>
                <p className="text-zinc-300 text-sm leading-relaxed">
                  Beyond dual-tone swaps, we support multi-color builds via <strong className="text-white font-medium">modular split-part printing</strong>—producing individual color components on separate plates. Clients can choose to have the studio professionally bond and assemble the parts before dispatch, or receive them disassembled as a modular kit to assemble themselves.
                </p>
                <p className="text-xs text-zinc-400 pt-2 border-t border-white/[0.06]">
                  <strong className="text-zinc-300 font-medium">Multi-Color Pricing Tier:</strong> Multi-color and modular split-part commissions carry a different (higher) pricing structure than standard single-color prints due to additional plate setups, filament swaps, purge calibration, and post-processing/bonding labor.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-['Playfair_Display',serif] text-base font-normal text-zinc-100">Advanced Custom Slicer Settings</h4>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  For builds requiring advanced slicer parameters, tight mechanical tolerances, custom infill geometry, or intricate detailing, contact us directly via Call or WhatsApp (+91 8509986008) prior to commissioning.
                </p>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-black/40 p-5 space-y-2">
                <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Cancellation Cutoff
                </div>
                <p className="text-zinc-300 text-sm leading-relaxed">
                  An order may only be cancelled <strong className="text-white font-medium">before</strong> the studio issues a "Print Floor Active / Slicing Locked" alert via WhatsApp. Once physical filament extrusion or bed heating begins, 0% cancellation or refund is permitted.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'warranty' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-['Playfair_Display',serif] text-xl sm:text-2xl font-normal text-white tracking-tight">
                  No Returns &amp; 7-Day Replacement Policy
                </h3>
                <p className="text-xs text-zinc-500 mt-1">Free replacement coverage with uncut unboxing video verification</p>
              </div>

              <div className="space-y-2">
                <h4 className="font-['Playfair_Display',serif] text-base font-normal text-zinc-100">No Returns or Buyer's-Remorse Refunds</h4>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  Because every object is custom-fabricated to bespoke client dimensions and vector silhouettes, general returns and refunds are strictly prohibited. Custom fabricated prints cannot be restocked.
                </p>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-3">
                <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                  7-Day Replacement Coverage
                </div>
                <p className="text-zinc-300 text-sm leading-relaxed">
                  We provide a <strong className="text-white font-medium">100% Free Replacement (including free re-shipping)</strong> within a 7-day warranty window strictly for:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-zinc-400 text-sm pl-1">
                  <li><strong className="text-zinc-200 font-medium">Severe physical breakage</strong> occurring during studio-arranged transit.</li>
                  <li><strong className="text-zinc-200 font-medium">Wrong model variant</strong> dispatched by the studio.</li>
                  <li><strong className="text-zinc-200 font-medium">Critical structural defects</strong> affecting assembly or operation.</li>
                </ol>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-black/40 p-5 space-y-2">
                <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Mandatory Verification: Uncut Unboxing Video
                </div>
                <p className="text-zinc-300 text-sm leading-relaxed">
                  To claim a replacement, submit a <strong className="text-white font-medium">single, continuous, uncut, and unedited unboxing video</strong> via WhatsApp (+91 8509986008) within <strong className="text-white font-medium">48 hours of carrier delivery</strong>. The video must show the sealed shipping label, package exterior, and immediate product inspection in one unbroken shot.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-['Playfair_Display',serif] text-base font-normal text-zinc-100">Standard Exclusions</h4>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  Coverage excludes intentional damage, post-unboxing drops, thermal misuse (e.g. non-LED heat sources inside PLA/PETG enclosures), or standard FDM manufacturing traits (visible layer lines, Z-seams, or minor support marks).
                </p>
              </div>
            </div>
          )}

          {activeTab === 'shipping' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-['Playfair_Display',serif] text-xl sm:text-2xl font-normal text-white tracking-tight">
                  Shipping, Kolkata Express &amp; Logistics
                </h3>
                <p className="text-xs text-zinc-500 mt-1">Ex-studio rates, hyperlocal dispatch, and studio pickup</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="rounded-2xl border border-white/[0.08] bg-black/40 p-4 space-y-1.5">
                  <div className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Pricing Baseline</div>
                  <div className="text-sm font-semibold text-white">Ex-Studio Valuation</div>
                  <p className="text-xs text-zinc-400 leading-normal">
                    Tool estimates reflect ex-studio manufacturing costs. Delivery fees are confirmed separately on WhatsApp based on destination and carrier.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-black/40 p-4 space-y-1.5">
                  <div className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Kolkata Studio</div>
                  <div className="text-sm font-semibold text-white">Free Studio Pickup</div>
                  <p className="text-xs text-zinc-400 leading-normal">
                    Free self-pickup is available at our Maniktala studio office by appointment once we notify you that manufacturing and QC are complete.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-2">
                <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                  Kolkata &amp; Howrah 5-Hour Hyperlocal Express
                </div>
                <p className="text-zinc-300 text-sm leading-relaxed">
                  Urgent builds can be dispatched within 5 hours of fabrication completion across Kolkata and Howrah via Porter, Rapido, or instant point-to-point courier partners. Applicable distance tariffs apply.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-['Playfair_Display',serif] text-base font-normal text-zinc-100">Client-Assigned Rider Liability Waiver</h4>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  Clients arranging their own rider or courier partner accept full transit liability: 100% of risk transfers upon parcel handover at our studio desk. Transit damage coverage does not apply to client-arranged couriers.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-['Playfair_Display',serif] text-base font-normal text-zinc-100">Strict No-RTO Refund Policy</h4>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  If an order is Returned to Origin (RTO) due to an incorrect address, unreachable phone, or delivery rejection, no refund will be issued. The client must settle return freight plus fresh re-dispatch freight.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-['Playfair_Display',serif] text-xl sm:text-2xl font-normal text-white tracking-tight">
                  Privacy &amp; Zero-Account Architecture
                </h3>
                <p className="text-xs text-zinc-500 mt-1">Local in-browser processing with zero account databases</p>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-2">
                <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                  Zero-Account Architecture
                </div>
                <p className="text-zinc-300 text-sm leading-relaxed">
                  STΔN studio maintains zero user accounts, zero passwords, and zero profiling databases. We do not track your identity across websites or harvest data for third-party networks.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-['Playfair_Display',serif] text-base font-normal text-zinc-100">Client-Side In-Memory Toolchain</h4>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  All interactive tools across studio.mxsourav.dev—including the 3D Shadow Box generator, filament volumetric calculator, and print estimator—execute 100% locally in your browser memory using WebGL and Canvas API. Uploaded photos and 3D files never leave your device unless explicitly commissioned.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-['Playfair_Display',serif] text-base font-normal text-zinc-100">Order Data Minimization</h4>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  Contact details shared via WhatsApp or build requests (name, phone, dispatch address) are used solely for order fulfillment, courier labeling, and invoicing. We never sell, lease, or monetize client records.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-white/[0.08] px-5 sm:px-7 py-4 bg-black/50">
          <div className="text-xs text-zinc-500">
            Kolkata Studio Desk &middot; 700006
          </div>

          <div className="flex items-center gap-2.5">
            <a
              href="https://wa.me/918509986008"
              target="_blank"
              rel="noreferrer"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.05] px-4 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.1] hover:text-white"
            >
              WhatsApp Desk
            </a>

            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black transition hover:bg-zinc-200"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

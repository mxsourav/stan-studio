import { Link } from 'react-router-dom';
import Wordmark, { BrandBadge } from '../components/Wordmark';
import Footer from '../components/Footer';

export default function About() {
  return (
    <div className="min-h-screen bg-[#070708] text-white font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Top Navigation */}
      <header className="glass-subtle fixed inset-x-2.5 sm:inset-x-4 top-2.5 sm:top-4 z-40 flex items-center justify-between rounded-xl sm:rounded-2xl px-3.5 sm:px-5 py-2 sm:py-3">
        <Link to="/" className="flex items-center gap-2.5 sm:gap-3 transition opacity-90 hover:opacity-100">
          <BrandBadge size={26} />
          <Wordmark size={16} />
        </Link>
        <nav className="flex items-center gap-3 text-xs sm:text-sm font-medium">
          <Link
            to="/"
            className="text-zinc-400 hover:text-white transition-colors"
          >
            Home
          </Link>
          <Link
            to="/studio"
            className="segment-pill px-3 sm:px-4 py-1.5 text-xs sm:text-sm"
          >
            <span className="hidden sm:inline">Shadow Lamp Studio</span>
            <span className="sm:hidden">Studio</span>
          </Link>
        </nav>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-28 sm:pt-36 pb-20 space-y-16 sm:space-y-24">
        {/* 1. Hero & Manifesto Section */}
        <div className="text-center max-w-4xl mx-auto space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1 font-mono text-[11px] sm:text-xs uppercase tracking-wider text-zinc-400">
            [STUDIO MANIFESTO // EST. JAN 2027]
          </div>

          <h1 className="font-['Playfair_Display',serif] text-4xl sm:text-5xl lg:text-6xl font-normal tracking-tight text-white leading-[1.12]">
            Built by a Maker, <br className="hidden sm:inline" />
            <span className="italic text-zinc-200">For the Makers.</span>
          </h1>

          <p className="text-base sm:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            No student project should ever stall out because of overpriced commercial printing bureaus or rigid minimum order quantities.
          </p>
        </div>

        {/* 2. Origin & Core Story Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
          {/* Story Card */}
          <div className="lg:col-span-7 rounded-3xl border border-white/[0.08] bg-zinc-950/70 backdrop-blur-xl p-6 sm:p-10 shadow-[0_24px_60px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.08)] flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                The Origin
              </div>
              <h2 className="font-['Playfair_Display',serif] text-2xl sm:text-3xl font-normal text-white tracking-tight">
                From a Kolkata Hostel Room to a Direct Maker Platform
              </h2>
              <p className="text-sm sm:text-base text-zinc-300 leading-relaxed">
                <strong className="text-white font-medium">STAN studio</strong> (<span className="text-zinc-400">Sketch, Test, Adapt, Navigate</span>) was founded out of a student hostel room in Kolkata by a solo engineering student and maker. We built this platform specifically for students, hobbyists, and science/engineering builders who need precision parts—from custom electronic enclosures and structural frames to project brackets—without getting crushed by commercial pricing or arbitrary minimum order caps.
              </p>
            </div>

            <div className="pt-4 border-t border-white/[0.06] space-y-2">
              <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Our Guarantee
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Whether you need a single 20-gram test token or a complex modular assembly, there is <strong className="text-white font-medium">zero MOQ (Minimum Order Quantity)</strong> and <strong className="text-white font-medium">zero price gating</strong>. If you can pay for shipping or self-pickup, we will slice and print it.
              </p>
            </div>
          </div>

          {/* VisionOS Quote / Manifesto Card */}
          <div className="lg:col-span-5 rounded-3xl border border-white/[0.08] bg-zinc-950/70 backdrop-blur-xl p-6 sm:p-10 shadow-[0_24px_60px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.08)] flex flex-col justify-between relative overflow-hidden group">
            <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-[#ff2d55]/[0.08] blur-[80px]" />

            <div className="space-y-4 relative z-10">
              <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Studio Thesis
              </div>
              <blockquote className="font-['Playfair_Display',serif] text-xl sm:text-2xl italic text-zinc-200 leading-snug">
                &ldquo;Precision digital fabrication belongs in the hands of learners and builders, not locked behind industrial price barriers.&rdquo;
              </blockquote>
            </div>

            <div className="pt-6 relative z-10">
              <div className="flex items-center gap-2">
                <BrandBadge size={22} />
                <div className="text-xs font-mono text-zinc-400">
                  ST&Delta;N studio<span className="text-[#ff2d55]">.</span> // Engineering Desk
                </div>
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">
                Wann Hostel, Scottish Church College &middot; Kolkata
              </div>
            </div>
          </div>
        </div>

        {/* 3. Beyond Prototyping: Sourcing & Full Fabrication Capabilities */}
        <div className="space-y-6">
          <div className="max-w-2xl space-y-2">
            <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Fabrication Scope
            </div>
            <h2 className="font-['Playfair_Display',serif] text-2xl sm:text-3xl font-normal text-white tracking-tight">
              Beyond Templates: Unlimited Manufacturing &amp; Sourcing Scope
            </h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              While our interactive web suite offers parametric shadow lanterns and volumetric estimation, our physical workshop is equipped for full-spectrum additive engineering.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/60 backdrop-blur-xl p-6 space-y-3">
              <div className="text-xs font-mono uppercase tracking-wider text-zinc-500">
                01 // Model Sourcing
              </div>
              <h3 className="text-base font-semibold text-white">
                File Discovery &amp; Model Sourcing
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Can&apos;t code or CAD? Don&apos;t have a 3D file yet? If you know what component you need for your school or college project, our team will search repositories, locate clean verified STLs, and preview them with you on WhatsApp so your build never halts.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/60 backdrop-blur-xl p-6 space-y-3">
              <div className="text-xs font-mono uppercase tracking-wider text-zinc-500">
                02 // Modular Color
              </div>
              <h3 className="text-base font-semibold text-white">
                Split-Part Multi-Color &amp; Kits
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                We produce polychromatic builds via modular split-part printing on dedicated plates. Choose to have us professionally align and chemically bond the assembly before dispatch, or receive individual parts as a DIY builder kit.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/60 backdrop-blur-xl p-6 space-y-3">
              <div className="text-xs font-mono uppercase tracking-wider text-zinc-500">
                03 // Tolerances
              </div>
              <h3 className="text-base font-semibold text-white">
                Custom Engineering Slices
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Need press-fit bearing tolerances, reinforced internal gyroid infill, or high-temperature PETG/functional materials? Reach out directly with your requirements and we will calibrate slicer parameters specifically for your mechanical load.
              </p>
            </div>
          </div>
        </div>

        {/* 4. Interactive Maker Help & WhatsApp Desk (Similar to Techno World's Sourcing Card) */}
        <div className="rounded-3xl border border-white/[0.08] bg-zinc-950/70 backdrop-blur-xl p-6 sm:p-10 shadow-[0_24px_60px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.08)]">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-8 space-y-3">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                [MAKER DESK // DIRECT CONSULTATION]
              </div>
              <h2 className="font-['Playfair_Display',serif] text-2xl sm:text-3xl font-normal text-white tracking-tight">
                Need Help Sourcing, Slicing, or Building?
              </h2>
              <p className="text-sm text-zinc-400 leading-relaxed max-w-2xl">
                Whether you have an existing STL file, a hand-drawn napkin sketch, or need us to hunt down an open-source CAD model for your college project, talk directly with our studio engineer. No sales reps, no automated answering machines.
              </p>
              <div className="text-xs text-zinc-500 pt-1">
                Open for free feasibility chats &middot; Mon–Sat: 3:00 PM – 8:00 PM IST
              </div>
            </div>

            <div className="lg:col-span-4 flex flex-col sm:flex-row lg:flex-col gap-3">
              <a
                href="https://wa.me/918509986008?text=Hi%20STAN%20studio,%20I'm%20working%20on%20a%20maker/student%20project%20and%20need%20help%20with%203D%20printing."
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200 text-center"
              >
                Chat with Engineer on WhatsApp
              </a>
              <a
                href="mailto:stanstudio@mxsourav.dev?subject=Student/Maker%20Project%20Inquiry"
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.04] px-6 py-3 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.1] hover:text-white text-center"
              >
                Email Project Details
              </a>
            </div>
          </div>
        </div>

        {/* 5. Physical Root & Operations */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-white/[0.06]">
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Studio Location
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed">
              Wann Hostel C/O Scottish Church College, 32/8 Abhedananda Rd, Beadon St, Maniktala, Kolkata 700006
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Fulfillment &amp; Speed
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed">
              Free Kolkata studio pickup, 5-hour Kolkata &amp; Howrah hyperlocal delivery via Porter/Rapido, and Pan-India Speed Post.
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Open Doors
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed">
              General feasibility inquiries and material checks are 100% free with no purchase mandatory. Drop by or ping us anytime.
            </p>
          </div>
        </div>
      </main>

      {/* Industrial Footer */}
      <Footer />
    </div>
  );
}

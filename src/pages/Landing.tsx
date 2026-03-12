import { useNavigate } from "react-router-dom";

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-blue-500/30 antialiased">
      {/* Top: Login + Sign up */}
      <header className="flex justify-end gap-4 px-6 py-4 border-b border-white/[0.06]">
        <button
          onClick={() => navigate("/login")}
          className="text-[15px] text-white hover:text-white/90 transition-colors"
        >
          Login
        </button>
        <button
          onClick={() => navigate("/login")}
          className="text-[15px] px-4 py-2 bg-white text-black font-medium rounded-lg hover:bg-gray-100 transition-colors"
        >
          Sign up
        </button>
      </header>

      {/* Hero: text left, prices right */}
      <section className="relative flex flex-col justify-center px-6 pt-8 pb-10 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.015)_1px,transparent_1px)] bg-[size:64px_64px]" />
        <div className="absolute top-1/3 left-1/4 w-96 h-96 rounded-full bg-blue-500/5 blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 rounded-full bg-indigo-500/5 blur-3xl" />

        <div className="relative max-w-6xl mx-auto w-full flex flex-col md:flex-row md:items-center md:justify-between gap-12 md:gap-16">
          {/* Left: name + copy */}
          <div className="text-left max-w-xl">
            <h1 className="text-[clamp(3rem,10vw,5.5rem)] font-extralight tracking-[-0.04em] text-white mb-6">
              kyn
            </h1>
            <p className="text-[18px] text-white mb-4 font-light leading-relaxed">
              The first Grok-powered builder that starts with architecture, not code.
            </p>
            <p className="text-[18px] text-white leading-relaxed">
              Chat naturally—no perfect prompts. Mind map visualizes roles, pages, security. We brainstorm, challenge, refine. You're a creator, not a debugger.
            </p>
          </div>

          {/* Right: Free + Pro */}
          <div className="flex flex-col sm:flex-row gap-6 text-left">
            <div className="flex-1 rounded-2xl bg-white/[0.02] border border-white/[0.08] p-6 md:p-8 min-w-[200px]">
              <p className="text-3xl font-light text-white mb-1">Free</p>
              <p className="text-[15px] text-white mb-4">Try the builder</p>
              <button
                onClick={() => navigate("/login")}
                className="w-full py-3 bg-white text-black font-medium rounded-lg hover:bg-gray-100 transition-colors text-[15px] mb-4"
              >
                Sign up now
              </button>
              <p className="text-[15px] text-white leading-relaxed">
                3 projects, 10 Grok chats per day. Full experience—see your idea come to life. Upgrade anytime for unlimited.
              </p>
            </div>
            <div className="flex-1 rounded-2xl bg-white/[0.02] border border-white/[0.08] p-6 md:p-8 min-w-[200px]">
              <p className="text-3xl font-light text-white mb-1">Pro</p>
              <p className="text-[15px] text-white mb-4">€19.99 per month</p>
              <button
                onClick={() => navigate("/pricing")}
                className="w-full py-3 bg-white text-black font-medium rounded-lg hover:bg-gray-100 transition-colors text-[15px] mb-4"
              >
                Get all features
              </button>
              <p className="text-[15px] text-white leading-relaxed">
                Unlimited projects and Grok. Export, GitHub, custom domains. One price—no hidden fees.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Four cards in 2x2 grid */}
      <section className="px-6 pt-10 pb-16 md:pt-12 md:pb-24 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-8 md:p-10">
              <h2 className="text-xl md:text-2xl font-light text-white mb-4 tracking-tight">
                Real AI Dev Partner
              </h2>
              <p className="text-[15px] text-white leading-relaxed">
                You're not talking to a tool—you're working with a partner. Grok doesn't just spit code. It questions assumptions, digs into research, pushes back when something's off. We brainstorm like a teammate. No blind obedience. Just better ideas, faster.
              </p>
            </div>
            <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-8 md:p-10">
              <h2 className="text-xl md:text-2xl font-light text-white mb-4 tracking-tight">
                Visualization First
              </h2>
              <p className="text-[15px] text-white leading-relaxed">
                Most builders jump straight to code. We don't. Our interactive diagram—mind map or blueprint—shows everything before a line's written. Pages, roles, security edges. Drag, zoom, tweak. Code right the first time.
              </p>
            </div>
            <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-8 md:p-10">
              <h2 className="text-xl md:text-2xl font-light text-white mb-4 tracking-tight">
                AI self debug
              </h2>
              <p className="text-[15px] text-white leading-relaxed">
                Grok finds and fixes bugs on its own. VETR loop runs silent: verify, explain, trace, repair. We pivot mid-stream, research libraries, suggest patterns. No endless fixes. One consistent mode—AI self-debugs so you don't have to.
              </p>
            </div>
            <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-8 md:p-10">
              <h2 className="text-xl md:text-2xl font-light text-white mb-4 tracking-tight">
                All-in-One, Zero Hassle
              </h2>
              <p className="text-[15px] text-white leading-relaxed mb-4">
                Setup once—GitHub, Supabase, Vercel, DNS guides. Pre-installed packages. Deploy smooth: one click, live. No more hunting keys, fighting deps. Just create.
              </p>
              <div className="flex flex-wrap gap-2">
                {["GitHub", "Supabase", "Vercel", "DNS"].map((label) => (
                <span
                  key={label}
                  className="px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-[15px] text-white"
                >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-16 border-t border-white/[0.06]">
        <p className="text-center text-[15px] text-white max-w-md mx-auto leading-relaxed">
          Less debug. More make. Grok handles the grind—you own the vision.
        </p>
      </footer>
    </div>
  );
}

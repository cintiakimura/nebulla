import React, { useState } from 'react';

interface LandingPageProps {
  onEnter: () => void;
}

export function LandingPage({ onEnter }: LandingPageProps) {
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get('success')) {
      window.history.replaceState({}, document.title, window.location.pathname);
      onEnter();
    }
    if (query.get('canceled')) {
      window.history.replaceState({}, document.title, window.location.pathname);
      alert('Payment canceled.');
    }
  }, [onEnter]);

  const handleCheckout = async () => {
    try {
      setLoading(true);

      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const session = await response.json();

      if (session.error) {
        throw new Error(session.error);
      }

      if (session.url) {
        window.location.href = session.url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Payment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-on-surface flex flex-col font-body font-normal">
      {/* Header */}
      <header className="h-16 border-b border-white/5 flex items-center px-8 justify-between shrink-0 glass-panel">
        <div className="flex items-center gap-2 text-cyan-300">
          <span className="material-symbols-outlined">terminal</span>
          <span className="font-headline text-lg font-normal">nebulla</span>
        </div>
        <button 
          onClick={handleCheckout}
          disabled={loading}
          className="px-4 py-2 bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 rounded-md hover:bg-cyan-500/20 transition-all font-headline text-sm font-normal disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Processing...' : 'Enter App'}
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8 md:p-16 lg:p-24 flex flex-col gap-24">
        {/* Hero */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          <div className="flex flex-col gap-6 text-left max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-headline font-normal w-fit">
              <span className="material-symbols-outlined text-[14px]">rocket_launch</span>
              The future of software architecture
            </div>
            <h1 className="text-4xl md:text-6xl font-headline text-slate-200 font-normal leading-tight">
              The first architecture-focused<br/>AI builder.
            </h1>
            <p className="text-lg md:text-xl text-slate-400 font-normal max-w-2xl leading-relaxed">
              Stop wrestling with disjointed tools. Design your system, generate UI mockups, and build your application with a true dev partner.
            </p>
            <div className="flex items-center gap-4 mt-4">
              <button 
                onClick={handleCheckout}
                disabled={loading}
                className="px-6 py-3 bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 rounded-lg hover:bg-cyan-500/30 transition-all font-headline text-base font-normal flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing...' : 'Start Building Now'}
                {!loading && <span className="material-symbols-outlined text-[18px]">arrow_forward</span>}
              </button>
            </div>
          </div>
          
          <div className="flex flex-col justify-center items-start lg:items-end p-8 lg:p-12 rounded-3xl bg-gradient-to-br from-cyan-500/10 to-transparent border border-cyan-500/20">
            <div className="text-7xl md:text-8xl lg:text-9xl font-headline text-cyan-300 font-normal tracking-tight mb-6">
              €19.99
            </div>
            <p className="text-xl md:text-2xl text-slate-300 font-normal max-w-sm text-left lg:text-right leading-snug">
              One tier with all features<br/>
              <span className="text-cyan-400/80">no credit limit</span><br/>
              <span className="text-slate-500">no hidden costs</span>
            </p>
          </div>
        </section>

        {/* Features Grid */}
        <section className="flex flex-col gap-12 text-left">
          <h2 className="text-2xl md:text-3xl font-headline text-slate-200 font-normal">
            Everything you need to build at scale.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard 
              icon="all_inclusive" 
              title="No credit limits" 
              description="Build without boundaries. We don't cap your creativity or charge per generation."
            />
            <FeatureCard 
              icon="dashboard_customize" 
              title="All in one solution" 
              description="From architecture to deployment, everything happens in one unified workspace."
            />
            <FeatureCard 
              icon="handshake" 
              title="Dev partner" 
              description="More than a code generator. An AI that understands your architecture and context."
            />
            <FeatureCard 
              icon="account_tree" 
              title="Mind map" 
              description="Visualize your entire application structure, user flows, and database schemas instantly."
            />
            <FeatureCard 
              icon="design_services" 
              title="AI gen. UI Mockup with 3 options" 
              description="Generate multiple UI variations for any component and choose the perfect fit."
            />
            <FeatureCard 
              icon="bug_report" 
              title="Self debugging method" 
              description="Automated error detection and resolution that learns from your codebase."
            />
          </div>
        </section>

        {/* Pricing CTA */}
        <section className="glass-panel border border-cyan-500/20 rounded-2xl p-8 md:p-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8 text-left">
          <div className="flex flex-col gap-4">
            <h2 className="text-3xl font-headline text-cyan-300 font-normal">
              Simple, transparent pricing.
            </h2>
            <p className="text-slate-400 text-lg font-normal">
              One tier with all features for only €19.99. No hidden fees, no credit limits.
            </p>
          </div>
          <button 
            onClick={handleCheckout}
            disabled={loading}
            className="px-8 py-4 bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 rounded-xl hover:bg-cyan-500/30 transition-all font-headline text-lg font-normal whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : 'Get Started'}
          </button>
        </section>
      </main>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: string, title: string, description: string }) {
  return (
    <div className="glass-panel border border-white/5 rounded-xl p-6 flex flex-col gap-4 hover:border-cyan-500/30 transition-colors text-left">
      <div className="w-12 h-12 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
        <span className="material-symbols-outlined text-2xl">{icon}</span>
      </div>
      <h3 className="text-xl font-headline text-slate-200 font-normal">{title}</h3>
      <p className="text-slate-400 text-sm font-normal leading-relaxed">{description}</p>
    </div>
  );
}

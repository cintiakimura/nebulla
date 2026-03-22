import React, { useState, useEffect } from 'react';

export function StitchMockup({ onLock }: { onLock: () => void }) {
  const [step, setStep] = useState<'ask' | 'generating' | 'review'>('ask');
  const [generations, setGenerations] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Mockup images to simulate Stitch API generations
  const mockups = [
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600"><rect width="100%" height="100%" fill="%231e293b"/><text x="50%" y="50%" font-family="sans-serif" font-size="40" fill="%2338bdf8" text-anchor="middle" dy=".3em">Dashboard Mockup 1</text></svg>',
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600"><rect width="100%" height="100%" fill="%231e293b"/><text x="50%" y="50%" font-family="sans-serif" font-size="40" fill="%2338bdf8" text-anchor="middle" dy=".3em">Dashboard Mockup 2</text></svg>',
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600"><rect width="100%" height="100%" fill="%231e293b"/><text x="50%" y="50%" font-family="sans-serif" font-size="40" fill="%2338bdf8" text-anchor="middle" dy=".3em">Dashboard Mockup 3</text></svg>'
  ];

  useEffect(() => {
    if (step === 'ask') {
      // Simulate waiting for voice answer
      const timer = setTimeout(() => {
        setStep('generating');
        generateMockup();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [step]);

  const generateMockup = () => {
    setStep('generating');
    setTimeout(() => {
      setGenerations(prev => [...prev, mockups[prev.length]]);
      setCurrentIndex(generations.length);
      setStep('review');
    }, 2000);
  };

  const handleRegenerate = () => {
    if (generations.length < 3) {
      generateMockup();
    }
  };

  const handlePrev = () => {
    setCurrentIndex(prev => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex(prev => Math.min(generations.length - 1, prev + 1));
  };

  return (
    <div className="flex flex-col items-center justify-center h-full w-full p-8">
      {step === 'ask' && (
        <div className="flex flex-col items-center gap-6 animate-pulse">
          <div className="w-20 h-20 rounded-full bg-cyan-500/20 flex items-center justify-center border border-cyan-400/50 shadow-[0_0_30px_rgba(0,255,255,0.2)]">
            <span className="material-symbols-outlined text-4xl text-cyan-300">mic</span>
          </div>
          <h2 className="text-2xl font-headline text-cyan-100 text-center max-w-lg">
            "What's the main page—the principal, most important one?"
          </h2>
          <p className="text-slate-500 text-sm">Listening for clear answer...</p>
        </div>
      )}

      {step === 'generating' && (
        <div className="flex flex-col items-center gap-6">
          <div className="w-16 h-16 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin"></div>
          <h2 className="text-xl font-headline text-cyan-100">Stitch API Generating...</h2>
          <p className="text-slate-500 text-sm">Synthesizing design system from your request.</p>
        </div>
      )}

      {step === 'review' && (
        <div className="flex flex-col items-center w-full max-w-5xl gap-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-headline text-white">Review Main Page Design</h2>
            <div className="max-w-2xl mx-auto bg-red-500/10 p-4 rounded-md border border-red-500/20 space-y-2">
              <p className="text-red-400 text-sm font-medium">
                You get three tries—pick wisely. Once locked, no going back. All pages will follow this exact design system from now on.
              </p>
              <p className="text-red-400/60 text-xs italic">
                Why this matters: Locking early stops endless tweaks—user commits, stays focused, app stays consistent. No mind-map refs, no extras—just Stitch.
              </p>
            </div>
          </div>

          <div className="relative w-full aspect-video bg-black/40 rounded-xl border border-white/10 overflow-hidden flex items-center justify-center shadow-2xl">
            <img 
              src={generations[currentIndex]} 
              alt={`Generation ${currentIndex + 1}`} 
              className="w-full h-full object-cover opacity-80"
              referrerPolicy="no-referrer"
            />
            
            {/* Navigation Arrows */}
            <div className="absolute inset-x-4 flex justify-between items-center pointer-events-none">
              <button 
                onClick={handlePrev}
                disabled={currentIndex === 0}
                className="pointer-events-auto w-12 h-12 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-white hover:bg-cyan-500/20 hover:border-cyan-400/50 disabled:opacity-30 disabled:hover:bg-black/50 disabled:hover:border-white/10 transition-all backdrop-blur-md"
              >
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              <button 
                onClick={handleNext}
                disabled={currentIndex === generations.length - 1}
                className="pointer-events-auto w-12 h-12 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-white hover:bg-cyan-500/20 hover:border-cyan-400/50 disabled:opacity-30 disabled:hover:bg-black/50 disabled:hover:border-white/10 transition-all backdrop-blur-md"
              >
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </div>

            {/* Generation Indicator */}
            <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-xs text-cyan-300 font-mono">
              {currentIndex + 1} / {generations.length}
            </div>
          </div>

          <div className="flex items-center gap-6 mt-4">
            <button 
              onClick={handleRegenerate}
              disabled={generations.length >= 3}
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-cyan-500/10 border border-cyan-400 text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-30 disabled:hover:bg-cyan-500/10 transition-all font-headline"
            >
              <span className="material-symbols-outlined text-18">refresh</span>
              Regenerate ({3 - generations.length} left)
            </button>
            
            <button 
              onClick={onLock}
              className="flex items-center justify-center gap-2 px-8 py-3 rounded-full bg-cyan-500 text-black hover:bg-cyan-400 hover:shadow-[0_0_20px_rgba(0,255,255,0.4)] transition-all font-headline font-medium"
            >
              <span className="material-symbols-outlined text-18">lock</span>
              Lock Design System
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

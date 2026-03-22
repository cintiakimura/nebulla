/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo } from 'react';
import { AssistantSidebar } from './components/AssistantSidebar';
import { MasterPlan } from './components/MasterPlan';
import { MindMap } from './components/MindMap';
import { StitchMockup } from './components/StitchMockup';

const initialPages = [
  { id: '1', type: 'pageNode', data: { label: 'Authentication Portal', isCritical: true, isCreated: true, description: 'GitHub and Google OAuth integration interface.' }, position: { x: 50, y: 250 } },
  { id: '2', type: 'pageNode', data: { label: 'Project Dashboard', isCritical: true, isCreated: false, description: 'Project creation, naming, and auto-provisioning status tracker.' }, position: { x: 350, y: 250 } },
  { id: '3', type: 'pageNode', data: { label: 'Voice-First Workspace', isCritical: true, isCreated: true, description: 'Main IDE interface featuring voice-command visualizer, code editor, and terminal.' }, position: { x: 650, y: 250 } },
  { id: '4', type: 'pageNode', data: { label: 'Settings Panel', isCritical: false, isCreated: false, description: 'Environment variable management, deployment configurations, and integration settings.' }, position: { x: 950, y: 250 } },
];

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2', animated: true, style: { stroke: '#00ffff' } },
  { id: 'e2-3', source: '2', target: '3', animated: true, style: { stroke: '#00ffff' } },
  { id: 'e3-4', source: '3', target: '4', animated: true, style: { stroke: '#00ffff' } },
];

export default function App() {
  const [showMasterPlan, setShowMasterPlan] = useState(false);
  const [showMindMap, setShowMindMap] = useState(false);
  const [showStitchMockup, setShowStitchMockup] = useState(false);
  
  const [pages, setPages] = useState(initialPages);
  const [edges, setEdges] = useState(initialEdges);

  // Generate dynamic text for Master Plan
  const pagesText = useMemo(() => {
    // Sort pages by X position to represent visual flow left-to-right
    const sortedPages = [...pages].sort((a, b) => a.position.x - b.position.x);
    return `PAGES & NAVIGATION\n\n` + sortedPages.map((p, i) => `${i + 1}. ${p.data.label}: ${p.data.description}`).join('\n');
  }, [pages]);

  const handleSaveToMasterPlan = () => {
    console.log("Saved to Master Plan");
  };

  const handleLockDesign = () => {
    setShowStitchMockup(false);
    // Return to default view or mind map
  };

  return (
    <>
      {/* TopAppBar */}
      <header className="h-12 w-full z-50 flex justify-between items-center px-6 bg-[#040f1a]/60 backdrop-blur-xl border-b border-white/5 shadow-[0_0_20px_rgba(96,0,159,0.05)]">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-cyan-400">terminal</span>
          <h1 className="font-headline text-lg font-light tracking-tighter text-cyan-300 no-bold">kyn</h1>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => { setShowStitchMockup(true); setShowMindMap(false); setShowMasterPlan(false); }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-13 font-headline no-bold transition-all ${showStitchMockup ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-primary-container/10 text-primary border border-primary/20 hover:bg-primary-container/20'}`}
          >
            <span className="material-symbols-outlined text-14">design_services</span>
            Stitch Mockup
          </button>
          <button 
            onClick={() => { setShowMindMap(true); setShowMasterPlan(false); setShowStitchMockup(false); }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-13 font-headline no-bold transition-all ${showMindMap ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-primary-container/10 text-primary border border-primary/20 hover:bg-primary-container/20'}`}
          >
            <span className="material-symbols-outlined text-14">account_tree</span>
            Mind Map
          </button>
          <button 
            onClick={() => { setShowMasterPlan(true); setShowMindMap(false); setShowStitchMockup(false); }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-13 font-headline no-bold transition-all shadow-[0_0_10px_rgba(0,255,255,0.1)] ${showMasterPlan ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-primary-container/10 text-primary border border-primary/20 hover:bg-primary-container/20'}`}
          >
            <span className="material-symbols-outlined text-14">menu_book</span>
            Master Plan
          </button>
          <div className="px-3 py-1 bg-white/5 rounded-full text-slate-400 font-headline text-sm tracking-wide no-bold hover:bg-white/10 transition-colors cursor-pointer">
            localhost:3000
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="workspace-grid flex-1">
        {/* 1. Left Sidebar (Icon Menu) */}
        <aside className="flex flex-col items-center py-4 gap-6 border-r border-white/5 bg-[#040f1a]/20">
          <button className="material-symbols-outlined text-cyan-300 hover:text-white transition-all">folder</button>
          <button className="material-symbols-outlined text-slate-500 hover:text-cyan-300 transition-all">search</button>
          <button className="material-symbols-outlined text-slate-500 hover:text-cyan-300 transition-all">account_tree</button>
          <button className="material-symbols-outlined text-slate-500 hover:text-cyan-300 transition-all">deployed_code</button>
          <div className="mt-auto flex flex-col gap-6 mb-4">
            <button className="material-symbols-outlined text-slate-500 hover:text-cyan-300 transition-all">settings</button>
          </div>
        </aside>

        {/* 2. Navigation Pane (File Tree) */}
        <aside className="flex flex-col border-r border-white/5 bg-[#040f1a]/30">
          <div className="p-4 border-b border-white/5 flex justify-between items-center">
            <span className="text-cyan-300 font-light tracking-widest text-xs font-headline no-bold uppercase">PROJECT</span>
            <button className="material-symbols-outlined text-slate-500 hover:text-cyan-300 transition-colors">chevron_left</button>
          </div>
          <nav className="flex-1 py-4 flex flex-col gap-1 px-2 overflow-y-auto">
            <div className="flex items-center gap-3 px-3 py-2 text-cyan-300 bg-white/5 rounded-lg transition-all cursor-pointer">
              <span className="material-symbols-outlined text-14">folder_open</span>
              <span className="text-13 no-bold">src</span>
            </div>
            <div className="flex items-center gap-3 px-3 py-2 ml-4 text-slate-400 hover:text-cyan-200 hover:bg-white/5 transition-all cursor-pointer">
              <span className="material-symbols-outlined text-14 text-cyan-500/50">javascript</span>
              <span className="text-13 no-bold">index.tsx</span>
            </div>
            <div className="flex items-center gap-3 px-3 py-2 ml-4 text-slate-400 hover:text-cyan-200 hover:bg-white/5 transition-all cursor-pointer">
              <span className="material-symbols-outlined text-14 text-purple-500/50">css</span>
              <span className="text-13 no-bold">globals.css</span>
            </div>
          </nav>

          {/* Quick Actions */}
          <div className="p-4 border-t border-white/5 space-y-3">
            <span className="text-[10px] text-slate-500 font-headline uppercase tracking-tighter no-bold">Quick Actions</span>
            <div className="flex flex-col gap-2">
              <button className="flex items-center gap-2 text-13 text-slate-400 hover:text-cyan-300 transition-all no-bold">
                <span className="material-symbols-outlined text-14">cloud_upload</span>
                Sync Git
              </button>
              <button className="flex items-center gap-2 text-13 text-slate-400 hover:text-cyan-300 transition-all no-bold">
                <span className="material-symbols-outlined text-14">upload_file</span>
                Upload
              </button>
            </div>
          </div>
        </aside>

        {/* 3. Central Preview Area (Tabs + Editor) */}
        <section className="flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="h-10 border-b border-white/5 bg-white/5 flex items-center px-2">
            <div className="flex items-center gap-2 px-4 py-1.5 bg-background border-t border-x border-white/5 rounded-t-lg text-13 text-cyan-300">
              <span className="material-symbols-outlined text-14">javascript</span>
              <span className="no-bold">index.tsx</span>
              <span className="material-symbols-outlined text-14 hover:text-red-400 cursor-pointer">close</span>
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 p-6 overflow-y-auto bg-black/20 relative flex flex-col">
            <div className="flex-1 flex flex-col gap-6">
              {showStitchMockup ? (
                <div className="flex-1 pb-44 flex flex-col">
                  <StitchMockup onLock={handleLockDesign} />
                </div>
              ) : showMasterPlan ? (
                <div className="flex-1 pb-44 flex flex-col">
                  <MasterPlan onClose={() => setShowMasterPlan(false)} pagesText={pagesText} />
                </div>
              ) : showMindMap ? (
                <div className="flex-1 pb-44 flex flex-col">
                  <MindMap 
                    pages={pages} 
                    setPages={setPages} 
                    edges={edges} 
                    setEdges={setEdges} 
                    onSaveToMasterPlan={handleSaveToMasterPlan} 
                  />
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto pb-44">
                  <div className="max-w-4xl mx-auto">
                    <div className="aspect-video glass-panel rounded-md border border-white/5 flex flex-col overflow-hidden nebula-glow transition-all duration-500">
                      <div className="h-10 px-4 flex items-center justify-between border-b border-white/5 bg-white/5">
                        <div className="flex gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-slate-700"></div>
                          <div className="w-2 h-2 rounded-full bg-slate-700"></div>
                          <div className="w-2 h-2 rounded-full bg-slate-700"></div>
                        </div>
                        <span className="text-xs text-slate-500 font-headline no-bold">Preview Mode</span>
                        <span className="material-symbols-outlined text-14 text-slate-500">open_in_new</span>
                      </div>
                      <div className="flex-1 relative flex items-center justify-center bg-surface-container-lowest/20">
                        <img className="w-full h-full object-cover opacity-30" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAKlJ0sHDMJZlFE0129BXHEqGmESmXs41E1DbsBZbAyF6z2Z_bbnIogM_z38qUSMWRdoC_q0tCNVIApHb0ZaIOyBCaMUpaDsZqP4vFQKSERbLS2j-IlDYr_tf-yjLW2pUmmSyCKipGsyBbA9_rcHj6_yAAAXP3iG15txNrSg67s9wKMpFWjQPlKeIPkli4Yxq9kG6nNTZZK25tKEP0eSC8OHYG6sA7x2h49Kh_SSkl2wHT_wHCaULxvheeFDHj9-DnBj9w5x1koFwMJ" alt="Nebula Background" referrerPolicy="no-referrer" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center gap-4">
                          <h2 className="text-2xl font-headline no-bold text-primary">Nebula Interface</h2>
                          <p className="text-13 text-on-surface-variant max-w-sm no-bold leading-relaxed">
                            System initialized. Working within the synchronized data-stream.
                          </p>
                          <button className="mt-2 px-6 py-2 bg-primary-container/10 text-primary border border-primary/20 rounded-md text-13 font-headline no-bold hover:bg-primary-container/20 transition-all">
                            Sync Workspace
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Terminal Area (Fixed to bottom of central panel) */}
            <div className="absolute bottom-0 left-0 right-0 p-6 bg-transparent pointer-events-none">
              <div className="h-40 glass-panel rounded-md border border-white/5 flex flex-col overflow-hidden pointer-events-auto">
                <div className="h-8 px-4 flex items-center gap-2 border-b border-white/5 bg-white/10">
                  <span className="material-symbols-outlined text-14 text-cyan-300">terminal</span>
                  <span className="text-[10px] text-cyan-300 font-headline uppercase no-bold">Terminal</span>
                </div>
                <div className="flex-1 p-3 font-mono text-[11px] text-slate-400 overflow-y-auto no-bold space-y-1 bg-black/20">
                  <div className="flex gap-2"><span className="text-cyan-500">λ</span> <span>npm run dev</span></div>
                  <div className="text-slate-600 text-[10px]">ready - started server on 0.0.0.0:3000</div>
                  <div className="text-slate-600 text-[10px]">event - compiled client and server successfully</div>
                  <div className="flex gap-2"><span className="text-cyan-500">λ</span> <span className="animate-pulse">_</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4. Right Sidebar (Kyn Assistant) */}
        <AssistantSidebar />
      </main>

      {/* BottomNavBar */}
      <footer className="h-10 w-full flex justify-center items-center gap-8 z-50 bg-[#040f1a]/80 backdrop-blur-md border-t border-white/5">
        <button className="material-symbols-outlined text-cyan-300 scale-110 no-bold transition-all active:scale-95 duration-200">visibility</button>
        <button className="material-symbols-outlined text-slate-500 hover:text-cyan-100 no-bold transition-all active:scale-95 duration-200">terminal</button>
        <button className="material-symbols-outlined text-slate-500 hover:text-cyan-100 no-bold transition-all active:scale-95 duration-200">history</button>
        <button className="material-symbols-outlined text-slate-500 hover:text-cyan-100 no-bold transition-all active:scale-95 duration-200">bug_report</button>
      </footer>
    </>
  );
}

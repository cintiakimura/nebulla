/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { AssistantSidebar } from './components/AssistantSidebar';
import { MasterPlan } from './components/MasterPlan';
import { MindMap } from './components/MindMap';
import { StitchMockup } from './components/StitchMockup';
import { auth, db } from './firebase';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';

const getFileIconInfo = (filename: string, isDirectory: boolean) => {
  if (isDirectory) return { icon: 'folder', color: 'text-cyan-400' };
  
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return { icon: 'javascript', color: 'text-blue-400' };
    case 'js':
    case 'jsx':
      return { icon: 'javascript', color: 'text-yellow-400' };
    case 'json':
      return { icon: 'data_object', color: 'text-green-400' };
    case 'css':
      return { icon: 'css', color: 'text-sky-400' };
    case 'html':
      return { icon: 'html', color: 'text-orange-400' };
    case 'md':
      return { icon: 'markdown', color: 'text-slate-300' };
    case 'svg':
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'ico':
      return { icon: 'image', color: 'text-purple-400' };
    default:
      return { icon: 'draft', color: 'text-slate-500' };
  }
};

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
  const [showCodePreview, setShowCodePreview] = useState(false);
  
  const [pages, setPages] = useState(initialPages);
  const [edges, setEdges] = useState(initialEdges);

  const [leftWidth, setLeftWidth] = useState(240);
  const [rightWidth, setRightWidth] = useState(320);
  const [terminalHeight, setTerminalHeight] = useState(160);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | 'terminal' | null>(null);

  const [isLeftOpen, setIsLeftOpen] = useState(true);
  const [isTerminalOpen, setIsTerminalOpen] = useState(true);

  const [user, setUser] = useState<User | null>(null);
  const [files, setFiles] = useState<{name: string, isDirectory: boolean}[]>([]);
  const [terminalHistory, setTerminalHistory] = useState<{command: string, output: string}[]>([]);
  const [terminalInput, setTerminalInput] = useState('');
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalHistory]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const docRef = doc(db, 'projects', 'default');
        getDoc(docRef).then(docSnap => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.pages) setPages(data.pages);
            if (data.edges) setEdges(data.edges);
          } else {
            setDoc(docRef, {
              id: 'default',
              ownerId: currentUser.uid,
              name: 'Nebula Project',
              createdAt: new Date().toISOString(),
              pages: initialPages,
              edges: initialEdges
            }).catch(console.error);
          }
        });
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    fetch('/api/fs/list')
      .then(res => res.json())
      .then(data => {
        if (data.files) setFiles(data.files);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      if (isResizing === 'left') {
        setLeftWidth(Math.max(150, Math.min(e.clientX - 64, 600)));
      } else if (isResizing === 'right') {
        setRightWidth(Math.max(200, Math.min(window.innerWidth - e.clientX, 800)));
      } else if (isResizing === 'terminal') {
        setTerminalHeight(Math.max(100, Math.min(window.innerHeight - e.clientY - 40, 600)));
      }
    };
    const handleMouseUp = () => setIsResizing(null);
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Generate dynamic text for Master Plan
  const pagesText = useMemo(() => {
    // Sort pages by X position to represent visual flow left-to-right
    const sortedPages = [...pages].sort((a, b) => a.position.x - b.position.x);
    return `PAGES & NAVIGATION\n\n` + sortedPages.map((p, i) => `${i + 1}. ${p.data.label}: ${p.data.description}`).join('\n');
  }, [pages]);

  const handleSaveToMasterPlan = () => {
    if (user) {
      setDoc(doc(db, 'projects', 'default'), {
        pages,
        edges
      }, { merge: true }).then(() => {
        console.log("Saved to Master Plan and Firestore");
      }).catch(console.error);
    } else {
      console.log("Saved to Master Plan locally (not logged in)");
    }
  };

  const handleLockDesign = () => {
    setShowStitchMockup(false);
    // Return to default view or mind map
  };

  const handleLogin = () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch(console.error);
  };
  
  const handleLogout = () => {
    signOut(auth).catch(console.error);
  };

  const handleTerminalSubmit = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && terminalInput.trim()) {
      const command = terminalInput.trim();
      setTerminalInput('');
      setTerminalHistory(prev => [...prev, { command, output: 'Executing...' }]);
      
      try {
        const res = await fetch('/api/terminal/exec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command })
        });
        const data = await res.json();
        setTerminalHistory(prev => {
          const newHistory = [...prev];
          newHistory[newHistory.length - 1].output = data.output;
          return newHistory;
        });
      } catch (err: any) {
        setTerminalHistory(prev => {
          const newHistory = [...prev];
          newHistory[newHistory.length - 1].output = err.message;
          return newHistory;
        });
      }
    }
  };

  return (
    <>
      {/* TopAppBar */}
      <header className="h-12 w-full z-50 flex justify-between items-center px-6 bg-[#040f1a]/60 backdrop-blur-xl border-b border-white/5 shadow-[0_0_20px_rgba(96,0,159,0.05)]">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-cyan-400">terminal</span>
          <h1 className="font-headline text-lg font-light tracking-tighter text-cyan-300 no-bold">nebulla</h1>
        </div>
        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-3">
              <img src={user.photoURL || ''} alt="User" className="w-6 h-6 rounded-full border border-white/10" referrerPolicy="no-referrer" />
              <button onClick={handleLogout} className="text-xs text-slate-400 hover:text-cyan-300 transition-colors font-headline">Logout</button>
            </div>
          ) : (
            <button onClick={handleLogin} className="text-xs px-3 py-1.5 bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 rounded hover:bg-cyan-500/20 transition-colors font-headline">
              Login
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* Resizing Overlay */}
        {isResizing && (
          <div 
            className="fixed inset-0 z-[9999]" 
            style={{ cursor: isResizing === 'terminal' ? 'row-resize' : 'col-resize' }} 
          />
        )}

        {/* 1. Left Sidebar (Icon Menu) */}
        <aside className="flex flex-col items-center py-4 gap-6 border-r border-white/5 bg-[#040f1a]/20 w-16 shrink-0">
          <button 
            onClick={() => setIsLeftOpen(!isLeftOpen)}
            className={`material-symbols-outlined transition-all ${isLeftOpen ? 'text-cyan-300' : 'text-slate-500 hover:text-cyan-300'}`}
            title="Toggle File Tree"
          >
            folder
          </button>
          <button className="material-symbols-outlined text-slate-500 hover:text-cyan-300 transition-all">search</button>
          
          <div className="w-8 h-[1px] bg-white/10 my-1"></div>
          <button 
            onClick={() => { setShowStitchMockup(true); setShowMindMap(false); setShowMasterPlan(false); }}
            className={`material-symbols-outlined transition-all ${showStitchMockup ? 'text-cyan-300' : 'text-slate-500 hover:text-cyan-300'}`}
            title="Stitch Mockup"
          >
            design_services
          </button>
          <button 
            onClick={() => { setShowMindMap(true); setShowMasterPlan(false); setShowStitchMockup(false); }}
            className={`material-symbols-outlined transition-all ${showMindMap ? 'text-cyan-300' : 'text-slate-500 hover:text-cyan-300'}`}
            title="Mind Map"
          >
            account_tree
          </button>
          <button 
            onClick={() => { setShowMasterPlan(true); setShowMindMap(false); setShowStitchMockup(false); }}
            className={`material-symbols-outlined transition-all ${showMasterPlan ? 'text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]' : 'text-slate-500 hover:text-yellow-400 hover:drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]'}`}
            title="Master Plan"
          >
            menu_book
          </button>
          <div className="w-8 h-[1px] bg-white/10 my-1"></div>

          <button className="material-symbols-outlined text-slate-500 hover:text-cyan-300 transition-all">deployed_code</button>
          <div className="mt-auto flex flex-col gap-6 mb-4">
            <button className="material-symbols-outlined text-slate-500 hover:text-cyan-300 transition-all">settings</button>
          </div>
        </aside>

        {/* 2. Navigation Pane (File Tree) */}
        {isLeftOpen && (
          <>
            <aside className="flex flex-col border-r border-white/5 bg-[#040f1a]/30 shrink-0" style={{ width: leftWidth }}>
              <div className="p-4 border-b border-white/5 flex justify-between items-center">
                <span className="text-cyan-300 font-light tracking-widest text-xs font-headline no-bold uppercase">PROJECT</span>
                <button 
                  onClick={() => setIsLeftOpen(false)}
                  className="material-symbols-outlined text-slate-500 hover:text-cyan-300 transition-colors"
                >
                  chevron_left
                </button>
              </div>
              <nav className="flex-1 py-4 flex flex-col gap-0 px-2 overflow-y-auto font-mono text-13">
                {files.map((file, i) => {
                  const { icon, color } = getFileIconInfo(file.name, file.isDirectory);
                  return (
                    <div key={i} className={`flex items-center gap-2 px-3 py-1 text-slate-400 hover:text-cyan-200 hover:bg-white/5 transition-all cursor-pointer ${file.isDirectory ? 'font-bold' : 'ml-4'}`}>
                      <span className={`material-symbols-outlined text-13 ${color}`}>
                        {icon}
                      </span>
                      <span className="no-bold">{file.name}</span>
                    </div>
                  );
                })}
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

            {/* Left Splitter */}
            <div 
              className="w-1 cursor-col-resize bg-transparent hover:bg-cyan-500/50 active:bg-cyan-500 transition-colors z-10 shrink-0" 
              onMouseDown={() => setIsResizing('left')} 
            />
          </>
        )}

        {/* 3. Central Preview Area (Tabs + Editor) */}
        <section className="flex flex-col overflow-hidden flex-1">
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
                <div className="flex-1 flex flex-col">
                  <StitchMockup onLock={handleLockDesign} />
                </div>
              ) : showMasterPlan ? (
                <div className="flex-1 flex flex-col">
                  <MasterPlan onClose={() => setShowMasterPlan(false)} pagesText={pagesText} />
                </div>
              ) : showMindMap ? (
                <div className="flex-1 flex flex-col">
                  <MindMap 
                    pages={pages} 
                    setPages={setPages} 
                    edges={edges} 
                    setEdges={setEdges} 
                    onSaveToMasterPlan={handleSaveToMasterPlan} 
                  />
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <div className="max-w-4xl mx-auto">
                    <div className="aspect-video glass-panel rounded-md border border-white/5 flex flex-col overflow-hidden nebula-glow transition-all duration-500">
                      <div className="h-10 px-4 flex items-center justify-between border-b border-white/5 bg-white/5">
                        <div className="flex gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-slate-700"></div>
                          <div className="w-2 h-2 rounded-full bg-slate-700"></div>
                          <div className="w-2 h-2 rounded-full bg-slate-700"></div>
                        </div>
                        <span className="text-xs text-slate-500 font-headline no-bold">Preview Mode</span>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => setShowCodePreview(!showCodePreview)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-headline no-bold transition-all ${showCodePreview ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10 hover:text-slate-300'}`}
                          >
                            <span className="material-symbols-outlined text-[14px]">code</span>
                            Code
                          </button>
                          <span className="material-symbols-outlined text-14 text-slate-500 cursor-pointer hover:text-slate-300 transition-colors">open_in_new</span>
                        </div>
                      </div>
                      <div className="flex-1 relative flex items-center justify-center bg-surface-container-lowest/20 overflow-hidden">
                        {showCodePreview ? (
                          <div className="absolute inset-0 bg-[#040f1a] p-4 overflow-auto font-mono text-13 text-slate-300">
                            <pre className="m-0">
                              <code>
{`// Nebula Interface Component
import React, { useState } from 'react';

export function NebulaInterface() {
  const [isSynced, setIsSynced] = useState(false);

  const handleSync = () => {
    console.log("Syncing workspace...");
    setIsSynced(true);
  };

  return (
    <div className="nebula-container">
      <h2>Nebula Interface</h2>
      <p>System initialized. Working within the synchronized data-stream.</p>
      <button onClick={handleSync}>
        {isSynced ? 'Workspace Synced' : 'Sync Workspace'}
      </button>
    </div>
  );
}`}
                              </code>
                            </pre>
                          </div>
                        ) : (
                          <>
                            <div className="w-full h-full opacity-30 bg-gradient-to-br from-cyan-900/50 to-purple-900/50" />
                            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center gap-4">
                              <h2 className="text-2xl font-headline no-bold text-primary">Nebula Interface</h2>
                              <p className="text-13 text-on-surface-variant max-w-sm no-bold leading-relaxed">
                                System initialized. Working within the synchronized data-stream.
                              </p>
                              <button className="mt-2 px-6 py-2 bg-primary-container/10 text-primary border border-primary/20 rounded-md text-13 font-headline no-bold hover:bg-primary-container/20 transition-all">
                                Sync Workspace
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {isTerminalOpen && (
            <>
              {/* Terminal Splitter */}
              <div 
                className="h-1 cursor-row-resize bg-transparent hover:bg-cyan-500/50 active:bg-cyan-500 transition-colors z-10 shrink-0" 
                onMouseDown={() => setIsResizing('terminal')} 
              />

              {/* Terminal Area (Anchored) */}
              <div className="bg-[#040f1a]/60 border-t border-white/5 flex flex-col shrink-0" style={{ height: terminalHeight }}>
                <div className="h-8 px-4 flex items-center justify-between border-b border-white/5 bg-white/10 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-14 text-cyan-300">terminal</span>
                    <span className="text-[10px] text-cyan-300 font-headline uppercase no-bold">Terminal</span>
                  </div>
                  <button 
                    onClick={() => setIsTerminalOpen(false)}
                    className="material-symbols-outlined text-14 text-slate-500 hover:text-cyan-300 transition-colors"
                  >
                    close
                  </button>
                </div>
                <div className="flex-1 p-3 font-mono text-[11px] text-slate-400 overflow-y-auto no-bold space-y-2 flex flex-col">
                  {terminalHistory.map((item, i) => (
                    <div key={i} className="flex flex-col gap-1">
                      <div className="flex gap-2"><span className="text-cyan-500">λ</span> <span>{item.command}</span></div>
                      <div className="text-slate-500 whitespace-pre-wrap">{item.output}</div>
                    </div>
                  ))}
                  <div className="flex gap-2 items-center mt-auto">
                    <span className="text-cyan-500">λ</span>
                    <input 
                      type="text" 
                      value={terminalInput}
                      onChange={e => setTerminalInput(e.target.value)}
                      onKeyDown={handleTerminalSubmit}
                      className="flex-1 bg-transparent border-none outline-none text-slate-300 placeholder-slate-600"
                      placeholder="Type a command and press Enter..."
                      autoComplete="off"
                      spellCheck="false"
                    />
                  </div>
                  <div ref={terminalEndRef} />
                </div>
              </div>
            </>
          )}
        </section>

        {/* Right Splitter */}
        <div 
          className="w-1 cursor-col-resize bg-transparent hover:bg-cyan-500/50 active:bg-cyan-500 transition-colors z-10 shrink-0" 
          onMouseDown={() => setIsResizing('right')} 
        />

        {/* 4. Right Sidebar (Kyn Assistant) */}
        <AssistantSidebar width={rightWidth} />
      </main>

      {/* BottomNavBar */}
      <footer className="h-10 w-full flex justify-center items-center gap-8 z-50 bg-[#040f1a]/80 backdrop-blur-md border-t border-white/5">
        <button className="material-symbols-outlined text-cyan-300 scale-110 no-bold transition-all active:scale-95 duration-200">visibility</button>
        <button 
          onClick={() => setIsTerminalOpen(!isTerminalOpen)}
          className={`material-symbols-outlined transition-all active:scale-95 duration-200 ${isTerminalOpen ? 'text-cyan-300' : 'text-slate-500 hover:text-cyan-100'}`}
          title="Toggle Terminal"
        >
          terminal
        </button>
        <button className="material-symbols-outlined text-slate-500 hover:text-cyan-100 no-bold transition-all active:scale-95 duration-200">history</button>
        <button className="material-symbols-outlined text-slate-500 hover:text-cyan-100 no-bold transition-all active:scale-95 duration-200">bug_report</button>
      </footer>
    </>
  );
}

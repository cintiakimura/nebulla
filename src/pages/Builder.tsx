import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, useSearchParams, useLocation } from "react-router-dom";
import { 
  Play, Square, Terminal as TerminalIcon, Layout, 
  Mic, MicOff, Settings, FileCode, Github, Cloud,
  X, Maximize2, Minimize2, Eye, Network, Copy, Link2, Wrench, Paperclip, Send, Volume2, VolumeX
} from "lucide-react";
import Editor from "@monaco-editor/react";
import {
  SandpackProvider,
  SandpackPreview,
  useSandpack,
} from "@codesandbox/sandpack-react";
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import { useDropzone } from 'react-dropzone';
import { getSetupComplete, setSetupComplete } from "../lib/setupStorage";
import { getUserId, getPaidStatus, setPaidFromSuccess } from "../lib/auth";
import { getApiBase } from "../lib/api";
import SetupWizard from "../components/SetupWizard";
import UpgradeProModal, { logFreeTierAttempt } from "../components/UpgradeProModal";

// A component to sync Monaco with Sandpack
const MonacoSync = ({ code, setCode }: { code: string, setCode: (c: string) => void }) => {
  const { sandpack } = useSandpack();
  
  useEffect(() => {
    sandpack.updateFile("/App.tsx", code);
  }, [code]);

  return null;
};

/** Extract code from markdown code blocks and apply to editor. Uses last block of each type. */
function applyCodeFromContent(
  content: string,
  setCode: (c: string) => void,
  setPackageJsonContent: (c: string) => void
) {
  const tsxRegex = /```(?:tsx|ts|jsx|js|javascript)\s*\n?([\s\S]*?)```/g;
  const jsonRegex = /```(?:json)\s*\n?([\s\S]*?)```/g;
  let tsxMatch: RegExpExecArray | null;
  let lastTsx = "";
  while ((tsxMatch = tsxRegex.exec(content)) !== null) lastTsx = tsxMatch[1].trim();
  if (lastTsx.length > 10) setCode(lastTsx);
  let jsonMatch: RegExpExecArray | null;
  let lastJson = "";
  while ((jsonMatch = jsonRegex.exec(content)) !== null) lastJson = jsonMatch[1].trim();
  if (lastJson.length > 2) setPackageJsonContent(lastJson);
}

export default function Builder() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isDemoMode = location.state?.demo === true;
  const { projectId } = useParams<{ projectId?: string }>();
  const [projectLoading, setProjectLoading] = useState(!!projectId);
  const [paidStatus, setPaidStatus] = useState(getPaidStatus);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [proModalOpen, setProModalOpen] = useState(false);
  const [proModalAction, setProModalAction] = useState("");
  const [code, setCode] = useState(`export default function App() {
  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>Hello from kyn Builder</h1>
      <p>Start editing to see some magic happen!</p>
    </div>
  );
}`);
  
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [logs, setLogs] = useState<string[]>(["[kyn] Builder initialized.", "[kyn] Ready for VETR loop (Verify, Explain, Trace, Repair)."]);
  type TabId = 'preview' | '/App.tsx' | '/package.json';
  const [openTabs, setOpenTabs] = useState<TabId[]>(['preview', '/App.tsx']);
  const [activeTabId, setActiveTabId] = useState<TabId>('preview');
  const [packageJsonContent, setPackageJsonContent] = useState(`{
  "name": "kyn-app",
  "private": true,
  "version": "0.0.0"
}`);
  const [chatMessages, setChatMessages] = useState<{ id: string; role: 'user' | 'assistant'; content: string }[]>(() =>
    getSetupComplete() ? [] : [{ id: crypto.randomUUID(), role: 'assistant', content: "Hey, before we build anything—let's connect your stack. Super quick, just once, then we're golden." }]
  );
  const [setupComplete, setSetupCompleteState] = useState(getSetupComplete());
  const [chatInput, setChatInput] = useState("");
  const [grokSpeaks, setGrokSpeaks] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const speechSynthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const codeRef = useRef(code);
  const packageRef = useRef(packageJsonContent);
  const chatRef = useRef(chatMessages);
  codeRef.current = code;
  packageRef.current = packageJsonContent;
  chatRef.current = chatMessages;

  // Stripe success: ?paid=true&plan=... → update Supabase via API, then persist locally and clear URL
  useEffect(() => {
    const paid = searchParams.get("paid");
    const plan = searchParams.get("plan");
    if (paid !== "true" || (plan !== "prototype" && plan !== "king_pro")) return;
    (async () => {
      const userId = await getUserId();
      try {
        await fetch(`${getApiBase()}/api/update-paid-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan, userId }),
        });
      } catch (_) {}
      setPaidFromSuccess(plan);
      setPaidStatus({ paid: true, plan });
      setSearchParams({}, { replace: true });
    })();
  }, [searchParams, setSearchParams]);

  // Load project when projectId is set
  useEffect(() => {
    if (!projectId) {
      setProjectLoading(false);
      return;
    }
    let cancelled = false;
    getUserId().then((userId) => {
      if (cancelled) return;
      fetch(`${getApiBase()}/api/users/${userId}/projects/${projectId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((project: { code?: string; package_json?: string; chat_messages?: string } | null) => {
          if (cancelled) {
            setProjectLoading(false);
            return;
          }
          if (project) {
            if (project.code) setCode(project.code);
            if (project.package_json) setPackageJsonContent(project.package_json);
            try {
              const msgs = typeof project.chat_messages === "string" ? JSON.parse(project.chat_messages || "[]") : project.chat_messages || [];
              if (Array.isArray(msgs) && msgs.length > 0) {
                setChatMessages(msgs);
              } else if (getSetupComplete()) {
                const opener = [{ id: crypto.randomUUID(), role: "assistant" as const, content: "Hey—what's on your mind? What do you wanna build, and why?" }];
                setChatMessages(opener);
                saveProject({ chat_messages: opener });
              }
            } catch (_) {}
          } else {
            // Project not found (e.g. 404 from demo/temp id): show Grok opener so "Start with Grok" still works
            if (getSetupComplete()) {
              const opener = [{ id: crypto.randomUUID(), role: "assistant" as const, content: "Hey—what's on your mind? What do you wanna build, and why?" }];
              setChatMessages(opener);
            }
          }
          setProjectLoading(false);
        })
        .catch(() => setProjectLoading(false));
    });
    return () => { cancelled = true; };
  }, [projectId]);

  const saveProject = async (updates?: { code?: string; package_json?: string; chat_messages?: { id: string; role: string; content: string }[] }) => {
    if (!projectId) return;
    const userId = await getUserId();
    const body = {
      code: updates?.code ?? codeRef.current,
      package_json: updates?.package_json ?? packageRef.current,
      chat_messages: updates?.chat_messages ?? chatRef.current,
      last_edited: new Date().toISOString(),
    };
    await fetch(`${getApiBase()}/api/users/${userId}/projects/${projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  };

  // Debounced save for code and package.json
  useEffect(() => {
    if (!projectId) return;
    const t = setTimeout(() => saveProject({ code: codeRef.current, package_json: packageRef.current }), 1500);
    return () => clearTimeout(t);
  }, [code, packageJsonContent, projectId]);

  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition
  } = useSpeechRecognition();

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, []);

  /** Prefer a more natural-sounding system voice when available (browser TTS is still robotic; for Grok-like voice use xAI Voice Agent API). */
  const getPreferredVoice = (): SpeechSynthesisVoice | null => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices();
    const prefer = voices.find(v => /samantha|karen|daniel|alex|victoria|moira|fiona/i.test(v.name))
      ?? voices.find(v => v.lang.startsWith('en-') && v.name.toLowerCase().includes('natural'))
      ?? voices.find(v => v.lang.startsWith('en-'));
    return prefer ?? voices[0] ?? null;
  };

  const speakWithTTS = (text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis || !text.trim()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 2000));
    utterance.rate = 0.92;
    utterance.pitch = 1;
    const voice = getPreferredVoice();
    if (voice) utterance.voice = voice;
    speechSynthRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const sendToGrok = async (newUserContent: string) => {
    const messages = [
      ...chatMessages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: newUserContent },
    ];
    addLog(`[Grok]: Sending to agent...`);
    try {
      const res = await fetch(`${getApiBase()}/api/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = (data as { error?: string })?.error || `Request failed (${res.status})`;
        addLog(`[Grok Error]: ${errMsg}`);
        const errAssistant = { id: crypto.randomUUID(), role: 'assistant' as const, content: `Grok isn’t available right now: ${errMsg}. Add GROK_API_KEY to .env (get key at console.x.ai).` };
        setChatMessages(prev => [...prev, errAssistant]);
        saveProject({ chat_messages: [...chatMessages, { id: crypto.randomUUID(), role: 'user', content: newUserContent }, errAssistant] });
        return;
      }
      const content = (data as { message?: { content?: string } })?.message?.content ?? 'No response.';
      addLog(`[Grok]: ${content.slice(0, 80)}${content.length > 80 ? '…' : ''}`);
      const assistantMsg = { id: crypto.randomUUID(), role: 'assistant' as const, content };
      setChatMessages(prev => [...prev, assistantMsg]);
      applyCodeFromContent(content, setCode, setPackageJsonContent);
      if (grokSpeaks) speakWithTTS(content);
      const newChat = [...chatMessages, { id: crypto.randomUUID(), role: 'user' as const, content: newUserContent }, assistantMsg];
      saveProject({ chat_messages: newChat });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      addLog(`[Grok Error]: ${msg}`);
      const errMsg = { id: crypto.randomUUID(), role: 'assistant' as const, content: `Grok request failed: ${msg}` };
      setChatMessages(prev => [...prev, errMsg]);
      const newChat = [...chatMessages, { id: crypto.randomUUID(), role: 'user' as const, content: newUserContent }, errMsg];
      saveProject({ chat_messages: newChat });
    }
  };

  const handleSendText = () => {
    const text = chatInput.trim();
    if (!text) return;
    setChatInput("");
    const userMsg = { id: crypto.randomUUID(), role: 'user' as const, content: text };
    setChatMessages(prev => [...prev, userMsg]);
    addLog(`[You]: ${text.slice(0, 60)}${text.length > 60 ? '…' : ''}`);
    saveProject({ chat_messages: [...chatMessages, userMsg] });
    sendToGrok(text);
  };

  const handleMicToggle = () => {
    if (listening) {
      SpeechRecognition.stopListening();
      if (transcript) {
        addLog(`[Voice Input]: ${transcript}`);
        addLog(`[Grok]: Analyzing request...`);
        const userMsg = { id: crypto.randomUUID(), role: 'user' as const, content: transcript };
        setChatMessages(prev => [...prev, userMsg]);
        saveProject({ chat_messages: [...chatMessages, userMsg] });
        resetTranscript();
        sendToGrok(transcript);
      }
    } else {
      resetTranscript();
      SpeechRecognition.startListening({ continuous: true });
      addLog(`[System]: Listening for voice commands...`);
    }
  };

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, msg]);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: true,
    onDragEnter: undefined,
    onDragOver: undefined,
    onDragLeave: undefined,
    onDrop: (acceptedFiles) => {
      acceptedFiles.forEach((file) => {
        const msg = `Uploaded: ${file.name}${file.size ? ` (${(file.size / 1024).toFixed(1)} KB)` : ''}`;
        const userMsg = { id: crypto.randomUUID(), role: 'user' as const, content: msg };
        setChatMessages(prev => [...prev, userMsg]);
        saveProject({ chat_messages: [...chatMessages, userMsg] });
        addLog(`[Upload]: ${file.name}`);
      });
    },
    noClick: true,
    noKeyboard: true,
  });

  const handleCopyLast = () => {
    if (!paidStatus.paid) {
      setProModalAction('copy_code');
      setProModalOpen(true);
      return;
    }
    const last = chatMessages.filter(m => m.role === 'assistant').pop();
    if (last) navigator.clipboard.writeText(last.content);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setChatMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', content: `Uploaded: ${file.name}${file.size ? ` (${(file.size / 1024).toFixed(1)} KB)` : ''}` }]);
      addLog(`[Upload]: ${file.name}`);
    }
    e.target.value = '';
  };

  const openTab = (id: TabId) => {
    if (!paidStatus.paid && (id === '/App.tsx' || id === '/package.json')) {
      setProModalAction('view_source');
      setProModalOpen(true);
      return;
    }
    setOpenTabs(prev => prev.includes(id) ? prev : [...prev, id]);
    setActiveTabId(id);
  };

  const closeTab = (id: TabId, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = openTabs.filter(t => t !== id);
    if (next.length === 0) return;
    setOpenTabs(next);
    if (activeTabId === id) setActiveTabId(next[0]);
  };

  const displayTabs: TabId[] = paidStatus.paid ? openTabs : ['preview'];
  const displayActiveTab: TabId = paidStatus.paid ? activeTabId : 'preview';

  const handleSetupComplete = () => {
    setSetupComplete();
    setSetupCompleteState(true);
    setChatMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: "All wired—now, what's your app about?",
    }]);
  };

  const handleDeploy = async (type: 'github' | 'netlify') => {
    if (!paidStatus.paid) {
      setProModalAction(type === 'github' ? 'github' : 'deploy');
      setProModalOpen(true);
      return;
    }
    addLog(`[Deploy]: Initiating ${type} deployment...`);
    try {
      const endpoint = type === 'github' ? '/api/deploy' : '/api/netlify/hook';
      const res = await fetch(`${getApiBase()}${endpoint}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        addLog(`[Deploy Success]: ${data.message}`);
      } else {
        addLog(`[Deploy Error]: ${data.error}`);
      }
    } catch (e) {
      addLog(`[Deploy Failed]: Network error.`);
    }
  };

  const startCheckout = async (plan: 'prototype' | 'king_pro') => {
    try {
      const res = await fetch(`${getApiBase()}/api/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        addLog(`[Checkout]: ${data.error ?? 'Failed'}`);
      }
    } catch (e) {
      addLog(`[Checkout]: Network error.`);
    }
  };

  return (
    <div className="flex h-screen bg-[#1e1e2e] text-[#d4d4d4] overflow-hidden font-sans flex-col">
      {isDemoMode && (
        <div className="flex-shrink-0 px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-amber-200 text-sm text-center">
          Demo mode—projects won’t be saved until you connect a backend. Set VITE_API_URL in Netlify to your backend URL and redeploy.
        </div>
      )}
      <div className="flex flex-1 min-h-0">
      <div className="w-12 bg-[#252536] flex flex-col items-center py-4 border-r border-[#3d3d4d] z-10">
        <button
          className={`p-2 rounded-md mb-4 transition-colors border-l-2 ${activeTabId !== 'preview' ? 'text-white bg-[#2d2d3d] border-l-[#007acc]' : 'text-[#9ca3af] hover:text-white hover:bg-[#2d2d3d] border-l-transparent'}`}
          title="Explorer"
        >
          <FileCode size={24} strokeWidth={1.5} />
        </button>
        <button
          onClick={() => openTab('preview')}
          className={`p-2 rounded-md mb-4 transition-colors border-l-2 ${activeTabId === 'preview' ? 'text-white bg-[#2d2d3d] border-l-[#007acc]' : 'text-[#9ca3af] hover:text-white hover:bg-[#2d2d3d] border-l-transparent'}`}
          title="Live Preview"
        >
          <Eye size={24} strokeWidth={1.5} />
        </button>
        <button className="p-2 text-[#9ca3af] hover:text-white hover:bg-[#2d2d3d] rounded-md mb-4 border-l-2 border-l-transparent" title="Deploy" onClick={() => navigate("/dashboard")}>
          <Layout size={24} strokeWidth={1.5} />
        </button>
        <div className="mt-auto flex flex-col gap-4">
          <button
            onClick={() => navigate("/settings")}
            className="p-2 text-[#9ca3af] hover:text-white hover:bg-[#2d2d3d] rounded-md border-l-2 border-l-transparent"
            title="Settings"
          >
            <Wrench size={24} strokeWidth={1.5} />
          </button>
          <button className="p-2 text-[#9ca3af] hover:text-white hover:bg-[#2d2d3d] rounded-md border-l-2 border-l-transparent" title="Settings">
            <Settings size={24} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Sidebar (Explorer) */}
      <div className="w-64 bg-[#252536] border-r border-[#3d3d4d] flex flex-col">
        <div className="p-3 text-xs font-semibold tracking-wider text-white uppercase">Explorer</div>
        <div className="flex-1 overflow-auto">
          {paidStatus.paid && (
            <>
          <div
            onClick={() => openTab('/App.tsx')}
            className={`px-3 py-1 text-sm cursor-pointer flex items-center gap-2 ${activeTabId === '/App.tsx' ? 'bg-[#2d2d3d] text-white' : 'text-[#9ca3af] hover:bg-[#2a2a3e]'}`}
          >
            <FileCode size={14} className="text-[#569cd6]" />
            App.tsx
          </div>
          <div
            onClick={() => openTab('/package.json')}
            className={`px-3 py-1 text-sm cursor-pointer flex items-center gap-2 ${activeTabId === '/package.json' ? 'bg-[#2d2d3d] text-white' : 'text-[#9ca3af] hover:bg-[#2a2a3e]'}`}
          >
            <FileCode size={14} className="text-[#ce9178]" />
            package.json
          </div>
            </>
          )}
          {!paidStatus.paid && (
            <div className="px-3 py-2 text-xs text-[#9ca3af]">Live Preview only — upgrade for code.</div>
          )}
        </div>
        
        {/* Deploy Actions */}
        <div className="p-4 border-t border-[#3d3d4d] space-y-3">
          <div className="text-xs font-semibold tracking-wider text-white uppercase mb-2">Deploy</div>
          {!paidStatus.paid && (
            <button
              onClick={() => { setProModalAction('deploy'); setProModalOpen(true); }}
              className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded flex items-center justify-center gap-2 transition-colors"
            >
              Upgrade to Deploy
            </button>
          )}
          <button 
            onClick={() => handleDeploy('github')}
            className="w-full py-2 px-3 bg-[#2d2d3d] hover:bg-[#3d3d5d] text-white text-sm rounded flex items-center justify-center gap-2 transition-colors"
          >
            <Github size={16} />
            Push to GitHub
          </button>
          <button 
            onClick={() => handleDeploy('netlify')}
            className="w-full py-2 px-3 bg-[#007acc] hover:bg-[#1a8ad4] text-white text-sm rounded flex items-center justify-center gap-2 transition-colors"
          >
            <Cloud size={16} />
            Auto-Deploy
          </button>
        </div>
      </div>

      {/* Main Editor Area - fills all space between explorer and chat */}
      <div className="flex-1 flex flex-col min-w-0 w-full min-h-0 overflow-hidden">
        {projectLoading ? (
          <div className="flex-1 flex items-center justify-center bg-[#1e1e2e] text-[#9ca3af]">Loading project...</div>
        ) : setupComplete ? (
          <>
        {/* Tabs */}
        <div className="flex-shrink-0 h-9 bg-[#252536] flex items-center border-b border-[#3d3d4d] overflow-x-auto">
          {displayTabs.map((tabId) => {
            const label = tabId === 'preview' ? 'Live Preview' : tabId === '/App.tsx' ? 'App.tsx' : 'package.json';
            const isActive = displayActiveTab === tabId;
            return (
              <div
                key={tabId}
                onClick={() => setActiveTabId(tabId)}
                className={`h-full flex items-center gap-2 px-4 min-w-[100px] border-r border-[#3d3d4d] cursor-pointer flex-shrink-0 ${isActive ? 'bg-[#1e1e2e] border-t-2 border-t-[#007acc] text-white' : 'text-[#9ca3af] hover:bg-[#2a2a3e]'}`}
              >
                {tabId === 'preview' ? <Eye size={14} /> : <FileCode size={14} className={tabId === '/App.tsx' ? 'text-[#569cd6]' : 'text-[#ce9178]'} />}
                <span className="text-sm truncate">{label}</span>
                <button onClick={(e) => closeTab(tabId, e)} className="ml-auto p-0.5 rounded hover:bg-[#2d2d3d]">
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Center content - one pane, absolutely filled so preview/editor get real dimensions */}
        <div className="flex-1 min-h-0 relative overflow-hidden">
          {displayActiveTab !== '/package.json' && (
            <SandpackProvider
              template="react-ts"
              theme="dark"
              files={{ "/App.tsx": code }}
              customSetup={{ dependencies: { "lucide-react": "latest", "tailwindcss": "latest" } }}
            >
              <MonacoSync code={code} setCode={setCode} />
              {displayActiveTab === 'preview' && (
                <div className="absolute inset-0 flex flex-col bg-white">
                  <div className="flex-none h-8 bg-[#252536] border-b border-[#3d3d4d] flex items-center px-4">
                    <span className="text-xs text-[#9ca3af] font-medium">Live Preview</span>
                  </div>
                  <div className="absolute top-8 left-0 right-0 bottom-0 w-full">
                    <SandpackPreview showOpenInCodeSandbox={false} showRefreshButton={true} style={{ height: '100%', width: '100%' }} />
                  </div>
                  {!paidStatus.paid && (
                    <div
                      className="absolute bottom-2 right-2 text-[10px] text-[#6b7280] pointer-events-none select-none z-10"
                      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                    >
                      Lumen Academy – Upgrade for full code & deploy
                    </div>
                  )}
                </div>
              )}
              {displayActiveTab === '/App.tsx' && (
                <div className="absolute inset-0 w-full">
                  <Editor
                    height="100%"
                    defaultLanguage="typescript"
                    theme="vs-dark"
                    value={code}
                    onChange={(val) => setCode(val ?? '')}
                    options={{ minimap: { enabled: false }, fontSize: 14, wordWrap: 'on', padding: { top: 16 }, fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
                  />
                </div>
              )}
            </SandpackProvider>
              )}
              {displayActiveTab === '/package.json' && (
            <div className="absolute inset-0 w-full bg-[#1e1e2e]">
              <Editor
                height="100%"
                defaultLanguage="json"
                theme="vs-dark"
                value={packageJsonContent}
                onChange={(val) => setPackageJsonContent(val ?? '')}
                options={{ minimap: { enabled: false }, fontSize: 14, wordWrap: 'on', padding: { top: 16 } }}
              />
            </div>
          )}
        </div>

        {/* Terminal Panel */}
        {terminalOpen && (
          <div className="h-48 bg-[#1e1e2e] border-t border-[#3d3d4d] flex flex-col">
            <div className="h-9 flex items-center px-4 border-b border-[#3d3d4d] justify-between">
              <div className="flex items-center gap-4">
                <button className="text-xs text-white border-b-2 border-b-white pb-1 uppercase tracking-wider">Terminal</button>
                <button className="text-xs text-[#9ca3af] hover:text-[#d4d4d4] pb-1 uppercase tracking-wider">Output</button>
                <button className="text-xs text-[#9ca3af] hover:text-[#d4d4d4] pb-1 uppercase tracking-wider">Problems</button>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setTerminalOpen(false)} className="text-[#9ca3af] hover:text-white p-1 rounded hover:bg-[#2d2d3d]">
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="flex-1 p-4 font-mono text-sm overflow-auto text-[#d4d4d4]">
              {logs.map((log, i) => (
                <div key={i} className={`mb-1 ${log.includes('Error') || log.includes('Failed') ? 'text-red-400' : log.includes('Success') ? 'text-green-400' : log.includes('AI') ? 'text-blue-400' : ''}`}>
                  <span className="text-[#6b7280] mr-2">$</span>
                  {log}
                </div>
              ))}
              {listening && transcript && (
                <div className="text-gray-500 italic mt-2">
                  <span className="mr-2">~</span>
                  {transcript}...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Status Bar */}
        <div className="h-6 bg-[#007acc] text-white text-xs flex items-center px-3 justify-between">
          <div className="flex items-center gap-4">
            {paidStatus.paid ? (
              <span className="flex items-center gap-1"><Github size={12} /> main*</span>
            ) : (
              <button
                type="button"
                onClick={() => { setProModalAction('github'); setProModalOpen(true); }}
                className="flex items-center gap-1 opacity-80 hover:opacity-100"
              >
                <Github size={12} /> main*
              </button>
            )}
            <span className="flex items-center gap-1"><X size={12} className="text-red-300" /> 0</span>
          </div>
          <div className="flex items-center gap-4">
            <span>Ln 1, Col 1</span>
            <span>Spaces: 2</span>
            <span>UTF-8</span>
            <span>TypeScript React</span>
            <button onClick={() => setTerminalOpen(!terminalOpen)} className="hover:bg-white/20 px-1 rounded">
              <TerminalIcon size={12} />
            </button>
          </div>
        </div>
          </>
        ) : (
          <SetupWizard onComplete={handleSetupComplete} />
        )}
      </div>

      {/* Chat Panel - same width as Explorer */}
      <div className="w-64 bg-[#252536] border-l border-[#3d3d4d] flex flex-col flex-shrink-0">
        <div className="p-3 text-xs font-semibold tracking-wider text-white uppercase border-b border-[#3d3d4d]">Chat</div>
        <div className="flex-1 flex flex-col min-h-0" {...getRootProps()}>
          <input {...getInputProps()} />
          <input ref={fileInputRef} type="file" className="hidden" accept="image/*,*" onChange={handleFileSelect} />
          <div className={`flex-1 overflow-auto p-3 space-y-3 ${isDragActive ? 'bg-blue-500/10 ring-1 ring-blue-500/50 rounded' : ''}`}>
            {chatMessages.map((msg) => (
              <div key={msg.id} className="group">
                <div className="text-xs text-[#9ca3af] mb-0.5">{msg.role === 'user' ? 'You' : 'Assistant'}</div>
                <div className="text-sm text-[#d4d4d4] select-text break-words pr-8">{msg.content}</div>
                <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!paidStatus.paid) { setProModalAction('copy_code'); setProModalOpen(true); return; }
                      navigator.clipboard.writeText(msg.content);
                    }}
                    className="p-1 rounded hover:bg-[#2d2d3d] text-[#9ca3af] hover:text-white"
                    title="Copy"
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!paidStatus.paid) { setProModalAction('copy_code'); setProModalOpen(true); return; }
                      navigator.clipboard.writeText(window.location.href);
                    }}
                    className="p-1 rounded hover:bg-[#2d2d3d] text-[#9ca3af] hover:text-white"
                    title="Copy link"
                  >
                    <Link2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {listening && (
            <div className="px-3 py-2 border-t border-[#3d3d4d] bg-[#1e1e2e]/60">
              <div className="text-xs text-[#9ca3af] mb-1">Live transcription</div>
              <div className="text-sm text-[#9ca3af] italic select-text">{transcript || '...'}</div>
            </div>
          )}
          {/* Text input + Send */}
          <div className="flex-shrink-0 p-2 border-t border-[#3d3d4d] bg-[#252536]" onClick={e => e.stopPropagation()}>
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(); } }}
                placeholder="Type to Grok..."
                className="flex-1 min-w-0 px-3 py-2 rounded-md bg-[#1e1e2e] border border-[#3d3d4d] text-sm text-white placeholder-[#6b7280] focus:border-[#007acc] focus:outline-none"
              />
              <button
                onClick={handleSendText}
                disabled={!chatInput.trim()}
                className="p-2 rounded-md bg-[#007acc] text-white hover:bg-[#1a8ad4] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Send"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
        {/* Bottom toolbar: Open talk, Grok speaks, paperclip, copy */}
        <div className="flex-shrink-0 flex items-center justify-center gap-1 py-2 px-2 border-t border-[#3d3d4d] bg-[#252536]">
          <button
            onClick={handleMicToggle}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${listening ? 'text-red-400' : 'text-[#9ca3af] hover:text-[#d4d4d4] hover:bg-[#2d2d3d]'}`}
            title="Open talk"
          >
            {listening ? <MicOff size={18} /> : <Mic size={18} />}
            <span className="text-xs">{listening ? 'Listening...' : 'Open talk'}</span>
          </button>
          <button
            onClick={() => setGrokSpeaks(prev => !prev)}
            className={`p-2 rounded-md transition-colors ${grokSpeaks ? 'text-[#007acc] bg-[#2d2d3d]' : 'text-[#9ca3af] hover:text-[#d4d4d4] hover:bg-[#2d2d3d]'}`}
            title={grokSpeaks ? 'Grok speaks (on)' : 'Grok speaks (off)'}
          >
            {grokSpeaks ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
            className="p-2 rounded-md text-[#9ca3af] hover:text-[#d4d4d4] hover:bg-[#2d2d3d] transition-colors"
            title="Upload file"
          >
            <Paperclip size={18} />
          </button>
          <button
            onClick={handleCopyLast}
            className="p-2 rounded-md text-[#9ca3af] hover:text-[#d4d4d4] hover:bg-[#2d2d3d] transition-colors"
            title="Copy last reply"
          >
            <Copy size={18} />
          </button>
        </div>
      </div>

      {/* Upgrade to Pro modal (free tier blocks) */}
      <UpgradeProModal
        open={proModalOpen}
        onClose={() => setProModalOpen(false)}
        action={proModalAction}
      />

      {/* Upgrade modal: pick plan → Stripe Checkout (paid flow) */}
      {upgradeModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setUpgradeModalOpen(false)}>
          <div className="bg-[#252536] border border-[#3d3d4d] rounded-lg p-4 w-72 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-medium text-white">Upgrade to deploy</span>
              <button onClick={() => setUpgradeModalOpen(false)} className="p-1 rounded text-[#9ca3af] hover:text-white hover:bg-[#2d2d3d]">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2">
              <button onClick={() => startCheckout('prototype')} className="w-full py-2 px-3 bg-[#2d2d3d] hover:bg-[#3d3d5d] text-white text-sm rounded">
                Prototype $5.99/mo
              </button>
              <button onClick={() => startCheckout('king_pro')} className="w-full py-2 px-3 bg-[#007acc] hover:bg-[#1a8ad4] text-white text-sm rounded">
                King Pro $19.99/mo
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

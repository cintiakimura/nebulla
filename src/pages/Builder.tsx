import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, useSearchParams, useLocation, Link } from "react-router-dom";
import { 
  Play, Square, Terminal as TerminalIcon, Layout, 
  Mic, MicOff, Settings, FileCode, Github,
  X, Maximize2, Minimize2, Eye, Network, Copy, Link2, Wrench, Paperclip, Send, Volume2, VolumeX, Download
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
import { getApiBase, clearBackendUnavailable } from "../lib/api";
import { getSessionToken } from "../lib/supabaseAuth";
import { extractUiGeneratePrompt } from "../lib/uiGenerateIntent";
import SetupWizard from "../components/SetupWizard";
import UpgradeProModal, { logFreeTierAttempt } from "../components/UpgradeProModal";
import UpgradeBubble from "../components/UpgradeBubble";

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
  const [chatMessages, setChatMessages] = useState<{ id: string; role: 'user' | 'assistant'; content: string; images?: string[] }[]>(() =>
    getSetupComplete() ? [] : [{ id: crypto.randomUUID(), role: 'assistant', content: "Hey, before we build anything—let's connect your stack. Super quick, just once, then we're golden." }]
  );
  const [setupComplete, setSetupCompleteState] = useState(getSetupComplete());
  const [chatInput, setChatInput] = useState("");
  const [grokSpeaks, setGrokSpeaks] = useState(() => {
    try { return localStorage.getItem("kyn_grok_speaks") !== "false"; } catch { return true; }
  });
  const [readOnly, setReadOnly] = useState(false);
  const [rateLimitModalOpen, setRateLimitModalOpen] = useState(false);
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const grokAudioRef = useRef<HTMLAudioElement | null>(null);
  const codeRef = useRef(code);
  const packageRef = useRef(packageJsonContent);
  const chatRef = useRef(chatMessages);
  codeRef.current = code;
  packageRef.current = packageJsonContent;
  chatRef.current = chatMessages;

  // Stripe success: ?paid=true&plan=pro → update Supabase via API, then persist locally and clear URL
  useEffect(() => {
    const paid = searchParams.get("paid");
    const plan = searchParams.get("plan");
    if (paid !== "true" || (plan !== "pro" && plan !== "king_pro")) return;
    (async () => {
      const userId = await getUserId();
      try {
        await fetch(`${getApiBase()}/api/update-paid-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: "pro", userId }),
        });
      } catch (_) {}
      setPaidFromSuccess("pro");
      setPaidStatus({ paid: true, plan: "pro" });
      setSearchParams({}, { replace: true });
    })();
  }, [searchParams, setSearchParams]);

  // Fetch limits (isPro only; no paid_until/expiry)
  useEffect(() => {
    let cancelled = false;
    getSessionToken().then((token) => {
      if (!token || cancelled) return;
      const apiBase = getApiBase();
      if (!apiBase) return;
      fetch(`${apiBase}/api/users/me/limits`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { isPro?: boolean } | null) => {
          if (cancelled || !data) return;
          setReadOnly(false);
        })
        .catch(() => {});
    });
    return () => { cancelled = true; };
  }, []);

  // Rate limit modal countdown
  useEffect(() => {
    if (!rateLimitModalOpen || rateLimitCountdown <= 0) return;
    const t = setInterval(() => {
      setRateLimitCountdown((s) => {
        if (s <= 1) {
          setRateLimitModalOpen(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [rateLimitModalOpen, rateLimitCountdown]);

  // Load project when projectId is set
  useEffect(() => {
    if (!projectId) {
      setProjectLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const userId = await getUserId();
      const token = await getSessionToken();
      if (cancelled) return;
      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      fetch(`${getApiBase() || ""}/api/users/${userId}/projects/${projectId}`, { headers })
        .then((r) => {
          if (r.ok) clearBackendUnavailable();
          return r.ok ? r.json() : null;
        })
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
            // Project not found (e.g. 404): show Grok opener so "Start with Grok" still works
            if (getSetupComplete()) {
              const opener = [{ id: crypto.randomUUID(), role: "assistant" as const, content: "Hey—what's on your mind? What do you wanna build, and why?" }];
              setChatMessages(opener);
            }
          }
          setProjectLoading(false);
        })
        .catch(() => setProjectLoading(false));
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  // After onboarding: Grok speaks the opener ("Let's go. What's your idea?") in chat
  const spokeOpenerRef = useRef(false);
  useEffect(() => {
    const opener = location.state?.speakOpener as string | undefined;
    if (!opener || projectLoading || spokeOpenerRef.current) return;
    spokeOpenerRef.current = true;
    const msg = { id: crypto.randomUUID(), role: "assistant" as const, content: opener };
    setChatMessages([msg]);
    saveProject({ chat_messages: [msg] });
    speakWithGrokEve(opener, true);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state?.speakOpener, location.pathname, projectLoading, navigate]);

  const saveProject = async (updates?: { code?: string; package_json?: string; chat_messages?: { id: string; role: string; content: string; images?: string[] }[] }) => {
    if (!projectId) return;
    const userId = await getUserId();
    const token = await getSessionToken();
    const body = {
      code: updates?.code ?? codeRef.current,
      package_json: updates?.package_json ?? packageRef.current,
      chat_messages: updates?.chat_messages ?? chatRef.current,
      last_edited: new Date().toISOString(),
    };
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    await fetch(`${getApiBase() || ""}/api/users/${userId}/projects/${projectId}`, {
      method: "PUT",
      headers,
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
      grokAudioRef.current?.pause();
      grokAudioRef.current = null;
    };
  }, []);

  /** Play Grok reply with browser TTS (Web Speech API). Prefer en-US voice. */
  const speakWithGrokEve = (text: string, force?: boolean) => {
    if (typeof window === "undefined" || !text?.trim()) return;
    if (!force && !grokSpeaks) return;
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) {
      setTimeout(() => speakWithGrokEve(text, force), 150);
      return;
    }
    const u = new SpeechSynthesisUtterance(text.slice(0, 4096));
    u.rate = 0.95;
    u.pitch = 1;
    const enUS = voices.find((v) => v.lang === "en-US") ?? voices.find((v) => v.lang.startsWith("en")) ?? voices[0];
    if (enUS) u.voice = enUS;
    window.speechSynthesis.speak(u);
  };

  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      const onVoices = () => window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = onVoices;
      return () => { window.speechSynthesis.onvoiceschanged = null; };
    }
  }, []);

  const sendToGrok = async (newUserContent: string) => {
    const userId = await getUserId();
    const messages = [
      ...chatMessages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: newUserContent },
    ];
    addLog(`[Grok]: Sending to agent...`);
    try {
      const res = await fetch(`${getApiBase() || ""}/api/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const dataErr = (data as { error?: string })?.error;
        const details = (data as { details?: string })?.details;
        let errMsg: string;
        if (res.status === 401) {
          errMsg = "Please sign in again.";
          addLog(`[Grok]: ${errMsg}`);
          const errAssistant = { id: crypto.randomUUID(), role: 'assistant' as const, content: errMsg };
          setChatMessages(prev => [...prev, errAssistant]);
          saveProject({ chat_messages: [...chatMessages, { id: crypto.randomUUID(), role: 'user', content: newUserContent }, errAssistant] });
          return;
        }
        if (res.status === 403 && dataErr === "read_only_expired") {
          errMsg = (data as { message?: string })?.message ?? "Read-only mode. Upgrade to continue chatting.";
          addLog(`[Grok]: ${errMsg}`);
          setReadOnly(true);
          const errAssistant = { id: crypto.randomUUID(), role: 'assistant' as const, content: errMsg };
          setChatMessages(prev => [...prev, errAssistant]);
          saveProject({ chat_messages: [...chatMessages, { id: crypto.randomUUID(), role: 'user', content: newUserContent }, errAssistant] });
          setProModalAction("read_only");
          setProModalOpen(true);
          return;
        }
        if (res.status === 429) {
          const isIpRateLimit = (data as { error?: string })?.error === "rate_limit_exceeded";
          errMsg = isIpRateLimit
            ? ((data as { message?: string })?.message ?? "Too many requests. Please wait a minute and try again.")
            : ((data as { message?: string })?.message ?? "Free tier: Grok chat limit reached. Upgrade to Pro for unlimited.");
          addLog(`[Grok]: ${errMsg}`);
          const errAssistant = { id: crypto.randomUUID(), role: 'assistant' as const, content: errMsg };
          setChatMessages(prev => [...prev, errAssistant]);
          saveProject({ chat_messages: [...chatMessages, { id: crypto.randomUUID(), role: 'user', content: newUserContent }, errAssistant] });
          if (!isIpRateLimit) {
            setProModalAction("grok_limit");
            setProModalOpen(true);
          } else {
            setRateLimitCountdown(60);
            setRateLimitModalOpen(true);
          }
          return;
        }
        if (res.status === 405 || res.status === 404) {
          errMsg = "Grok isn’t available right now. Check Settings → Backend URL and that the backend is running.";
        } else if (details) {
          errMsg = `${dataErr || "Grok error"}: ${details}`;
        } else {
          errMsg = dataErr || "Grok request failed. Check your backend is running and Backend URL in Settings.";
        }
        addLog(`[Grok Error]: ${errMsg}`);
        const errAssistant = { id: crypto.randomUUID(), role: 'assistant' as const, content: errMsg };
        setChatMessages(prev => [...prev, errAssistant]);
        saveProject({ chat_messages: [...chatMessages, { id: crypto.randomUUID(), role: 'user', content: newUserContent }, errAssistant] });
        return;
      }
      const content = (data as { message?: { content?: string } })?.message?.content ?? 'No response.';
      addLog(`[Grok]: ${content.slice(0, 80)}${content.length > 80 ? '…' : ''}`);
      const assistantMsg = { id: crypto.randomUUID(), role: 'assistant' as const, content };
      setChatMessages(prev => [...prev, assistantMsg]);
      applyCodeFromContent(content, setCode, setPackageJsonContent);
      if (grokSpeaks) speakWithGrokEve(content);
      const newChat = [...chatMessages, { id: crypto.randomUUID(), role: 'user' as const, content: newUserContent }, assistantMsg];
      saveProject({ chat_messages: newChat });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      addLog(`[Grok Error]: ${msg}`);
      const errMsg = { id: crypto.randomUUID(), role: 'assistant' as const, content: `Something went wrong: ${msg}. Check Backend URL in Settings.` };
      setChatMessages(prev => [...prev, errMsg]);
      const newChat = [...chatMessages, { id: crypto.randomUUID(), role: 'user' as const, content: newUserContent }, errMsg];
      saveProject({ chat_messages: newChat });
    }
  };

  const handleSendText = () => {
    if (readOnly) return;
    const text = chatInput.trim();
    if (!text) return;
    setChatInput("");
    const userMsg = { id: crypto.randomUUID(), role: 'user' as const, content: text };
    setChatMessages(prev => [...prev, userMsg]);
    addLog(`[You]: ${text.slice(0, 60)}${text.length > 60 ? '…' : ''}`);
    saveProject({ chat_messages: [...chatMessages, userMsg] });

    // If user asked for UI/layout/design, call Builder.io Visual Copilot and apply generated code
    const uiPrompt = extractUiGeneratePrompt(text);
    if (uiPrompt) {
      (async () => {
        try {
          const userId = await getUserId();
          const res = await fetch(`${getApiBase()}/api/builder/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: uiPrompt, userId }),
          });
          const data = await res.json().catch(() => ({})) as { code?: string; error?: string; placeholder?: boolean };
          if (res.ok && data.code) {
            const code = data.code.trim();
            if (code.includes("```")) {
              applyCodeFromContent(code, setCode, setPackageJsonContent);
            } else {
              setCode(code);
            }
            const kynContent = "Here's the UI code from Builder.io — check the preview. Want me to refine it, add state/logic, or tweak the design?";
            const builderMsg = { id: crypto.randomUUID(), role: 'assistant' as const, content: kynContent };
            setChatMessages(prev => [...prev, builderMsg]);
            saveProject({ chat_messages: [...chatMessages, userMsg, builderMsg] });
            if (grokSpeaks) speakWithGrokEve(kynContent);
          } else if (data.error && !data.placeholder) {
            const errMsg = { id: crypto.randomUUID(), role: 'assistant' as const, content: `UI generation: ${data.error}` };
            setChatMessages(prev => [...prev, errMsg]);
            saveProject({ chat_messages: [...chatMessages, userMsg, errMsg] });
          }
        } catch (_) {}
      })();
    }

    sendToGrok(text);
  };

  const handleMicToggle = () => {
    if (readOnly) return;
    if (listening) {
      SpeechRecognition.stopListening();
      if (transcript) {
        addLog(`[Voice Input]: ${transcript}`);
        addLog(`[Grok]: Analyzing request...`);
        const userMsg = { id: crypto.randomUUID(), role: 'user' as const, content: transcript };
        setChatMessages(prev => [...prev, userMsg]);
        saveProject({ chat_messages: [...chatMessages, userMsg] });
        resetTranscript();

        const uiPrompt = extractUiGeneratePrompt(transcript);
        if (uiPrompt) {
          (async () => {
            try {
              const userId = await getUserId();
              const res = await fetch(`${getApiBase()}/api/builder/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: uiPrompt, userId }),
              });
              const data = await res.json().catch(() => ({})) as { code?: string; error?: string; placeholder?: boolean };
              if (res.ok && data.code) {
                const code = data.code.trim();
                if (code.includes("```")) {
                  applyCodeFromContent(code, setCode, setPackageJsonContent);
                } else {
                  setCode(code);
                }
                const kynContent = "Here's the UI code from Builder.io — check the preview. Want me to refine it, add state/logic, or tweak the design?";
                const builderMsg = { id: crypto.randomUUID(), role: 'assistant' as const, content: kynContent };
                setChatMessages(prev => [...prev, builderMsg]);
                saveProject({ chat_messages: [...chatMessages, userMsg, builderMsg] });
                if (grokSpeaks) speakWithGrokEve(kynContent);
              } else if (data.error && !data.placeholder) {
                const errMsg = { id: crypto.randomUUID(), role: 'assistant' as const, content: `UI generation: ${data.error}` };
                setChatMessages(prev => [...prev, errMsg]);
                saveProject({ chat_messages: [...chatMessages, userMsg, errMsg] });
              }
            } catch (_) {}
          })();
        }

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

  const handleSetupComplete = () => {
    setSetupComplete();
    setSetupCompleteState(true);
    setChatMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: "All wired—now, what's your app about?",
    }]);
  };

  const handleDeploy = async () => {
    if (!paidStatus.paid) {
      setProModalAction('deploy');
      setProModalOpen(true);
      return;
    }
    addLog(`[Deploy]: Initiating deployment...`);
    try {
      const res = await fetch(`${getApiBase()}/api/deploy`, { method: 'POST' });
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

  const startCheckout = async () => {
    try {
      const userId = await getUserId();
      const res = await fetch(`${getApiBase()}/api/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'pro', userId }),
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

  const handleExport = async () => {
    if (!projectId) {
      addLog("[Export]: Save or open a project first.");
      return;
    }
    if (!paidStatus.paid) {
      setProModalAction("export");
      setProModalOpen(true);
      return;
    }
    const token = await getSessionToken();
    const apiBase = getApiBase();
    if (!apiBase) {
      addLog("[Export]: Backend not configured.");
      return;
    }
    try {
      const headers: Record<string, string> = { Accept: "application/zip" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${apiBase}/api/export/${projectId}`, { headers });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        addLog(`[Export]: ${err.error ?? res.status}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kyn-export-${projectId.slice(0, 8)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      addLog("[Export]: Download started.");
    } catch (e) {
      addLog("[Export]: " + (e instanceof Error ? e.message : "Failed"));
    }
  };

  return (
    <div className="flex h-screen bg-[#1e1e2e] text-[#d4d4d4] overflow-hidden font-sans flex-col">
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
        </div>
        
        {/* Deploy: same layout for all; free users see only Upgrade, paid see full actions */}
        <div className="p-4 border-t border-[#3d3d4d] space-y-3">
          <div className="text-xs font-semibold tracking-wider text-white uppercase mb-2">Deploy</div>
          {!paidStatus.paid ? (
            <button
              onClick={() => { setProModalAction('deploy'); setProModalOpen(true); }}
              className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded flex items-center justify-center gap-2 transition-colors"
            >
              Upgrade to Pro
            </button>
          ) : (
            <>
          <button 
            onClick={() => handleDeploy()}
            className="w-full py-2 px-3 bg-[#2d2d3d] hover:bg-[#3d3d5d] text-white text-sm rounded flex items-center justify-center gap-2 transition-colors"
          >
            <Github size={16} />
            Push to GitHub
          </button>
          <button
            onClick={() => handleExport()}
            className="w-full py-2 px-3 bg-[#2d2d3d] hover:bg-[#3d3d5d] text-white text-sm rounded flex items-center justify-center gap-2 transition-colors"
            title="Download zip: code, mind map, keys"
          >
            <Download size={16} />
            Export zip
          </button>
            </>
          )}
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
          {openTabs.map((tabId) => {
            const label = tabId === 'preview' ? 'Live Preview' : tabId === '/App.tsx' ? 'App.tsx' : 'package.json';
            const isActive = activeTabId === tabId;
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
          {activeTabId !== '/package.json' && (
            <SandpackProvider
              template="react-ts"
              theme="dark"
              files={{ "/App.tsx": code }}
              customSetup={{ dependencies: { "lucide-react": "latest", "tailwindcss": "latest" } }}
            >
              <MonacoSync code={code} setCode={setCode} />
              {activeTabId === 'preview' && (
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
              {activeTabId === '/App.tsx' && (
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
              {activeTabId === '/package.json' && (
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

        {/* Status Bar: same layout; free users see git label without click-to-upgrade if preferred, or keep as is */}
        <div className="h-6 bg-[#007acc] text-white text-xs flex items-center px-3 justify-between">
          <div className="flex items-center gap-4">
            {paidStatus.paid ? (
              <span className="flex items-center gap-1"><Github size={12} /> main*</span>
            ) : (
              <span className="flex items-center gap-1 opacity-80"><Github size={12} /> main*</span>
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
                {msg.images && msg.images.length > 0 && (
                  <div className="mt-3 flex flex-col gap-2">
                    {msg.images.map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt="Generated UI mockup"
                        loading="lazy"
                        className="rounded-lg shadow-lg max-w-full border border-[#3d3d4d] bg-[#1e1e2e]"
                      />
                    ))}
                  </div>
                )}
                {paidStatus.paid && (
                <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
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
                      navigator.clipboard.writeText(window.location.href);
                    }}
                    className="p-1 rounded hover:bg-[#2d2d3d] text-[#9ca3af] hover:text-white"
                    title="Copy link"
                  >
                    <Link2 size={12} />
                  </button>
                </div>
                )}
              </div>
            ))}
          </div>
          {listening && (
            <div className="px-3 py-2 border-t border-[#3d3d4d] bg-[#1e1e2e]/60">
              <div className="text-xs text-[#9ca3af] mb-1">Live transcription</div>
              <div className="text-sm text-[#9ca3af] italic select-text">{transcript || '...'}</div>
            </div>
          )}
          {/* Text input + Mic + Send. Fallback: no mic if browser doesn't support speech recognition. */}
          <div className="flex-shrink-0 p-2 border-t border-[#3d3d4d] bg-[#252536]" onClick={e => e.stopPropagation()}>
            {listening && (
              <div className="flex items-center gap-2 mb-2 text-xs text-red-400">
                <span className="flex h-2 w-2 rounded-full bg-red-400 animate-pulse" aria-hidden />
                Listening...
              </div>
            )}
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!readOnly) handleSendText(); } }}
                placeholder={readOnly ? "Upgrade for full access" : (listening ? "Speak, then tap mic again to send" : "Type to Grok...")}
                className={`flex-1 min-w-0 px-3 py-2 rounded-md bg-[#1e1e2e] border border-[#3d3d4d] text-sm text-white placeholder-[#6b7280] focus:border-[#007acc] focus:outline-none ${readOnly ? "opacity-60 cursor-not-allowed" : ""}`}
                disabled={readOnly}
                title={readOnly ? "Upgrade for full access" : undefined}
              />
              <span
                className="shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-[#2d2d3d] text-[#9ca3af] border border-[#3d3d4d] cursor-help"
                title="Fast reasoning model — unlimited chats on Pro"
              >
                Powered by Grok 4.1 Fast
              </span>
              {browserSupportsSpeechRecognition !== false && (
                <button
                  type="button"
                  onClick={handleMicToggle}
                  disabled={readOnly}
                  className={`p-2 rounded-md transition-colors shrink-0 ${readOnly ? "opacity-60 cursor-not-allowed" : ""} ${listening ? 'bg-red-500/20 text-red-400' : 'text-[#9ca3af] hover:text-[#d4d4d4] hover:bg-[#2d2d3d]'}`}
                  title={readOnly ? "Upgrade for full access" : (listening ? 'Stop and send' : 'Voice input')}
                >
                  {listening ? <MicOff size={18} /> : <Mic size={18} />}
                </button>
              )}
              <button
                onClick={handleSendText}
                disabled={!chatInput.trim() || readOnly}
                className="p-2 rounded-md bg-[#007acc] text-white hover:bg-[#1a8ad4] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                title={readOnly ? "Upgrade for full access" : "Send"}
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
            disabled={readOnly}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${readOnly ? "opacity-60 cursor-not-allowed" : ""} ${listening ? 'text-red-400' : 'text-[#9ca3af] hover:text-[#d4d4d4] hover:bg-[#2d2d3d]'}`}
            title={readOnly ? "Upgrade for full access" : "Open talk"}
          >
            {listening ? <MicOff size={18} /> : <Mic size={18} />}
            <span className="text-xs">{listening ? 'Listening...' : 'Open talk'}</span>
          </button>
          <button
            onClick={() => setGrokSpeaks(prev => {
              const next = !prev;
              try { localStorage.setItem("kyn_grok_speaks", next ? "true" : "false"); } catch (_) {}
              return next;
            })}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${grokSpeaks ? 'text-[#007acc] bg-[#2d2d3d]' : 'text-[#9ca3af] hover:text-[#d4d4d4] hover:bg-[#2d2d3d]'}`}
            title="Grok reads replies aloud (browser TTS)"
          >
            {grokSpeaks ? <Volume2 size={18} /> : <VolumeX size={18} />}
            <span className="text-xs">Grok speaks</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
            className="p-2 rounded-md text-[#9ca3af] hover:text-[#d4d4d4] hover:bg-[#2d2d3d] transition-colors"
            title="Upload file"
          >
            <Paperclip size={18} />
          </button>
          {paidStatus.paid && (
          <button
            onClick={handleCopyLast}
            className="p-2 rounded-md text-[#9ca3af] hover:text-[#d4d4d4] hover:bg-[#2d2d3d] transition-colors"
            title="Copy last reply"
          >
            <Copy size={18} />
          </button>
          )}
        </div>
      </div>

      {/* Upgrade to Pro modal (free tier blocks) */}
      <UpgradeProModal
        open={proModalOpen}
        onClose={() => setProModalOpen(false)}
        action={proModalAction}
        title={proModalAction === "read_only" ? "Read-only mode" : undefined}
        message={proModalAction === "read_only" ? "Upgrade to keep building." : undefined}
        ctaLabel={proModalAction === "read_only" ? "Upgrade" : undefined}
        ctaToPricing={proModalAction === "read_only"}
      />

      {/* Rate limit modal: 429 too many requests */}
      {rateLimitModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => rateLimitCountdown <= 0 && setRateLimitModalOpen(false)}>
          <div className="bg-[#252536] border border-[#3d3d4d] rounded-lg p-4 w-72 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-medium text-white">Too many requests</span>
              {rateLimitCountdown <= 0 ? (
                <button onClick={() => setRateLimitModalOpen(false)} className="p-1 rounded text-[#9ca3af] hover:text-white hover:bg-[#2d2d3d]">
                  <X size={16} />
                </button>
              ) : null}
            </div>
            <p className="text-sm text-[#d4d4d4] mb-3">
              Wait {rateLimitCountdown > 0 ? rateLimitCountdown : 0} second{rateLimitCountdown !== 1 ? "s" : ""} and try again, or upgrade for unlimited.
            </p>
            <Link
              to="/pricing"
              onClick={() => setRateLimitModalOpen(false)}
              className="block w-full py-2 px-3 bg-[#6366F1] hover:bg-[#4f46e5] text-white text-sm rounded-lg transition-colors text-center"
            >
              Upgrade for unlimited
            </Link>
          </div>
        </div>
      )}

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
              <button onClick={() => startCheckout()} className="w-full py-2 px-3 bg-[#007acc] hover:bg-[#1a8ad4] text-white text-sm rounded">
                Upgrade to Pro
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
      <UpgradeBubble show={!paidStatus.paid} message="Upgrade to Pro for unlimited" />
    </div>
  );
}

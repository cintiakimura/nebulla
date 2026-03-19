import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, useSearchParams, useLocation, Link } from "react-router-dom";
import { 
  Play, Square, Terminal as TerminalIcon, Layout, 
  Mic, MicOff, Settings, FileCode, Github,
  X, Maximize2, Minimize2, Eye, Network, Copy, Link2, Paperclip, Send, Volume2, VolumeX, Download, AlertCircle, FileText,
  Plus, FolderOpen,
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
import { getUserId, getPaidStatus, setPaidFromSuccess, isOpenMode } from "../lib/auth";
import { getApiBase, clearBackendUnavailable, setBackendUnavailable } from "../lib/api";
import { getSessionToken } from "../lib/supabaseAuth";
import { extractUiGeneratePrompt } from "../lib/uiGenerateIntent";
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

type ProjectStatus = "Live" | "Preview" | "Draft";
type Project = { id: string; name: string; status: ProjectStatus; lastEdited: string; thumbnail?: string | null; url?: string | null };

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
  type BottomPanelTab = 'terminal' | 'output' | 'problems';
  const [bottomPanelTab, setBottomPanelTab] = useState<BottomPanelTab>('terminal');
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
  const chatInputDomRef = useRef<HTMLInputElement | null>(null);
  const [grokSpeaks, setGrokSpeaks] = useState(() => {
    try { return localStorage.getItem("kyn_grok_speaks") !== "false"; } catch { return true; }
  });
  const [readOnly, setReadOnly] = useState(false);
  const [rateLimitModalOpen, setRateLimitModalOpen] = useState(false);
  const [showGrokKeyModal, setShowGrokKeyModal] = useState(false);
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [projectLimit, setProjectLimit] = useState(3);
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
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
        .then((project: { code?: string; package_json?: string; chat_messages?: string; plan?: string | null } | null) => {
          if (cancelled) {
            setProjectLoading(false);
            return;
          }
          if (project) {
            if (project.code) setCode(project.code);
            if (project.package_json) setPackageJsonContent(project.package_json);
            try {
              let msgs: { id: string; role: string; content: string; images?: string[] }[] =
                typeof project.chat_messages === "string" ? JSON.parse(project.chat_messages || "[]") : project.chat_messages || [];
              if (Array.isArray(msgs) && msgs.length > 0) {
                const normalized = msgs
                  .filter((m) => m && typeof m.content === "string")
                  .map((m) => ({
                    id: typeof m.id === "string" ? m.id : crypto.randomUUID(),
                    role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
                    content: m.content,
                    images: Array.isArray(m.images) ? m.images : undefined,
                  }));
                setChatMessages(normalized);
              } else if (project.plan) {
                try {
                  const plan = typeof project.plan === "string" ? JSON.parse(project.plan) : project.plan;
                  const history = plan?.chat_history;
                  if (Array.isArray(history) && history.length > 0) {
                    const withIds = history.map((m: { id?: string; role?: string; content?: string }) => ({
                      id: m.id ?? crypto.randomUUID(),
                      role: (m.role ?? "user") as "user" | "assistant",
                      content: m.content ?? "",
                    }));
                    setChatMessages(withIds);
                    saveProject({ chat_messages: withIds });
                  } else if (getSetupComplete()) {
                    const opener = [{ id: crypto.randomUUID(), role: "assistant" as const, content: "Hey—what's on your mind? What do you wanna build, and why?" }];
                    setChatMessages(opener);
                    saveProject({ chat_messages: opener });
                  }
                } catch (_) {
                  if (getSetupComplete()) {
                    const opener = [{ id: crypto.randomUUID(), role: "assistant" as const, content: "Hey—what's on your mind? What do you wanna build, and why?" }];
                    setChatMessages(opener);
                    saveProject({ chat_messages: opener });
                  }
                }
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

  // Fetch projects when no projectId (project list view)
  useEffect(() => {
    if (projectId) return;
    let cancelled = false;
    setProjectsLoading(true);
    (async () => {
      const [userId, token] = await Promise.all([getUserId(), getSessionToken()]);
      if (cancelled) return;
      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      fetch(`${getApiBase() || ""}/api/users/${userId}/projects`, { headers })
        .then((r) => {
          if (!r.ok) setBackendUnavailable();
          return r.json();
        })
        .then((list: { id: string; name: string; status: string; last_edited: string }[]) => {
          if (cancelled) return;
          if (Array.isArray(list)) {
            clearBackendUnavailable();
            setProjects(list.map((p) => ({
              id: p.id,
              name: p.name,
              status: (p.status as ProjectStatus) || "Draft",
              lastEdited: p.last_edited || "Just now",
              thumbnail: null,
              url: null,
            })));
          }
        })
        .catch(() => setBackendUnavailable())
        .finally(() => { if (!cancelled) setProjectsLoading(false); });
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  // Fetch limits (project count / limit)
  useEffect(() => {
    let cancelled = false;
    const apiBase = getApiBase();
    if (!apiBase) return () => {};
    (async () => {
      const token = await getSessionToken();
      const userId = await getUserId();
      const url = token ? `${apiBase}/api/users/me/limits` : `${apiBase}/api/users/${userId}/limits`;
      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      try {
        const r = await fetch(url, { headers });
        if (!r.ok || cancelled) return;
        const data = (await r.json()) as { projectLimit?: number; projectCount?: number };
        if (data.projectLimit != null) setProjectLimit(data.projectLimit);
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, []);

  const atProjectLimit = !paidStatus.paid && projects.length >= projectLimit;

  const createAndOpenProject = async (name: string) => {
    setCreateError(null);
    if (atProjectLimit) {
      setUpgradeModalOpen(true);
      return;
    }
    const api = getApiBase();
    if (!isOpenMode() && !api) {
      setCreateError("Add your backend URL in Settings to create projects.");
      return;
    }
    try {
      const userId = await getUserId();
      const token = await getSessionToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${api || ""}/api/users/${userId}/projects`, { method: "POST", headers, body: JSON.stringify({ name }) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setCreateError("Please sign in again.");
        if (!isOpenMode()) navigate("/login", { replace: true });
        return;
      }
      if (res.status === 403 && (data as { error?: string }).error === "free_project_limit_reached") {
        setUpgradeModalOpen(true);
        return;
      }
      if (res.ok) {
        const project = data as { id: string; name: string; status: string; last_edited: string };
        setProjects((prev) => [...prev, {
          id: project.id,
          name: project.name,
          status: (project.status as ProjectStatus) || "Draft",
          lastEdited: project.last_edited || "Just now",
          thumbnail: null,
          url: null,
        }]);
        if (chatMessages.length > 0) {
          try {
            await fetch(`${api || ""}/api/users/${userId}/projects/${project.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
              body: JSON.stringify({ plan: { chat_history: chatMessages }, chat_messages: chatMessages }),
            });
          } catch (_) {}
        }
        navigate(`/builder/${project.id}`);
        return;
      }
      setBackendUnavailable();
      setCreateError("Backend didn't respond. Try again.");
    } catch (_) {
      setBackendUnavailable();
      setCreateError("Could not create project. Try again.");
    }
  };

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
        body: JSON.stringify({ messages, userId, projectId: projectId ?? undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const dataErr = (data as { error?: string })?.error;
        const details = (data as { details?: string })?.details;
        const message = (data as { message?: string })?.message;
        const grokRelated = res.status === 503 && [dataErr, details, message].some(s => typeof s === "string" && s.toLowerCase().includes("grok"));
        if (grokRelated) setShowGrokKeyModal(true);
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
          errMsg = "Grok isn’t available right now. Make sure the backend is running and has an API key set.";
        } else if (details) {
          errMsg = `${dataErr || "Grok error"}: ${details}`;
        } else {
          errMsg = dataErr || "Grok request failed. Check Settings for API key and that the backend is running.";
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
      const errMsg = { id: crypto.randomUUID(), role: 'assistant' as const, content: `Something went wrong: ${msg}. Check Settings and that the backend is running.` };
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
              } else if (!res.ok) {
                const fallback = `UI generation failed (HTTP ${res.status}). Check Backend URL and Builder key in Settings.`;
                const errMsg = { id: crypto.randomUUID(), role: 'assistant' as const, content: fallback };
                setChatMessages(prev => [...prev, errMsg]);
                saveProject({ chat_messages: [...chatMessages, userMsg, errMsg] });
              } else {
                const noCodeMsg = { id: crypto.randomUUID(), role: 'assistant' as const, content: "UI generation returned no code. Try again or rephrase your request." };
                setChatMessages(prev => [...prev, noCodeMsg]);
                saveProject({ chat_messages: [...chatMessages, userMsg, noCodeMsg] });
              }
        } catch (_) {}
      })();
    }

    sendToGrok(text);
  };

  const handleMicToggle = () => {
    if (readOnly) return;
    if (browserSupportsSpeechRecognition === false) return;
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
              } else if (!res.ok) {
                const fallback = `UI generation failed (HTTP ${res.status}). Check Backend URL and Builder key in Settings.`;
                const errMsg = { id: crypto.randomUUID(), role: 'assistant' as const, content: fallback };
                setChatMessages(prev => [...prev, errMsg]);
                saveProject({ chat_messages: [...chatMessages, userMsg, errMsg] });
              } else {
                const noCodeMsg = { id: crypto.randomUUID(), role: 'assistant' as const, content: "UI generation returned no code. Try again or rephrase your request." };
                setChatMessages(prev => [...prev, noCodeMsg]);
                saveProject({ chat_messages: [...chatMessages, userMsg, noCodeMsg] });
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
    if (id === 'preview') return; // Preview tab always stays
    const next = openTabs.filter(t => t !== id);
    if (next.length === 0) return;
    setOpenTabs(next);
    if (activeTabId === id) setActiveTabId(next[0]);
  };

  const handleDeploy = async () => {
    if (!paidStatus.paid) {
      setProModalAction('deploy');
      setProModalOpen(true);
      return;
    }
    addLog(`[Deploy]: Initiating deployment...`);
    try {
      const res = await fetch(`${getApiBase() || ""}/api/deploy`, { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (res.ok) {
        addLog(`[Deploy Success]: ${data.message ?? "OK"}`);
      } else {
        addLog(`[Deploy Error]: ${data.error ?? `HTTP ${res.status}`}`);
      }
    } catch (e) {
      addLog(`[Deploy Failed]: ${e instanceof Error ? e.message : "Network error."}`);
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
    <div className="flex h-screen bg-background text-white overflow-hidden font-sans flex-col">
      <div className="flex flex-1 min-h-0">
      {/* Activity bar - blue-accented IDE style */}
      <div className="w-12 bg-[#1e2a38] flex flex-col items-center py-4 border-r border-border z-10">
        <button
          className={`p-2 rounded-md mb-4 transition-colors border-l-2 ${activeTabId !== 'preview' ? 'text-white bg-primary/15 border-l-primary' : 'text-muted hover:text-primary hover:bg-primary/10 border-l-transparent'}`}
          title="Explorer"
        >
          <FileCode size={24} strokeWidth={1.5} />
        </button>
        <button
          onClick={() => openTab('preview')}
          className={`p-2 rounded-md mb-4 transition-colors border-l-2 ${activeTabId === 'preview' ? 'text-white bg-primary/15 border-l-primary' : 'text-muted hover:text-primary hover:bg-primary/10 border-l-transparent'}`}
          title="Live Preview"
        >
          <Eye size={24} strokeWidth={1.5} />
        </button>
        <button className="p-2 text-muted hover:text-primary hover:bg-primary/10 rounded-md mb-4 border-l-2 border-l-transparent" title="Projects" onClick={() => navigate("/builder")}>
          <Layout size={24} strokeWidth={1.5} />
        </button>
        <div className="mt-auto flex flex-col gap-4">
          <button
            onClick={() => navigate("/settings")}
            className="p-2 text-muted hover:text-primary hover:bg-primary/10 rounded-md border-l-2 border-l-transparent"
            title="Settings"
          >
            <Settings size={24} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Sidebar: Projects (when no project) or Explorer + Deploy (when project) */}
      <div className="w-64 bg-sidebar-bg border-r border-border flex flex-col">
        {projectId && (
          <div className="flex items-center gap-1 p-2 border-b border-border">
            <button
              type="button"
              onClick={() => { addLog("[Git]: Stage"); }}
              className="flex-1 py-1.5 px-2 text-xs font-medium rounded bg-[#1e3a5f] text-primary hover:bg-[#264f78] transition-colors"
              title="Stage changes"
            >
              Stage
            </button>
            <button
              type="button"
              onClick={() => { addLog("[Git]: Commit"); }}
              className="flex-1 py-1.5 px-2 text-xs font-medium rounded bg-[#1e3a5f] text-primary hover:bg-[#264f78] transition-colors"
              title="Commit"
            >
              Commit
            </button>
            <button
              type="button"
              onClick={() => { addLog("[Git]: Push"); if (paidStatus.paid) handleDeploy(); else { setProModalAction("deploy"); setProModalOpen(true); } }}
              className="flex-1 py-1.5 px-2 text-xs font-medium rounded bg-primary text-white hover:bg-primary/90 transition-colors"
              title="Push to GitHub"
            >
              Push
            </button>
          </div>
        )}
        {!projectId ? (
          <>
            <div className="p-3 text-xs font-semibold tracking-wider text-primary uppercase">Projects</div>
            <div className="flex-1 overflow-auto">
              <button
                type="button"
                onClick={() => atProjectLimit ? setUpgradeModalOpen(true) : setShowCreateProjectModal(true)}
                disabled={atProjectLimit}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-[#2a2d2e] disabled:opacity-50 disabled:cursor-not-allowed border-l-2 border-l-transparent"
              >
                <Plus size={16} />
                New project
              </button>
              {projectsLoading ? (
                <div className="px-3 py-2 text-xs text-muted">Loading…</div>
              ) : (
                projects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => navigate(`/builder/${p.id}`)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-muted hover:bg-[#2a2d2e] hover:text-white border-l-2 border-l-transparent"
                  >
                    <FolderOpen size={14} />
                    <span className="truncate">{p.name}</span>
                  </button>
                ))
              )}
            </div>
            {!paidStatus.paid && (
              <div className="p-3 border-t border-border text-xs text-muted">
                {projects.length}/{projectLimit} projects
              </div>
            )}
          </>
        ) : (
          <>
            <div className="p-3 text-xs font-semibold tracking-wider text-primary uppercase">Explorer</div>
            <div className="flex-1 overflow-auto">
              <div
                onClick={() => openTab('/App.tsx')}
                className={`px-3 py-1.5 text-sm cursor-pointer flex items-center gap-2 border-l-2 ${activeTabId === '/App.tsx' ? 'bg-[#264f78] border-l-primary text-white' : 'border-l-transparent text-muted hover:bg-[#1e3a5f] hover:text-white'}`}
              >
                <FileCode size={14} className="text-[#569cd6]" />
                App.tsx
              </div>
              <div
                onClick={() => openTab('/package.json')}
                className={`px-3 py-1.5 text-sm cursor-pointer flex items-center gap-2 border-l-2 ${activeTabId === '/package.json' ? 'bg-[#264f78] border-l-primary text-white' : 'border-l-transparent text-muted hover:bg-[#1e3a5f] hover:text-white'}`}
              >
                <FileCode size={14} className="text-[#ce9178]" />
                package.json
              </div>
            </div>
            <div className="p-4 border-t border-border space-y-3">
              <div className="text-xs font-semibold tracking-wider text-primary uppercase mb-2">Deploy</div>
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
                    onClick={() => handleExport()}
                    className="w-full py-2 px-3 bg-[#1e3a5f] hover:bg-[#264f78] text-primary text-sm rounded flex items-center justify-center gap-2 transition-colors"
                    title="Download zip: code, mind map, keys"
                  >
                    <Download size={16} />
                    Export zip
                  </button>
                  <button
                    onClick={() => handleDeploy()}
                    className="w-full py-2 px-3 bg-[#0e639c] hover:bg-[#1177bb] text-white text-sm rounded flex items-center justify-center gap-2 transition-colors"
                  >
                    <Github size={16} />
                    Push to GitHub
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Main area - project list (no project) or editor + preview (with project) */}
      <div className="flex-1 flex flex-col min-w-0 w-full min-h-0 overflow-hidden bg-editor-bg">
        {projectLoading ? (
          <div className="flex-1 flex items-center justify-center bg-editor-bg text-muted">Loading project...</div>
        ) : !projectId ? (
          /* Project list / welcome - no project selected */
          <div className="flex-1 overflow-auto p-6 flex flex-col items-center justify-center">
            <div className="max-w-lg w-full space-y-6">
              <h1 className="text-xl font-medium text-white text-center">Start project brainstorming</h1>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/master-plan-brainstorming")}
                  className="flex-1 py-3 px-4 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  Brainstorm
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/settings")}
                  className="flex-1 py-3 px-4 rounded-lg bg-sidebar-bg border border-border hover:bg-editor-bg text-white font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  Clone from Github
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 py-3 px-4 rounded-lg bg-sidebar-bg border border-border hover:bg-editor-bg text-white font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  Open folder
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (readOnly) {
                      setProModalAction("read_only");
                      setProModalOpen(true);
                      return;
                    }
                    chatInputDomRef.current?.focus();
                  }}
                  className="flex-1 py-3 px-4 rounded-lg bg-sidebar-bg border border-border hover:bg-editor-bg text-white font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  Write prompt
                </button>
              </div>
              <p className="text-sm text-muted text-center">Create a project and start coding. Chat with Grok on the right to plan or generate code.</p>
              {createError && (
                <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-300">{createError}</div>
              )}
              <div className="flex flex-col gap-3">
                <label className="text-sm text-muted">Project name</label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (atProjectLimit) setUpgradeModalOpen(true);
                      else createAndOpenProject(newProjectName.trim() || "New project");
                    }
                  }}
                  placeholder="e.g. My app, Dashboard, Landing page"
                  className="w-full px-4 py-3 rounded-lg bg-sidebar-bg border border-border text-white placeholder-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => atProjectLimit ? setUpgradeModalOpen(true) : createAndOpenProject(newProjectName.trim() || "New project")}
                  disabled={atProjectLimit}
                  className="w-full py-3 px-4 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus size={18} />
                  Create project
                </button>
              </div>
              {projects.length > 0 && (
                <div className="pt-4 border-t border-border">
                  <p className="text-xs text-muted uppercase tracking-wider mb-2">Recent projects</p>
                  <div className="space-y-1">
                    {projects.slice(0, 5).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => navigate(`/builder/${p.id}`)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm text-white hover:bg-[#2a2d2e]"
                      >
                        <FolderOpen size={14} className="text-muted" />
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
        {/* Tab bar - files and preview navigation */}
        <div className="flex-shrink-0 h-11 bg-sidebar-bg flex items-center border-b border-border overflow-x-auto gap-0">
          {openTabs.map((tabId) => {
            const label = tabId === 'preview' ? 'Live Preview' : tabId === '/App.tsx' ? 'App.tsx' : 'package.json';
            const isActive = activeTabId === tabId;
            return (
              <div
                key={tabId}
                onClick={() => setActiveTabId(tabId)}
                className={`h-full flex items-center gap-2 pl-5 pr-4 min-w-[120px] border-r border-border cursor-pointer flex-shrink-0 ${isActive ? 'bg-editor-bg border-t-2 border-t-primary text-white' : 'text-muted hover:bg-[#1e3a5f] hover:text-white'}`}
              >
                {tabId === 'preview' ? <Eye size={14} /> : <FileCode size={14} className={tabId === '/App.tsx' ? 'text-[#569cd6]' : 'text-[#ce9178]'} />}
                <span className="text-sm truncate">{label}</span>
                {tabId !== 'preview' && (
                  <button onClick={(e) => closeTab(tabId, e)} className="ml-auto p-0.5 rounded hover:bg-[#2d3f4f]">
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Center content - preview/editor pane (dark blue #1e1e1e) */}
        <div className="flex-1 min-h-0 relative overflow-hidden bg-editor-bg">
          {!setupComplete ? (
            <div className="absolute inset-0 flex items-center justify-center bg-editor-bg p-8">
              <div className="max-w-md rounded-lg border border-border bg-sidebar-bg p-6 text-center">
                <p className="text-white text-sm mb-4">Connect GitHub and set your domain in Settings, then return here to use the preview and editor.</p>
                <button
                  type="button"
                  onClick={() => navigate("/settings")}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm rounded transition-colors"
                >
                  Go to Settings
                </button>
              </div>
            </div>
          ) : activeTabId !== '/package.json' ? (
            <SandpackProvider
              template="react-ts"
              theme="dark"
              files={{ "/App.tsx": code }}
              customSetup={{ dependencies: { "lucide-react": "latest", "tailwindcss": "latest" } }}
            >
              <MonacoSync code={code} setCode={setCode} />
              {activeTabId === 'preview' && (
                <div className="absolute inset-0 flex flex-col bg-editor-bg">
                  <div className="flex-none h-8 bg-sidebar-bg border-b border-border flex items-center px-4">
                    <span className="text-xs text-muted font-medium">Live Preview</span>
                  </div>
                  <div className="absolute top-8 left-0 right-0 bottom-0 w-full bg-editor-bg">
                    <SandpackPreview showOpenInCodeSandbox={false} showRefreshButton={true} style={{ height: '100%', width: '100%' }} />
                  </div>
                  {!paidStatus.paid && (
                    <div className="absolute bottom-2 right-2 text-sm text-muted bg-sidebar-bg/90 px-2 py-1 rounded pointer-events-none select-none z-10 border border-border">
                      Kyn Sandbox – Upgrade for full access
                    </div>
                  )}
                </div>
              )}
              {activeTabId === '/App.tsx' && (
                <div className="absolute inset-0 w-full bg-editor-bg">
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
          ) : (
            <div className="absolute inset-0 w-full bg-editor-bg">
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

        {/* Bottom panel: Terminal, Output, Problems (Cursor-style) */}
        {terminalOpen && (
          <div className="h-48 min-h-[120px] bg-editor-bg border-t border-border flex flex-col flex-shrink-0">
            <div className="h-9 flex items-center border-b border-border bg-[#1e2a38]">
              <div className="flex items-center h-full">
                <button
                  onClick={() => setBottomPanelTab('terminal')}
                  className={`h-full px-4 flex items-center gap-2 border-b-2 transition-colors ${bottomPanelTab === 'terminal' ? 'border-primary text-primary bg-editor-bg' : 'border-transparent text-muted hover:text-primary hover:bg-[#1e3a5f]'}`}
                >
                  <TerminalIcon size={14} />
                  <span className="text-xs uppercase tracking-wider">Terminal</span>
                </button>
                <button
                  onClick={() => setBottomPanelTab('output')}
                  className={`h-full px-4 flex items-center gap-2 border-b-2 transition-colors ${bottomPanelTab === 'output' ? 'border-primary text-primary bg-editor-bg' : 'border-transparent text-muted hover:text-primary hover:bg-[#1e3a5f]'}`}
                >
                  <FileCode size={14} />
                  <span className="text-xs uppercase tracking-wider">Output</span>
                </button>
                <button
                  onClick={() => setBottomPanelTab('problems')}
                  className={`h-full px-4 flex items-center gap-2 border-b-2 transition-colors ${bottomPanelTab === 'problems' ? 'border-primary text-primary bg-editor-bg' : 'border-transparent text-muted hover:text-primary hover:bg-[#1e3a5f]'}`}
                >
                  <AlertCircle size={14} />
                  <span className="text-xs uppercase tracking-wider">Problems</span>
                </button>
              </div>
              <div className="ml-auto flex items-center pr-2">
                <button onClick={() => setTerminalOpen(false)} className="text-muted hover:text-white p-1.5 rounded hover:bg-[#2d3f4f]" title="Close panel">
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto font-mono text-sm text-white min-h-0">
              {bottomPanelTab === 'terminal' && (
                <div className="p-4">
                  {logs.map((log, i) => (
                    <div key={i} className={`mb-1 ${log.includes('Error') || log.includes('Failed') ? 'text-red-400' : log.includes('Success') ? 'text-green-400' : log.includes('AI') || log.includes('Grok') ? 'text-blue-400' : ''}`}>
                      <span className="text-[#6b7280] mr-2">$</span>
                      {log}
                    </div>
                  ))}
                  {listening && transcript && (
                    <div className="text-muted italic mt-2">
                      <span className="mr-2">~</span>
                      {transcript}...
                    </div>
                  )}
                </div>
              )}
              {bottomPanelTab === 'output' && (
                <div className="p-4">
                  {logs.map((log, i) => (
                    <div key={i} className={`mb-1 ${log.includes('Error') || log.includes('Failed') ? 'text-red-400' : log.includes('Success') ? 'text-green-400' : ''}`}>
                      <span className="text-[#6b7280] mr-2 select-none">›</span>
                      {log}
                    </div>
                  ))}
                  {logs.length === 0 && (
                    <div className="text-[#6b7280]">No output yet.</div>
                  )}
                </div>
              )}
              {bottomPanelTab === 'problems' && (
                <div className="p-4 text-muted">
                  <div className="text-xs text-[#6b7280] mb-2">No problems have been detected in the workspace.</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Status Bar: same layout; free users see git label without click-to-upgrade if preferred, or keep as is */}
        <div className="h-6 bg-primary text-white text-xs flex items-center px-3 justify-between">
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
            <button onClick={() => setTerminalOpen(!terminalOpen)} className="hover:bg-primary/20 px-1 rounded">
              <TerminalIcon size={12} />
            </button>
          </div>
        </div>
          </>
        )}
      </div>

      {/* Chat Panel - same width as Explorer */}
      <div className="w-64 bg-sidebar-bg border-l border-border flex flex-col flex-shrink-0">
        <div className="p-3 border-b border-border flex items-center justify-between gap-2">
          <span className="text-xs font-semibold tracking-wider text-white uppercase">CHAT</span>
          <span
            className="text-[11px] font-medium text-white bg-primary/20 border border-primary/60 px-3 py-1 rounded-full"
            title="Fast reasoning model"
          >
            Powered by Grok 4.1 Fast
          </span>
        </div>
        <div className="flex-1 flex flex-col min-h-0" {...getRootProps()}>
          <input {...getInputProps()} />
          <input ref={fileInputRef} type="file" className="hidden" accept="*/*" onChange={handleFileSelect} />
          <div className={`flex-1 overflow-auto p-3 space-y-3 ${isDragActive ? 'bg-primary/10 ring-1 ring-primary/50 rounded' : ''}`}>
            {chatMessages.map((msg) => (
              <div key={msg.id} className="group">
                <div className="text-xs text-muted mb-0.5">{msg.role === 'user' ? 'You' : 'Assistant'}</div>
                <div className="text-sm text-white select-text break-words pr-8">{msg.content}</div>
                {msg.images && msg.images.length > 0 && (
                  <div className="mt-3 flex flex-col gap-2">
                    {msg.images.map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt="Generated UI mockup"
                        loading="lazy"
                        className="rounded-lg shadow-lg max-w-full border border-border bg-editor-bg"
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
                    className="p-1 rounded hover:bg-[#2d3f4f] text-muted hover:text-white"
                    title="Copy"
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(window.location.href);
                    }}
                    className="p-1 rounded hover:bg-[#2d3f4f] text-muted hover:text-white"
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
            <div className="px-3 py-2 border-t border-border bg-editor-bg/60">
              <div className="text-xs text-muted mb-1">Live transcription</div>
              <div className="text-sm text-muted italic select-text">{transcript || '...'}</div>
            </div>
          )}
          {/* Text input + Send. Voice/more controls live in the bottom toolbar */}
          <div className="flex-shrink-0 p-2 border-t border-border bg-sidebar-bg" onClick={e => e.stopPropagation()}>
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
                className={`flex-1 min-w-0 px-3 py-2 rounded-md bg-editor-bg border border-white/50 text-sm text-white placeholder-muted focus:border-primary focus:outline-none ${readOnly ? "opacity-60 cursor-not-allowed" : ""}`}
                disabled={readOnly}
                title={readOnly ? "Upgrade for full access" : undefined}
                ref={chatInputDomRef}
              />
              <button
                onClick={handleSendText}
                disabled={!chatInput.trim() || readOnly}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-primary text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                title={readOnly ? "Upgrade for full access" : "Send"}
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
        {/* Bottom toolbar: mic, Grok reads aloud, upload, copy */}
        <div className="flex-shrink-0 flex items-center justify-center gap-4 py-1.5 px-3 border-t border-border bg-sidebar-bg">
          <button
            onClick={handleMicToggle}
            disabled={readOnly || browserSupportsSpeechRecognition === false}
            className={`p-2 rounded-md transition-colors shrink-0 ${
              readOnly || browserSupportsSpeechRecognition === false
                ? "opacity-60 cursor-not-allowed"
                : ""
            } ${listening ? "text-red-400 bg-red-500/12 border border-red-500/25" : "text-white/70 hover:text-white hover:bg-border/40"}`}
            title={
              readOnly
                ? "Upgrade for full access"
                : browserSupportsSpeechRecognition === false
                  ? "Speech recognition not supported in this browser"
                  : listening
                    ? "Listening…"
                    : "Open talk"
            }
          >
            {listening ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
          <button
            onClick={() => setGrokSpeaks(prev => {
              const next = !prev;
              try { localStorage.setItem("kyn_grok_speaks", next ? "true" : "false"); } catch (_) {}
              return next;
            })}
            className={`p-2 rounded-md transition-colors shrink-0 ${grokSpeaks ? 'text-white bg-primary/15 border border-primary/30' : 'text-white/70 hover:text-white hover:bg-border/40'}`}
            title="Grok reads replies aloud (browser TTS)"
          >
            {grokSpeaks ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
            className="p-2 rounded-md text-white/70 hover:text-white hover:bg-border/40 transition-colors shrink-0"
            title="Upload file"
          >
            <Paperclip size={16} />
          </button>
          {projectId ? (
            <Link
              to={`/project/${projectId}/locked-summary`}
              className="p-2 rounded-md text-white/70 hover:text-white hover:bg-border/40 transition-colors shrink-0"
              title="Locked Spec"
            >
              <FileText size={16} />
            </Link>
          ) : null}
          <button
            onClick={handleCopyLast}
            disabled={!paidStatus.paid}
            className={`p-2 rounded-md transition-colors shrink-0 ${
              paidStatus.paid
                ? "text-white/70 hover:text-white hover:bg-border/40"
                : "opacity-60 cursor-not-allowed text-white/60"
            }`}
            title={paidStatus.paid ? "Copy last reply" : "Upgrade to Pro to copy last reply"}
          >
            <Copy size={16} />
          </button>
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

      {/* Grok API key missing: 503 from agent/chat */}
      {showGrokKeyModal && (
        <div className="fixed inset-0 bg-editor-bg/80 flex items-center justify-center z-50" onClick={() => setShowGrokKeyModal(false)}>
          <div className="bg-sidebar-bg border border-border rounded-lg p-4 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-white mb-3">Grok isn’t available. Set XAI_API_KEY (or GROK_API_KEY) in your backend .env to enable chat.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowGrokKeyModal(false)} className="px-3 py-2 rounded border border-border text-white text-sm">Close</button>
              <Link to="/settings" onClick={() => setShowGrokKeyModal(false)} className="px-3 py-2 rounded bg-primary text-white text-sm">Open Settings</Link>
            </div>
          </div>
        </div>
      )}

      {/* Rate limit modal: 429 too many requests */}
      {rateLimitModalOpen && (
        <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50" onClick={() => rateLimitCountdown <= 0 && setRateLimitModalOpen(false)}>
          <div className="bg-sidebar-bg border border-border rounded-lg p-4 w-72 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-medium text-white">Too many requests</span>
              {rateLimitCountdown <= 0 ? (
                <button onClick={() => setRateLimitModalOpen(false)} className="p-1 rounded text-muted hover:text-white hover:bg-[#2d3f4f]">
                  <X size={16} />
                </button>
              ) : null}
            </div>
            <p className="text-sm text-white mb-3">
              Wait {rateLimitCountdown > 0 ? rateLimitCountdown : 0} second{rateLimitCountdown !== 1 ? "s" : ""} and try again, or upgrade for unlimited.
            </p>
            <Link
              to="/pricing"
              onClick={() => setRateLimitModalOpen(false)}
              className="block w-full py-2 px-3 bg-primary hover:bg-primary/90 text-white text-sm rounded-lg transition-colors text-center"
            >
              Upgrade for unlimited
            </Link>
          </div>
        </div>
      )}

      {/* Upgrade modal: pick plan → Stripe Checkout (paid flow) */}
      {upgradeModalOpen && (
        <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50" onClick={() => setUpgradeModalOpen(false)}>
          <div className="bg-sidebar-bg border border-border rounded-lg p-4 w-72 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-medium text-white">Upgrade to deploy</span>
              <button onClick={() => setUpgradeModalOpen(false)} className="p-1 rounded text-muted hover:text-white hover:bg-[#2d3f4f]">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2">
              <button onClick={() => startCheckout()} className="w-full py-2 px-3 bg-primary hover:bg-primary/90 text-white text-sm rounded">
                Upgrade to Pro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create project: ask project name (e.g. from sidebar) */}
      {showCreateProjectModal && (
        <div className="fixed inset-0 bg-editor-bg/80 flex items-center justify-center z-50" onClick={() => { setShowCreateProjectModal(false); setNewProjectName(""); }}>
          <div className="bg-sidebar-bg border border-border rounded-lg p-4 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-medium text-white">New project</span>
              <button type="button" onClick={() => { setShowCreateProjectModal(false); setNewProjectName(""); }} className="p-1 rounded text-muted hover:text-white hover:bg-[#2d3f4f]">
                <X size={16} />
              </button>
            </div>
            <label className="block text-xs text-muted mb-2">Project name</label>
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!atProjectLimit) {
                    createAndOpenProject(newProjectName.trim() || "New project");
                    setShowCreateProjectModal(false);
                    setNewProjectName("");
                  } else setUpgradeModalOpen(true);
                }
              }}
              placeholder="e.g. My app, Dashboard"
              className="w-full px-3 py-2 rounded bg-editor-bg border border-border text-white placeholder-muted focus:border-primary focus:outline-none text-sm mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setShowCreateProjectModal(false); setNewProjectName(""); }} className="px-3 py-2 rounded border border-border text-white text-sm">Cancel</button>
              <button
                type="button"
                onClick={() => {
                  if (atProjectLimit) setUpgradeModalOpen(true);
                  else {
                    createAndOpenProject(newProjectName.trim() || "New project");
                    setShowCreateProjectModal(false);
                    setNewProjectName("");
                  }
                }}
                className="px-3 py-2 rounded bg-primary hover:bg-primary/90 text-white text-sm"
              >
                Create
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

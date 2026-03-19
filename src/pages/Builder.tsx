import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, useSearchParams, useLocation, Link } from "react-router-dom";
import { 
  Play, Square, Terminal as TerminalIcon, Layout, 
  Mic, MicOff, Settings, FileCode, Github,
  X, Maximize2, Minimize2, Eye, Network, Copy, Link2, Paperclip, Send, Volume2, VolumeX, Download, AlertCircle, FileText,
  Plus, FolderOpen, MessageSquare, Bug, Code2,
} from "lucide-react";
import Editor from "@monaco-editor/react";
import {
  SandpackProvider,
  SandpackPreview,
  SandpackConsole,
  useSandpack,
} from "@codesandbox/sandpack-react";
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import { useDropzone } from 'react-dropzone';
import { getSetupComplete, setSetupComplete } from "../lib/setupStorage";
import { getUserId, getPaidStatus, setPaidFromSuccess, isOpenMode } from "../lib/auth";
import { getApiBase, clearBackendUnavailable, setBackendUnavailable } from "../lib/api";
import { getSessionToken } from "../lib/supabaseAuth";
import { getBackendSecretHeaders } from "../lib/storedSecrets";
import { formatGrokErrorForChat } from "../lib/grokApiError";
import { playGrokTts } from "../lib/grokVoiceAgent";
import { extractUiGeneratePrompt } from "../lib/uiGenerateIntent";
import UpgradeProModal, { logFreeTierAttempt } from "../components/UpgradeProModal";
import UpgradeBubble from "../components/UpgradeBubble";
import { runBuilderAgentChain } from "../lib/builderAgentChain";
import { loadAgentTaskMemory } from "../lib/multiAgentMemory";

/** Builder: one dark blue canvas; borders are 1px, only slightly lighter than BG (no white strokes). */
const BUILDER_BG = "#020c17";
const BUILDER_ACCENT = "#081a2e";
const BUILDER_MUTED = "#6c7286";
const BUILDER_BORDER = "#112536";

function readStoredPanelSize(key: string, fallback: number, min: number, max: number) {
  try {
    const v = localStorage.getItem(key);
    const n = v ? parseInt(v, 10) : NaN;
    if (Number.isFinite(n)) return Math.min(max, Math.max(min, n));
  } catch {
    /* ignore */
  }
  return fallback;
}

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

type BottomPanelTabId = "terminal" | "output" | "problems";

/** Cursor-style bottom panel: optional Sandpack console (must render inside SandpackProvider) + kyn activity logs */
function BuilderBottomPanel({
  bottomPanelTab,
  setBottomPanelTab,
  setTerminalOpen,
  logs,
  listening,
  transcript,
  sandpackConsole,
}: {
  bottomPanelTab: BottomPanelTabId;
  setBottomPanelTab: (t: BottomPanelTabId) => void;
  setTerminalOpen: (open: boolean) => void;
  logs: string[];
  listening: boolean;
  transcript: string;
  sandpackConsole?: React.ReactNode;
}) {
  const bottomRootRef = useRef<HTMLDivElement>(null);
  const [bottomHeight, setBottomHeight] = useState(() =>
    readStoredPanelSize("kyn_builder_bottom_h", 240, 132, 720)
  );

  useEffect(() => {
    const el = bottomRootRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = Math.round(entries[0].contentRect.height);
      if (h < 120) return;
      setBottomHeight(h);
      try {
        localStorage.setItem("kyn_builder_bottom_h", String(h));
      } catch {
        /* ignore */
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={bottomRootRef}
      className="flex flex-col flex-shrink-0 min-h-[132px] max-h-[80vh]"
      style={{
        height: bottomHeight,
        resize: "vertical",
        overflow: "auto",
        boxSizing: "border-box",
        backgroundColor: BUILDER_BG,
        borderTop: `1px solid ${BUILDER_BORDER}`,
      }}
    >
      <div
        className="h-9 flex items-center flex-shrink-0"
        style={{ backgroundColor: BUILDER_ACCENT, borderBottom: `1px solid ${BUILDER_BORDER}` }}
      >
        <div className="flex items-center h-full">
          <button
            type="button"
            onClick={() => setBottomPanelTab("terminal")}
            className={`h-full px-4 flex items-center gap-2 border-b-2 transition-colors ${bottomPanelTab === "terminal" ? "border-cyan-500/60" : "border-transparent"}`}
            style={{
              color: bottomPanelTab === "terminal" ? "#a8b0c0" : BUILDER_MUTED,
              backgroundColor: bottomPanelTab === "terminal" ? BUILDER_BG : "transparent",
            }}
          >
            <TerminalIcon size={14} />
            <span className="text-xs uppercase tracking-wider">Terminal</span>
          </button>
          <button
            type="button"
            onClick={() => setBottomPanelTab("output")}
            className={`h-full px-4 flex items-center gap-2 border-b-2 transition-colors ${bottomPanelTab === "output" ? "border-cyan-500/60" : "border-transparent"}`}
            style={{
              color: bottomPanelTab === "output" ? "#a8b0c0" : BUILDER_MUTED,
              backgroundColor: bottomPanelTab === "output" ? BUILDER_BG : "transparent",
            }}
          >
            <FileCode size={14} />
            <span className="text-xs uppercase tracking-wider">Output</span>
          </button>
          <button
            type="button"
            onClick={() => setBottomPanelTab("problems")}
            className={`h-full px-4 flex items-center gap-2 border-b-2 transition-colors ${bottomPanelTab === "problems" ? "border-cyan-500/60" : "border-transparent"}`}
            style={{
              color: bottomPanelTab === "problems" ? "#a8b0c0" : BUILDER_MUTED,
              backgroundColor: bottomPanelTab === "problems" ? BUILDER_BG : "transparent",
            }}
          >
            <AlertCircle size={14} />
            <span className="text-xs uppercase tracking-wider">Problems</span>
          </button>
        </div>
        <div className="ml-auto flex items-center pr-2">
          <button
            type="button"
            onClick={() => setTerminalOpen(false)}
            className="p-1.5 rounded hover:opacity-90"
            style={{ color: BUILDER_MUTED }}
            title="Close panel"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden flex flex-col min-h-0 font-mono text-sm" style={{ color: "#a8b0c0" }}>
        {bottomPanelTab === "terminal" && (
          <div className="flex flex-col h-full min-h-0">
            {sandpackConsole ? (
              <div
                className="shrink-0 h-[42%] min-h-[96px] max-h-[200px] overflow-hidden flex flex-col"
                style={{ backgroundColor: BUILDER_BG, borderBottom: `1px solid ${BUILDER_BORDER}` }}
              >
                <div
                  className="text-[10px] uppercase tracking-wider px-3 py-1 border-b"
                  style={{ color: BUILDER_MUTED, borderBottom: `1px solid ${BUILDER_BORDER}`, backgroundColor: BUILDER_ACCENT }}
                >
                  Preview console (Sandpack)
                </div>
                <div className="flex-1 min-h-0 overflow-auto sandpack-console-embed">
                  {sandpackConsole}
                </div>
              </div>
            ) : null}
            <div className={`flex-1 min-h-0 overflow-auto p-3 ${sandpackConsole ? "" : "pt-3"}`} style={{ backgroundColor: BUILDER_BG }}>
              {sandpackConsole ? (
                <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: BUILDER_MUTED }}>
                  Kyn activity
                </div>
              ) : null}
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={`mb-1 ${log.includes("Error") || log.includes("Failed") ? "text-red-400" : log.includes("Success") ? "text-green-400" : log.includes("AI") || log.includes("Grok") ? "text-cyan-400/90" : ""}`}
                >
                  <span className="mr-2" style={{ color: BUILDER_MUTED }}>
                    $
                  </span>
                  {log}
                </div>
              ))}
              {listening && transcript ? (
                <div className="italic mt-2" style={{ color: BUILDER_MUTED }}>
                  <span className="mr-2">~</span>
                  {transcript}...
                </div>
              ) : null}
            </div>
          </div>
        )}
        {bottomPanelTab === "output" && (
          <div className="p-4 h-full overflow-auto" style={{ backgroundColor: BUILDER_BG }}>
            {logs.map((log, i) => (
              <div key={i} className={`mb-1 ${log.includes("Error") || log.includes("Failed") ? "text-red-400" : log.includes("Success") ? "text-green-400" : ""}`}>
                <span className="mr-2 select-none" style={{ color: BUILDER_MUTED }}>
                  ›
                </span>
                {log}
              </div>
            ))}
            {logs.length === 0 ? (
              <div style={{ color: BUILDER_MUTED }}>No output yet.</div>
            ) : null}
          </div>
        )}
        {bottomPanelTab === "problems" && (
          <div className="p-4 h-full overflow-auto" style={{ backgroundColor: BUILDER_BG, color: BUILDER_MUTED }}>
            <div className="text-xs mb-2">No problems have been detected in the workspace.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function BuilderStatusBar({
  terminalOpen,
  setTerminalOpen,
  paidStatus,
}: {
  terminalOpen: boolean;
  setTerminalOpen: (v: boolean) => void;
  paidStatus: { paid: boolean };
}) {
  return (
    <div
      className="h-6 text-xs flex items-center px-3 justify-between flex-shrink-0"
      style={{ backgroundColor: BUILDER_ACCENT, color: BUILDER_MUTED, borderTop: `1px solid ${BUILDER_BORDER}` }}
    >
      <div className="flex items-center gap-4">
        {paidStatus.paid ? (
          <span className="flex items-center gap-1 text-[#a8b0c0]">
            <Github size={12} /> main*
          </span>
        ) : (
          <span className="flex items-center gap-1 opacity-80">
            <Github size={12} /> main*
          </span>
        )}
        <span className="flex items-center gap-1">
          <X size={12} className="text-amber-600/80" /> 0
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span>Ln 1, Col 1</span>
        <span>UTF-8</span>
        <span>TSX</span>
        <button
          type="button"
          onClick={() => setTerminalOpen(!terminalOpen)}
          className="hover:opacity-90 px-1 rounded"
          style={{ color: "#a8b0c0" }}
          title={terminalOpen ? "Hide preview console panel" : "Show preview console panel"}
        >
          <TerminalIcon size={12} />
        </button>
      </div>
    </div>
  );
}

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
  const [bottomPanelTab, setBottomPanelTab] = useState<BottomPanelTabId>("terminal");
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
  const [agentDebugEnabled, setAgentDebugEnabled] = useState(() => {
    try {
      return localStorage.getItem("kyn_agent_debug_chain") === "1";
    } catch {
      return false;
    }
  });
  const [interactionMode, setInteractionMode] = useState<"talk" | "code">(() => {
    try {
      const v = localStorage.getItem("kyn_interaction_mode");
      return v === "code" ? "code" : "talk";
    } catch {
      return "talk";
    }
  });
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [sidebarPanelW, setSidebarPanelW] = useState(() =>
    readStoredPanelSize("kyn_builder_sidebar_w", 224, 160, 560)
  );
  const [terminalPanelW, setTerminalPanelW] = useState(() =>
    readStoredPanelSize("kyn_builder_terminal_w", 300, 200, 720)
  );
  const [chatPanelW, setChatPanelW] = useState(() =>
    readStoredPanelSize("kyn_builder_chat_w", 320, 260, 640)
  );
  const sidebarPanelRef = useRef<HTMLDivElement>(null);
  const terminalPanelRef = useRef<HTMLDivElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const [agentRunning, setAgentRunning] = useState(false);
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
  /** Horizontal scroll container: chat sits on the right; narrow windows need scroll or the Chat control. */
  const builderMainScrollRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const show = !projectId || explorerOpen;
    if (!show) return;
    const el = sidebarPanelRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (w < 48) return;
      setSidebarPanelW(w);
      try {
        localStorage.setItem("kyn_builder_sidebar_w", String(w));
      } catch {
        /* ignore */
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [explorerOpen, projectId]);

  useEffect(() => {
    if (!projectId || !setupComplete || activeTabId === "/package.json" || projectLoading) return;
    const el = terminalPanelRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (w < 48) return;
      setTerminalPanelW(w);
      try {
        localStorage.setItem("kyn_builder_terminal_w", String(w));
      } catch {
        /* ignore */
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [projectId, setupComplete, activeTabId, projectLoading]);

  useEffect(() => {
    const el = chatPanelRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (w < 48) return;
      setChatPanelW(w);
      try {
        localStorage.setItem("kyn_builder_chat_w", String(w));
      } catch {
        /* ignore */
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = BUILDER_BG;
    return () => {
      document.body.style.backgroundColor = prev;
    };
  }, []);

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
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable,
  } = useSpeechRecognition();

  useEffect(() => {
    return () => {
      grokAudioRef.current?.pause();
      grokAudioRef.current = null;
    };
  }, []);

  /**
   * After Grok reasons via POST /api/agent/chat → xAI /v1/chat/completions, speak the reply with Eve:
   * POST /api/tts → xAI /v1/tts (same key). No browser SpeechSynthesis robot voice.
   */
  const speakWithGrokEve = (text: string, force?: boolean) => {
    if (typeof window === "undefined" || !text?.trim()) return;
    if (!force && !grokSpeaks) return;
    void (async () => {
      const base = getApiBase() || "";
      if (!base) {
        setLogs((prev) => [...prev, "[TTS]: Set backend URL — Eve playback needs POST /api/tts."]);
        return;
      }
      try {
        grokAudioRef.current?.pause();
        const ok = await playGrokTts(base, text, { voice_id: "eve", audioElementRef: grokAudioRef });
        if (!ok) {
          setLogs((prev) => [
            ...prev,
            "[TTS]: Grok Eve failed after retries — check xAI key, TTS permission, and /api/tts.",
          ]);
        }
      } catch {
        setLogs((prev) => [...prev, "[TTS]: Grok Eve error — check /api/tts and network."]);
      }
    })();
  };

  const persistInteractionMode = (m: "talk" | "code") => {
    setInteractionMode(m);
    try {
      localStorage.setItem("kyn_interaction_mode", m);
    } catch {
      /* ignore */
    }
  };

  const persistAgentDebug = (on: boolean) => {
    setAgentDebugEnabled(on);
    try {
      localStorage.setItem("kyn_agent_debug_chain", on ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const mem = loadAgentTaskMemory();
    if (mem.length === 0) return;
    setLogs((prev) => [
      ...prev,
      `[Memory] ${mem.length} task(s) stored (max 10). Latest: ${mem[0]?.summary?.slice(0, 100) ?? "—"}`,
    ]);
  }, []);

  const sendToGrok = async (newUserContent: string) => {
    const userId = await getUserId();
    const apiBase = getApiBase() || "";

    if (projectId && agentDebugEnabled && interactionMode === "code" && apiBase) {
      setAgentRunning(true);
      addLog("[Multi-agent] Code Agent → Deploy Agent (chained)");
      try {
        const { codeResult, deployResult, appliedCode } = await runBuilderAgentChain(
          apiBase,
          {
            instruction: newUserContent,
            app_tsx: codeRef.current,
            package_json: packageRef.current,
            self_debug: true,
          },
          addLog
        );
        const ca = codeResult.code_agent as { summary?: string } | undefined;
        const preview =
          deployResult && typeof deployResult.preview_url === "string"
            ? deployResult.preview_url
            : deployResult && deployResult.message
              ? String(deployResult.message)
              : "";
        const assistantText = [ca?.summary ?? "Code agent finished.", preview && `Preview / deploy: ${preview}`]
          .filter(Boolean)
          .join("\n\n");
        if (typeof appliedCode === "string" && appliedCode.trim()) setCode(appliedCode);
        const assistantMsg = { id: crypto.randomUUID(), role: "assistant" as const, content: assistantText };
        setChatMessages((prev) => {
          const next = [...prev, assistantMsg];
          window.setTimeout(() => {
            saveProject({
              chat_messages: next,
              code: appliedCode ?? codeRef.current,
              package_json: packageRef.current,
            });
          }, 0);
          return next;
        });
        if (grokSpeaks) speakWithGrokEve(assistantText);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        addLog(`[Multi-agent Error]: ${msg}`);
        const errAssistant = { id: crypto.randomUUID(), role: "assistant" as const, content: `Agent chain failed: ${msg}` };
        setChatMessages((prev) => {
          const next = [...prev, errAssistant];
          window.setTimeout(() => saveProject({ chat_messages: next }), 0);
          return next;
        });
      } finally {
        setAgentRunning(false);
      }
      return;
    }

    const messages = [
      ...chatMessages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: newUserContent },
    ];
    addLog(`[Grok]: Sending to agent (${interactionMode})…`);
    try {
      const res = await fetch(`${apiBase || ""}/api/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getBackendSecretHeaders() },
        body: JSON.stringify({
          messages,
          userId,
          projectId: projectId ?? undefined,
          interactionMode,
        }),
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
        } else {
          errMsg = formatGrokErrorForChat(data as { error?: string; details?: string; hint?: string }, "Grok request failed. Check Settings for API key and that the backend is running.");
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
            headers: { "Content-Type": "application/json", ...getBackendSecretHeaders() },
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
      const spoken = typeof transcript === "string" ? transcript.trim() : "";
      SpeechRecognition.stopListening();
      if (spoken) {
        addLog(`[Voice Input]: ${spoken}`);
        addLog(`[Grok]: Analyzing request...`);
        const userMsg = { id: crypto.randomUUID(), role: "user" as const, content: spoken };
        setChatMessages((prev) => {
          const next = [...prev, userMsg];
          void saveProject({ chat_messages: next });
          return next;
        });
        resetTranscript();

        const uiPrompt = extractUiGeneratePrompt(spoken);
        if (uiPrompt) {
          (async () => {
            try {
              const userId = await getUserId();
              const res = await fetch(`${getApiBase()}/api/builder/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...getBackendSecretHeaders() },
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
                setChatMessages((prev) => {
                  const next = [...prev, builderMsg];
                  void saveProject({ chat_messages: next });
                  return next;
                });
                if (grokSpeaks) speakWithGrokEve(kynContent);
              } else if (data.error && !data.placeholder) {
                const errMsg = { id: crypto.randomUUID(), role: 'assistant' as const, content: `UI generation: ${data.error}` };
                setChatMessages((prev) => {
                  const next = [...prev, errMsg];
                  void saveProject({ chat_messages: next });
                  return next;
                });
              } else if (!res.ok) {
                const fallback = `UI generation failed (HTTP ${res.status}). Check Backend URL and Builder key in Settings.`;
                const errMsg = { id: crypto.randomUUID(), role: 'assistant' as const, content: fallback };
                setChatMessages((prev) => {
                  const next = [...prev, errMsg];
                  void saveProject({ chat_messages: next });
                  return next;
                });
              } else {
                const noCodeMsg = { id: crypto.randomUUID(), role: 'assistant' as const, content: "UI generation returned no code. Try again or rephrase your request." };
                setChatMessages((prev) => {
                  const next = [...prev, noCodeMsg];
                  void saveProject({ chat_messages: next });
                  return next;
                });
              }
            } catch (_) {}
          })();
        }

        sendToGrok(spoken);
      } else {
        addLog("[Voice]: No speech captured — try again or check the mic permission.");
        resetTranscript();
      }
    } else {
      resetTranscript();
      void (async () => {
        try {
          if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach((t) => t.stop());
          }
        } catch (e) {
          addLog(
            `[Voice]: Microphone permission denied or unavailable — ${e instanceof Error ? e.message : String(e)}`
          );
          return;
        }
        try {
          await SpeechRecognition.startListening({
            continuous: true,
            interimResults: true,
            language: "en-US",
          });
          addLog("[System]: Listening for voice commands… (tap mic again to send)");
        } catch (e2) {
          addLog(`[Voice]: Could not start speech recognition — ${e2 instanceof Error ? e2.message : String(e2)}`);
        }
      })();
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

  /** Chat column is on the far right; narrow viewports clip it — scroll the main strip horizontally. */
  const scrollBuilderToChat = () => {
    const el = builderMainScrollRef.current;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
    window.setTimeout(() => chatInputDomRef.current?.focus(), 350);
  };

  return (
    <div className="flex h-screen overflow-hidden font-sans flex-col" style={{ backgroundColor: BUILDER_BG, color: "#a8b0c0" }}>
      <div
        ref={builderMainScrollRef}
        className="flex-1 min-h-0 min-w-0 overflow-x-auto overflow-y-hidden"
        style={{ backgroundColor: BUILDER_BG }}
      >
        <div className="flex min-h-0 h-full min-w-[60rem]" style={{ backgroundColor: BUILDER_BG }}>
      <div
        className="w-14 flex flex-col items-center py-3 z-10 shrink-0"
        style={{ backgroundColor: BUILDER_ACCENT, borderRight: `1px solid ${BUILDER_BORDER}` }}
      >
        <button
          type="button"
          className="p-2 rounded-md mb-2"
          style={{ color: BUILDER_MUTED }}
          title="Projects"
          onClick={() => navigate("/builder")}
        >
          <Layout size={22} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => setExplorerOpen((o) => !o)}
          className="p-2 rounded-md mb-2 transition-colors"
          style={{
            color: explorerOpen ? "#a8b0c0" : BUILDER_MUTED,
            backgroundColor: explorerOpen ? "rgba(2,12,23,0.45)" : "transparent",
          }}
          title="Toggle explorer"
        >
          <FileCode size={22} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => openTab("preview")}
          className={`p-2 rounded-md mb-2 transition-colors ${activeTabId === "preview" ? "ring-1 ring-cyan-500/40" : ""}`}
          style={{ color: activeTabId === "preview" ? "#a8b0c0" : BUILDER_MUTED }}
          title="Live Preview"
        >
          <Eye size={22} strokeWidth={1.5} />
        </button>
        <div className="mt-auto flex flex-col gap-2 pb-1">
          <button
            type="button"
            onClick={() => persistAgentDebug(!agentDebugEnabled)}
            className="p-2 rounded-md transition-colors"
            style={{
              color: agentDebugEnabled ? "#22d3ee" : BUILDER_MUTED,
              backgroundColor: agentDebugEnabled ? "rgba(2,12,23,0.45)" : "transparent",
            }}
            title={agentDebugEnabled ? "Multi-agent chain ON (Code → Deploy)" : "Multi-agent chain OFF"}
          >
            <Bug size={22} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={scrollBuilderToChat}
            className="p-2 rounded-md"
            style={{ color: BUILDER_MUTED }}
            title="Scroll to chat"
          >
            <MessageSquare size={22} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="p-2 rounded-md"
            style={{ color: BUILDER_MUTED }}
            title="Settings"
          >
            <Settings size={22} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div
        ref={sidebarPanelRef}
        className={`shrink-0 flex flex-col ${!projectId || explorerOpen ? "" : "pointer-events-none"}`}
        style={
          !projectId || explorerOpen
            ? {
                width: sidebarPanelW,
                minWidth: 160,
                maxWidth: 560,
                minHeight: 200,
                maxHeight: "100%",
                resize: "both",
                overflow: "auto",
                boxSizing: "border-box",
                backgroundColor: BUILDER_ACCENT,
                borderRight: `1px solid ${BUILDER_BORDER}`,
              }
            : {
                width: 0,
                minWidth: 0,
                overflow: "hidden",
                resize: "none",
                opacity: 0,
                border: "none",
                flexShrink: 0,
              }
        }
      >
        {projectId && (
          <div className="flex items-center gap-1 p-2 shrink-0" style={{ borderBottom: `1px solid ${BUILDER_BORDER}` }}>
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
              <div className="p-3 text-xs text-muted shrink-0" style={{ borderTop: `1px solid ${BUILDER_BORDER}` }}>
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
            <div className="p-4 space-y-3 shrink-0" style={{ borderTop: `1px solid ${BUILDER_BORDER}` }}>
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

      <div className="flex-1 flex flex-col min-w-0 w-full min-h-0 overflow-hidden" style={{ backgroundColor: BUILDER_BG }}>
        {projectLoading ? (
          <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: BUILDER_BG, color: BUILDER_MUTED }}>
            Loading project...
          </div>
        ) : !projectId ? (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 overflow-auto p-6 flex flex-col items-center justify-center min-h-0">
              <div className="max-w-lg w-full space-y-6">
              <h1 className="text-xl font-medium text-center" style={{ color: "#a8b0c0" }}>
                Start project brainstorming
              </h1>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => navigate("/master-plan-brainstorming")}
                  className="w-full py-3.5 px-4 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium flex items-center justify-center gap-2 transition-colors shadow-sm shadow-primary/20"
                >
                  Brainstorm
                </button>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => navigate("/settings")}
                    className="py-3 px-2 rounded-lg font-medium flex flex-col items-center justify-center gap-1.5 transition-colors min-h-[88px] hover:brightness-110"
                    style={{ backgroundColor: "rgba(8,26,46,0.45)", border: `1px solid ${BUILDER_BORDER}` }}
                  >
                    <Github size={20} className="shrink-0 text-cyan-500/80" />
                    <span className="text-[10px] font-medium text-center leading-tight" style={{ color: BUILDER_MUTED }}>GitHub</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="py-3 px-2 rounded-lg font-medium flex flex-col items-center justify-center gap-1.5 transition-colors min-h-[88px] hover:brightness-110"
                    style={{ backgroundColor: "rgba(8,26,46,0.45)", border: `1px solid ${BUILDER_BORDER}` }}
                  >
                    <FolderOpen size={20} className="shrink-0" style={{ color: BUILDER_MUTED }} />
                    <span className="text-[10px] font-medium text-center leading-tight" style={{ color: BUILDER_MUTED }}>Local folder</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (readOnly) {
                        setProModalAction("read_only");
                        setProModalOpen(true);
                        return;
                      }
                      scrollBuilderToChat();
                      chatInputDomRef.current?.focus();
                    }}
                    className="py-3 px-2 rounded-lg font-medium flex flex-col items-center justify-center gap-1.5 transition-colors min-h-[88px] hover:brightness-110"
                    style={{ backgroundColor: "rgba(8,26,46,0.45)", border: `1px solid ${BUILDER_BORDER}` }}
                  >
                    <FileText size={20} className="shrink-0" style={{ color: BUILDER_MUTED }} />
                    <span className="text-[10px] font-medium text-center leading-tight" style={{ color: BUILDER_MUTED }}>Prompt</span>
                  </button>
                </div>
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
                  className="w-full px-4 py-3 rounded-lg placeholder:text-[#6c7286] focus:outline-none focus:ring-1 focus:ring-cyan-900/40 text-[#a8b0c0]"
                  style={{ backgroundColor: BUILDER_ACCENT, border: `1px solid ${BUILDER_BORDER}` }}
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
                <div className="pt-4" style={{ borderTop: `1px solid ${BUILDER_BORDER}` }}>
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
            {terminalOpen ? (
              <BuilderBottomPanel
                bottomPanelTab={bottomPanelTab}
                setBottomPanelTab={setBottomPanelTab}
                setTerminalOpen={setTerminalOpen}
                logs={logs}
                listening={listening}
                transcript={typeof transcript === "string" ? transcript : ""}
              />
            ) : null}
            <BuilderStatusBar terminalOpen={terminalOpen} setTerminalOpen={setTerminalOpen} paidStatus={paidStatus} />
          </div>
        ) : (
          <>
        {/* Tab bar - files and preview navigation */}
        <div
          className="flex-shrink-0 h-11 flex items-center overflow-x-auto gap-0 shrink-0"
          style={{ backgroundColor: BUILDER_ACCENT, borderBottom: `1px solid ${BUILDER_BORDER}` }}
        >
          {openTabs.map((tabId) => {
            const label = tabId === 'preview' ? 'Live Preview' : tabId === '/App.tsx' ? 'App.tsx' : 'package.json';
            const isActive = activeTabId === tabId;
            return (
              <div
                key={tabId}
                onClick={() => setActiveTabId(tabId)}
                className={`h-full flex items-center gap-2 pl-5 pr-4 min-w-[120px] cursor-pointer flex-shrink-0 ${isActive ? "border-t-2 border-t-cyan-500/70" : ""}`}
                style={{
                  borderRight: `1px solid ${BUILDER_BORDER}`,
                  backgroundColor: isActive ? BUILDER_BG : "transparent",
                  color: isActive ? "#a8b0c0" : BUILDER_MUTED,
                }}
              >
                {tabId === 'preview' ? <Eye size={14} /> : <FileCode size={14} className={tabId === '/App.tsx' ? 'text-[#569cd6]' : 'text-[#ce9178]'} />}
                <span className="text-sm truncate">{label}</span>
                {tabId !== 'preview' && (
                  <button
                    type="button"
                    onClick={(e) => closeTab(tabId, e)}
                    className="ml-auto p-0.5 rounded hover:opacity-90"
                    style={{ color: BUILDER_MUTED }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Center + embedded terminal (Sandpack console when preview/editor) + status */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ backgroundColor: BUILDER_BG }}>
          {!setupComplete ? (
            <>
              <div className="flex-1 min-h-0 relative overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center p-8 z-[1]" style={{ backgroundColor: BUILDER_BG }}>
                  <div className="max-w-md rounded-lg p-6 text-center" style={{ backgroundColor: BUILDER_ACCENT, border: `1px solid ${BUILDER_BORDER}` }}>
                    <p className="text-sm mb-4" style={{ color: "#a8b0c0" }}>Connect GitHub and set your domain in Settings, then return here to use the preview and editor.</p>
                    <button
                      type="button"
                      onClick={() => navigate("/settings")}
                      className="px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm rounded transition-colors"
                    >
                      Go to Settings
                    </button>
                  </div>
                </div>
              </div>
              {terminalOpen ? (
                <BuilderBottomPanel
                  bottomPanelTab={bottomPanelTab}
                  setBottomPanelTab={setBottomPanelTab}
                  setTerminalOpen={setTerminalOpen}
                  logs={logs}
                  listening={listening}
                  transcript={typeof transcript === "string" ? transcript : ""}
                />
              ) : null}
              <BuilderStatusBar terminalOpen={terminalOpen} setTerminalOpen={setTerminalOpen} paidStatus={paidStatus} />
            </>
          ) : activeTabId !== "/package.json" ? (
            <>
              <div className="flex-1 flex min-h-0 overflow-hidden min-w-0">
                <div
                  ref={terminalPanelRef}
                  className="flex flex-col shrink-0 flex-nowrap min-h-0"
                  style={{
                    width: terminalPanelW,
                    minWidth: 200,
                    maxWidth: 720,
                    minHeight: 200,
                    maxHeight: "100%",
                    resize: "both",
                    overflow: "auto",
                    boxSizing: "border-box",
                    backgroundColor: BUILDER_BG,
                    borderRight: `1px solid ${BUILDER_BORDER}`,
                  }}
                >
                  <div
                    className="text-[10px] uppercase tracking-wider px-2 py-1.5 shrink-0 font-semibold"
                    style={{ color: BUILDER_MUTED, borderBottom: `1px solid ${BUILDER_BORDER}`, backgroundColor: BUILDER_ACCENT }}
                  >
                    Live terminal
                  </div>
                  <div className="flex-1 overflow-auto font-mono text-[11px] leading-relaxed p-2" style={{ color: "#a8b0c0" }}>
                    {logs.map((log, i) => (
                      <div key={i} className="mb-0.5 break-words">
                        <span style={{ color: BUILDER_MUTED }} className="mr-1 select-none">
                          ›
                        </span>
                        {log}
                      </div>
                    ))}
                    {agentRunning ? (
                      <div className="mt-2 animate-pulse" style={{ color: BUILDER_MUTED }}>
                        Multi-agent pipeline running…
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
                <SandpackProvider
                  template="react-ts"
                  theme="dark"
                  files={{ "/App.tsx": code }}
                  customSetup={{ dependencies: { "lucide-react": "latest", "tailwindcss": "latest" } }}
                >
                  <MonacoSync code={code} setCode={setCode} />
                  <div className="flex flex-col flex-1 min-h-0 overflow-hidden h-full">
                    <div className="flex-1 min-h-0 relative overflow-hidden" style={{ backgroundColor: BUILDER_BG }}>
                      {activeTabId === "preview" && (
                        <div className="absolute inset-0 flex flex-col" style={{ backgroundColor: BUILDER_BG }}>
                          <div
                            className="flex-none h-8 flex items-center px-4"
                            style={{ backgroundColor: BUILDER_ACCENT, borderBottom: `1px solid ${BUILDER_BORDER}` }}
                          >
                            <span className="text-xs font-medium" style={{ color: BUILDER_MUTED }}>Live Preview</span>
                          </div>
                          <div className="absolute top-8 left-0 right-0 bottom-0 w-full" style={{ backgroundColor: BUILDER_BG }}>
                            <SandpackPreview showOpenInCodeSandbox={false} showRefreshButton={true} style={{ height: "100%", width: "100%" }} />
                          </div>
                          {!paidStatus.paid && (
                            <div
                              className="absolute bottom-2 right-2 text-sm px-2 py-1 rounded pointer-events-none select-none z-10"
                              style={{
                                color: BUILDER_MUTED,
                                backgroundColor: "rgba(8,26,46,0.92)",
                                border: `1px solid ${BUILDER_BORDER}`,
                              }}
                            >
                              Kyn Sandbox – Upgrade for full access
                            </div>
                          )}
                        </div>
                      )}
                      {activeTabId === "/App.tsx" && (
                        <div className="absolute inset-0 w-full" style={{ backgroundColor: BUILDER_BG }}>
                          <Editor
                            height="100%"
                            defaultLanguage="typescript"
                            theme="vs-dark"
                            value={code}
                            onChange={(val) => setCode(val ?? "")}
                            options={{
                              minimap: { enabled: false },
                              fontSize: 14,
                              wordWrap: "on",
                              padding: { top: 16 },
                              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            }}
                          />
                        </div>
                      )}
                    </div>
                    {terminalOpen ? (
                      <BuilderBottomPanel
                        bottomPanelTab={bottomPanelTab}
                        setBottomPanelTab={setBottomPanelTab}
                        setTerminalOpen={setTerminalOpen}
                        logs={[]}
                        listening={listening}
                        transcript={typeof transcript === "string" ? transcript : ""}
                        sandpackConsole={
                          <div className="h-full min-h-0 overflow-auto" style={{ backgroundColor: BUILDER_BG }}>
                            <SandpackConsole
                              showHeader={false}
                              showSyntaxError
                              showSetupProgress
                              showRestartButton={false}
                              showResetConsoleButton
                              className="h-full min-h-0 !bg-transparent text-[11px] text-[#a8b0c0]"
                            />
                          </div>
                        }
                      />
                    ) : null}
                  </div>
                </SandpackProvider>
                </div>
              </div>
              <BuilderStatusBar terminalOpen={terminalOpen} setTerminalOpen={setTerminalOpen} paidStatus={paidStatus} />
            </>
          ) : (
            <>
              <div className="flex-1 min-h-0 relative overflow-hidden" style={{ backgroundColor: BUILDER_BG }}>
                <div className="absolute inset-0 w-full" style={{ backgroundColor: BUILDER_BG }}>
                  <Editor
                    height="100%"
                    defaultLanguage="json"
                    theme="vs-dark"
                    value={packageJsonContent}
                    onChange={(val) => setPackageJsonContent(val ?? "")}
                    options={{ minimap: { enabled: false }, fontSize: 14, wordWrap: "on", padding: { top: 16 } }}
                  />
                </div>
              </div>
              {terminalOpen ? (
                <BuilderBottomPanel
                  bottomPanelTab={bottomPanelTab}
                  setBottomPanelTab={setBottomPanelTab}
                  setTerminalOpen={setTerminalOpen}
                  logs={logs}
                  listening={listening}
                  transcript={typeof transcript === "string" ? transcript : ""}
                />
              ) : null}
              <BuilderStatusBar terminalOpen={terminalOpen} setTerminalOpen={setTerminalOpen} paidStatus={paidStatus} />
            </>
          )}
        </div>
          </>
        )}
      </div>

      <div
        ref={chatPanelRef}
        id="builder-chat-panel"
        className="flex flex-col shrink-0 min-h-0"
        style={{
          width: chatPanelW,
          minWidth: 260,
          maxWidth: 720,
          minHeight: 200,
          maxHeight: "100%",
          resize: "both",
          overflow: "auto",
          boxSizing: "border-box",
          backgroundColor: BUILDER_BG,
          borderLeft: `1px solid ${BUILDER_BORDER}`,
        }}
      >
        <div
          className="p-2 flex flex-col gap-2 shrink-0"
          style={{ borderBottom: `1px solid ${BUILDER_BORDER}`, backgroundColor: BUILDER_ACCENT }}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#a8b0c0" }}>
              Chat
            </span>
            <Code2 size={14} style={{ color: BUILDER_MUTED }} aria-hidden />
          </div>
          <div className="flex rounded overflow-hidden min-h-[32px]" style={{ border: `1px solid ${BUILDER_BORDER}` }}>
            <button
              type="button"
              onClick={() => persistInteractionMode("talk")}
              className="flex-1 py-1.5 text-[10px] font-medium transition-colors"
              style={{
                backgroundColor: interactionMode === "talk" ? BUILDER_BG : "transparent",
                color: interactionMode === "talk" ? "#a8b0c0" : BUILDER_MUTED,
              }}
            >
              Talk
            </button>
            <button
              type="button"
              onClick={() => persistInteractionMode("code")}
              className="flex-1 py-1.5 text-[10px] font-medium transition-colors"
              style={{
                backgroundColor: interactionMode === "code" ? BUILDER_BG : "transparent",
                color: interactionMode === "code" ? "#a8b0c0" : BUILDER_MUTED,
              }}
            >
              Code
            </button>
          </div>
          <p className="text-[9px] leading-tight" style={{ color: BUILDER_MUTED }}>
            Code + bug on → chained Code &amp; Deploy agents. Talk → chat only. Drag the <strong className="text-[#a8b0c0] font-normal">bottom-right</strong> grip on
            sidebar, terminal, chat, or bottom panel to resize.
          </p>
        </div>
        <div className="flex-1 flex flex-col min-h-0" {...getRootProps()}>
          <input {...getInputProps()} />
          <input ref={fileInputRef} type="file" className="hidden" accept="*/*" onChange={handleFileSelect} />
          <div
            className={`flex-1 overflow-auto p-3 space-y-3 ${isDragActive ? "rounded" : ""}`}
            style={
              isDragActive
                ? { backgroundColor: "rgba(8,26,46,0.5)", boxShadow: `0 0 0 1px ${BUILDER_BORDER}` }
                : undefined
            }
          >
            {chatMessages.map((msg) => (
              <div key={msg.id} className="group">
                <div className="text-xs mb-0.5" style={{ color: BUILDER_MUTED }}>
                  {msg.role === "user" ? "You" : "Assistant"}
                </div>
                <div className="text-sm select-text break-words pr-8" style={{ color: "#a8b0c0" }}>
                  {msg.content}
                </div>
                {msg.images && msg.images.length > 0 && (
                  <div className="mt-3 flex flex-col gap-2">
                    {msg.images.map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt="Generated UI mockup"
                        loading="lazy"
                        className="rounded-lg max-w-full border"
                        style={{ border: `1px solid ${BUILDER_BORDER}`, backgroundColor: BUILDER_BG }}
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
                    className="p-1 rounded hover:opacity-90"
                    style={{ color: BUILDER_MUTED }}
                    title="Copy"
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(window.location.href);
                    }}
                    className="p-1 rounded hover:opacity-90"
                    style={{ color: BUILDER_MUTED }}
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
            <div
              className="px-3 py-2 shrink-0"
              style={{ borderTop: `1px solid ${BUILDER_BORDER}`, backgroundColor: BUILDER_ACCENT }}
            >
              <div className="text-xs mb-1" style={{ color: BUILDER_MUTED }}>
                Live transcription
              </div>
              <div className="text-sm italic select-text" style={{ color: "#a8b0c0" }}>
                {transcript || "..."}
              </div>
            </div>
          )}
          <div
            className="flex-shrink-0 p-2"
            style={{ borderTop: `1px solid ${BUILDER_BORDER}`, backgroundColor: BUILDER_ACCENT }}
            onClick={(e) => e.stopPropagation()}
          >
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
                className={`flex-1 min-w-0 px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500/30 placeholder:text-[#6C7286] ${readOnly ? "opacity-60 cursor-not-allowed" : ""}`}
                style={{
                  backgroundColor: BUILDER_BG,
                  border: `1px solid ${BUILDER_BORDER}`,
                  color: "#a8b0c0",
                }}
                disabled={readOnly}
                title={readOnly ? "Upgrade for full access" : undefined}
                ref={chatInputDomRef}
              />
              <button
                onClick={handleSendText}
                disabled={!chatInput.trim() || readOnly}
                className="w-8 h-8 flex items-center justify-center rounded-full disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 hover:opacity-90"
                style={{ backgroundColor: "#0e3a4a", color: "#a8b0c0", border: "1px solid #164e60" }}
                title={readOnly ? "Upgrade for full access" : "Send"}
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
        {/* Bottom toolbar: mic, Grok reads aloud, upload, copy */}
        <div
          className="flex-shrink-0 flex items-center justify-center gap-4 py-1.5 px-3"
          style={{ borderTop: `1px solid ${BUILDER_BORDER}`, backgroundColor: BUILDER_ACCENT }}
        >
          <button
            type="button"
            onClick={handleMicToggle}
            disabled={readOnly || browserSupportsSpeechRecognition === false}
            className={`p-2 rounded-md transition-colors shrink-0 ${
              readOnly || browserSupportsSpeechRecognition === false ? "opacity-60 cursor-not-allowed" : ""
            } ${listening ? "text-red-400 bg-red-500/12 border border-red-500/25" : ""}`}
            style={!listening && !(readOnly || browserSupportsSpeechRecognition === false) ? { color: BUILDER_MUTED } : undefined}
            title={
              readOnly
                ? "Upgrade for full access"
                : browserSupportsSpeechRecognition === false
                  ? "Speech recognition not supported in this browser (try Chrome)"
                  : isMicrophoneAvailable === false
                    ? "Mic: click to request access (allow in browser prompt if shown)"
                    : listening
                      ? "Tap to stop and send"
                      : "Speak to text — uses browser speech recognition (Chrome recommended)"
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
            className={`p-2 rounded-md transition-colors shrink-0 ${grokSpeaks ? "border border-cyan-500/35" : ""}`}
            style={
              grokSpeaks
                ? { color: "#a8b0c0", backgroundColor: BUILDER_BG, border: "1px solid rgba(34,211,238,0.35)" }
                : { color: BUILDER_MUTED }
            }
            title="Read replies with Grok Eve: /api/tts → xAI /v1/tts (same key as chat). No robot voice fallback."
          >
            {grokSpeaks ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
            className="p-2 rounded-md transition-colors shrink-0 hover:opacity-90"
            style={{ color: BUILDER_MUTED }}
            title="Upload file"
          >
            <Paperclip size={16} />
          </button>
          {projectId ? (
            <Link
              to={`/project/${projectId}/locked-summary`}
              className="p-2 rounded-md transition-colors shrink-0 hover:opacity-90"
              style={{ color: BUILDER_MUTED }}
              title="Locked Spec"
            >
              <FileText size={16} />
            </Link>
          ) : null}
          <button
            onClick={handleCopyLast}
            disabled={!paidStatus.paid}
            className={`p-2 rounded-md transition-colors shrink-0 hover:opacity-90 ${
              paidStatus.paid ? "" : "opacity-60 cursor-not-allowed"
            }`}
            style={{ color: paidStatus.paid ? BUILDER_MUTED : `${BUILDER_MUTED}99` }}
            title={paidStatus.paid ? "Copy last reply" : "Upgrade to Pro to copy last reply"}
          >
            <Copy size={16} />
          </button>
        </div>
      </div>
        </div>
      </div>

      {/* Narrow / zoomed-in: chat is off-screen to the right — same as scrolling this row sideways */}
      <button
        type="button"
        onClick={scrollBuilderToChat}
        className="fixed bottom-24 right-4 z-[55] flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-white shadow-lg shadow-black/40 hover:bg-primary/90 xl:hidden"
        title="Open Grok chat (on small windows it’s to the right — scroll or tap here)"
      >
        <MessageSquare size={18} aria-hidden />
        Chat
      </button>

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
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: "rgba(2,12,23,0.88)" }}
          onClick={() => setShowGrokKeyModal(false)}
        >
          <div
            className="rounded-lg p-4 w-80 shadow-xl"
            style={{ backgroundColor: BUILDER_ACCENT, border: `1px solid ${BUILDER_BORDER}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm mb-3" style={{ color: "#a8b0c0" }}>Grok isn’t available. Set XAI_API_KEY (or GROK_API_KEY) in your backend .env to enable chat.</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowGrokKeyModal(false)}
                className="px-3 py-2 rounded text-sm"
                style={{ color: "#a8b0c0", border: `1px solid ${BUILDER_BORDER}` }}
              >
                Close
              </button>
              <Link to="/settings" onClick={() => setShowGrokKeyModal(false)} className="px-3 py-2 rounded bg-primary text-white text-sm">Open Settings</Link>
            </div>
          </div>
        </div>
      )}

      {/* Rate limit modal: 429 too many requests */}
      {rateLimitModalOpen && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: "rgba(2,12,23,0.88)" }}
          onClick={() => rateLimitCountdown <= 0 && setRateLimitModalOpen(false)}
        >
          <div
            className="rounded-lg p-4 w-72 shadow-xl"
            style={{ backgroundColor: BUILDER_ACCENT, border: `1px solid ${BUILDER_BORDER}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-medium" style={{ color: "#a8b0c0" }}>Too many requests</span>
              {rateLimitCountdown <= 0 ? (
                <button onClick={() => setRateLimitModalOpen(false)} className="p-1 rounded text-muted hover:text-white hover:bg-[#2d3f4f]">
                  <X size={16} />
                </button>
              ) : null}
            </div>
            <p className="text-sm mb-3" style={{ color: "#a8b0c0" }}>
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
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: "rgba(2,12,23,0.88)" }}
          onClick={() => setUpgradeModalOpen(false)}
        >
          <div
            className="rounded-lg p-4 w-72 shadow-xl"
            style={{ backgroundColor: BUILDER_ACCENT, border: `1px solid ${BUILDER_BORDER}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-medium" style={{ color: "#a8b0c0" }}>Upgrade to deploy</span>
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
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: "rgba(2,12,23,0.88)" }}
          onClick={() => {
            setShowCreateProjectModal(false);
            setNewProjectName("");
          }}
        >
          <div
            className="rounded-lg p-4 w-80 shadow-xl"
            style={{ backgroundColor: BUILDER_ACCENT, border: `1px solid ${BUILDER_BORDER}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-medium" style={{ color: "#a8b0c0" }}>New project</span>
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
              className="w-full px-3 py-2 rounded placeholder:text-[#6c7286] focus:outline-none focus:ring-1 focus:ring-cyan-900/40 text-sm mb-4 text-[#a8b0c0]"
              style={{ backgroundColor: BUILDER_BG, border: `1px solid ${BUILDER_BORDER}` }}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreateProjectModal(false);
                  setNewProjectName("");
                }}
                className="px-3 py-2 rounded text-sm"
                style={{ color: "#a8b0c0", border: `1px solid ${BUILDER_BORDER}` }}
              >
                Cancel
              </button>
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
      <UpgradeBubble show={!paidStatus.paid} message="Upgrade to Pro for unlimited" />
    </div>
  );
}

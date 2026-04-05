import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, useSearchParams, useLocation, Link } from "react-router-dom";
import {
  Play, Square, Terminal as TerminalIcon, Layout,
  Mic, MicOff, Settings, FileCode, Github,
  X, Maximize2, Minimize2, Eye, Network, Copy, Link2, Paperclip, Send, Download, AlertCircle, FileText,
  Plus, FolderOpen, MessageSquare, Bug, Code2, AudioWaveform,
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
import { getGrokModelAndMode } from "../lib/grokModelSelection.js";
import { formatGrokErrorForChat } from "../lib/grokApiError";
import { playGrokTts } from "../lib/grokVoiceAgent";
import { extractUiGeneratePrompt } from "../lib/uiGenerateIntent";
import UpgradeProModal, { logFreeTierAttempt } from "../components/UpgradeProModal";
import UpgradeBubble from "../components/UpgradeBubble";
import { NebullaLogo } from "../components/NebullaLogo";
import { runBuilderAgentChain } from "../lib/builderAgentChain";
import { loadAgentTaskMemory } from "../lib/multiAgentMemory";
import { lockedDesignSystemDirective } from "../nebulla-workspace/lockedDesignStorage";

function stitchGeneratePromptWithLockedStyle(base: string): string {
  const lock = lockedDesignSystemDirective();
  return lock ? `${base.trim()}\n\n${lock}` : base.trim();
}

/** Builder — Celestial Fluidity: tonal layers + soft separators (see src/index.css). Layout unchanged. */
const BUILDER_BG = "var(--celestial-surface)";
const BUILDER_ACCENT = "var(--celestial-surface-container-high)";
const BUILDER_MUTED = "var(--celestial-on-surface-muted)";
const BUILDER_BORDER = "var(--celestial-separator-soft)";
const BUILDER_TEXT = "var(--celestial-on-surface)";
const BUILDER_TEXT_BRIGHT = "var(--celestial-on-surface-bright)";
const BUILDER_RADIUS = "0.75rem";
const BUILDER_RADIUS_LG = "1.25rem";

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
              color: bottomPanelTab === "terminal" ? BUILDER_TEXT : BUILDER_MUTED,
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
              color: bottomPanelTab === "output" ? BUILDER_TEXT : BUILDER_MUTED,
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
              color: bottomPanelTab === "problems" ? BUILDER_TEXT : BUILDER_MUTED,
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
      <div className="flex-1 overflow-hidden flex flex-col min-h-0 font-mono text-sm" style={{ color: BUILDER_TEXT }}>
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
                  Nebulla activity
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
          <span className="flex items-center gap-1 text-[color:var(--celestial-on-surface)]">
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
          style={{ color: BUILDER_TEXT }}
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
      <h1>Hello from Nebulla Builder</h1>
      <p>Start editing to see some magic happen!</p>
    </div>
  );
}`);
  
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [bottomPanelTab, setBottomPanelTab] = useState<BottomPanelTabId>("terminal");
  const [logs, setLogs] = useState<string[]>(["[nebulla] Builder initialized.", "[nebulla] Ready for VETR loop (Verify, Explain, Trace, Repair)."]);
  type TabId = 'preview' | '/App.tsx' | '/package.json';
  const [openTabs, setOpenTabs] = useState<TabId[]>(['preview', '/App.tsx']);
  const [activeTabId, setActiveTabId] = useState<TabId>('preview');
  const [packageJsonContent, setPackageJsonContent] = useState(`{
  "name": "nebulla-app",
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
  /** Server uses heuristics on the message (no manual Talk/Code switch). */
  const INTERACTION_MODE = "auto" as const;
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
  /**
   * Grok voice: Eve TTS + browser STT. Hands-free: open → listen immediately; pause ~2s → auto-send; tap mic to end.
   * Press-hold mode: hold mic, release to send. Mute stops listening; say "mute" / "unmute" or use Mute button.
   */
  const [voiceModeOpen, setVoiceModeOpen] = useState(() => {
    try {
      const v = localStorage.getItem("kyn_voice_mode");
      if (v === "1") return true;
      if (v === "0") return false;
      return false;
    } catch {
      return false;
    }
  });
  const voiceModeOpenRef = useRef(voiceModeOpen);
  useEffect(() => {
    voiceModeOpenRef.current = voiceModeOpen;
  }, [voiceModeOpen]);
  /** True while Grok TTS (Eve) audio is actually playing — makes “voice” obvious in the UI. */
  const [grokSpeaking, setGrokSpeaking] = useState(false);
  /** True while POST /api/agent/chat (or multi-agent) is in flight — shows “thinking”. */
  const [grokPending, setGrokPending] = useState(false);
  const grokPendingRef = useRef(false);
  useEffect(() => {
    grokPendingRef.current = grokPending;
  }, [grokPending]);
  /** Mic muted: session can stay open but we do not listen / auto-send. */
  const [voiceMicMuted, setVoiceMicMuted] = useState(false);
  const voiceMicMutedRef = useRef(false);
  useEffect(() => {
    voiceMicMutedRef.current = voiceMicMuted;
  }, [voiceMicMuted]);
  /** continuous = hands-free + silence auto-send; push_to_talk = hold mic, release to send. */
  const [voiceCaptureMode, setVoiceCaptureMode] = useState<"continuous" | "push_to_talk">(() => {
    try {
      return localStorage.getItem("kyn_voice_capture_mode") === "push_to_talk" ? "push_to_talk" : "continuous";
    } catch {
      return "continuous";
    }
  });
  const voiceCaptureModeRef = useRef(voiceCaptureMode);
  useEffect(() => {
    voiceCaptureModeRef.current = voiceCaptureMode;
  }, [voiceCaptureMode]);
  const pttPointerActiveRef = useRef(false);
  const pttConsumeClickRef = useRef(false);
  /** UI only: PTT button actively held (refs don’t re-render). */
  const [pttHolding, setPttHolding] = useState(false);
  const [chatAutoScroll, setChatAutoScroll] = useState(() => {
    try {
      return localStorage.getItem("kyn_chat_autoscroll") !== "0";
    } catch {
      return true;
    }
  });
  const chatThreadRef = useRef<HTMLDivElement>(null);
  const prevGrokSpeakingRef = useRef(false);
  const grokSpeakingRef = useRef(false);
  useEffect(() => {
    grokSpeakingRef.current = grokSpeaking;
  }, [grokSpeaking]);
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

  const VOICE_SILENCE_MS = 2000;
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptRef = useRef("");
  const submitVoiceRef = useRef<(spoken: string) => void>(() => {});
  const prevGrokPendingForMicRef = useRef(false);

  useEffect(() => {
    transcriptRef.current = typeof transcript === "string" ? transcript : "";
  }, [transcript]);

  const closeVoiceSession = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    try {
      SpeechRecognition.stopListening();
    } catch {
      /* ignore */
    }
    resetTranscript();
    grokAudioRef.current?.pause();
    grokAudioRef.current = null;
    setGrokSpeaking(false);
    setVoiceModeOpen(false);
    setVoiceMicMuted(false);
    pttPointerActiveRef.current = false;
    setPttHolding(false);
    pttConsumeClickRef.current = false;
    try {
      localStorage.setItem("kyn_voice_mode", "0");
    } catch {
      /* ignore */
    }
    setLogs((prev) => [...prev, "[Voice]: Session ended."]);
  };

  const openVoiceSession = () => {
    void (async () => {
      setVoiceModeOpen(true);
      setVoiceMicMuted(false);
      try {
        localStorage.setItem("kyn_voice_mode", "1");
      } catch {
        /* ignore */
      }
      resetTranscript();
      try {
        if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((t) => t.stop());
        }
      } catch (e) {
        setLogs((prev) => [
          ...prev,
          `[Voice]: Microphone permission denied — ${e instanceof Error ? e.message : String(e)}`,
        ]);
        closeVoiceSession();
        return;
      }
      const mode = voiceCaptureModeRef.current;
      try {
        if (mode === "continuous") {
          await SpeechRecognition.startListening({
            continuous: true,
            interimResults: true,
            language: "en-US",
          });
          setLogs((prev) => [
            ...prev,
            `[Voice]: Listening — pause ~${VOICE_SILENCE_MS / 1000}s after speaking to send. Tap mic to end. Say "stop listening" to end.`,
          ]);
        } else {
          setLogs((prev) => [
            ...prev,
            "[Voice]: Hold mic, speak, release to send. Tap mic when finished to close.",
          ]);
        }
      } catch (e2) {
        setLogs((prev) => [
          ...prev,
          `[Voice]: Could not start speech recognition — ${e2 instanceof Error ? e2.message : String(e2)}`,
        ]);
        closeVoiceSession();
      }
    })();
  };

  useEffect(() => {
    return () => {
      grokAudioRef.current?.pause();
      grokAudioRef.current = null;
      try {
        SpeechRecognition.stopListening();
      } catch {
        /* ignore */
      }
    };
  }, []);

  /**
   * After Grok reasons via POST /api/agent/chat → xAI /v1/chat/completions, speak the reply with Eve:
   * POST /api/tts → xAI /v1/tts (same key). No browser SpeechSynthesis robot voice.
   */
  const speakWithGrokEve = (text: string, force?: boolean) => {
    if (typeof window === "undefined" || !text?.trim()) return;
    if (!force && !voiceModeOpenRef.current) return;
    void (async () => {
      const base = getApiBase() || "";
      if (!base) {
        setLogs((prev) => [...prev, "[TTS]: Set backend URL — Eve playback needs POST /api/tts."]);
        return;
      }
      try {
        grokAudioRef.current?.pause();
        setGrokSpeaking(false);
        const ok = await playGrokTts(base, text, {
          voice_id: "eve",
          audioElementRef: grokAudioRef,
          onPlayingChange: setGrokSpeaking,
        });
        if (!ok) {
          setGrokSpeaking(false);
          setLogs((prev) => [
            ...prev,
            "[TTS]: Grok Eve failed after retries — check xAI key, TTS permission, and /api/tts.",
          ]);
          if (voiceModeOpenRef.current) {
            window.setTimeout(() => {
              if (
                grokSpeakingRef.current ||
                !voiceModeOpenRef.current ||
                voiceMicMutedRef.current ||
                voiceCaptureModeRef.current !== "continuous"
              )
                return;
              void SpeechRecognition.startListening({
                continuous: true,
                interimResults: true,
                language: "en-US",
              }).catch(() => {});
            }, 400);
          }
        }
      } catch {
        setGrokSpeaking(false);
        setLogs((prev) => [...prev, "[TTS]: Grok Eve error — check /api/tts and network."]);
        if (voiceModeOpenRef.current) {
          window.setTimeout(() => {
            if (
              grokSpeakingRef.current ||
              !voiceModeOpenRef.current ||
              voiceMicMutedRef.current ||
              voiceCaptureModeRef.current !== "continuous"
            )
              return;
            void SpeechRecognition.startListening({
              continuous: true,
              interimResults: true,
              language: "en-US",
            }).catch(() => {});
          }, 400);
        }
      }
    })();
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
    setGrokPending(true);
    const userId = await getUserId();
    const apiBase = getApiBase() || "";

    try {
    const routeMessages = [
      ...chatMessages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: newUserContent },
    ];
    const routeToCodeAgent = getGrokModelAndMode(routeMessages).codingMode;

    if (projectId && agentDebugEnabled && routeToCodeAgent && apiBase) {
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
        if (voiceModeOpenRef.current) speakWithGrokEve(assistantText);
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
    addLog(`[Grok]: Sending to agent (auto — ${routeToCodeAgent ? "code" : "chat"} heuristic)…`);
    try {
      const res = await fetch(`${apiBase || ""}/api/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getBackendSecretHeaders() },
        body: JSON.stringify({
          messages,
          userId,
          projectId: projectId ?? undefined,
          interactionMode: INTERACTION_MODE,
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
      if (voiceModeOpenRef.current) speakWithGrokEve(content);
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
    } finally {
      setGrokPending(false);
    }
  };

  /** Voice: after silence, auto-send (hands-free). Voice commands: stop / mute / unmute. */
  submitVoiceRef.current = (spoken: string) => {
    const t = spoken.trim();
    if (!t) return;
    if (/^(stop listening|end chat|stop voice|close voice|quit voice)$/i.test(t)) {
      closeVoiceSession();
      return;
    }
    if (/^mute\b/i.test(t) && t.length < 28) {
      setVoiceMicMuted(true);
      try {
        SpeechRecognition.stopListening();
      } catch {
        /* ignore */
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      resetTranscript();
      setLogs((prev) => [...prev, '[Voice]: Muted — tap "Mic on" or say "unmute".']);
      return;
    }
    if (/^unmute\b/i.test(t) && t.length < 28) {
      setVoiceMicMuted(false);
      if (
        voiceModeOpenRef.current &&
        voiceCaptureModeRef.current === "continuous" &&
        !grokSpeakingRef.current &&
        !grokPendingRef.current
      ) {
        void SpeechRecognition.startListening({
          continuous: true,
          interimResults: true,
          language: "en-US",
        }).catch(() => {});
      }
      setLogs((prev) => [...prev, "[Voice]: Unmuted."]);
      return;
    }
    addLog(`[Voice Input]: ${t}`);
    addLog(`[Grok]: Analyzing request...`);
    SpeechRecognition.stopListening();
    resetTranscript();
    const userMsg = { id: crypto.randomUUID(), role: "user" as const, content: t };
    setChatMessages((prev) => {
      const next = [...prev, userMsg];
      void saveProject({ chat_messages: next });
      return next;
    });
    const uiPrompt = extractUiGeneratePrompt(t);
    if (uiPrompt) {
      void (async () => {
        try {
          const userId = await getUserId();
          const res = await fetch(`${getApiBase()}/api/stitch/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getBackendSecretHeaders() },
            body: JSON.stringify({ prompt: stitchGeneratePromptWithLockedStyle(uiPrompt), userId }),
          });
          const data = await res.json().catch(() => ({})) as { code?: string; error?: string; placeholder?: boolean };
          if (res.ok && data.code) {
            const code = data.code.trim();
            if (code.includes("```")) {
              applyCodeFromContent(code, setCode, setPackageJsonContent);
            } else {
              setCode(code);
            }
            const kynContent = "Here's the UI from Google Stitch — check the preview. Want me to refine it, add state/logic, or tweak the design?";
            const builderMsg = { id: crypto.randomUUID(), role: "assistant" as const, content: kynContent };
            setChatMessages((prev) => {
              const next = [...prev, builderMsg];
              void saveProject({ chat_messages: next });
              return next;
            });
            if (voiceModeOpenRef.current) speakWithGrokEve(kynContent);
          } else if (data.error && !data.placeholder) {
            const errMsg = { id: crypto.randomUUID(), role: "assistant" as const, content: `UI generation: ${data.error}` };
            setChatMessages((prev) => {
              const next = [...prev, errMsg];
              void saveProject({ chat_messages: next });
              return next;
            });
          } else if (!res.ok) {
            const fallback = `UI generation failed (HTTP ${res.status}). Check Backend URL and Stitch API key in Settings.`;
            const errMsg = { id: crypto.randomUUID(), role: "assistant" as const, content: fallback };
            setChatMessages((prev) => {
              const next = [...prev, errMsg];
              void saveProject({ chat_messages: next });
              return next;
            });
          } else {
            const noCodeMsg = { id: crypto.randomUUID(), role: "assistant" as const, content: "UI generation returned no code. Try again or rephrase your request." };
            setChatMessages((prev) => {
              const next = [...prev, noCodeMsg];
              void saveProject({ chat_messages: next });
              return next;
            });
          }
        } catch (_) {}
      })();
    }
    sendToGrok(t);
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

    // If user asked for UI/layout/design, call Google Stitch (POST /api/stitch/generate) and apply generated code
    const uiPrompt = extractUiGeneratePrompt(text);
    if (uiPrompt) {
      (async () => {
        try {
          const userId = await getUserId();
          const res = await fetch(`${getApiBase()}/api/stitch/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getBackendSecretHeaders() },
            body: JSON.stringify({ prompt: stitchGeneratePromptWithLockedStyle(uiPrompt), userId }),
          });
              const data = await res.json().catch(() => ({})) as { code?: string; error?: string; placeholder?: boolean };
              if (res.ok && data.code) {
                const code = data.code.trim();
                if (code.includes("```")) {
                  applyCodeFromContent(code, setCode, setPackageJsonContent);
                } else {
                  setCode(code);
                }
                const kynContent = "Here's the UI from Google Stitch — check the preview. Want me to refine it, add state/logic, or tweak the design?";
                const builderMsg = { id: crypto.randomUUID(), role: 'assistant' as const, content: kynContent };
                setChatMessages(prev => [...prev, builderMsg]);
                saveProject({ chat_messages: [...chatMessages, userMsg, builderMsg] });
                if (voiceModeOpenRef.current) speakWithGrokEve(kynContent);
              } else if (data.error && !data.placeholder) {
                const errMsg = { id: crypto.randomUUID(), role: 'assistant' as const, content: `UI generation: ${data.error}` };
                setChatMessages(prev => [...prev, errMsg]);
                saveProject({ chat_messages: [...chatMessages, userMsg, errMsg] });
              } else if (!res.ok) {
                const fallback = `UI generation failed (HTTP ${res.status}). Check Backend URL and Stitch API key in Settings.`;
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

  /** Tap mic: open + listen (hands-free) or full stop. PTT: hold mic, release to send (same button). */
  const handleWaveformButtonClick = () => {
    if (readOnly || browserSupportsSpeechRecognition === false) return;
    if (pttConsumeClickRef.current) {
      pttConsumeClickRef.current = false;
      return;
    }
    if (grokSpeaking) {
      grokAudioRef.current?.pause();
      grokAudioRef.current = null;
      setGrokSpeaking(false);
      return;
    }
    if (!voiceModeOpen) {
      openVoiceSession();
      return;
    }
    closeVoiceSession();
  };

  const handleMicPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (readOnly || browserSupportsSpeechRecognition === false) return;
    if (voiceCaptureMode !== "push_to_talk" || !voiceModeOpen || voiceMicMuted || grokSpeaking || grokPending) return;
    e.preventDefault();
    pttPointerActiveRef.current = true;
    setPttHolding(true);
    void SpeechRecognition.startListening({
      continuous: true,
      interimResults: true,
      language: "en-US",
    }).catch(() => {});
  };

  const handleMicPointerUp = () => {
    if (voiceCaptureMode !== "push_to_talk" || !voiceModeOpen) return;
    if (!pttPointerActiveRef.current) return;
    pttPointerActiveRef.current = false;
    setPttHolding(false);
    pttConsumeClickRef.current = true;
    const spoken = (transcriptRef.current || "").trim();
    try {
      SpeechRecognition.stopListening();
    } catch {
      /* ignore */
    }
    resetTranscript();
    if (spoken) {
      submitVoiceRef.current(spoken);
    }
  };

  const toggleVoiceMicMuted = () => {
    setVoiceMicMuted((m) => {
      const next = !m;
      if (next) {
        try {
          SpeechRecognition.stopListening();
        } catch {
          /* ignore */
        }
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
        resetTranscript();
      } else if (voiceModeOpen && voiceCaptureMode === "continuous" && !grokSpeaking && !grokPending) {
        void SpeechRecognition.startListening({
          continuous: true,
          interimResults: true,
          language: "en-US",
        }).catch(() => {});
      }
      return next;
    });
  };

  /** After silence (hands-free only), auto-send. */
  useEffect(() => {
    if (
      !voiceModeOpen ||
      !listening ||
      grokSpeaking ||
      grokPending ||
      voiceMicMuted ||
      voiceCaptureMode !== "continuous"
    ) {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      return;
    }
    const text = (transcript || "").trim();
    if (!text) return;

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      silenceTimerRef.current = null;
      const spoken = (transcriptRef.current || "").trim();
      if (!spoken || !voiceModeOpenRef.current) return;
      submitVoiceRef.current(spoken);
    }, VOICE_SILENCE_MS);

    return () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    };
  }, [transcript, voiceModeOpen, listening, grokSpeaking, grokPending, voiceMicMuted, voiceCaptureMode]);

  /** While Grok TTS plays, stop the browser mic so it doesn’t transcribe Grok’s voice (feedback loop). */
  useEffect(() => {
    if (!voiceModeOpen || !grokSpeaking) return;
    if (listening) {
      SpeechRecognition.stopListening();
    }
  }, [voiceModeOpen, grokSpeaking, listening]);

  /** After Eve TTS finishes, resume the mic (only on grokSpeaking true → false; avoids racing chat return vs TTS start). */
  useEffect(() => {
    const ttsEnded = prevGrokSpeakingRef.current && !grokSpeaking;
    prevGrokSpeakingRef.current = grokSpeaking;
    if (!voiceModeOpen || readOnly || browserSupportsSpeechRecognition === false) return;
    if (!ttsEnded) return;
    if (listening || grokPending || voiceMicMutedRef.current || voiceCaptureModeRef.current !== "continuous") return;
    const id = window.setTimeout(() => {
      if (
        !voiceModeOpenRef.current ||
        grokSpeakingRef.current ||
        grokPending ||
        voiceMicMutedRef.current ||
        voiceCaptureModeRef.current !== "continuous"
      )
        return;
      void SpeechRecognition.startListening({
        continuous: true,
        interimResults: true,
        language: "en-US",
      }).catch(() => {});
    }, 400);
    return () => clearTimeout(id);
  }, [voiceModeOpen, grokSpeaking, grokPending, listening, readOnly, browserSupportsSpeechRecognition]);

  /** After chat returns without Eve audio, resume mic for the next voice turn. */
  useEffect(() => {
    const agentDone = prevGrokPendingForMicRef.current && !grokPending;
    prevGrokPendingForMicRef.current = grokPending;
    if (!voiceModeOpen || readOnly || browserSupportsSpeechRecognition === false) return;
    if (!agentDone) return;
    if (grokSpeaking || voiceMicMuted || voiceCaptureMode !== "continuous") return;
    const id = window.setTimeout(() => {
      if (
        !voiceModeOpenRef.current ||
        grokSpeakingRef.current ||
        grokPending ||
        voiceMicMutedRef.current ||
        voiceCaptureModeRef.current !== "continuous"
      )
        return;
      void SpeechRecognition.startListening({
        continuous: true,
        interimResults: true,
        language: "en-US",
      }).catch(() => {});
    }, 600);
    return () => clearTimeout(id);
  }, [grokPending, voiceModeOpen, grokSpeaking, readOnly, browserSupportsSpeechRecognition, voiceMicMuted, voiceCaptureMode]);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, msg]);
  };

  useEffect(() => {
    if (!chatAutoScroll) return;
    const el = chatThreadRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
  }, [chatMessages, transcript, grokPending, grokSpeaking, listening, chatAutoScroll]);

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
    <div className="flex h-screen overflow-hidden font-sans flex-col" style={{ backgroundColor: BUILDER_BG, color: BUILDER_TEXT }}>
      <div
        ref={builderMainScrollRef}
        className="flex-1 min-h-0 min-w-0 overflow-x-auto overflow-y-hidden"
        style={{ backgroundColor: BUILDER_BG }}
      >
        <div className="flex min-h-0 h-full min-w-[60rem]" style={{ backgroundColor: BUILDER_BG }}>
      <div
        className="w-14 flex flex-col items-center py-3 z-10 shrink-0 backdrop-blur-md"
        style={{
          backgroundColor: "color-mix(in srgb, var(--celestial-surface-container-high) 88%, transparent)",
          boxShadow: `inset -1px 0 0 0 var(--celestial-ghost-border)`,
          borderRadius: `0 ${BUILDER_RADIUS_LG} ${BUILDER_RADIUS_LG} 0`,
        }}
      >
        <button
          type="button"
          className="mb-3 p-0 rounded-lg border-0 bg-transparent cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40"
          title="Nebulla"
          onClick={() => navigate("/builder")}
        >
          <NebullaLogo size={28} />
        </button>
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
            color: explorerOpen ? BUILDER_TEXT : BUILDER_MUTED,
            backgroundColor: explorerOpen ? "color-mix(in srgb, var(--celestial-surface) 55%, transparent)" : "transparent",
          }}
          title="Toggle explorer"
        >
          <FileCode size={22} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => openTab("preview")}
          className={`p-2 rounded-md mb-2 transition-colors ${activeTabId === "preview" ? "ring-1 ring-cyan-500/40" : ""}`}
          style={{ color: activeTabId === "preview" ? BUILDER_TEXT : BUILDER_MUTED }}
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
              backgroundColor: agentDebugEnabled ? "color-mix(in srgb, var(--celestial-surface) 55%, transparent)" : "transparent",
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
              <h1 className="text-xl font-medium text-center font-display tracking-tight" style={{ color: BUILDER_TEXT }}>
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
                  className="w-full px-4 py-3 rounded-2xl placeholder:text-[color:var(--celestial-on-surface-muted)] focus:outline-none focus:shadow-[0_0_0_1px_color-mix(in_srgb,var(--celestial-primary)_28%,transparent),0_0_20px_color-mix(in_srgb,var(--celestial-primary-dim)_14%,transparent)] text-[color:var(--celestial-on-surface)] bg-[color-mix(in_srgb,var(--celestial-surface-container-low)_90%,transparent)] shadow-[inset_0_-1px_0_0_var(--celestial-ghost-border)] border-0"
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
                  color: isActive ? BUILDER_TEXT : BUILDER_MUTED,
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
                    <p className="text-sm mb-4" style={{ color: BUILDER_TEXT }}>Connect GitHub and set your domain in Settings, then return here to use the preview and editor.</p>
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
                  <div className="flex-1 overflow-auto font-mono text-[11px] leading-relaxed p-2" style={{ color: BUILDER_TEXT }}>
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
                              Nebulla Sandbox – Upgrade for full access
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
                              className="h-full min-h-0 !bg-transparent text-[11px] text-[color:var(--celestial-on-surface)]"
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
          boxShadow: `inset 1px 0 0 0 var(--celestial-ghost-border)`,
          borderTopLeftRadius: BUILDER_RADIUS_LG,
          borderBottomLeftRadius: BUILDER_RADIUS_LG,
        }}
      >
        <div
          className="p-2 flex flex-col gap-2 shrink-0 celestial-glass-strong rounded-tl-[1.25rem]"
          style={{ borderBottom: `1px solid ${BUILDER_BORDER}` }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold font-display tracking-tight" style={{ color: BUILDER_TEXT_BRIGHT }}>
                  Grok
                </span>
                <span
                  className="text-[9px] px-1.5 py-px rounded-full font-medium uppercase tracking-wide font-display"
                  style={{
                    color: "var(--celestial-primary-dim)",
                    backgroundColor: "color-mix(in srgb, var(--celestial-primary) 12%, transparent)",
                    boxShadow: "0 0 0 1px color-mix(in srgb, var(--celestial-primary) 22%, transparent)",
                  }}
                >
                  Open chat
                </span>
              </div>
              <p className="text-[10px] leading-snug mt-1" style={{ color: BUILDER_MUTED }}>
                Voice: tap <strong className="text-[var(--celestial-primary)] font-normal">mic</strong> → listens right away (hands-free) or use <strong className="text-[var(--celestial-primary)] font-normal">Hold to send</strong>. Pause ~2s → auto-send. Eve speaks Grok’s reply. Tap mic again or say <strong className="text-[var(--celestial-primary)] font-normal">stop listening</strong> to end.
              </p>
              <label className="flex items-center gap-1.5 mt-2 cursor-pointer select-none text-[10px]" style={{ color: BUILDER_MUTED }}>
                <input
                  type="checkbox"
                  checked={chatAutoScroll}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setChatAutoScroll(on);
                    try {
                      localStorage.setItem("kyn_chat_autoscroll", on ? "1" : "0");
                    } catch {
                      /* ignore */
                    }
                  }}
                  className="rounded-xl border-0 bg-[var(--celestial-surface-container-low)] shadow-[inset_0_-1px_0_0_var(--celestial-ghost-border)]"
                />
                Smooth auto-scroll while chatting
              </label>
            </div>
            <Code2 size={14} className="shrink-0 mt-0.5" style={{ color: BUILDER_MUTED }} aria-hidden />
          </div>
          <p className="text-[9px] leading-tight" style={{ color: BUILDER_MUTED }}>
            Grok echoes what you want before building; say <strong className="text-[var(--celestial-primary)] font-normal">yes</strong> to proceed. Say <strong className="text-[var(--celestial-primary)] font-normal">mute</strong> / <strong className="text-[var(--celestial-primary)] font-normal">unmute</strong> or use the Mute control. Multi-agent runs when your message looks like a code task (debug chain on).
          </p>
        </div>
        <div className="flex-1 flex flex-col min-h-0" {...getRootProps()}>
          <input {...getInputProps()} />
          <input ref={fileInputRef} type="file" className="hidden" accept="*/*" onChange={handleFileSelect} />
          <div
            className={`flex-1 overflow-auto p-3 space-y-3 ${isDragActive ? "rounded-2xl" : ""}`}
            style={
              isDragActive
                ? {
                    backgroundColor: "color-mix(in srgb, var(--celestial-surface-container-high) 55%, transparent)",
                    boxShadow: "0 0 0 1px var(--celestial-ghost-outline)",
                  }
                : undefined
            }
          >
            {chatMessages.length === 0 && (
              <div
                className="rounded-2xl px-3 py-3 text-xs leading-relaxed"
                style={{
                  backgroundColor: "var(--celestial-surface-container-low)",
                  boxShadow: "0 0 0 1px var(--celestial-ghost-outline)",
                  color: BUILDER_MUTED,
                }}
              >
                <p className="font-medium mb-1 font-display" style={{ color: BUILDER_TEXT }}>
                  Start anywhere
                </p>
                <p>
                  Type here anytime, or tap the <span className="text-cyan-400/90">mic</span> — listening starts immediately; Grok answers with Eve’s voice. No extra Send for voice (pause after speaking).
                </p>
              </div>
            )}
            {chatMessages.map((msg) => (
              <div key={msg.id} className="group">
                <div className="text-xs mb-0.5" style={{ color: BUILDER_MUTED }}>
                  {msg.role === "user" ? "You" : "Grok"}
                </div>
                <div className="text-sm select-text break-words pr-8" style={{ color: BUILDER_TEXT }}>
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
              <div className="text-sm italic select-text" style={{ color: BUILDER_TEXT }}>
                {transcript || "..."}
              </div>
            </div>
          )}
          <div
            className="flex-shrink-0 p-2"
            style={{ borderTop: `1px solid ${BUILDER_BORDER}`, backgroundColor: BUILDER_ACCENT }}
            onClick={(e) => e.stopPropagation()}
          >
            {grokPending && (
              <div className="flex items-center gap-2 mb-2 text-xs" style={{ color: "#7dd3fc" }}>
                <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-pulse" aria-hidden />
                Grok is thinking…
              </div>
            )}
            {listening && !grokSpeaking && (
              <div className="flex items-center gap-2 mb-2 text-xs text-red-400">
                <span className="flex h-2 w-2 rounded-full bg-red-400 animate-pulse" aria-hidden />
                Listening…
              </div>
            )}
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!readOnly) handleSendText(); } }}
                placeholder={
                  readOnly
                    ? "Upgrade for full access"
                    : grokPending
                      ? "Grok is thinking…"
                      : listening && voiceCaptureMode === "continuous"
                        ? `Pause ~${VOICE_SILENCE_MS / 1000}s after speaking — auto-send`
                        : "Ask Grok anything…"
                }
                className={`celestial-input flex-1 min-w-0 px-3 py-2 text-sm placeholder:text-[color:var(--celestial-on-surface-muted)] ${readOnly ? "opacity-60 cursor-not-allowed" : ""}`}
                style={{
                  color: BUILDER_TEXT,
                }}
                disabled={readOnly}
                title={readOnly ? "Upgrade for full access" : undefined}
                ref={chatInputDomRef}
              />
              <button
                onClick={handleSendText}
                disabled={!chatInput.trim() || readOnly}
                className="w-8 h-8 flex items-center justify-center rounded-full disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 hover:opacity-90"
                style={{
                  background: "linear-gradient(135deg, color-mix(in srgb, var(--celestial-primary) 22%, var(--celestial-surface-container-high)) 0%, var(--celestial-surface-container-high) 100%)",
                  color: "#042028",
                  border: "none",
                  boxShadow: "0 0 0 1px var(--celestial-ghost-outline), 0 0 16px color-mix(in srgb, var(--celestial-primary) 15%, transparent)",
                }}
                title={readOnly ? "Upgrade for full access" : "Send"}
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
        {/* Grok-style: one waveform = voice session (mic + Eve). Paperclip = upload. */}
        <div
          className="flex-shrink-0 flex flex-col gap-1.5 py-1.5 px-3"
          style={{ borderTop: `1px solid ${BUILDER_BORDER}`, backgroundColor: BUILDER_ACCENT }}
        >
          {grokSpeaking && (
            <div
              className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px]"
              style={{ backgroundColor: "rgba(14,165,233,0.1)", border: "1px solid rgba(34,211,238,0.25)", color: "#a5f3fc" }}
              role="status"
              aria-live="polite"
            >
              <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-pulse shrink-0" aria-hidden />
              <span>
                <strong className="font-semibold text-cyan-100">Grok is speaking</strong>
                <span className="text-cyan-200/80"> — mic paused so it won’t pick up Eve</span>
              </span>
            </div>
          )}
          {voiceMicMuted && voiceModeOpen && (
            <div
              className="flex items-center gap-2 px-2 py-1 rounded-md text-[10px]"
              style={{ backgroundColor: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.35)", color: "#fcd34d" }}
              role="status"
            >
              <MicOff size={14} className="shrink-0" aria-hidden />
              <span>Mic muted — not listening. Tap Mute to unmute or say &quot;unmute&quot;.</span>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-center gap-2 px-1 pb-1">
            <label className="text-[10px] flex items-center gap-1" style={{ color: BUILDER_MUTED }}>
              <span className="sr-only">Input mode</span>
              <select
                value={voiceCaptureMode}
                onChange={(e) => {
                  const v = e.target.value === "push_to_talk" ? "push_to_talk" : "continuous";
                  setVoiceCaptureMode(v);
                  try {
                    localStorage.setItem("kyn_voice_capture_mode", v);
                  } catch {
                    /* ignore */
                  }
                  if (voiceModeOpen) {
                    try {
                      SpeechRecognition.stopListening();
                    } catch {
                      /* ignore */
                    }
                    resetTranscript();
                    if (silenceTimerRef.current) {
                      clearTimeout(silenceTimerRef.current);
                      silenceTimerRef.current = null;
                    }
                    if (v === "continuous" && !voiceMicMuted && !grokSpeaking && !grokPending) {
                      void SpeechRecognition.startListening({
                        continuous: true,
                        interimResults: true,
                        language: "en-US",
                      }).catch(() => {});
                    }
                  }
                }}
                className="rounded px-1.5 py-0.5 text-[10px] max-w-[9rem]"
                style={{ backgroundColor: BUILDER_BG, border: `1px solid ${BUILDER_BORDER}`, color: BUILDER_TEXT }}
              >
                <option value="continuous">Hands-free (pause → send)</option>
                <option value="push_to_talk">Hold mic → release to send</option>
              </select>
            </label>
          </div>
          <div className="flex items-center justify-center gap-4 sm:gap-5 flex-wrap">
          <button
            type="button"
            onClick={handleWaveformButtonClick}
            onPointerDown={handleMicPointerDown}
            onPointerUp={handleMicPointerUp}
            onPointerLeave={voiceCaptureMode === "push_to_talk" ? handleMicPointerUp : undefined}
            disabled={readOnly || browserSupportsSpeechRecognition === false}
            aria-pressed={voiceModeOpen}
            className={`flex flex-col items-center justify-center gap-0.5 min-w-[72px] px-3 py-2 rounded-full transition-all shrink-0 touch-none ${
              readOnly || browserSupportsSpeechRecognition === false ? "opacity-60 cursor-not-allowed" : "hover:opacity-95"
            } ${voiceModeOpen ? "ring-2 ring-cyan-500/50 shadow-[0_0_20px_rgba(34,211,238,0.15)]" : ""} ${
              voiceCaptureMode === "push_to_talk" && voiceModeOpen && pttHolding ? "ring-amber-400/60" : ""
            }`}
            style={{
              color: voiceModeOpen ? "#e0f2fe" : BUILDER_MUTED,
              backgroundColor: voiceModeOpen ? BUILDER_BG : "transparent",
              border: `1px solid ${voiceModeOpen ? "rgba(34,211,238,0.45)" : BUILDER_BORDER}`,
            }}
            title={
              readOnly
                ? "Upgrade for full access"
                : browserSupportsSpeechRecognition === false
                  ? "Speech recognition not supported (try Chrome)"
                  : isMicrophoneAvailable === false
                    ? "Allow microphone when prompted"
                    : !voiceModeOpen
                      ? "Tap: start voice — listens immediately (hands-free) or hold mic in Hold mode"
                      : voiceCaptureMode === "push_to_talk"
                        ? "Hold to speak, release to send. Tap when idle to end session."
                        : listening
                          ? `Listening — pause ~${VOICE_SILENCE_MS / 1000}s to auto-send`
                          : "Tap to end voice session"
            }
          >
            <AudioWaveform size={22} strokeWidth={voiceModeOpen ? 2.25 : 2} className={voiceModeOpen ? "text-cyan-300" : ""} aria-hidden />
            <span className="text-[10px] font-semibold tracking-wide">
              {!voiceModeOpen ? "Mic" : voiceCaptureMode === "push_to_talk" ? "Hold" : listening ? "Listening" : "On"}
            </span>
          </button>
          <button
            type="button"
            onClick={toggleVoiceMicMuted}
            disabled={!voiceModeOpen || readOnly}
            className={`flex flex-col items-center justify-center gap-0.5 min-w-[56px] px-2 py-2 rounded-lg transition-colors shrink-0 ${
              !voiceModeOpen || readOnly ? "opacity-40 cursor-not-allowed" : "hover:opacity-90"
            }`}
            style={{
              color: voiceMicMuted ? "#fbbf24" : BUILDER_MUTED,
              border: `1px solid ${voiceMicMuted ? "rgba(251,191,36,0.5)" : BUILDER_BORDER}`,
              backgroundColor: voiceMicMuted ? "rgba(251,191,36,0.08)" : "transparent",
            }}
            title={voiceModeOpen ? (voiceMicMuted ? "Unmute mic" : "Mute mic (stop listening until unmute)") : "Open voice first"}
          >
            {voiceMicMuted ? <MicOff size={18} aria-hidden /> : <Mic size={18} aria-hidden />}
            <span className="text-[10px] font-medium">{voiceMicMuted ? "Unmute" : "Mute"}</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="flex flex-col items-center justify-center gap-0.5 min-w-[56px] px-2 py-2 rounded-lg transition-colors shrink-0 hover:opacity-90"
            style={{ color: BUILDER_MUTED, border: `1px solid ${BUILDER_BORDER}` }}
            title="Attach a file (same slot as Grok’s attach)"
          >
            <Paperclip size={18} aria-hidden />
            <span className="text-[10px] font-medium">Upload</span>
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
            type="button"
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
      </div>

      {/* Narrow / zoomed-in: chat is off-screen to the right — same as scrolling this row sideways */}
      <button
        type="button"
        onClick={scrollBuilderToChat}
        className="fixed bottom-24 right-4 z-[55] flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-white shadow-lg shadow-black/40 hover:bg-primary/90 xl:hidden"
        title="Open Grok chat — open conversation on the right (scroll sideways or tap)"
      >
        <MessageSquare size={18} aria-hidden />
        Grok
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
            <p className="text-sm mb-3" style={{ color: BUILDER_TEXT }}>Grok isn’t available. Set XAI_API_KEY (or GROK_API_KEY) in your backend .env to enable chat.</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowGrokKeyModal(false)}
                className="px-3 py-2 rounded text-sm"
                style={{ color: BUILDER_TEXT, border: `1px solid ${BUILDER_BORDER}` }}
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
              <span className="text-sm font-medium" style={{ color: BUILDER_TEXT }}>Too many requests</span>
              {rateLimitCountdown <= 0 ? (
                <button onClick={() => setRateLimitModalOpen(false)} className="p-1 rounded text-muted hover:text-white hover:bg-[#2d3f4f]">
                  <X size={16} />
                </button>
              ) : null}
            </div>
            <p className="text-sm mb-3" style={{ color: BUILDER_TEXT }}>
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
              <span className="text-sm font-medium" style={{ color: BUILDER_TEXT }}>Upgrade to deploy</span>
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
              <span className="text-sm font-medium" style={{ color: BUILDER_TEXT }}>New project</span>
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
              className="w-full px-3 py-2 rounded-2xl placeholder:text-[color:var(--celestial-on-surface-muted)] focus:outline-none focus:shadow-[0_0_0_1px_color-mix(in_srgb,var(--celestial-primary)_25%,transparent)] text-sm mb-4 text-[color:var(--celestial-on-surface)] bg-[color-mix(in_srgb,var(--celestial-surface-container-low)_88%,transparent)] shadow-[inset_0_-1px_0_0_var(--celestial-ghost-border)] border-0"
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
                style={{ color: BUILDER_TEXT, border: `1px solid ${BUILDER_BORDER}` }}
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

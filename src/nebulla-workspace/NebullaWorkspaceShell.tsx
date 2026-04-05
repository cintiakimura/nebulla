import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Node, Edge } from "@xyflow/react";
import { NebullaLogo } from "../components/NebullaLogo";
import { getUserId, isOpenMode } from "../lib/auth";
import { getApiBase } from "../lib/api";
import { ensureSupabaseConfig, getSessionToken, getSupabaseAuthClient } from "../lib/supabaseAuth";
import { loadWorkspaceGraph, saveWorkspaceGraph } from "./graphStorage";
import { NebullaWorkspaceAssistant } from "./NebullaWorkspaceAssistant";
import { NebullaWorkspaceDashboard, type NebullaDashboardTab } from "./NebullaWorkspaceDashboard";
import {
  NebullaWorkspaceMasterPlan,
  defaultNebullaMasterPlanSlice,
  type NebullaMasterPlanSlice,
} from "./NebullaWorkspaceMasterPlan";
import { NebullaWorkspaceMindMap } from "./NebullaWorkspaceMindMap";
import { StitchMockupPanel } from "../components/StitchMockupPanel";

const MOCK_FILES = [
  { name: ".env.example", isDirectory: false },
  { name: ".gitignore", isDirectory: false },
  { name: "dist", isDirectory: true },
  { name: "node_modules", isDirectory: true },
  { name: "public", isDirectory: true },
  { name: "server.ts", isDirectory: false },
  { name: "src", isDirectory: true },
  { name: "tsconfig.json", isDirectory: false },
  { name: "vite.config.ts", isDirectory: false },
  { name: "index.html", isDirectory: false },
  { name: "metadata.json", isDirectory: false },
  { name: "package.json", isDirectory: false },
];

const initialPages: Node[] = [
  {
    id: "1",
    type: "pageNode",
    data: {
      label: "Authentication Portal",
      isCritical: true,
      isCreated: true,
      description: "GitHub and Google OAuth integration interface.",
    },
    position: { x: 50, y: 250 },
  },
  {
    id: "2",
    type: "pageNode",
    data: {
      label: "Project Dashboard",
      isCritical: true,
      isCreated: false,
      description: "Project creation, naming, and auto-provisioning status tracker.",
    },
    position: { x: 350, y: 250 },
  },
  {
    id: "3",
    type: "pageNode",
    data: {
      label: "Voice-First Workspace",
      isCritical: true,
      isCreated: true,
      description: "Main IDE interface featuring voice-command visualizer, code editor, and terminal.",
    },
    position: { x: 650, y: 250 },
  },
  {
    id: "4",
    type: "pageNode",
    data: {
      label: "Settings Panel",
      isCritical: false,
      isCreated: false,
      description: "Environment variable management, deployment configurations, and integration settings.",
    },
    position: { x: 950, y: 250 },
  },
];

const initialEdges: Edge[] = [
  { id: "e1-2", source: "1", target: "2", animated: true, style: { stroke: "#00ffff" } },
  { id: "e2-3", source: "2", target: "3", animated: true, style: { stroke: "#00ffff" } },
  { id: "e3-4", source: "3", target: "4", animated: true, style: { stroke: "#00ffff" } },
];

const getFileIconInfo = (filename: string, isDirectory: boolean) => {
  if (isDirectory) return { icon: "folder", color: "text-cyan-400" };
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
      return { icon: "javascript", color: "text-blue-400" };
    case "js":
    case "jsx":
      return { icon: "javascript", color: "text-yellow-400" };
    case "json":
      return { icon: "data_object", color: "text-green-400" };
    case "css":
      return { icon: "css", color: "text-sky-400" };
    case "html":
      return { icon: "html", color: "text-orange-400" };
    case "md":
      return { icon: "markdown", color: "text-slate-300" };
    case "svg":
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "ico":
      return { icon: "image", color: "text-purple-400" };
    default:
      return { icon: "draft", color: "text-slate-500" };
  }
};

const PREVIEW_CODE = `// Nebula Interface Component
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
}`;

function parseMindMapPayload(raw: string | undefined): { pages: Node[]; edges: Edge[] } | null {
  try {
    const p = JSON.parse(raw || "{}") as { pages?: Node[]; edges?: Edge[] };
    if (Array.isArray(p.pages) && Array.isArray(p.edges)) return { pages: p.pages, edges: p.edges };
  } catch {
    /* ignore */
  }
  return null;
}

function normalizePlanPayload(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return { ...(raw as Record<string, unknown>) };
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw) as unknown;
      if (typeof p === "object" && p !== null && !Array.isArray(p)) return p as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  }
  return {};
}

export function NebullaWorkspaceShell() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectFromQuery = searchParams.get("project");
  const [userLabel, setUserLabel] = useState<string>("");

  useEffect(() => {
    void (async () => {
      const id = await getUserId();
      const supabase = getSupabaseAuthClient();
      if (supabase) {
        const { data } = await supabase.auth.getUser();
        const em = data.user?.email;
        if (em) {
          setUserLabel(em);
          return;
        }
      }
      setUserLabel(id ? id.slice(0, 10) + "…" : "");
    })();
  }, []);

  const [showMasterPlan, setShowMasterPlan] = useState(false);
  const [showMindMap, setShowMindMap] = useState(true);
  const [showStitchMockup, setShowStitchMockup] = useState(false);
  const [showCodePreview, setShowCodePreview] = useState(false);
  const [dashboardTab, setDashboardTab] = useState<NebullaDashboardTab | null>(null);

  const [pages, setPages] = useState<Node[]>(() => loadWorkspaceGraph({ pages: initialPages, edges: initialEdges }).pages);
  const [edges, setEdges] = useState<Edge[]>(() => loadWorkspaceGraph({ pages: initialPages, edges: initialEdges }).edges);
  const [workspaceProjectId, setWorkspaceProjectId] = useState<string | null>(null);
  const [allowRemotePush, setAllowRemotePush] = useState(false);
  const planStateRef = useRef<Record<string, unknown>>({});
  const [nebullaPlanSlice, setNebullaPlanSlice] = useState<NebullaMasterPlanSlice>(() => defaultNebullaMasterPlanSlice());

  const [leftWidth, setLeftWidth] = useState(240);
  const [rightWidth, setRightWidth] = useState(320);
  const [terminalHeight, setTerminalHeight] = useState(160);
  const [isResizing, setIsResizing] = useState<"left" | "right" | "terminal" | null>(null);

  const [isLeftOpen, setIsLeftOpen] = useState(true);
  const [isTerminalOpen, setIsTerminalOpen] = useState(true);

  const [terminalHistory, setTerminalHistory] = useState<{ command: string; output: string }[]>([
    { command: "hint", output: "Shell runs in Builder; this panel is UI-only in workspace preview." },
  ]);
  const [terminalInput, setTerminalInput] = useState("");
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalHistory]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      if (isResizing === "left") {
        setLeftWidth(Math.max(150, Math.min(e.clientX - 64, 600)));
      } else if (isResizing === "right") {
        setRightWidth(Math.max(200, Math.min(window.innerWidth - e.clientX, 800)));
      } else if (isResizing === "terminal") {
        setTerminalHeight(Math.max(100, Math.min(window.innerHeight - e.clientY - 40, 600)));
      }
    };
    const handleMouseUp = () => setIsResizing(null);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const pagesText = useMemo(() => {
    const sorted = [...pages].sort((a, b) => a.position.x - b.position.x);
    return (
      `PAGES & NAVIGATION\n\n` +
      sorted.map((p, i) => `${i + 1}. ${String(p.data.label)}: ${String(p.data.description ?? "")}`).join("\n")
    );
  }, [pages]);

  const mindMapSummary = useMemo(() => {
    const nodeLines = pages.map((p) => {
      const label = String(p.data.label ?? "");
      const created = Boolean(p.data.isCreated);
      return `  • ${label}${created ? " — Live link" : " — Pending creation"}`;
    });
    const edgeLines = edges.map((e) => `  ${e.source} → ${e.target}`);
    return (
      `Nodes (${pages.length}):\n${nodeLines.join("\n")}` +
      (edges.length ? `\n\nConnections (${edges.length}):\n${edgeLines.join("\n")}` : "")
    );
  }, [pages, edges]);

  const [stitchMockupNonce, setStitchMockupNonce] = useState(0);

  const graphPersistNoop = useCallback(() => {}, []);

  useEffect(() => {
    saveWorkspaceGraph({ pages, edges });
  }, [pages, edges]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await ensureSupabaseConfig();
      const api = (getApiBase() || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
      const token = await getSessionToken();
      if (!token) {
        if (!cancelled) {
          setWorkspaceProjectId(null);
          setAllowRemotePush(false);
        }
        return;
      }
      let pid = projectFromQuery?.trim() || null;
      if (!pid) {
        try {
          const r = await fetch(`${api}/api/projects`, { headers: { Authorization: `Bearer ${token}` } });
          if (r.ok) {
            const list = (await r.json()) as { id?: string }[];
            pid = list[0]?.id ?? null;
          }
        } catch {
          /* offline */
        }
      }
      if (!pid || cancelled) {
        return;
      }
      setWorkspaceProjectId(pid);
      try {
        const pr = await fetch(`${api}/api/projects/${pid}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!pr.ok) throw new Error("project fetch");
        const data = (await pr.json()) as { mind_map_json?: string; plan?: unknown };
        const mm = parseMindMapPayload(data.mind_map_json);
        if (mm && !cancelled) {
          setPages(mm.pages);
          setEdges(mm.edges);
        }
        const norm = normalizePlanPayload(data.plan);
        if (!cancelled) {
          planStateRef.current = norm;
          const slice = norm.nebullaMasterPlanV1 as NebullaMasterPlanSlice | undefined;
          setNebullaPlanSlice(slice?.v === 1 ? slice : defaultNebullaMasterPlanSlice());
        }
        if (!cancelled) {
          window.setTimeout(() => {
            if (!cancelled) setAllowRemotePush(true);
          }, 300);
        }
      } catch {
        /* keep local graph; do not enable remote push */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectFromQuery]);

  useEffect(() => {
    if (!allowRemotePush || !workspaceProjectId) return;
    const api = (getApiBase() || window.location.origin).replace(/\/$/, "");
    const t = window.setTimeout(() => {
      void (async () => {
        const token = await getSessionToken();
        if (!token) return;
        const mind_map_json = JSON.stringify({ pages, edges });
        const plan = { ...planStateRef.current, nebullaMasterPlanV1: nebullaPlanSlice };
        try {
          await fetch(`${api}/api/projects/${workspaceProjectId}`, {
            method: "PUT",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ mind_map_json, plan, last_edited: new Date().toISOString() }),
          });
        } catch {
          /* ignore */
        }
      })();
    }, 600);
    return () => clearTimeout(t);
  }, [pages, edges, nebullaPlanSlice, allowRemotePush, workspaceProjectId]);

  const handleOpenStitchFromAssistant = () => {
    setShowMindMap(false);
    setShowMasterPlan(false);
    setDashboardTab(null);
    setShowStitchMockup(true);
    queueMicrotask(() => setStitchMockupNonce((n) => n + 1));
  };

  const handleLockDesign = () => {
    setShowStitchMockup(false);
  };

  const handleTerminalKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !terminalInput.trim()) return;
    const command = terminalInput.trim();
    setTerminalInput("");
    setTerminalHistory((prev) => [
      ...prev,
      { command, output: "Use the Builder terminal for real commands. Workspace UI is preview-only." },
    ]);
  };

  const logout = async () => {
    const supabase = getSupabaseAuthClient();
    if (supabase) await supabase.auth.signOut();
    localStorage.removeItem("kyn_user_id");
    navigate("/login");
  };

  const signedIn = isOpenMode() || !!localStorage.getItem("kyn_user_id");

  return (
    <div className="nebulla-workspace flex flex-col h-screen min-h-0 w-full overflow-hidden bg-background text-on-surface font-sans selection:bg-cyan-500/20">
      <header className="h-12 w-full z-50 flex justify-between items-center px-6 bg-[#040f1a]/60 backdrop-blur-xl border-b border-white/5 shadow-[0_0_20px_rgba(96,0,159,0.05)] shrink-0">
        <div className="flex items-center gap-3 min-w-0 shrink-0">
          <div className="nebulla-logo-pulse shrink-0">
            <NebullaLogo size={24} tray />
          </div>
          <h1 className="font-headline text-lg font-light tracking-tighter text-cyan-300 no-bold truncate">
            nebulla
          </h1>
        </div>
        <div className="flex items-center gap-4 shrink-0 flex-wrap justify-end">
          <button
            type="button"
            onClick={() => navigate("/builder")}
            className="text-xs px-3 py-1.5 bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 rounded hover:bg-cyan-500/20 transition-colors font-headline flex items-center gap-1 no-bold"
            title="Open Builder to deploy"
          >
            <span className="material-symbols-outlined text-[14px]">rocket_launch</span>
            Deploy
          </button>
          <button
            type="button"
            onClick={() => navigate("/builder")}
            className="text-xs px-3 py-1.5 bg-white/5 text-slate-300 border border-white/10 rounded hover:bg-white/10 transition-colors font-headline flex items-center gap-1 no-bold"
            title="Export from Builder"
          >
            <span className="material-symbols-outlined text-[14px]">download</span>
            Download
          </button>
          {signedIn ? (
            <div className="flex items-center gap-3">
              {userLabel ? <span className="text-xs text-slate-500 max-w-[120px] truncate">{userLabel}</span> : null}
              {!isOpenMode() ? (
                <button type="button" onClick={() => void logout()} className="text-xs text-slate-400 hover:text-cyan-300 transition-colors font-headline no-bold">
                  Logout
                </button>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="text-xs px-3 py-1.5 bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 rounded hover:bg-cyan-500/20 transition-colors font-headline flex items-center gap-2 no-bold"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Google
              </button>
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="text-xs px-3 py-1.5 bg-slate-800 text-slate-300 border border-slate-700 rounded hover:bg-slate-700 transition-colors font-headline flex items-center gap-2 no-bold"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                GitHub
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        {isResizing ? (
          <div
            className="fixed inset-0 z-[9999]"
            style={{ cursor: isResizing === "terminal" ? "row-resize" : "col-resize" }}
          />
        ) : null}

        <aside className="flex flex-col items-center py-4 gap-6 border-r border-white/5 bg-[#040f1a]/20 w-16 shrink-0">
          <button
            type="button"
            onClick={() => setIsLeftOpen(!isLeftOpen)}
            className={`material-symbols-outlined transition-all ${isLeftOpen ? "text-cyan-300" : "text-slate-500 hover:text-cyan-300"}`}
            title="Toggle file tree"
          >
            folder
          </button>
          <button type="button" className="material-symbols-outlined text-slate-500 hover:text-cyan-300 transition-all" title="Search">
            search
          </button>

          <div className="w-8 h-[1px] bg-white/10 my-1" />
          <button
            type="button"
            onClick={() => {
              setShowStitchMockup(true);
              setShowMindMap(false);
              setShowMasterPlan(false);
              setDashboardTab(null);
            }}
            className={`material-symbols-outlined transition-all ${showStitchMockup ? "text-cyan-300" : "text-slate-500 hover:text-cyan-300"}`}
            title="Stitch Mockup"
          >
            design_services
          </button>
          <button
            type="button"
            onClick={() => {
              setShowMindMap(true);
              setShowMasterPlan(false);
              setShowStitchMockup(false);
              setDashboardTab(null);
            }}
            className={`material-symbols-outlined transition-all ${showMindMap ? "text-cyan-300" : "text-slate-500 hover:text-cyan-300"}`}
            title="Mind map"
          >
            account_tree
          </button>
          <button
            type="button"
            onClick={() => {
              setShowMasterPlan(true);
              setShowMindMap(false);
              setShowStitchMockup(false);
              setDashboardTab(null);
            }}
            className={`material-symbols-outlined transition-all ${showMasterPlan ? "text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]" : "text-slate-500 hover:text-yellow-400 hover:drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]"}`}
            title="Master plan"
          >
            menu_book
          </button>
          <div className="w-8 h-[1px] bg-white/10 my-1" />

          <button
            type="button"
            onClick={() => {
              setDashboardTab("projects");
              setShowStitchMockup(false);
              setShowMindMap(false);
              setShowMasterPlan(false);
            }}
            className={`material-symbols-outlined transition-all ${dashboardTab === "projects" ? "text-cyan-300" : "text-slate-500 hover:text-cyan-300"}`}
            title="Projects"
          >
            grid_view
          </button>
          <button
            type="button"
            onClick={() => {
              setDashboardTab("project-settings");
              setShowStitchMockup(false);
              setShowMindMap(false);
              setShowMasterPlan(false);
            }}
            className={`material-symbols-outlined transition-all ${dashboardTab === "project-settings" ? "text-cyan-300" : "text-slate-500 hover:text-cyan-300"}`}
            title="Project settings"
          >
            dns
          </button>
          <button
            type="button"
            onClick={() => {
              setDashboardTab("secrets");
              setShowStitchMockup(false);
              setShowMindMap(false);
              setShowMasterPlan(false);
            }}
            className={`material-symbols-outlined transition-all ${dashboardTab === "secrets" ? "text-cyan-300" : "text-slate-500 hover:text-cyan-300"}`}
            title="Secrets"
          >
            key
          </button>

          <div className="mt-auto flex flex-col gap-6 mb-4">
            <button
              type="button"
              onClick={() => {
                setDashboardTab("user-settings");
                setShowStitchMockup(false);
                setShowMindMap(false);
                setShowMasterPlan(false);
              }}
              className={`material-symbols-outlined transition-all ${dashboardTab === "user-settings" ? "text-cyan-300" : "text-slate-500 hover:text-cyan-300"}`}
              title="User settings"
            >
              settings
            </button>
          </div>
        </aside>

        {isLeftOpen ? (
          <>
            <aside className="flex flex-col border-r border-white/5 bg-[#040f1a]/30 shrink-0" style={{ width: leftWidth }}>
              <div className="p-4 border-b border-white/5 flex justify-between items-center">
                <span className="text-cyan-300 font-light tracking-widest text-xs font-headline no-bold uppercase">
                  PROJECT
                </span>
                <button
                  type="button"
                  onClick={() => setIsLeftOpen(false)}
                  className="material-symbols-outlined text-slate-500 hover:text-cyan-300 transition-colors"
                  title="Hide sidebar"
                >
                  chevron_left
                </button>
              </div>
              <nav className="flex-1 py-2 flex flex-col px-1 overflow-y-auto font-mono text-13 min-h-0">
                {MOCK_FILES.map((file, i) => {
                  const { icon, color } = getFileIconInfo(file.name, file.isDirectory);
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-1.5 px-2 h-[22px] text-slate-400 hover:text-cyan-200 hover:bg-white/5 transition-all cursor-pointer ${file.isDirectory ? "font-bold" : "ml-4"}`}
                    >
                      <span className={`material-symbols-outlined !text-[14px] ${color}`}>{icon}</span>
                      <span className="no-bold text-[13px] leading-none truncate">{file.name}</span>
                    </div>
                  );
                })}
              </nav>
              <div className="p-4 border-t border-white/5 space-y-3 shrink-0">
                <span className="text-[10px] text-slate-500 font-headline uppercase tracking-tighter no-bold">Quick Actions</span>
                <div className="flex flex-col gap-2">
                  <button type="button" className="flex items-center gap-2 text-13 text-slate-400 hover:text-cyan-300 transition-all no-bold">
                    <span className="material-symbols-outlined text-14">cloud_upload</span>
                    Sync Git
                  </button>
                  <button type="button" className="flex items-center gap-2 text-13 text-slate-400 hover:text-cyan-300 transition-all no-bold">
                    <span className="material-symbols-outlined text-14">upload_file</span>
                    Upload
                  </button>
                </div>
              </div>
            </aside>

            <div
              className="w-1 cursor-col-resize bg-transparent hover:bg-cyan-500/50 active:bg-cyan-500 transition-colors z-10 shrink-0"
              onMouseDown={() => setIsResizing("left")}
            />
          </>
        ) : null}

        <section className="flex flex-col overflow-hidden flex-1 min-w-0 min-h-0">
          <div className="h-10 border-b border-white/5 bg-white/5 flex items-center px-2 shrink-0">
            <div className="flex items-center gap-2 px-4 py-1.5 bg-background border-t border-x border-white/5 rounded-t-lg text-13 text-cyan-300">
              {dashboardTab ? (
                <>
                  <span className="material-symbols-outlined text-14">
                    {dashboardTab === "projects"
                      ? "grid_view"
                      : dashboardTab === "project-settings"
                        ? "dns"
                        : dashboardTab === "secrets"
                          ? "key"
                          : "settings"}
                  </span>
                  <span className="no-bold">
                    {dashboardTab === "projects"
                      ? "User Projects"
                      : dashboardTab === "project-settings"
                        ? "Project Settings"
                        : dashboardTab === "secrets"
                          ? "Secrets & Integrations"
                          : "User Settings"}
                  </span>
                </>
              ) : showStitchMockup ? (
                <>
                  <span className="material-symbols-outlined text-14">design_services</span>
                  <span className="no-bold">Stitch Mockup</span>
                </>
              ) : showMasterPlan ? (
                <>
                  <span className="material-symbols-outlined text-14">menu_book</span>
                  <span className="no-bold">Master Plan</span>
                </>
              ) : showMindMap ? (
                <>
                  <span className="material-symbols-outlined text-14">account_tree</span>
                  <span className="no-bold">Mind Map</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-14">javascript</span>
                  <span className="no-bold">index.tsx</span>
                </>
              )}
              <span
                className="material-symbols-outlined text-14 hover:text-red-400 cursor-pointer"
                onClick={() => {
                  setDashboardTab(null);
                  setShowStitchMockup(false);
                  setShowMasterPlan(false);
                  setShowMindMap(false);
                }}
              >
                close
              </span>
            </div>
          </div>

          <div className="flex-1 p-6 overflow-y-auto bg-black/20 relative flex flex-col">
            <div className="flex-1 flex flex-col gap-6">
              {dashboardTab ? (
                <div className="flex-1 flex flex-col">
                  <NebullaWorkspaceDashboard activeTab={dashboardTab} onTabChange={setDashboardTab} />
                </div>
              ) : showStitchMockup ? (
                <div className="flex-1 flex flex-col">
                  <StitchMockupPanel
                    pagesText={pagesText}
                    mindMapSummary={mindMapSummary}
                    generationNonce={stitchMockupNonce}
                    onClose={handleLockDesign}
                  />
                </div>
              ) : showMasterPlan ? (
                <div className="flex-1 flex flex-col min-h-0">
                  <NebullaWorkspaceMasterPlan
                    onClose={() => setShowMasterPlan(false)}
                    pagesText={pagesText}
                    planSlice={nebullaPlanSlice}
                    onPlanSliceChange={(next) => {
                      setNebullaPlanSlice(next);
                      planStateRef.current = { ...planStateRef.current, nebullaMasterPlanV1: next };
                    }}
                  />
                </div>
              ) : showMindMap ? (
                <div className="flex-1 flex flex-col">
                  <NebullaWorkspaceMindMap
                    pages={pages}
                    setPages={setPages}
                    edges={edges}
                    setEdges={setEdges}
                    onSaveToMasterPlan={graphPersistNoop}
                  />
                </div>
              ) : (
                <div className="flex-1 overflow-hidden">
                  <div className="w-full h-full max-w-5xl mx-auto">
                    <div className="h-full glass-panel rounded-md border border-white/5 flex flex-col overflow-hidden nebula-glow transition-all duration-500">
                      <div className="h-10 px-4 flex items-center justify-between border-b border-white/5 bg-white/5">
                        <div className="flex gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-slate-700" />
                          <div className="w-2 h-2 rounded-full bg-slate-700" />
                          <div className="w-2 h-2 rounded-full bg-slate-700" />
                        </div>
                        <span className="text-xs text-slate-500 font-headline no-bold">Preview Mode</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowCodePreview(!showCodePreview)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-headline no-bold transition-all ${
                              showCodePreview
                                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                                : "bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10 hover:text-slate-300"
                            }`}
                          >
                            <span className="material-symbols-outlined !text-[14px]">code</span>
                            <span className="text-[12px]">Code</span>
                          </button>
                          <span className="material-symbols-outlined text-14 text-slate-500 cursor-pointer hover:text-slate-300 transition-colors">
                            open_in_new
                          </span>
                        </div>
                      </div>
                      <div className="flex-1 relative flex items-center justify-center bg-surface-container-lowest/20 overflow-hidden">
                        {showCodePreview ? (
                          <div className="absolute inset-0 bg-[#1e1e1e] overflow-auto text-13">
                            <pre className="m-0 p-4 text-left text-slate-300 font-mono bg-transparent text-[13px]">
                              {PREVIEW_CODE}
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
                              <button
                                type="button"
                                className="mt-2 px-6 py-2 bg-primary-container/10 text-primary border border-primary/20 rounded-md text-13 font-headline no-bold hover:bg-primary-container/20 transition-all"
                              >
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

          {isTerminalOpen ? (
            <div
              className="h-1 cursor-row-resize bg-transparent hover:bg-cyan-500/50 active:bg-cyan-500 transition-colors z-10 shrink-0"
              onMouseDown={() => setIsResizing("terminal")}
            />
          ) : null}

          <div
            className="bg-[#040f1a]/60 border-t border-white/5 flex flex-col shrink-0 transition-all duration-300 ease-in-out overflow-hidden"
            style={{ height: isTerminalOpen ? terminalHeight : 32 }}
          >
            <div className="h-8 px-4 flex items-center justify-between border-b border-white/5 bg-white/10 shrink-0 cursor-pointer select-none" onClick={() => setIsTerminalOpen(!isTerminalOpen)}>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={`material-symbols-outlined text-14 text-slate-500 hover:text-cyan-300 transition-transform duration-300 ${!isTerminalOpen ? "-rotate-90" : "rotate-0"}`}
                >
                  expand_more
                </button>
                <span className="material-symbols-outlined text-14 text-cyan-300">terminal</span>
                <span className="text-[10px] text-cyan-300 font-headline uppercase no-bold">Terminal</span>
              </div>
            </div>

            {isTerminalOpen ? (
              <div className="flex-1 p-3 font-mono text-[11px] text-slate-400 overflow-y-auto no-bold space-y-2 flex flex-col">
                {terminalHistory.map((item, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <div className="flex gap-2">
                      <span className="text-cyan-500">λ</span> <span>{item.command}</span>
                    </div>
                    <div className="text-slate-500 whitespace-pre-wrap">{item.output}</div>
                  </div>
                ))}
                <div className="flex gap-2 items-center mt-auto">
                  <span className="text-cyan-500">λ</span>
                  <input
                    type="text"
                    value={terminalInput}
                    onChange={(e) => setTerminalInput(e.target.value)}
                    onKeyDown={handleTerminalKey}
                    className="flex-1 bg-transparent border-none outline-none text-slate-300 placeholder-slate-600"
                    placeholder="Type a command and press Enter..."
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                <div ref={terminalEndRef} />
              </div>
            ) : null}
          </div>
        </section>

        <div
          className="w-1 cursor-col-resize bg-transparent hover:bg-cyan-500/50 active:bg-cyan-500 transition-colors z-10 shrink-0"
          onMouseDown={() => setIsResizing("right")}
        />

        <NebullaWorkspaceAssistant width={rightWidth} onRequestStitchMockup={handleOpenStitchFromAssistant} />
      </main>

      <footer className="h-10 w-full flex justify-center items-center gap-8 z-50 bg-[#040f1a]/80 backdrop-blur-md border-t border-white/5">
        <button type="button" className="material-symbols-outlined text-cyan-300 scale-110 no-bold transition-all active:scale-95 duration-200" title="Preview">
          visibility
        </button>
        <button
          type="button"
          onClick={() => setIsTerminalOpen(!isTerminalOpen)}
          className={`material-symbols-outlined transition-all active:scale-95 duration-200 ${isTerminalOpen ? "text-cyan-300" : "text-slate-500 hover:text-cyan-100"}`}
          title="Toggle Terminal"
        >
          terminal
        </button>
        <button type="button" className="material-symbols-outlined text-slate-500 hover:text-cyan-100 no-bold transition-all active:scale-95 duration-200" title="History">
          history
        </button>
        <button type="button" className="material-symbols-outlined text-slate-500 hover:text-cyan-100 no-bold transition-all active:scale-95 duration-200" title="Ideas">
          bug_report
        </button>
      </footer>
    </div>
  );
}

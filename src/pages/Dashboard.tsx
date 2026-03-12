import { useState, useRef, useEffect, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  FolderOpen,
  Settings,
  DollarSign,
  User,
  ChevronDown,
  Search,
  Github,
  Upload,
  X,
  Mic,
  MicOff,
  Copy,
  Link2,
  Play,
  Bug,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import { useDropzone } from "react-dropzone";
import { getSetupComplete } from "../lib/setupStorage";
import { getUserId, getPaidStatus, setPaidFromSuccess } from "../lib/auth";
import { getApiBase, isBackendAvailable, setBackendUnavailable, clearBackendUnavailable } from "../lib/api";
import { isFirstLogin, setFirstLoginDone, getSessionToken } from "../lib/supabaseAuth";
import { runQuickAudit, type AuditEntry } from "../lib/runQuickAudit";
import { VETR_SYSTEM_PROMPT } from "../lib/vetrPrompt";
import FirstLoginOnboarding from "../components/FirstLoginOnboarding";
import UpgradeProModal from "../components/UpgradeProModal";
import UpgradeBubble from "../components/UpgradeBubble";

type ProjectStatus = "Live" | "Preview" | "Draft";

type Project = {
  id: string;
  name: string;
  status: ProjectStatus;
  lastEdited: string;
  thumbnail?: string | null;
  url?: string | null;
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "deployed" | "drafts">("all");
  const [search, setSearch] = useState("");
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [chatMessages, setChatMessages] = useState<{ id: string; role: "user" | "assistant"; content: string }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showFirstLoginOnboarding, setShowFirstLoginOnboarding] = useState<boolean | null>(null);
  const [projectLimit, setProjectLimit] = useState<number>(3);
  const [limits, setLimits] = useState<{
    isPro: boolean;
    projectCount: number;
    grokToday: number;
    grokLimit: number | null;
    projectLimit: number;
  } | null>(null);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [testReport, setTestReport] = useState<AuditEntry[] | null>(null);
  const [testReportOpen, setTestReportOpen] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [vetrResult, setVetrResult] = useState<string | null>(null);
  const [vetrLoading, setVetrLoading] = useState(false);
  const [startBuildingPrompt, setStartBuildingPrompt] = useState("");
  const [welcomeModalPrompt, setWelcomeModalPrompt] = useState("");
  const [welcomeModalLoading, setWelcomeModalLoading] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

  const KEY_SEEN_WELCOME = "kyn_seen_welcome";
  const seenWelcome = typeof window !== "undefined" && localStorage.getItem(KEY_SEEN_WELCOME) === "1";
  const showWelcomeModal = !loading && projects.length === 0 && !seenWelcome && showFirstLoginOnboarding === false;

  const { transcript, listening } = useSpeechRecognition();
  const paidStatus = getPaidStatus();
  const projectCount = projects.length;
  const atProjectLimit = !paidStatus.paid && projectCount >= (limits?.projectLimit ?? projectLimit);
  const atGrokLimit = !paidStatus.paid && limits != null && limits.grokLimit != null && limits.grokToday >= limits.grokLimit;
  const showUpgradeBubble = !paidStatus.paid && (atProjectLimit || atGrokLimit || (limits != null && !limits.isPro && (limits.projectCount > 3 || (limits.grokLimit != null && limits.grokToday >= limits.grokLimit))));
  const setupComplete = getSetupComplete();

  useEffect(() => {
    let cancelled = false;
    isFirstLogin()
      .then((first) => {
        if (!cancelled) setShowFirstLoginOnboarding(first);
      })
      .catch(() => {
        if (!cancelled) setShowFirstLoginOnboarding(true); // fail open: show onboarding on error
      });
    return () => { cancelled = true; };
  }, []);

  // Fetch limits: prefer /api/users/me/limits with Bearer, else /api/users/:userId/limits
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
        const data = (await r.json()) as {
          isPro?: boolean;
          projectCount?: number;
          grokToday?: number;
          grokLimit?: number;
          projectLimit?: number;
        };
        clearBackendUnavailable();
        if (data.isPro) setPaidFromSuccess("pro");
        setLimits({
          isPro: !!data.isPro,
          projectCount: data.projectCount ?? 0,
          grokToday: data.grokToday ?? 0,
          grokLimit: data.grokLimit !== undefined ? data.grokLimit : 10,
          projectLimit: data.projectLimit ?? 3,
        });
        if (data.projectLimit != null) setProjectLimit(data.projectLimit);
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const api = getApiBase();
    (async () => {
      const [userId, token] = await Promise.all([getUserId(), getSessionToken()]);
      if (cancelled) return;
      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      fetch(`${api || ""}/api/users/${userId}/projects`, { headers })
        .then((r) => {
          if (!r.ok) setBackendUnavailable();
          return r.json();
        })
        .then((list: { id: string; name: string; status: string; last_edited: string }[]) => {
          if (cancelled) return;
          if (Array.isArray(list)) clearBackendUnavailable();
          setProjects(
            list.map((p) => ({
              id: p.id,
              name: p.name,
              status: (p.status as ProjectStatus) || "Draft",
              lastEdited: p.last_edited || "Just now",
              thumbnail: null,
              url: null,
            }))
          );
        })
        .catch(() => {
          setBackendUnavailable();
        })
        .finally(() => setLoading(false));
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) setAvatarOpen(false);
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const filtered = projects.filter((p) => {
    const matchSearch = !search.trim() || p.name.toLowerCase().includes(search.toLowerCase());
    const matchTab = tab === "all" || (tab === "deployed" && (p.status === "Live" || p.status === "Preview")) || (tab === "drafts" && p.status === "Draft");
    return matchSearch && matchTab;
  });

  const createAndOpenProject = async (name: string) => {
    setCreateError(null);
    if (atProjectLimit) {
      setUpgradeModalOpen(true);
      return;
    }
    if (!isBackendAvailable()) {
      setCreateError("Set up your backend to continue. Run the server (npm run dev) and set VITE_API_URL to your backend URL if the frontend is on another host.");
      return;
    }
    try {
      const userId = await getUserId();
      const api = getApiBase();
      const token = await getSessionToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${api}/api/users/${userId}/projects`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setCreateError("Please sign in again.");
        navigate("/login", { replace: true });
        return;
      }
      if (res.status === 403 && (data as { error?: string }).error === "free_project_limit_reached") {
        setUpgradeModalOpen(true);
        return;
      }
      if (res.status === 403 && (data as { error?: string }).error === "read_only_expired") {
        setCreateError((data as { message?: string }).message ?? "Subscription expired. You're in read-only mode. Upgrade to create new projects.");
        setUpgradeModalOpen(true);
        return;
      }
      if (res.ok) {
        try {
          const project = data as { id: string; name: string; status: string; last_edited: string };
          setProjects((prev) => {
            const next = [
              ...prev,
              { id: project.id, name: project.name, status: (project.status as ProjectStatus) || "Draft", lastEdited: project.last_edited || "Just now", thumbnail: null, url: null },
            ];
            return next;
          });
          if (typeof window !== "undefined") localStorage.setItem(KEY_SEEN_WELCOME, "1");
          navigate(`/builder/${project.id}`);
        } catch {
          setCreateError("Could not create project. Try again.");
        }
        return;
      }
      setBackendUnavailable();
      setCreateError("Backend error. Check that the server is running and VITE_API_URL points to it.");
    } catch (_err) {
      setBackendUnavailable();
      setCreateError("Could not reach backend. Run the server (npm run dev) and set VITE_API_URL if the frontend is on another host.");
    }
  };

  const handleWelcomeStart = async () => {
    const name = welcomeModalPrompt.trim() || "My first app";
    setWelcomeModalLoading(true);
    await createAndOpenProject(name);
    setWelcomeModalLoading(false);
  };

  const handleFile = async (file: File) => {
    const name = file.name.replace(/\.[^.]*$/, "") || "Untitled";
    await createAndOpenProject(name);
  };

  const handleOpenFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip,.tar.gz,application/zip,*";
    input.onchange = () => {
      if (input.files?.[0]) handleFile(input.files[0]);
    };
    input.click();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleOpenFromGitHub = () => {
    createAndOpenProject("my-repo");
  };

  const handleMicToggle = () => {
    if (listening) SpeechRecognition.stopListening();
    else SpeechRecognition.startListening({ continuous: true });
  };

  const handleRunQuickTest = async () => {
    const apiBase = getApiBase();
    if (!apiBase) {
      setTestReport([{ name: "Backend", ok: false, detail: "VITE_API_URL not set or backend unreachable" }]);
      setTestReportOpen(true);
      return;
    }
    setTestLoading(true);
    setVetrResult(null);
    try {
      const results = await runQuickAudit(apiBase);
      setTestReport(results);
      setTestReportOpen(true);
    } catch (e) {
      setTestReport([{ name: "Audit", ok: false, detail: e instanceof Error ? e.message : String(e) }]);
      setTestReportOpen(true);
    } finally {
      setTestLoading(false);
    }
  };

  const handleRunFinalDebuggingTest = async () => {
    const apiBase = getApiBase();
    if (!apiBase) {
      setTestReport([{ name: "Backend", ok: false, detail: "VITE_API_URL not set or backend unreachable" }]);
      setTestReportOpen(true);
      return;
    }
    setTestLoading(true);
    setVetrResult(null);
    setTestReportOpen(true);
    try {
      const results = await runQuickAudit(apiBase);
      setTestReport(results);
      const reportText = results.map((r) => `[${r.ok ? "PASS" : "FAIL"}] ${r.name}${r.detail ? " — " + r.detail : ""}`).join("\n");
      setVetrLoading(true);
      try {
        const res = await fetch(`${apiBase}/api/agent/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [
              { role: "user", content: `${VETR_SYSTEM_PROMPT}\n\n--- AUDIT REPORT ---\n${reportText}\n\nApply the VETR loop to the above. For each FAIL, output phases 2–5. If all PASS, output a short confidence summary.` },
            ],
          }),
        });
        const data = await res.json().catch(() => ({}));
        const content = res.ok && (data as { message?: { content?: string } }).message?.content
          ? (data as { message: { content: string } }).message.content
          : res.status === 503
            ? "Grok API not configured (GROK_API_KEY). Run quick test only."
            : "Could not run VETR analysis.";
        setVetrResult(content);
      } finally {
        setVetrLoading(false);
      }
    } catch (e) {
      setTestReport([{ name: "Audit", ok: false, detail: e instanceof Error ? e.message : String(e) }]);
    } finally {
      setTestLoading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: true,
    onDragEnter: undefined,
    onDragOver: undefined,
    onDragLeave: undefined,
    onDrop: (acceptedFiles) => {
      acceptedFiles.forEach((file) => {
        setChatMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "user", content: `Uploaded: ${file.name}` },
        ]);
      });
    },
    noClick: true,
    noKeyboard: true,
  });

  const statusClass = (s: ProjectStatus) =>
    s === "Live" ? "bg-green-500/10 text-green-400" : s === "Preview" ? "bg-blue-500/10 text-blue-400" : "bg-gray-500/10 text-gray-400";

  return (
    <div className="flex h-screen bg-[#1e1e1e] text-gray-300 overflow-hidden font-sans">
      {showFirstLoginOnboarding === true && (
        <div className="fixed inset-0 z-[100]">
          <FirstLoginOnboarding
            onComplete={async () => {
              setFirstLoginDone();
              setShowFirstLoginOnboarding(false);
              if (isBackendAvailable()) {
                try {
                  const userId = await getUserId();
                  const api = getApiBase();
                  const token = await getSessionToken();
                  const headers: Record<string, string> = { "Content-Type": "application/json" };
                  if (token) headers["Authorization"] = `Bearer ${token}`;
                  const res = await fetch(`${api}/api/users/${userId}/projects`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ name: "My first project" }),
                  });
                  if (res.ok) {
                    const project = (await res.json()) as { id: string };
                    navigate(`/builder/${project.id}`, {
                      state: { speakOpener: "Let's go. What's your idea?" },
                    });
                    return;
                  }
                } catch (_) {}
              }
              setChatOpen(true);
            }}
          />
        </div>
      )}

      {/* First-load welcome modal: no projects ever, after first-login flow */}
      <AnimatePresence>
        {showWelcomeModal && (
          <div className="fixed inset-0 z-[99] flex items-center justify-center p-4 bg-black/70">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#252526] border border-[#333333] rounded-xl shadow-xl max-w-md w-full p-6"
            >
              <h2 className="text-xl font-semibold text-white mb-2">Welcome!</h2>
              <p className="text-gray-400 text-sm mb-4">What do you want to build today?</p>
              <input
                type="text"
                value={welcomeModalPrompt}
                onChange={(e) => setWelcomeModalPrompt(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleWelcomeStart()}
                placeholder="e.g. A todo app, a landing page..."
                className="w-full px-4 py-3 bg-[#1e1e1e] border border-[#333333] rounded-lg text-white placeholder-gray-500 focus:border-[#007acc] outline-none mb-4"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleWelcomeStart}
                  disabled={welcomeModalLoading || atProjectLimit}
                  className="flex-1 py-2.5 bg-[#007acc] hover:bg-[#1a8ad4] text-white font-medium rounded-lg disabled:opacity-50"
                >
                  {welcomeModalLoading ? "Creating…" : "Start"}
                </button>
              </div>
              {createError && <p className="mt-2 text-xs text-amber-500">{createError}</p>}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {upgradeModalOpen && (
          <UpgradeProModal
            open={true}
            onClose={() => setUpgradeModalOpen(false)}
            action="project_limit"
            title="You've reached the free limit"
            message="You've reached the free limit of 3 projects! Upgrade to Pro for unlimited projects, code export, GitHub integration, one-click deploy to Firebase, and no watermarks."
            ctaLabel="Upgrade to Pro"
            ctaToPricing
          />
        )}
        {testReportOpen && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/60" onClick={() => setTestReportOpen(false)}>
            <div
              className="bg-[#252526] border border-[#333333] rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#333333]">
                <h3 className="text-sm font-semibold text-white">
                  {vetrLoading ? "Running final debugging test (VETR)…" : testLoading && !testReport ? "Running quick test…" : "Audit report"}
                </h3>
                <button onClick={() => setTestReportOpen(false)} className="p-1 rounded hover:bg-[#37373d] text-gray-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-4">
                {testReport === null ? (
                  <p className="text-sm text-gray-500">Running audit…</p>
                ) : (
                  <>
                    <div className="space-y-2">
                      {testReport.map((r, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <span className={r.ok ? "text-green-500 font-medium" : "text-amber-500 font-medium"}>
                            {r.ok ? "PASS" : "FAIL"}
                          </span>
                          <span className="text-gray-300">{r.name}</span>
                          {r.detail && <span className="text-gray-500 truncate">{r.detail}</span>}
                        </div>
                      ))}
                    </div>
                    {vetrResult && (
                      <div className="pt-4 border-t border-[#333333]">
                        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">VETR analysis</h4>
                        <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans bg-[#1e1e1e] p-3 rounded overflow-auto max-h-64">
                          {vetrResult}
                        </pre>
                      </div>
                    )}
                    {vetrLoading && (
                      <p className="text-sm text-gray-500">Grok is applying the VETR loop (Verify → Explain → Trace → Repair → Validate)…</p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Left sidebar - explorer style */}
      <div className="w-14 flex flex-col items-center py-4 bg-[#252526] border-r border-[#333333] flex-shrink-0">
        <div className="flex flex-col items-center gap-1 mb-4">
          <button
            onClick={() => atProjectLimit ? setUpgradeModalOpen(true) : createAndOpenProject("New project")}
            className={`p-3 rounded-lg transition-colors ${atProjectLimit ? "bg-[#37373d] text-gray-500 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-500 text-white"}`}
            title={atProjectLimit ? "Upgrade for more projects" : "New Project"}
          >
            <Plus size={22} strokeWidth={2} />
          </button>
          {!paidStatus.paid && (
            <span className="text-[10px] text-gray-500" title="Free tier project limit">
              {projectCount}/{projectLimit}
            </span>
          )}
        </div>
        <button
          className="p-3 rounded-lg bg-[#37373d] text-white transition-colors"
          title="Projects"
        >
          <FolderOpen size={20} strokeWidth={1.5} />
        </button>
        <div className="flex-1" />
        <button
          onClick={() => navigate("/settings")}
          className="p-3 rounded-lg text-gray-400 hover:text-white hover:bg-[#37373d] transition-colors"
          title="Settings"
        >
          <Settings size={20} strokeWidth={1.5} />
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar: avatar right only */}
        <div className="h-12 flex items-center justify-between px-4 border-b border-[#333333] bg-[#252526] flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunQuickTest}
              disabled={testLoading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#37373d] hover:bg-[#444] text-gray-300 text-sm font-medium disabled:opacity-50 transition-colors"
              title="Run audit and show status of every functionality"
            >
              <Play size={14} />
              Run quick test
            </button>
            <button
              onClick={handleRunFinalDebuggingTest}
              disabled={testLoading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#37373d] hover:bg-[#444] text-gray-300 text-sm font-medium disabled:opacity-50 transition-colors"
              title="Run audit then VETR loop (Verify → Explain → Trace → Repair → Validate)"
            >
              <Bug size={14} />
              Run final debugging test
            </button>
          </div>
          <div className="relative" ref={avatarRef}>
            <button
              onClick={() => setAvatarOpen((o) => !o)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[#37373d] transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-[#007acc] flex items-center justify-center text-white text-sm font-medium">U</div>
              <ChevronDown size={16} className="text-gray-400" />
            </button>
            {avatarOpen && (
              <div className="absolute right-0 mt-1 py-1 w-48 bg-[#252526] border border-[#333333] rounded-md shadow-lg z-50">
                <button onClick={() => { setAvatarOpen(false); navigate("/settings"); }} className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-[#37373d] flex items-center gap-2">
                  <Settings size={14} /> Settings
                </button>
                <button onClick={() => { setAvatarOpen(false); navigate("/pricing"); }} className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-[#37373d] flex items-center gap-2">
                  <DollarSign size={14} /> Billing
                </button>
                <button onClick={() => { setAvatarOpen(false); navigate("/settings"); }} className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-[#37373d] flex items-center gap-2">
                  <User size={14} /> Account
                </button>
                <button onClick={() => setAvatarOpen(false)} className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-[#37373d] flex items-center gap-2">
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Middle: empty state or project grid */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center min-h-[40vh] text-gray-500">Loading projects...</div>
          ) : projects.length === 0 ? (
            <div
              className={`max-w-md mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center rounded-2xl border border-[#333333] bg-[#252526]/50 p-10 transition-colors ${dragOver ? "border-blue-500 bg-blue-500/5" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              {!paidStatus.paid && (
                <div className="w-full mb-8 p-4 rounded-xl bg-[#1e1e1e] border border-[#333333] text-left">
                  <label className="block text-sm font-medium text-gray-300 mb-2">What do you want to build?</label>
                  <input
                    type="text"
                    placeholder="e.g. A todo app, a landing page..."
                    value={startBuildingPrompt}
                    onChange={(e) => setStartBuildingPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (atProjectLimit ? setUpgradeModalOpen(true) : createAndOpenProject(startBuildingPrompt.trim() || "My first app"))}
                    className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333333] rounded-lg text-white placeholder-gray-500 focus:border-[#007acc] outline-none"
                  />
                  <button
                    onClick={() => (atProjectLimit ? setUpgradeModalOpen(true) : createAndOpenProject(startBuildingPrompt.trim() || "My first app"))}
                    disabled={atProjectLimit}
                    className={`mt-3 w-full py-2.5 font-medium rounded-lg transition-colors ${atProjectLimit ? "bg-[#37373d] text-gray-500 cursor-not-allowed" : "bg-[#007acc] hover:bg-[#1a8ad4] text-white"}`}
                  >
                    Start building
                  </button>
                </div>
              )}
              <h2 className="text-2xl font-semibold text-white mb-2">Let's build.</h2>
              <p className="text-gray-400 text-sm mb-6">
                Click the microphone or type in the chat. Explain in your own words what you want to build.
              </p>
              <button
                onClick={() => (atProjectLimit ? setUpgradeModalOpen(true) : createAndOpenProject("New project"))}
                disabled={atProjectLimit}
                className={`flex items-center gap-2 px-6 py-3 font-medium rounded-lg transition-colors mb-2 ${atProjectLimit ? "bg-[#37373d] text-gray-500 cursor-not-allowed" : "bg-[#007acc] hover:bg-[#1a8ad4] text-white"}`}
              >
                <Mic size={18} />
                Start with Grok
              </button>
              {atProjectLimit && (
                <button
                  onClick={() => setUpgradeModalOpen(true)}
                  className="text-sm text-blue-400 hover:underline mb-2"
                >
                  Upgrade for unlimited projects
                </button>
              )}
              <p className="text-gray-500 text-xs">
                Opens a new project. Grok will greet you and guide you through the setup questions.
              </p>
              {createError && (
                <p className="mt-3 text-xs text-amber-500/90 max-w-sm">{createError}</p>
              )}
              <div className="flex items-center gap-2 text-gray-500 text-xs mt-4">
                <Mic size={14} />
                <span>Or use the mic in the chat panel →</span>
              </div>
              {!setupComplete && (
                <p className="mt-6 text-sm text-gray-500">
                  <button onClick={() => navigate("/setup")} className="text-blue-400 hover:underline">
                    Connect stack first?
                  </button>
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                {!paidStatus.paid && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 bg-[#252526] border border-[#333333] px-2 py-1 rounded">
                      Projects: {projectCount}/{projectLimit}
                    </span>
                    {atProjectLimit && (
                      <button onClick={() => setUpgradeModalOpen(true)} className="text-xs text-blue-400 hover:underline">
                        Upgrade for unlimited
                      </button>
                    )}
                  </div>
                )}
                <div className="relative flex-1 max-w-sm">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search projects..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-[#252526] border border-[#333333] rounded-md text-sm text-white placeholder-gray-500 focus:border-[#555] outline-none"
                  />
                </div>
                <div className="flex gap-1 p-1 bg-[#252526] rounded-lg border border-[#333333] w-fit">
                  {(["all", "deployed", "drafts"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${tab === t ? "bg-[#37373d] text-white" : "text-gray-400 hover:text-white"}`}
                    >
                      {t === "all" ? "All" : t === "deployed" ? "Deployed" : "Drafts"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => navigate(`/builder/${project.id}`)}
                    className="bg-[#252526] border border-[#333333] rounded-lg overflow-hidden text-left hover:border-[#444] transition-colors group"
                  >
                    <div className="aspect-video bg-[#1e1e1e] flex items-center justify-center border-b border-[#333333]">
                      {project.thumbnail ? (
                        <img src={project.thumbnail} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <FolderOpen size={32} className="text-gray-600" />
                      )}
                    </div>
                    <div className="p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-medium text-white truncate">{project.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${statusClass(project.status)}`}>
                          {project.status}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">{project.lastEdited}</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Optional chat panel - mic/upload/copy like Grok */}
      {chatOpen && (
        <div className="w-64 bg-[#252526] border-l border-[#333333] flex flex-col flex-shrink-0">
          <div className="p-3 flex items-center justify-between border-b border-[#333333]">
            <span className="text-xs font-semibold tracking-wider text-gray-400 uppercase">Chat</span>
            <button onClick={() => setChatOpen(false)} className="p-1 rounded hover:bg-[#37373d] text-gray-400 hover:text-white">
              <X size={14} />
            </button>
          </div>
          <div className="flex-1 flex flex-col min-h-0" {...getRootProps()}>
            <input {...getInputProps()} />
            <div className={`flex-1 overflow-auto p-3 space-y-3 ${isDragActive ? "bg-blue-500/10 ring-1 ring-blue-500/50 rounded" : ""}`}>
              {chatMessages.length === 0 && (
                <p className="text-xs text-gray-500">Voice and chat here. Drop files to upload.</p>
              )}
              {chatMessages.map((m) => (
                <div key={m.id} className="group">
                  <div className="text-xs text-gray-500 mb-0.5">{m.role === "user" ? "You" : "Assistant"}</div>
                  <div className="text-sm text-gray-300 select-text break-words pr-8">{m.content}</div>
                  <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(m.content); }}
                      className="p-1 rounded hover:bg-[#37373d] text-gray-400 hover:text-white"
                      title="Copy"
                    >
                      <Copy size={12} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(window.location.href); }}
                      className="p-1 rounded hover:bg-[#37373d] text-gray-400 hover:text-white"
                      title="Copy link"
                    >
                      <Link2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="p-3 border-t border-[#333333]">
            <button
              onClick={handleMicToggle}
              className={`w-full flex items-center justify-center gap-2 py-2 rounded-md text-sm transition-colors ${listening ? "bg-red-500/20 text-red-400" : "bg-[#333] text-gray-300 hover:bg-[#444]"}`}
            >
              {listening ? <MicOff size={16} /> : <Mic size={16} />}
              {listening ? "Listening..." : "Voice"}
            </button>
            {listening && transcript && (
              <div className="mt-2 text-xs text-gray-500 italic truncate" title={transcript}>{transcript}</div>
            )}
          </div>
        </div>
      )}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed right-4 bottom-4 p-2 bg-[#252526] border border-[#333333] rounded-lg text-gray-400 hover:text-white hover:bg-[#37373d] transition-colors"
          title="Open chat"
        >
          <Mic size={20} />
        </button>
      )}
      <UpgradeBubble show={showUpgradeBubble} />
    </div>
  );
}

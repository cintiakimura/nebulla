import { useState, useRef, useEffect, useCallback, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  FolderOpen,
  Settings,
  DollarSign,
  User,
  ChevronDown,
  ChevronRight,
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
  Network,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Group, Panel, Separator } from "react-resizable-panels";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import { useDropzone } from "react-dropzone";
import { getSetupComplete } from "../lib/setupStorage";
import { getUserId, getPaidStatus, setPaidFromSuccess, isOpenMode } from "../lib/auth";
import { getApiBase, setBackendUnavailable, clearBackendUnavailable } from "../lib/api";
import { speakWithSpeechSynthesisFallback } from "../lib/grokVoiceAgent";
import { useBidirectionalVoiceAgent } from "../lib/useBidirectionalVoiceAgent";
import VoiceFallback from "../components/VoiceFallback";
import { isFirstLogin, setFirstLoginDone, getSessionToken } from "../lib/supabaseAuth";
import { runQuickAudit, type AuditEntry } from "../lib/runQuickAudit";
import {
  fetchUnbreakableRules,
  getVETRSystemPrompt,
  buildVETRUserMessage,
  buildVETRContinuationMessage,
  buildVETRFreshStartMessage,
  parseVETROutput,
  parseVETRTermination,
  getCurrentPhase,
  extractNewFailures,
  type VETRSection,
} from "../lib/vetrPrompt";
import FirstLoginOnboarding from "../components/FirstLoginOnboarding";
import UpgradeProModal from "../components/UpgradeProModal";
import UpgradeBubble from "../components/UpgradeBubble";
import MindMapFromPlan, { type MindMapData } from "../components/MindMapFromPlan";
import SettingsDrawer from "../components/SettingsDrawer";

type ProjectStatus = "Live" | "Preview" | "Draft";

function VETRCollapsibleSections({ sections }: { sections: VETRSection[] }) {
  const [open, setOpen] = useState<Set<number>>(() => new Set(sections.map((_, i) => i)));
  const toggle = (i: number) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });
  return (
    <div className="space-y-1 max-h-96 overflow-auto">
      {sections.map((s, i) => (
        <div key={i} className="rounded border border-vs-border bg-vs-bg overflow-hidden">
          <button
            type="button"
            onClick={() => toggle(i)}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-medium text-vs-foreground hover:bg-vs-hover"
          >
            {open.has(i) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {s.title}
          </button>
          {open.has(i) && (
            <pre className="text-xs text-vs-foreground whitespace-pre-wrap font-sans p-3 border-t border-vs-border max-h-48 overflow-auto">
              {s.body}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

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
  const [vetrIteration, setVetrIteration] = useState(0);
  const [vetrProgress, setVetrProgress] = useState<string>("");
  const [vetrFreshStartTriggered, setVetrFreshStartTriggered] = useState(false);
  const [startBuildingPrompt, setStartBuildingPrompt] = useState("");
  const [welcomeModalPrompt, setWelcomeModalPrompt] = useState("");
  const [welcomeModalLoading, setWelcomeModalLoading] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [useVoiceAgentWs, setUseVoiceAgentWs] = useState(true);
  const [mindMapData, setMindMapData] = useState<MindMapData | null>(null);
  const [mindMapOpen, setMindMapOpen] = useState(false);
  const [mindMapLoading, setMindMapLoading] = useState(false);
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false);
  const [settingsDrawerMessage, setSettingsDrawerMessage] = useState<string | undefined>(undefined);
  const avatarRef = useRef<HTMLDivElement>(null);
  const settingsAutoOpenedRef = useRef(false);
  const prevListeningRef = useRef(false);
  const planningProjectIdRef = useRef<string | null>(null);
  const apiBase = getApiBase() || "";

  const KEY_SEEN_WELCOME = "kyn_seen_welcome";
  const KEY_MIC_TOOLTIP = "kyn_mic_tooltip_dismissed";
  const [showMicTooltip, setShowMicTooltip] = useState(() =>
    typeof sessionStorage !== "undefined" ? !sessionStorage.getItem(KEY_MIC_TOOLTIP) : false
  );
  const seenWelcome = typeof window !== "undefined" && localStorage.getItem(KEY_SEEN_WELCOME) === "1";
  const showWelcomeModal = !loading && projects.length === 0 && !seenWelcome && showFirstLoginOnboarding === false;
  const paidStatus = getPaidStatus();
  const projectCount = projects.length;
  const atProjectLimit = !paidStatus.paid && projectCount >= (limits?.projectLimit ?? projectLimit);

  const savePlanToProject = useCallback(
    async (projectId: string, messages: { role: string; content: string }[]) => {
      try {
        const userId = await getUserId();
        const token = await getSessionToken();
        await fetch(`${apiBase}/api/users/${userId}/projects/${projectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ plan: { chat_history: messages } }),
        });
      } catch (_) {}
    },
    [apiBase]
  );

  const createPlanningProjectDraft = useCallback(async () => {
    if (planningProjectIdRef.current || atProjectLimit) return;
    const api = getApiBase();
    if (!api) return;
    try {
      const userId = await getUserId();
      const token = await getSessionToken();
      const res = await fetch(`${api}/api/users/${userId}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ name: "Planning" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.id) {
        planningProjectIdRef.current = data.id;
        setProjects((prev) => [
          ...prev,
          { id: data.id, name: data.name || "Planning", status: "Draft" as ProjectStatus, lastEdited: "Just now", thumbnail: null, url: null },
        ]);
      }
    } catch (_) {}
  }, [atProjectLimit]);

  const { start: startVoiceAgent, stop: stopVoiceAgent, status: voiceAgentStatus } = useBidirectionalVoiceAgent(apiBase, {
    onUserTranscript(text) {
      const userMsg = { id: crypto.randomUUID(), role: "user" as const, content: text };
      setChatMessages((prev) => {
        const next = [...prev, userMsg];
        if (prev.length === 0) createPlanningProjectDraft();
        return next;
      });
    },
    onAssistantTranscript(text) {
      const assistantMsg = { id: crypto.randomUUID(), role: "assistant" as const, content: text };
      setChatMessages((prev) => {
        const next = [...prev, assistantMsg];
        const pid = planningProjectIdRef.current;
        if (pid) savePlanToProject(pid, next.map((m) => ({ role: m.role, content: m.content })));
        return next;
      });
    },
    onError(msg) {
      setUseVoiceAgentWs(false);
      setSettingsDrawerMessage("Service down—try later");
      setChatMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: `Voice unavailable: ${msg}. Use "Type instead" or text chat.` }]);
    },
  });

  const { transcript, listening, resetTranscript } = useSpeechRecognition();
  useEffect(() => () => { stopVoiceAgent(); }, [stopVoiceAgent]);
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


  // Send user text to chat API (used by VoiceFallback and voice effect)
  const sendUserText = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t) return;
    const apiBase = getApiBase() || "";
    const userId = await getUserId();
    const history = chatMessages.map((m) => ({ role: m.role, content: m.content }));
    const messages = [...history, { role: "user" as const, content: t }];
    try {
      const res = await fetch(`${apiBase}/api/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, userId }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: { content?: string }; error?: string; details?: string };
      if (res.status === 503) setSettingsDrawerMessage("Service down—try later");
      const content = res.ok && data.message?.content ? data.message.content : (data.error && data.details ? `${data.error}: ${data.details}` : data.error || "Service down—try later");
      const userMsg = { id: crypto.randomUUID(), role: "user" as const, content: t };
      const assistantMsg = { id: crypto.randomUUID(), role: "assistant" as const, content };
      setChatMessages((prev) => [...prev, userMsg, assistantMsg]);
    } catch (e) {
      const err = e instanceof Error ? e.message : "Network error";
      setChatMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: t }, { id: crypto.randomUUID(), role: "assistant", content: `Error: ${err}` }]);
    }
  }, [chatMessages]);

  // When user stops speaking (mic off), send transcript to Grok and play reply via TTS (only when NOT using bidirectional Voice Agent WS)
  const voiceCancelRef = useRef(false);
  useEffect(() => {
    if (useVoiceAgentWs) return;
    const wasListening = prevListeningRef.current;
    prevListeningRef.current = listening;
    if (!wasListening || listening) return;
    const text = (typeof transcript === "string" ? transcript : "").trim();
    if (!text) return;

    voiceCancelRef.current = false;
    setVoiceLoading(true);
    (async () => {
      try {
        const apiBase = getApiBase() || "";
        const userId = await getUserId();
        const history = chatMessages.map((m) => ({ role: m.role, content: m.content }));
        const messages = [...history, { role: "user" as const, content: text }];
        const res = await fetch(`${apiBase}/api/agent/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages, userId }),
        });
        if (voiceCancelRef.current) return;
        const data = (await res.json().catch(() => ({}))) as { message?: { content?: string }; error?: string; details?: string };
        if (res.status === 503) {
          setSettingsDrawerMessage("Service down—try later");
          setSettingsDrawerOpen(true);
        }
        const content = res.ok && data.message?.content ? data.message.content : (data.error && data.details ? `${data.error}: ${data.details}` : data.error || "Service down—try later");

        const userMsg = { id: crypto.randomUUID(), role: "user" as const, content: text };
        const assistantMsg = { id: crypto.randomUUID(), role: "assistant" as const, content };
        setChatMessages((prev) => [...prev, userMsg, assistantMsg]);

        if (res.ok && content && !voiceCancelRef.current) {
          try {
            const ttsRes = await fetch(`${apiBase || ""}/api/tts`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: content.slice(0, 4096), voice_id: "eve" }),
            });
            if (ttsRes.status === 503) {
              setSettingsDrawerMessage("Service down—try later");
              setSettingsDrawerOpen(true);
            }
            if (ttsRes.ok && !voiceCancelRef.current) {
              const blob = await ttsRes.blob();
              const url = URL.createObjectURL(blob);
              const audio = new Audio(url);
              audio.onended = () => URL.revokeObjectURL(url);
              audio.play().catch(() => {});
            }
          } catch (_) {
            speakWithSpeechSynthesisFallback(content.slice(0, 4096));
          }
        }
      } catch (e) {
        if (!voiceCancelRef.current) {
          const err = e instanceof Error ? e.message : "Network error";
          setChatMessages((prev) => [
            ...prev,
            { id: crypto.randomUUID(), role: "user", content: text },
            { id: crypto.randomUUID(), role: "assistant", content: `Something went wrong: ${err}. Check Backend URL and GROK_API_KEY.` },
          ]);
        }
      } finally {
        if (!voiceCancelRef.current) {
          resetTranscript();
          setVoiceLoading(false);
        }
      }
    })();
    return () => { voiceCancelRef.current = true; };
  }, [listening, transcript, chatMessages]);

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
      const res = await fetch(`${api || ""}/api/users/${userId}/projects`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name }),
      });
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
      if (res.status === 403 && (data as { error?: string }).error === "read_only_expired") {
        setCreateError((data as { message?: string }).message ?? "Read-only mode. Upgrade to create new projects.");
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
          if (chatMessages.length > 0) {
            try {
              await fetch(`${api || ""}/api/users/${userId}/projects/${project.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ plan: { chat_history: chatMessages } }),
              });
            } catch (_) {}
          }
          navigate(`/builder/${project.id}`);
        } catch {
          setCreateError("Could not create project. Try again.");
        }
        return;
      }
      setBackendUnavailable();
      setCreateError("Backend didn’t respond. Check Settings → Backend URL.");
    } catch (_err) {
      setBackendUnavailable();
      setCreateError("Couldn’t reach the backend. Check Settings → Backend URL.");
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
    if (useVoiceAgentWs) {
      if (voiceAgentStatus === "listening" || voiceAgentStatus === "connecting" || voiceAgentStatus === "speaking") stopVoiceAgent();
      else startVoiceAgent();
      return;
    }
    if (listening) SpeechRecognition.stopListening();
    else SpeechRecognition.startListening({ continuous: true });
  };

  const isVoiceActive = useVoiceAgentWs ? (voiceAgentStatus === "listening" || voiceAgentStatus === "connecting" || voiceAgentStatus === "speaking") : listening;

  const MIND_MAP_PROMPT = `Based on our planning conversation above, output a mind map as a single JSON object with this exact shape (no other text):
{"nodes":[{"id":"1","label":"App Idea","type":"central"},{"id":"2","label":"Objective","type":"branch"},{"id":"3","label":"Users","type":"branch"}],"edges":[{"source":"1","target":"2"},{"source":"1","target":"3"}]}
Use one central node "App Idea" and branch nodes for each planning theme we covered (objective, users, data, constraints, branding, pages, etc). Label branches with short titles. Output only the JSON.`;

  const handleShowMindMap = async () => {
    const api = getApiBase();
    if (!api || chatMessages.length === 0) {
      setMindMapData(null);
      setMindMapOpen(true);
      return;
    }
    setMindMapLoading(true);
    setMindMapOpen(true);
    try {
      const history = chatMessages.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch(`${api}/api/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...history, { role: "user", content: MIND_MAP_PROMPT }], userId: await getUserId() }),
      });
      if (res.status === 503) {
        setSettingsDrawerMessage("Service down—try later");
        setSettingsDrawerOpen(true);
      }
      const data = (await res.json().catch(() => ({}))) as { message?: { content?: string } };
      const content = data.message?.content ?? "";
      const jsonMatch = content.match(/\{[\s\S]*"nodes"[\s\S]*"edges"[\s\S]*\}/) || content.match(/\{[\s\S]*\}/);
      const raw = jsonMatch ? jsonMatch[0] : content;
      let parsed: MindMapData | null = null;
      try {
        parsed = JSON.parse(raw) as MindMapData;
        if (!Array.isArray(parsed?.nodes) || !Array.isArray(parsed?.edges)) parsed = null;
      } catch (_) {}
      setMindMapData(parsed);
    } catch (_) {
      setMindMapData(null);
    } finally {
      setMindMapLoading(false);
    }
  };

  const handleRunQuickTest = async () => {
    const apiBase = getApiBase();
    if (!apiBase) {
      setTestReport([{ name: "Backend", ok: false, detail: "Backend URL not set or unreachable" }]);
      setTestReportOpen(true);
      return;
    }
    console.log("[Run test] Starting audit…");
    setTestLoading(true);
    setVetrResult(null);
    try {
      const results = await runQuickAudit(apiBase);
      setTestReport(results);
      setTestReportOpen(true);
      const pass = results.filter((r) => r.ok).length;
      const fail = results.filter((r) => !r.ok).length;
      console.log("[Run test] Audit complete:", { total: results.length, pass, fail });
    } catch (e) {
      setTestReport([{ name: "Audit", ok: false, detail: e instanceof Error ? e.message : String(e) }]);
      setTestReportOpen(true);
      console.log("[Run test] Error:", e);
    } finally {
      setTestLoading(false);
    }
  };

  const handleRunFinalDebuggingTest = async () => {
    const apiBase = getApiBase();
    if (!apiBase) {
      setTestReport([{ name: "Backend", ok: false, detail: "Backend URL not set or unreachable" }]);
      setTestReportOpen(true);
      return;
    }
    console.log("[VETR] Phase 0: Starting audit…");
    setTestLoading(true);
    setVetrResult(null);
    setVetrIteration(0);
    setVetrProgress("Running audit…");
    setVetrFreshStartTriggered(false);
    setTestReportOpen(true);
    try {
      const results = await runQuickAudit(apiBase);
      setTestReport(results);
      const reportText = results.map((r) => `[${r.ok ? "PASS" : "FAIL"}] ${r.name}${r.detail ? " — " + r.detail : ""}`).join("\n");
      const failCount = results.filter((r) => !r.ok).length;
      console.log("[VETR] Phase 0 done. Failures:", failCount);

      setVetrProgress("Loading UNBREAKABLE RULES…");
      const unbreakableRules = await fetchUnbreakableRules();

      setVetrLoading(true);
      const messages: { role: string; content: string }[] = [];
      const MAX_ITERATIONS = 7;
      let additionalFeedbackAccumulated = "";
      let previousOutput = "";
      let iteration = 1;
      let done = false;
      let triggerFreshStart = false;

      const initialUser =
        getVETRSystemPrompt(1, unbreakableRules) + "\n\n" + buildVETRUserMessage(reportText);
      messages.push({ role: "user", content: initialUser });

      while (iteration <= MAX_ITERATIONS && !done) {
        setVetrIteration(iteration);
        setVetrProgress(`Running VETR Iteration ${iteration}/${MAX_ITERATIONS} — calling Grok…`);
        const res = await fetch(`${apiBase}/api/agent/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages }),
        });
        if (res.status === 503) {
          setSettingsDrawerMessage("Service down—try later");
          setSettingsDrawerOpen(true);
          setVetrProgress("Service down—try later.");
          setVetrResult("Grok not available. Add your API key in Settings.");
          done = true;
          break;
        }
        const data = await res.json().catch(() => ({}));
        const content =
          res.ok && (data as { message?: { content?: string } }).message?.content
            ? (data as { message: { content: string } }).message.content
            : "Could not run VETR analysis.";
        previousOutput = content;
        messages.push({ role: "assistant", content });
        setVetrResult(content);
        setVetrProgress(`Running VETR Iteration ${iteration}/${MAX_ITERATIONS} — ${getCurrentPhase(content)}`);

        const { terminated, confidence, freshStart } = parseVETRTermination(content);
        if (freshStart) triggerFreshStart = true;
        if (terminated) {
          console.log("[VETR] Terminated. Confidence:", confidence);
          setVetrProgress(confidence != null ? `Done. Confidence: ${confidence}%` : "Done.");
          done = true;
          break;
        }
        if (iteration >= MAX_ITERATIONS) {
          setVetrProgress("Max iterations (7) reached.");
          done = true;
          break;
        }
        additionalFeedbackAccumulated = extractNewFailures(content) + additionalFeedbackAccumulated;
        iteration += 1;
        if (triggerFreshStart || (iteration >= 4 && /no progress|still fail|same failure|stalled/i.test(content))) {
          setVetrFreshStartTriggered(true);
          setVetrProgress(`Iteration ${iteration}/7 — Strategic Fresh Start: resetting context and restarting generation.`);
          messages.push({ role: "user", content: buildVETRFreshStartMessage(content, reportText) });
          triggerFreshStart = false;
          additionalFeedbackAccumulated = "";
        } else {
          setVetrProgress(`Iteration ${iteration}/7 — ${getCurrentPhase(content)}`);
          messages.push({
            role: "user",
            content: buildVETRContinuationMessage(iteration, content, reportText, additionalFeedbackAccumulated),
          });
        }
      }
      if (!done) setVetrProgress((p) => (p.startsWith("Done") || p.includes("reached") ? p : `Iteration ${iteration}/${MAX_ITERATIONS} complete.`));
    } catch (e) {
      setTestReport([{ name: "Audit", ok: false, detail: e instanceof Error ? e.message : String(e) }]);
      setVetrResult(e instanceof Error ? e.message : String(e));
      console.log("[VETR] Error:", e);
    } finally {
      setTestLoading(false);
      setVetrLoading(false);
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
    s === "Live" ? "bg-green-500/10 text-green-400" : s === "Preview" ? "bg-[#00BFFF]/10 text-[#00BFFF]" : "bg-gray-500/10 text-gray-400";

  return (
    <div className="flex flex-col h-screen bg-vs-bg text-vs-foreground overflow-hidden font-sans">
      {showFirstLoginOnboarding === true && (
        <div className="fixed inset-0 z-[100]">
          <FirstLoginOnboarding
            onComplete={async () => {
              setFirstLoginDone();
              setShowFirstLoginOnboarding(false);
              const api = getApiBase();
              if (api) {
                try {
                  const userId = await getUserId();
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
          <div className="fixed inset-0 z-[99] flex items-center justify-center p-4 bg-background/90">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-vs-editor border border-vs-border rounded-xl shadow-xl max-w-md w-full p-6"
            >
              <h2 className="text-xl font-semibold text-white mb-2">Welcome!</h2>
              <p className="text-gray-400 text-sm mb-4">What do you want to build today?</p>
              <input
                type="text"
                value={welcomeModalPrompt}
                onChange={(e) => setWelcomeModalPrompt(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleWelcomeStart()}
                placeholder="e.g. A todo app, a landing page..."
                className="w-full px-4 py-3 bg-[#1e1e1e] border border-[#333333] rounded-lg text-white placeholder-gray-500 focus:border-[#00BFFF] outline-none mb-4"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleWelcomeStart}
                  disabled={welcomeModalLoading || atProjectLimit}
                  className="flex-1 py-2.5 bg-[#00BFFF] hover:bg-[#40d4ff] text-white font-medium rounded-lg disabled:opacity-50"
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
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-background/80" onClick={() => setTestReportOpen(false)}>
            <div
              className="bg-vs-editor border border-vs-border rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-vs-border">
                <h3 className="text-sm font-semibold text-white">
                  {vetrLoading ? "Applying VETR loop…" : testLoading && !testReport ? "Running test…" : "Audit report"}
                </h3>
                <button onClick={() => setTestReportOpen(false)} className="p-1 rounded hover:bg-vs-hover text-vs-muted hover:text-vs-foreground">
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-4">
                {testReport === null ? (
                  <p className="text-sm text-gray-500">Running audit…</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-vs-border">
                      <p className="text-sm font-medium text-vs-foreground">
                        {testReport.filter((r) => r.ok).length} of {testReport.length} functionalities passed
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          const text = testReport.map((r) => `[${r.ok ? "PASS" : "FAIL"}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`).join("\n");
                          navigator.clipboard.writeText(text);
                        }}
                        className="text-xs px-2 py-1 rounded bg-vs-hover text-vs-muted hover:text-vs-foreground"
                      >
                        Copy report
                      </button>
                    </div>
                    <div className="space-y-2">
                      {testReport.map((r, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <span className={r.ok ? "text-green-500 font-medium shrink-0" : "text-amber-500 font-medium shrink-0"}>
                            {r.ok ? "PASS" : "FAIL"}
                          </span>
                          <div className="min-w-0 flex-1">
                            <span className="text-gray-300">{r.name}</span>
                            {r.detail ? <span className="text-gray-500"> — {r.detail}</span> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                    {(vetrProgress || vetrResult) && (
                      <div className="pt-4 border-t border-vs-border">
                        <h4 className="text-xs font-semibold text-vs-muted uppercase tracking-wider mb-2">VETR analysis (Verify → Explain → Trace → Repair → Validate)</h4>
                        {(vetrProgress || vetrIteration > 0) && (
                          <p className="text-xs text-vs-accent font-medium mb-2">
                            {vetrProgress || `Iteration ${vetrIteration}/7`}
                          </p>
                        )}
                        {vetrFreshStartTriggered && (
                          <div className="mb-2 rounded-lg bg-amber-500/15 border border-amber-500/40 px-3 py-2 text-xs text-amber-200">
                            Resetting context and restarting generation.
                          </div>
                        )}
                        {vetrResult && (() => {
                          const { iteration, sections } = parseVETROutput(vetrResult);
                          return (
                            <>
                              {iteration && (
                                <p className="text-xs text-vs-foreground/80 mb-2">{iteration}</p>
                              )}
                              {sections.length > 1 ? (
                                <VETRCollapsibleSections sections={sections} />
                              ) : (
                                <pre className="text-xs text-vs-foreground whitespace-pre-wrap font-sans bg-vs-bg p-3 rounded overflow-auto max-h-96">
                                  {vetrResult}
                                </pre>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}
                    {vetrLoading && (
                      <p className="text-sm text-gray-500">{vetrProgress || "Running VETR loop: Phase 0 → Phase 2 (hypotheses, root cause, trace) → Phase 3 (minimal diff) → Phase 5 (simulate) → Phase 7 termination…"}</p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-1 min-h-0 min-w-0">
      {/* Left sidebar - explorer style */}
      <div className="w-14 flex flex-col items-center py-4 bg-vs-editor border-r border-vs-border flex-shrink-0">
        <div className="flex flex-col items-center gap-1 mb-4">
          <button
            onClick={() => atProjectLimit ? setUpgradeModalOpen(true) : createAndOpenProject("New project")}
            className={`p-3 rounded-lg transition-colors ${atProjectLimit ? "bg-vs-hover text-vs-muted cursor-not-allowed" : "btn-accent text-white"}`}
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
          className="p-3 rounded-lg bg-[#1e1e1e] text-white transition-colors"
          title="Projects"
        >
          <FolderOpen size={20} strokeWidth={1.5} />
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => { setSettingsDrawerMessage(undefined); setSettingsDrawerOpen(true); }}
          className="p-3 rounded-lg text-vs-muted hover:text-vs-foreground hover:bg-vs-hover transition-colors"
          title="Settings & API Keys"
        >
          <Settings size={20} strokeWidth={1.5} />
        </button>
      </div>

      <Group orientation="horizontal" className="flex-1 min-w-0" defaultLayout={{ main: 55, chat: 30 }}>
        <Panel id="main" defaultSize={55} minSize={30} className="flex flex-col min-w-0 overflow-hidden">
      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar: avatar right only */}
        <div className="h-12 flex items-center justify-between px-4 border-b border-vs-border bg-vs-editor flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunQuickTest}
              disabled={testLoading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-vs-hover hover:bg-[#222] text-vs-foreground text-sm font-medium disabled:opacity-50 transition-colors"
              title="Run audit test and output report with status of every single functionality"
            >
              <Play size={14} />
              Run test
            </button>
            <button
              onClick={handleRunFinalDebuggingTest}
              disabled={testLoading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-vs-hover hover:bg-[#222] text-vs-foreground text-sm font-medium disabled:opacity-50 transition-colors"
              title="Run audit then apply VETR loop: Verify → Explain → Trace → Repair → Validate (self-debug with hypotheses, root cause, fix strategy)"
            >
              <Bug size={14} />
              Final debugging test
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { setSettingsDrawerMessage(undefined); setSettingsDrawerOpen(true); }}
              className="p-2 rounded-md hover:bg-vs-hover text-vs-muted hover:text-vs-foreground transition-colors"
              title="Settings & API Keys"
              aria-label="Settings"
            >
              <Settings size={18} strokeWidth={1.5} />
            </button>
            <div className="relative" ref={avatarRef}>
            <button
              onClick={() => setAvatarOpen((o) => !o)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[#1e1e1e] transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-vs-accent flex items-center justify-center text-white text-sm font-medium">U</div>
              <ChevronDown size={16} className="text-gray-400" />
            </button>
            {avatarOpen && (
              <div className="absolute right-0 mt-1 py-1 w-48 bg-vs-editor border border-vs-border rounded-md shadow-lg z-50">
                <button onClick={() => { setAvatarOpen(false); navigate("/settings"); }} className="w-full px-4 py-2 text-left text-sm text-vs-foreground hover:bg-vs-hover flex items-center gap-2">
                  <Settings size={14} /> Settings
                </button>
                <button onClick={() => { setAvatarOpen(false); navigate("/pricing"); }} className="w-full px-4 py-2 text-left text-sm text-vs-foreground hover:bg-vs-hover flex items-center gap-2">
                  <DollarSign size={14} /> Billing
                </button>
                <button onClick={() => { setAvatarOpen(false); navigate("/settings"); }} className="w-full px-4 py-2 text-left text-sm text-vs-foreground hover:bg-vs-hover flex items-center gap-2">
                  <User size={14} /> Account
                </button>
                <button onClick={() => setAvatarOpen(false)} className="w-full px-4 py-2 text-left text-sm text-vs-foreground hover:bg-vs-hover flex items-center gap-2">
                  Logout
                </button>
              </div>
            )}
            </div>
          </div>
        </div>

        {/* Middle: empty state or project grid */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center min-h-[40vh] text-gray-500">Loading projects...</div>
          ) : projects.length === 0 ? (
            <div
              className={`max-w-md mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center rounded-2xl border border-vs-border bg-vs-editor/80 p-10 transition-colors ${dragOver ? "border-vs-accent bg-vs-accent/10" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              {!paidStatus.paid && (
                <div className="w-full mb-8 p-4 rounded-xl bg-vs-bg border border-vs-border text-left">
                  <label className="block text-sm font-medium text-gray-300 mb-2">What do you want to build?</label>
                  <input
                    type="text"
                    placeholder="e.g. A todo app, a landing page..."
                    value={startBuildingPrompt}
                    onChange={(e) => setStartBuildingPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (atProjectLimit ? setUpgradeModalOpen(true) : createAndOpenProject(startBuildingPrompt.trim() || "My first app"))}
                    className="w-full px-4 py-3 bg-[#0a0a0a] border border-vs-border rounded-lg text-white placeholder-vs-muted focus:border-vs-accent outline-none"
                  />
                  <button
                    onClick={() => (atProjectLimit ? setUpgradeModalOpen(true) : createAndOpenProject(startBuildingPrompt.trim() || "My first app"))}
                    disabled={atProjectLimit}
                    className={`mt-3 w-full py-2.5 font-medium rounded-lg transition-colors ${atProjectLimit ? "bg-[#1e1e1e] text-[#9ca3af] cursor-not-allowed" : "bg-[#00BFFF] hover:bg-[#40d4ff] text-white hover:scale-105"}`}
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
                className={`flex items-center gap-2 px-6 py-3 font-medium rounded-lg transition-colors mb-2 ${atProjectLimit ? "bg-vs-hover text-vs-muted cursor-not-allowed" : "btn-accent text-white"}`}
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
                    <span className="text-xs text-vs-muted bg-vs-editor border border-vs-border px-2 py-1 rounded">
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
                <div className="flex gap-1 p-1 bg-vs-editor rounded-lg border border-vs-border w-fit">
                  {(["all", "deployed", "drafts"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${tab === t ? "bg-[#1e1e1e] text-white" : "text-gray-400 hover:text-white"}`}
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
                    className="bg-vs-editor border border-vs-border rounded-lg overflow-hidden text-left hover:border-vs-hover transition-colors group"
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
        </Panel>
        <Separator id="resize-chat" className="w-2 bg-vs-border hover:bg-vs-accent data-[resize-handle-active]:bg-vs-accent transition-colors" />
        <Panel id="chat" defaultSize={30} minSize={15} className="flex flex-col min-w-0 overflow-hidden">
      {/* Optional chat panel - mic/upload/copy like Grok */}
      {chatOpen ? (
        <div className="flex-1 flex flex-col min-w-0 bg-vs-editor border-l border-vs-border">
          <div className="p-3 flex items-center justify-between border-b border-vs-border">
            <span className="text-xs font-semibold tracking-wider text-gray-400 uppercase">Chat</span>
            <div className="flex items-center gap-1">
              <button
                onClick={handleShowMindMap}
                disabled={mindMapLoading}
                className="p-1.5 rounded hover:bg-vs-hover text-vs-muted hover:text-vs-foreground disabled:opacity-50"
                title="Show mind map from conversation"
              >
                <Network size={14} />
              </button>
              <button onClick={() => setChatOpen(false)} className="p-1 rounded hover:bg-vs-hover text-vs-muted hover:text-vs-foreground">
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="flex-1 flex flex-col min-h-0" {...getRootProps()}>
            <input {...getInputProps()} />
            <div className={`flex-1 overflow-auto p-3 space-y-3 ${isDragActive ? "bg-[#00BFFF]/10 ring-1 ring-[#00BFFF]/50 rounded" : ""}`}>
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
                      className="p-1 rounded hover:bg-vs-hover text-vs-muted hover:text-vs-foreground"
                      title="Copy"
                    >
                      <Copy size={12} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(window.location.href); }}
                      className="p-1 rounded hover:bg-vs-hover text-vs-muted hover:text-vs-foreground"
                      title="Copy link"
                    >
                      <Link2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="p-3 border-t border-vs-border relative">
            {showMicTooltip && (
              <div className="absolute bottom-full left-0 right-0 mb-2 px-3 py-2 rounded-lg bg-vs-editor border border-vs-border text-sm text-vs-foreground shadow-lg flex items-center justify-between gap-2">
                <span>Click the microphone and say hi.</span>
                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.setItem(KEY_MIC_TOOLTIP, "1");
                    setShowMicTooltip(false);
                  }}
                  className="shrink-0 p-1 rounded text-gray-400 hover:text-white"
                  aria-label="Dismiss"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            <button
              onClick={handleMicToggle}
              disabled={voiceLoading && !useVoiceAgentWs}
              className={`w-full flex items-center justify-center gap-2 py-2 rounded-md text-sm transition-colors ${isVoiceActive ? "bg-red-500/20 text-red-400" : voiceLoading && !useVoiceAgentWs ? "bg-[#333] text-gray-500" : "bg-[#333] text-gray-300 hover:bg-[#444]"}`}
            >
              {isVoiceActive ? <MicOff size={16} /> : <Mic size={16} />}
              {useVoiceAgentWs
                ? voiceAgentStatus === "connecting"
                  ? "Connecting…"
                  : voiceAgentStatus === "listening"
                    ? "Listening…"
                    : voiceAgentStatus === "speaking"
                      ? "Speaking…"
                      : "Voice (Grok)"
                : listening
                  ? "Listening..."
                  : voiceLoading
                    ? "Grok…"
                    : "Voice"}
            </button>
            {listening && !useVoiceAgentWs && transcript && (
              <div className="mt-2 text-xs text-gray-500 italic truncate" title={transcript}>{transcript}</div>
            )}
            {voiceAgentStatus === "error" && (
              <div className="mt-2 flex flex-col gap-2">
                <span className="text-xs text-vs-muted">Service down—try later.</span>
                <VoiceFallback onTextSubmit={sendUserText} />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-vs-editor border-l border-vs-border">
          <button onClick={() => setChatOpen(true)} className="p-3 rounded-lg bg-vs-hover text-vs-muted hover:text-vs-foreground transition-colors" title="Open chat">
            <Mic size={24} />
          </button>
        </div>
      )}
        </Panel>
      </Group>
      </div>

      {/* Status bar: Run test + Final debugging test always visible */}
      <div className="h-8 flex-shrink-0 flex items-center justify-between px-3 bg-vs-status text-vs-foreground text-xs font-medium border-t border-vs-border gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex-shrink-0">Kyn</span>
          <button
            type="button"
            onClick={handleRunQuickTest}
            disabled={testLoading}
            className="flex items-center gap-1 px-2 py-1 rounded bg-vs-hover hover:bg-vs-accent/20 text-vs-foreground disabled:opacity-50"
            title="Run audit test — status of every functionality"
          >
            <Play size={12} />
            Run test
          </button>
          <button
            type="button"
            onClick={handleRunFinalDebuggingTest}
            disabled={testLoading}
            className="flex items-center gap-1 px-2 py-1 rounded bg-vs-hover hover:bg-vs-accent/20 text-vs-foreground disabled:opacity-50"
            title="Final debugging test — VETR loop"
          >
            <Bug size={12} />
            Final debugging test
          </button>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => { setSettingsDrawerMessage(undefined); setSettingsDrawerOpen(true); }}
            className="p-1.5 rounded hover:bg-vs-hover text-vs-muted hover:text-vs-foreground"
            title="Settings & API Keys"
            aria-label="Settings"
          >
            <Settings size={14} />
          </button>
          <span>{projects.length} project{projects.length !== 1 ? "s" : ""}</span>
        </div>
      </div>
      {mindMapOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4" onClick={() => setMindMapOpen(false)}>
          <div className="w-full max-w-4xl h-[80vh] bg-vs-editor border border-vs-border rounded-lg shadow-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b border-vs-border">
              <span className="text-sm font-medium text-gray-300">Mind map</span>
              <button onClick={() => setMindMapOpen(false)} className="p-1.5 rounded hover:bg-vs-hover text-vs-muted hover:text-vs-foreground">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              {mindMapLoading ? (
                <div className="flex items-center justify-center h-full text-gray-500">Generating mind map…</div>
              ) : (
                <MindMapFromPlan data={mindMapData} className="h-full w-full" />
              )}
            </div>
          </div>
        </div>
      )}
      {!chatOpen && (
        <div className="fixed right-4 bottom-4 flex flex-col items-end gap-2">
          {showMicTooltip && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-vs-editor border border-vs-border text-sm text-vs-foreground shadow-lg">
              <span>Click the microphone and say hi.</span>
              <button
                type="button"
                onClick={() => {
                  sessionStorage.setItem(KEY_MIC_TOOLTIP, "1");
                  setShowMicTooltip(false);
                }}
                className="p-1 rounded text-gray-400 hover:text-white"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          )}
          <button
            onClick={() => setChatOpen(true)}
            className="p-2 bg-vs-editor border border-vs-border rounded-lg text-vs-muted hover:text-vs-foreground hover:bg-vs-hover transition-colors"
            title="Open chat"
          >
            <Mic size={20} />
          </button>
        </div>
      )}
      <UpgradeBubble show={showUpgradeBubble} />

      <SettingsDrawer
        open={settingsDrawerOpen}
        onClose={() => { setSettingsDrawerOpen(false); setSettingsDrawerMessage(undefined); }}
        initialMessage={settingsDrawerMessage}
      />
    </div>
  );
}

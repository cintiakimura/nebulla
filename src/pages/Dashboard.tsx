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
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import { useDropzone } from "react-dropzone";
import { getSetupComplete } from "../lib/setupStorage";
import { getUserId, getPaidStatus } from "../lib/auth";
import { getApiBase, isBackendAvailable, setBackendUnavailable, clearBackendUnavailable } from "../lib/api";
import { isFirstLogin, setFirstLoginDone } from "../lib/supabaseAuth";
import FirstLoginOnboarding from "../components/FirstLoginOnboarding";
import UpgradeProModal from "../components/UpgradeProModal";

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
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

  const { transcript, listening } = useSpeechRecognition();
  const paidStatus = getPaidStatus();
  const projectCount = projects.length;
  const atProjectLimit = !paidStatus.paid && projectCount >= projectLimit;
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

  // Fetch free-tier project limit for display
  useEffect(() => {
    let cancelled = false;
    getUserId().then((userId) => {
      if (cancelled) return;
      const apiBase = getApiBase();
      fetch(`${apiBase || ""}/api/users/${userId}/limits`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { projectLimit?: number } | null) => {
          if (!cancelled && data?.projectLimit != null) {
            clearBackendUnavailable();
            setProjectLimit(data.projectLimit);
          }
        })
        .catch(() => {});
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const api = getApiBase();
    getUserId().then((userId) => {
      if (cancelled) return;
      fetch(`${api || ""}/api/users/${userId}/projects`)
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
    });
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
      const res = await fetch(`${api}/api/users/${userId}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403 && (data as { error?: string }).error === "free_project_limit_reached") {
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
                  const res = await fetch(`${api}/api/users/${userId}/projects`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
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
          <div className="flex-1" />
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
    </div>
  );
}

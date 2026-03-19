import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FileCode, Layout, Settings } from "lucide-react";
import { isOpenMode } from "../lib/auth";

const KEY_USER_ID = "kyn_user_id";

export default function Setup() {
  const navigate = useNavigate();
  const [chatMessages] = useState<{ id: string; role: "user" | "assistant"; content: string }[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isOpenMode()) return;
    if (!localStorage.getItem(KEY_USER_ID)) {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  if (typeof window !== "undefined" && !isOpenMode() && !localStorage.getItem(KEY_USER_ID)) {
    return null;
  }

  return (
    <div className="flex h-screen bg-background text-white overflow-hidden font-sans">
      {/* Activity Bar - IDE blue theme */}
      <div className="w-12 bg-sidebar-bg flex flex-col items-center py-4 border-r border-border z-10">
        <button
          onClick={() => navigate("/builder")}
          className="p-2 text-muted hover:text-primary hover:bg-primary/10 rounded-md mb-4"
          title="Explorer"
        >
          <FileCode size={24} strokeWidth={1.5} />
        </button>
        <button
          onClick={() => navigate("/builder")}
          className="p-2 text-muted hover:text-primary hover:bg-primary/10 rounded-md mb-4"
          title="Deploy"
        >
          <Layout size={24} strokeWidth={1.5} />
        </button>
        <div className="mt-auto flex flex-col gap-4">
          <button
            onClick={() => navigate("/settings")}
            className="p-2 text-muted hover:text-primary hover:bg-primary/10 rounded-md"
            title="Settings"
          >
            <Settings size={24} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Sidebar - minimal when on setup */}
      <div className="w-64 bg-sidebar-bg border-r border-border flex flex-col">
        <div className="p-3 text-xs font-semibold tracking-wider text-primary uppercase">
          Setup
        </div>
        <div className="flex-1 overflow-auto px-3 text-sm text-muted">
          Connect GitHub and set your domain in Settings.
        </div>
      </div>

      {/* Center: open for preview; config is in Settings */}
      <div className="flex-1 flex flex-col min-w-0 w-full overflow-hidden bg-background">
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md text-center">
            <p className="text-white text-sm mb-4">
              Projects are created under your profile. Connect GitHub and set your domain in Settings.
            </p>
            <button
              type="button"
              onClick={() => navigate("/settings")}
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm rounded transition-colors"
            >
              Open Settings
            </button>
          </div>
        </div>
      </div>

      {/* Chat Panel - same width as Explorer */}
      <div className="w-64 bg-sidebar-bg border-l border-border flex flex-col flex-shrink-0">
        <div className="p-3 text-xs font-semibold tracking-wider text-primary uppercase border-b border-border">
          Chat
        </div>
        <div className="flex-1 overflow-auto p-3 text-sm text-muted">
          {chatMessages.length === 0 ? (
            <p>Voice and chat here once you’re building.</p>
          ) : (
            chatMessages.map((msg) => (
              <div key={msg.id} className="mb-2">
                <div className="text-xs text-muted">{msg.role === "user" ? "You" : "Assistant"}</div>
                <div className="text-white">{msg.content}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

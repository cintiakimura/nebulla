import React, { useState } from "react";
import { getApiBase } from "../lib/api";
import { getSessionToken } from "../lib/supabaseAuth";

export type NebullaDashboardTab = "projects" | "project-settings" | "user-settings" | "secrets";

interface DashboardProps {
  activeTab: NebullaDashboardTab;
  onTabChange: (tab: NebullaDashboardTab) => void;
}

export function NebullaWorkspaceDashboard({ activeTab, onTabChange }: DashboardProps) {
  return (
    <div className="flex-1 flex flex-col h-full bg-[#040f1a]/40 backdrop-blur-sm border border-white/5 rounded-lg overflow-hidden">
      <div className="h-14 border-b border-white/5 bg-white/5 flex items-center px-6 shrink-0">
        <h2 className="text-lg font-headline text-cyan-300 flex items-center gap-2">
          <span className="material-symbols-outlined">
            {activeTab === "projects"
              ? "grid_view"
              : activeTab === "project-settings"
                ? "dns"
                : activeTab === "secrets"
                  ? "key"
                  : "settings"}
          </span>
          {activeTab === "projects"
            ? "User Projects"
            : activeTab === "project-settings"
              ? "Project Settings"
              : activeTab === "secrets"
                ? "Secrets & Integrations"
                : "User Settings"}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        <div className="max-w-4xl mx-auto">
          {activeTab === "projects" && <ProjectsTab />}
          {activeTab === "project-settings" && <ProjectSettingsTab />}
          {activeTab === "secrets" && <SecretsTab />}
          {activeTab === "user-settings" && <UserSettingsTab onNavigate={onTabChange} />}
        </div>
      </div>
    </div>
  );
}

function ProjectsTab() {
  const [provisionMsg, setProvisionMsg] = useState<string | null>(null);
  const [provisionBusy, setProvisionBusy] = useState(false);

  const newCloudProject = async () => {
    setProvisionMsg(null);
    const api = getApiBase() || "";
    if (!api) {
      setProvisionMsg("Set API URL in Settings.");
      return;
    }
    setProvisionBusy(true);
    try {
      const token = await getSessionToken();
      if (!token) {
        setProvisionMsg("Sign in required.");
        setProvisionBusy(false);
        return;
      }
      const name = window.prompt("Project name", "MyApp")?.trim() || "MyApp";
      const repoUrl = window.prompt("GitHub repo URL (optional)", "")?.trim() || undefined;
      const res = await fetch(`${api}/api/projects/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, repoUrl: repoUrl || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        projectId?: string;
        supabaseUrl?: string;
        vercelUrl?: string;
        error?: string;
      };
      if (res.ok && data.success) {
        setProvisionMsg(
          `Created ${data.projectId?.slice(0, 8)}… · ${data.supabaseUrl ?? ""}${data.vercelUrl ? ` · ${data.vercelUrl}` : ""}`
        );
      } else {
        setProvisionMsg(data.error || `HTTP ${res.status}`);
      }
    } catch {
      setProvisionMsg("Request failed");
    } finally {
      setProvisionBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-headline text-cyan-300 mb-1">User Projects</h3>
        <p className="text-sm text-slate-500 mb-6">Manage workspaces; data lives in Supabase (or local fallback).</p>
        <button
          type="button"
          disabled={provisionBusy}
          onClick={() => void newCloudProject()}
          className="px-4 py-2 rounded-lg bg-cyan-500/15 text-cyan-200 border border-cyan-500/30 text-sm font-headline no-bold hover:bg-cyan-500/25 disabled:opacity-40 transition-colors"
        >
          {provisionBusy ? "Creating…" : "New Project"}
        </button>
        {provisionMsg ? <p className="text-xs text-slate-500 mt-2 font-mono">{provisionMsg}</p> : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="p-5 border border-white/10 rounded-xl bg-white/5 hover:bg-white/10 hover:border-cyan-500/30 transition-all cursor-pointer group">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center text-cyan-400">
              <span className="material-symbols-outlined">rocket_launch</span>
            </div>
            <span className="px-2 py-1 bg-green-500/10 text-green-400 text-[10px] uppercase tracking-wider rounded font-headline border border-green-500/20">
              Active
            </span>
          </div>
          <h4 className="text-slate-200 font-headline mb-1 group-hover:text-cyan-300 transition-colors">Nebulla Core</h4>
          <p className="text-xs text-slate-500 mb-4">React + Vite + Supabase + Vercel</p>
          <div className="flex items-center justify-between text-[11px] text-slate-600 border-t border-white/5 pt-3">
            <span>Main app</span>
            <span className="material-symbols-outlined text-[14px]">more_horiz</span>
          </div>
        </div>

        <div className="p-5 border border-white/10 rounded-xl bg-white/5 hover:bg-white/10 hover:border-cyan-500/30 transition-all cursor-pointer group">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400">
              <span className="material-symbols-outlined">language</span>
            </div>
            <span className="px-2 py-1 bg-slate-500/10 text-slate-400 text-[10px] uppercase tracking-wider rounded font-headline border border-slate-500/20">
              Draft
            </span>
          </div>
          <h4 className="text-slate-200 font-headline mb-1 group-hover:text-cyan-300 transition-colors">Marketing Site</h4>
          <p className="text-xs text-slate-500 mb-4">Static + API routes</p>
          <div className="flex items-center justify-between text-[11px] text-slate-600 border-t border-white/5 pt-3">
            <span>Preview</span>
            <span className="material-symbols-outlined text-[14px]">more_horiz</span>
          </div>
        </div>

        <div className="p-5 border border-dashed border-white/20 rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-cyan-300 hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all cursor-pointer min-h-[180px]">
          <span className="material-symbols-outlined text-3xl mb-2">add_circle</span>
          <span className="font-headline text-sm">Create New Project</span>
        </div>
      </div>
    </div>
  );
}

function ProjectSettingsTab() {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-headline text-cyan-300 mb-1">Project Settings</h3>
        <p className="text-sm text-slate-500 mb-6">Domains and DNS — use Vercel manager in Settings or REST.</p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        <h4 className="text-sm font-headline text-slate-200 mb-2">Custom Domain</h4>
        <p className="text-xs text-slate-500 mb-4">Point DNS to Vercel (A / CNAME).</p>
        <div className="flex gap-3 flex-wrap">
          <input
            type="text"
            placeholder="e.g. myapp.com"
            className="bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm w-full max-w-md text-slate-300 focus:border-cyan-500/50 outline-none transition-colors"
          />
          <button
            type="button"
            className="px-5 py-2 bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 rounded-lg hover:bg-cyan-500/20 transition-colors text-sm font-headline"
          >
            Add Domain
          </button>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h4 className="text-sm font-headline text-slate-200 mb-1">DNS Records</h4>
            <p className="text-xs text-slate-500">Typical Vercel targets shown below.</p>
          </div>
          <button type="button" className="text-xs px-3 py-1.5 bg-white/5 border border-white/10 rounded hover:bg-white/10 text-slate-300 transition-colors">
            Refresh Status
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-400">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-500">
                <th className="pb-3 font-headline font-normal">Type</th>
                <th className="pb-3 font-headline font-normal">Name</th>
                <th className="pb-3 font-headline font-normal">Value</th>
                <th className="pb-3 font-headline font-normal">Status</th>
              </tr>
            </thead>
            <tbody className="font-mono text-13">
              <tr className="border-b border-white/5">
                <td className="py-4 text-cyan-400">A</td>
                <td className="py-4">@</td>
                <td className="py-4">76.76.21.21</td>
                <td className="py-4">
                  <span className="flex items-center gap-1.5 text-green-400 text-xs font-sans">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Valid
                  </span>
                </td>
              </tr>
              <tr>
                <td className="py-4 text-cyan-400">CNAME</td>
                <td className="py-4">www</td>
                <td className="py-4">cname.vercel-dns.com</td>
                <td className="py-4">
                  <span className="flex items-center gap-1.5 text-yellow-400 text-xs font-sans">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" /> Pending
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SecretsTab() {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-headline text-cyan-300 mb-1">Secrets & Integrations</h3>
        <p className="text-sm text-slate-500 mb-6">Host env on Vercel/Railway — Grok, Stitch, Supabase, Vercel token.</p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        <h4 className="text-sm font-headline text-slate-200 mb-2">Environment variables (host)</h4>
        <p className="text-xs text-slate-500 mb-4">Mirror optional browser overrides in app Settings.</p>

        <div className="flex gap-3 mb-6 flex-wrap">
          <input
            type="text"
            placeholder="Key (e.g. XAI_API_KEY)"
            className="bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm w-full sm:w-1/3 text-slate-300 focus:border-cyan-500/50 outline-none font-mono"
          />
          <input
            type="password"
            placeholder="Value"
            className="bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm flex-1 min-w-[120px] text-slate-300 focus:border-cyan-500/50 outline-none font-mono"
          />
          <button
            type="button"
            className="px-5 py-2 bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 rounded-lg hover:bg-cyan-500/20 transition-colors text-sm font-headline"
          >
            Add
          </button>
        </div>

        <div className="space-y-2">
          {["XAI_API_KEY / GROK_API_KEY", "STITCH_API_KEY", "SUPABASE_URL", "VERCEL_TOKEN"].map((key) => (
            <div key={key} className="flex items-center justify-between p-3 border border-white/5 rounded-lg bg-black/20">
              <div className="flex items-center gap-3 min-w-0">
                <span className="material-symbols-outlined text-slate-500 text-lg shrink-0">key</span>
                <span className="text-sm text-slate-300 font-mono truncate">{key}</span>
              </div>
              <button type="button" className="text-slate-500 hover:text-red-400 transition-colors shrink-0">
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-headline text-slate-200 mb-4">Connected services</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 border border-white/10 rounded-xl bg-white/5 flex items-center justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-white shrink-0">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="text-sm text-slate-200 font-headline">GitHub</div>
                <div className="text-xs text-slate-500 truncate">Supabase OAuth</div>
              </div>
            </div>
            <button type="button" className="text-xs text-slate-400 hover:text-cyan-300 transition-colors shrink-0">
              Manage
            </button>
          </div>

          <div className="p-5 border border-white/10 rounded-xl bg-white/5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-300">
                <span className="material-symbols-outlined">deployed_code</span>
              </div>
              <div>
                <div className="text-sm text-slate-200 font-headline">Vercel</div>
                <div className="text-xs text-slate-500">Deploy + domains API</div>
              </div>
            </div>
            <button type="button" className="text-xs px-4 py-1.5 bg-white/10 text-slate-300 rounded-lg hover:bg-white/20 transition-colors font-headline">
              Docs
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function UserSettingsTab({ onNavigate }: { onNavigate: (t: NebullaDashboardTab) => void }) {
  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h3 className="text-xl font-headline text-cyan-300 mb-1">User Settings</h3>
        <p className="text-sm text-slate-500 mb-6">Profile and app preferences — full controls in app Settings.</p>
        <button
          type="button"
          onClick={() => onNavigate("secrets")}
          className="text-xs text-cyan-400 hover:underline font-headline"
        >
          Open Secrets tab →
        </button>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-6">
        <h4 className="text-sm font-headline text-slate-200 border-b border-white/5 pb-2">Profile</h4>
        <p className="text-sm text-slate-400">Use Supabase Auth (GitHub / Google) from the main Login page.</p>
      </div>
    </div>
  );
}

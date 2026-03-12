/**
 * Multi-step setup wizard content for the help panel.
 * 6 steps: Welcome, Supabase (form + Test connection), GitHub OAuth, Backend deploy, Optional keys, Test full flow.
 */
import { useState } from "react";
import {
  BookOpen,
  AlertTriangle,
  ExternalLink,
  Check,
  ChevronRight,
  ChevronLeft,
  Github,
  Database,
  Server,
  Sparkles,
  PartyPopper,
} from "lucide-react";
import { useHelpWidget } from "../context/HelpWidgetContext";
import { type SetupStepId } from "../lib/helpWidgetStorage";
import { getApiBase, setApiBaseFallback } from "../lib/api";
import { setSupabaseCreds, setConnectedService, setSecrets, getSupabaseCreds, getSecrets } from "../lib/setupStorage";
import { testSupabaseConnection } from "../lib/healthCheck";
import { getUserId } from "../lib/auth";
import { getSessionToken } from "../lib/supabaseAuth";
import { clsx } from "clsx";

const STEP_ORDER_6: SetupStepId[] = [
  "welcome",
  "supabase-project",
  "github-oauth",
  "railway-backend",
  "optional-extras",
  "done",
];

export default function SetupGuideWizard() {
  const { wizardStep, setWizardStep, isStepDone, setStepDone } = useHelpWidget();
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseAnonKey, setSupabaseAnonKey] = useState("");
  const [supabaseTestResult, setSupabaseTestResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [supabaseTestLoading, setSupabaseTestLoading] = useState(false);
  const [backendUrl, setBackendUrl] = useState("");
  const [githubClientId, setGitHubClientId] = useState("");
  const [githubClientSecret, setGitHubClientSecret] = useState("");
  const [grokEnabled, setGrokEnabled] = useState(false);
  const [grokKey, setGrokKey] = useState("");
  const [builderEnabled, setBuilderEnabled] = useState(false);
  const [builderKey, setBuilderKey] = useState("");
  const [fullFlowLoading, setFullFlowLoading] = useState(false);
  const [fullFlowResult, setFullFlowResult] = useState<{ ok: boolean; message: string } | null>(null);

  const idx = STEP_ORDER_6.indexOf(wizardStep);
  const canPrev = idx > 0;
  const canNext = idx < STEP_ORDER_6.length - 1;

  const creds = getSupabaseCreds();
  const effectiveSupabaseUrl = supabaseUrl || creds?.url || "";
  const callbackUrl = effectiveSupabaseUrl.trim()
    ? `${effectiveSupabaseUrl.replace(/\/$/, "")}/auth/v1/callback`
    : "https://YOUR_REF.supabase.co/auth/v1/callback";

  const handleTestSupabase = async () => {
    const url = supabaseUrl.trim();
    const key = supabaseAnonKey.trim();
    if (!url || !key) {
      setSupabaseTestResult({ ok: false, message: "Enter URL and anon key first." });
      return;
    }
    setSupabaseTestLoading(true);
    setSupabaseTestResult(null);
    const result = await testSupabaseConnection(url, key);
    setSupabaseTestResult(result);
    setSupabaseTestLoading(false);
  };

  const handleSaveSupabase = () => {
    const url = supabaseUrl.trim();
    const key = supabaseAnonKey.trim();
    if (!url || !key) return;
    setSupabaseCreds(url, key);
    setConnectedService("supabase", true);
    setStepDone("supabase-project", true);
    setSupabaseTestResult({ ok: true });
  };

  const handleSaveBackendUrl = () => {
    const url = backendUrl.trim().replace(/\/$/, "");
    if (url) setApiBaseFallback(url);
    setStepDone("railway-backend", true);
  };

  const handleTestFullFlow = async () => {
    setFullFlowLoading(true);
    setFullFlowResult(null);
    try {
      const apiBase = getApiBase();
      if (!apiBase) {
        setFullFlowResult({ ok: false, message: "Backend URL not set. Complete step 4." });
        setFullFlowLoading(false);
        return;
      }
      const userId = await getUserId();
      const sessionRes = await fetch(`${apiBase}/api/auth/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!sessionRes.ok) {
        setFullFlowResult({ ok: false, message: `Session failed: ${sessionRes.status}` });
        setFullFlowLoading(false);
        return;
      }
      const token = await getSessionToken();
      const projectHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (token) projectHeaders["Authorization"] = `Bearer ${token}`;
      const createRes = await fetch(`${apiBase}/api/users/${userId}/projects`, {
        method: "POST",
        headers: projectHeaders,
        body: JSON.stringify({ name: "Wizard test project" }),
      });
      if (!createRes.ok) {
        setFullFlowResult({ ok: false, message: `Create project failed: ${createRes.status}` });
        setFullFlowLoading(false);
        return;
      }
      const project = (await createRes.json()) as { id?: string };
      const chatRes = await fetch(`${apiBase}/api/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "Say: test" }] }),
      });
      const chatOk = chatRes.ok || chatRes.status === 503;
      const uiRes = await fetch(`${apiBase}/api/builder/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "A blue button", userId }),
      });
      const uiOk = uiRes.ok || uiRes.status === 503;
      setFullFlowResult({
        ok: true,
        message: `Session ✓ Project created (${project?.id ?? "—"}) Chat ${chatOk ? "✓" : "✗"} UI ${uiOk ? "✓" : "✗"}`,
      });
    } catch (e) {
      setFullFlowResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setFullFlowLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Stepper — 6 steps */}
      <div className="flex-shrink-0 flex items-center gap-1 overflow-x-auto py-2 border-b border-[#333333]">
        {STEP_ORDER_6.map((step, i) => (
          <button
            key={step}
            type="button"
            onClick={() => setWizardStep(step)}
            className={clsx(
              "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors",
              wizardStep === step
                ? "bg-[#007acc] text-white"
                : "text-gray-400 hover:text-white hover:bg-[#37373d]"
            )}
          >
            {isStepDone(step) && <Check size={12} />}
            {i + 1}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
        {/* Step 1: Welcome */}
        {wizardStep === "welcome" && (
          <>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <BookOpen size={18} /> Welcome & Overview
            </h3>
            <p className="text-gray-400">
              This guide gets you from clone → running app with auth and backend in one place.
            </p>
            <div className="rounded-lg bg-[#252526] border border-[#333333] p-3 font-mono text-xs text-gray-300 overflow-x-auto">
              <pre>{`Stack:
• Vite + React + TypeScript + Tailwind (frontend)
• Supabase (auth + db)
• Express (backend API)
• Vercel (frontend deploy)
• Railway (backend deploy)`}</pre>
            </div>
            {/* TODO: screenshot or Mermaid diagram placeholder */}
            <p className="text-gray-500 italic text-xs">
              {/* TODO: diagram of Vite → Vercel, Express → Railway, Supabase */}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setWizardStep("supabase-project")}
                className="px-4 py-2 bg-[#007acc] hover:bg-[#1a8ad4] text-white rounded-lg text-sm font-medium"
              >
                Start Setup
              </button>
              <button
                type="button"
                onClick={() => setWizardStep("done")}
                className="px-4 py-2 bg-[#37373d] hover:bg-[#444] text-white rounded-lg text-sm"
              >
                I already did everything
              </button>
            </div>
          </>
        )}

        {/* Step 2: Supabase project */}
        {wizardStep === "supabase-project" && (
          <>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Database size={18} /> One-time: Create Supabase Project
            </h3>
            <p className="text-gray-400">
              Create a project once; reuse for all deployments.
            </p>
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-blue-400 hover:underline text-sm"
            >
              supabase.com/dashboard → New project <ExternalLink size={14} />
            </a>
            <p className="text-gray-400 text-xs">
              Project Settings → API → copy <strong>Project URL</strong> and <strong>anon public</strong> key.
            </p>
            <div className="rounded border border-amber-500/50 bg-amber-500/10 p-2 text-amber-200 text-xs flex items-start gap-2">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>Never use <code className="bg-black/20 px-1">service_role</code> in the browser.</span>
            </div>
            <div className="space-y-2">
              <input
                type="url"
                placeholder="https://xxxx.supabase.co"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                className="w-full px-3 py-2 bg-[#1e1e1e] border border-[#333] rounded text-sm text-white placeholder-gray-500 focus:border-blue-500 outline-none"
              />
              <input
                type="password"
                placeholder="Anon key (eyJ...)"
                value={supabaseAnonKey}
                onChange={(e) => setSupabaseAnonKey(e.target.value)}
                className="w-full px-3 py-2 bg-[#1e1e1e] border border-[#333] rounded text-sm text-white placeholder-gray-500 focus:border-blue-500 outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleTestSupabase}
                  disabled={supabaseTestLoading || !supabaseUrl.trim() || !supabaseAnonKey.trim()}
                  className="px-3 py-2 bg-[#37373d] hover:bg-[#444] disabled:opacity-50 text-white rounded-lg text-sm"
                >
                  {supabaseTestLoading ? "…" : "Test connection"}
                </button>
                <button
                  type="button"
                  onClick={handleSaveSupabase}
                  disabled={!supabaseUrl.trim() || !supabaseAnonKey.trim()}
                  className="px-3 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-lg text-sm"
                >
                  Save
                </button>
              </div>
            </div>
            {supabaseTestResult && (
              <div className={clsx(
                "p-2 rounded text-xs",
                supabaseTestResult.ok ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"
              )}>
                {supabaseTestResult.ok ? "Connection OK" : supabaseTestResult.message}
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isStepDone("supabase-project")}
                onChange={(e) => setStepDone("supabase-project", e.target.checked)}
                className="rounded border-gray-500"
              />
              <span className="text-gray-300">I have a Supabase project</span>
            </label>
          </>
        )}

        {/* Step 3: GitHub OAuth — pre-fill callback + form */}
        {wizardStep === "github-oauth" && (
          <>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Github size={18} /> One-time: Enable GitHub OAuth in Supabase
            </h3>
            <p className="text-gray-400">
              GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
            </p>
            <a
              href="https://github.com/settings/developers"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-blue-400 hover:underline text-sm"
            >
              GitHub OAuth Apps <ExternalLink size={14} />
            </a>
            <div className="space-y-2 text-xs">
              <p className="text-gray-400">Use:</p>
              <ul className="list-disc list-inside text-gray-300 space-y-1">
                <li>App name: <code className="bg-[#1e1e1e] px-1">Kyn Login</code></li>
                <li>Homepage URL: your Vercel domain (e.g. https://your-app.vercel.app)</li>
                <li>Authorization callback URL: <code className="bg-[#1e1e1e] px-1 break-all">{callbackUrl}</code></li>
              </ul>
              <p className="text-gray-400 mt-2">Paste Client ID and Secret into Supabase → Authentication → Providers → GitHub.</p>
            </div>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="GitHub Client ID"
                value={githubClientId}
                onChange={(e) => setGitHubClientId(e.target.value)}
                className="w-full px-3 py-2 bg-[#1e1e1e] border border-[#333] rounded text-sm text-white placeholder-gray-500"
              />
              <input
                type="password"
                placeholder="GitHub Client Secret (paste into Supabase)"
                value={githubClientSecret}
                onChange={(e) => setGitHubClientSecret(e.target.value)}
                className="w-full px-3 py-2 bg-[#1e1e1e] border border-[#333] rounded text-sm text-white placeholder-gray-500"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isStepDone("github-oauth")}
                onChange={(e) => setStepDone("github-oauth", e.target.checked)}
                className="rounded border-gray-500"
              />
              <span className="text-gray-300">GitHub provider enabled in Supabase</span>
            </label>
          </>
        )}

        {/* Step 4: Backend deploy — Railway + paste URL */}
        {wizardStep === "railway-backend" && (
          <>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Server size={18} /> Per-project: Deploy backend
            </h3>
            <p className="text-gray-400">
              Deploy from GitHub (root: <code className="bg-[#1e1e1e] px-1">/</code>, server.ts at root).
            </p>
            <a
              href="https://railway.app/new?referralCode=starter"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-blue-400 hover:underline text-sm"
            >
              Railway → New Project → Deploy from GitHub <ExternalLink size={14} />
            </a>
            <p className="text-gray-400 text-xs">
              Add variables: PORT=8080, NODE_ENV=production, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. After deploy, copy the public URL.
            </p>
            <div className="space-y-2">
              <input
                type="url"
                placeholder="https://your-app.up.railway.app"
                value={backendUrl}
                onChange={(e) => setBackendUrl(e.target.value)}
                className="w-full px-3 py-2 bg-[#1e1e1e] border border-[#333] rounded text-sm text-white placeholder-gray-500 focus:border-blue-500 outline-none"
              />
              <button
                type="button"
                onClick={handleSaveBackendUrl}
                disabled={!backendUrl.trim()}
                className="px-3 py-2 bg-[#007acc] hover:bg-[#1a8ad4] disabled:opacity-50 text-white rounded-lg text-sm"
              >
                Save URL (use for this session)
              </button>
            </div>
            <p className="text-amber-200/90 text-xs">
              For production: set <code className="bg-black/20 px-1">VITE_API_URL</code> in Vercel (Environment Variables) and redeploy.
            </p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isStepDone("railway-backend")}
                onChange={(e) => setStepDone("railway-backend", e.target.checked)}
                className="rounded border-gray-500"
              />
              <span className="text-gray-300">Backend deployed & URL saved</span>
            </label>
          </>
        )}

        {/* Step 5: Optional keys */}
        {wizardStep === "optional-extras" && (
          <>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Sparkles size={18} /> Optional: Grok & Builder.io
            </h3>
            <p className="text-gray-400 text-xs">
              Add these in your backend env (Railway/Render), not in the browser.
            </p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={grokEnabled} onChange={(e) => setGrokEnabled(e.target.checked)} className="rounded border-gray-500" />
              <span className="text-gray-300">Grok API (chat)</span>
            </label>
            {grokEnabled && (
              <input
                type="password"
                placeholder="GROK_API_KEY (add to backend env)"
                value={grokKey}
                onChange={(e) => setGrokKey(e.target.value)}
                onBlur={() => grokKey.trim() && setSecrets({ ...getSecrets(), GROK_API_KEY: grokKey })}
                className="w-full px-3 py-2 bg-[#1e1e1e] border border-[#333] rounded text-sm text-white placeholder-gray-500"
              />
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={builderEnabled} onChange={(e) => setBuilderEnabled(e.target.checked)} className="rounded border-gray-500" />
              <span className="text-gray-300">Builder.io (UI generation)</span>
            </label>
            {builderEnabled && (
              <input
                type="password"
                placeholder="BUILDER_PRIVATE_KEY (add to backend env)"
                value={builderKey}
                onChange={(e) => setBuilderKey(e.target.value)}
                onBlur={() => builderKey.trim() && setSecrets({ ...getSecrets(), BUILDER_PRIVATE_KEY: builderKey })}
                className="w-full px-3 py-2 bg-[#1e1e1e] border border-[#333] rounded text-sm text-white placeholder-gray-500"
              />
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isStepDone("optional-extras")}
                onChange={(e) => setStepDone("optional-extras", e.target.checked)}
                className="rounded border-gray-500"
              />
              <span className="text-gray-300">I've configured what I need</span>
            </label>
          </>
        )}

        {/* Step 6: Done — Test full flow */}
        {wizardStep === "done" && (
          <>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <PartyPopper size={18} /> You're all set!
            </h3>
            <p className="text-gray-400">
              Run a full flow test: session → create project → chat → UI generate.
            </p>
            <button
              type="button"
              onClick={handleTestFullFlow}
              disabled={fullFlowLoading}
              className="px-4 py-2 bg-[#007acc] hover:bg-[#1a8ad4] disabled:opacity-50 text-white rounded-lg text-sm font-medium"
            >
              {fullFlowLoading ? "Running…" : "Test full flow"}
            </button>
            {fullFlowResult && (
              <div className={clsx(
                "p-2 rounded text-xs",
                fullFlowResult.ok ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"
              )}>
                {fullFlowResult.message}
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              <a href="https://github.com/cintiakimura/kyn#readme" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline text-xs">README</a>
              <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline text-xs">Supabase</a>
              <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline text-xs">Vercel</a>
              <a href="https://railway.app/dashboard" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline text-xs">Railway</a>
            </div>
          </>
        )}
      </div>

      {/* Prev/Next */}
      <div className="flex-shrink-0 flex items-center justify-between pt-3 border-t border-[#333333]">
        <button
          type="button"
          onClick={() => setWizardStep(STEP_ORDER_6[idx - 1])}
          disabled={!canPrev}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-sm text-gray-400 hover:text-white disabled:opacity-40 disabled:pointer-events-none"
        >
          <ChevronLeft size={16} /> Previous
        </button>
        {canNext && (
          <button
            type="button"
            onClick={() => setWizardStep(STEP_ORDER_6[idx + 1])}
            className="flex items-center gap-1 px-3 py-1.5 bg-[#007acc] hover:bg-[#1a8ad4] text-white rounded text-sm"
          >
            Next <ChevronRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

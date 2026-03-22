import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Check, ChevronDown, ChevronRight } from "lucide-react";
import { getSupabaseAuthClient, getSessionToken, clearSupabaseConfigCache, ensureSupabaseConfig } from "../lib/supabaseAuth";
import { getApiBase, setApiBaseFallback, clearBackendUnavailable } from "../lib/api";
import { isOpenMode } from "../lib/auth";
import {
  SECRET_KEYS,
  getStoredSecret,
  setStoredSecret,
  hasStoredSecret,
  type SecretKey,
} from "../lib/storedSecrets";
import { getConnectedServices, setDomainVerified } from "../lib/setupStorage";

type IntegrationsSummaryPayload = {
  strictServerSecretsOnly?: boolean;
  architecture?: string;
  description?: string;
  services?: {
    grok?: { configured?: boolean; routes?: string[] };
    supabase?: { url?: boolean; publishableKey?: boolean; secretKey?: boolean; publicConfigRoute?: string };
    stitch?: { configured?: boolean; routes?: string[] };
    stripe?: { secretKey?: boolean; webhookSecret?: boolean };
    vercel?: {
      runningOnVercel?: boolean;
      deploymentUrl?: string | null;
      apiLinked?: boolean;
      project?: Record<string, unknown> | null;
      hint?: string;
    };
  };
};

const KEY_USER_ID = "kyn_user_id";
const KEY_STRIPE_PRICE_ID = "stripe_price_id";
const VERCEL_DNS = { A: "76.76.21.21", CNAME: "cname.vercel-dns.com" };
const GODADDY = "https://www.godaddy.com/domains";
const CLOUDFLARE = "https://dash.cloudflare.com";

type Limits = { isPro?: boolean; paidUntil?: string };

export default function Settings() {
  const navigate = useNavigate();
  const [apiUrl, setApiUrl] = useState("");
  const [stripePriceId, setStripePriceId] = useState("");
  const [limits, setLimits] = useState<Limits | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [secretSaved, setSecretSaved] = useState<string | null>(null);
  const [secretsOpen, setSecretsOpen] = useState(false);
  const [envDiagOpen, setEnvDiagOpen] = useState(false);
  const [envAuditLoading, setEnvAuditLoading] = useState(false);
  const [secretsAuditItems, setSecretsAuditItems] = useState<
    { key: string; category: string; configured: boolean; aliases?: string[] }[]
  >([]);
  const [secretsRuntime, setSecretsRuntime] = useState<{ nodeEnv?: string; vercel?: boolean } | null>(null);
  const [productionChecklist, setProductionChecklist] = useState<string[]>([]);
  const [coreConfigured, setCoreConfigured] = useState<boolean | null>(null);
  const [coreMissing, setCoreMissing] = useState<string[]>([]);
  const [alignmentRows, setAlignmentRows] = useState<
    { key: string; serverConfigured: boolean; browserConfigured: boolean; aligned: boolean; hint: string }[]
  >([]);
  const [integrationsSummary, setIntegrationsSummary] = useState<IntegrationsSummaryPayload | null>(null);
  const [dnsCopied, setDnsCopied] = useState<"A" | "CNAME" | null>(null);
  const [domainVerified, setDomainVerifiedState] = useState(false);

  useEffect(() => {
    const next: Record<string, string> = {};
    SECRET_KEYS.forEach((k) => {
      next[k] = getStoredSecret(k) ? "••••••••" : "";
    });
    setSecretValues(next);
  }, []);

  const setSecret = (key: SecretKey, value: string) => {
    setSecretValues((prev) => ({ ...prev, [key]: value }));
  };

  const saveSecret = (key: SecretKey) => {
    const raw = secretValues[key] ?? "";
    const toSave = raw === "••••••••" ? getStoredSecret(key) : raw.trim();
    setStoredSecret(key, toSave);
    setSecretSaved(key);
    setTimeout(() => setSecretSaved(null), 2000);
    setSecretValues((prev) => ({ ...prev, [key]: getStoredSecret(key) ? "••••••••" : "" }));
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    setApiUrl(getApiBase() || "");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isOpenMode()) {
      setStripePriceId(localStorage.getItem(KEY_STRIPE_PRICE_ID) ?? "");
      setDomainVerifiedState(getConnectedServices().domainVerified);
      return;
    }
    if (!localStorage.getItem(KEY_USER_ID)) {
      navigate("/login", { replace: true });
      return;
    }
    setStripePriceId(localStorage.getItem(KEY_STRIPE_PRICE_ID) ?? "");
    setDomainVerifiedState(getConnectedServices().domainVerified);
  }, [navigate]);

  const refreshEnvDiagnostics = async () => {
    const base = getApiBase();
    if (!base) {
      alert("Set API URL first so we can reach your backend.");
      return;
    }
    setEnvAuditLoading(true);
    try {
      const [aRes, pRes, intRes] = await Promise.all([
        fetch(`${base}/api/config/secrets-audit`),
        fetch(`${base}/api/config/production-readiness`),
        fetch(`${base}/api/integrations/summary`),
      ]);
      const aJson = (await aRes.json().catch(() => ({}))) as {
        items?: { key: string; category: string; configured: boolean; aliases?: string[] }[];
        runtime?: { nodeEnv: string; vercel: boolean };
      };
      const pJson = (await pRes.json().catch(() => ({}))) as {
        productionChecklist?: string[];
        coreConfigured?: boolean;
        coreMissing?: string[];
        items?: typeof aJson.items;
        runtime?: typeof aJson.runtime;
      };
      setSecretsAuditItems(Array.isArray(aJson.items) ? aJson.items : []);
      setSecretsRuntime(aJson.runtime ?? pJson.runtime ?? null);
      setProductionChecklist(Array.isArray(pJson.productionChecklist) ? pJson.productionChecklist : []);
      setCoreConfigured(typeof pJson.coreConfigured === "boolean" ? pJson.coreConfigured : null);
      setCoreMissing(Array.isArray(pJson.coreMissing) ? pJson.coreMissing : []);

      const intJson = (await intRes.json().catch(() => ({}))) as IntegrationsSummaryPayload;
      setIntegrationsSummary(intRes.ok && intJson?.architecture ? intJson : null);

      const browserSecrets = Object.fromEntries(SECRET_KEYS.map((k) => [k, hasStoredSecret(k)]));
      const alRes = await fetch(`${base}/api/config/secrets-alignment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ browserSecrets }),
      });
      const alJson = (await alRes.json().catch(() => ({}))) as {
        rows?: { key: string; serverConfigured: boolean; browserConfigured: boolean; aligned: boolean; hint: string }[];
      };
      setAlignmentRows(Array.isArray(alJson.rows) ? alJson.rows : []);
    } catch (e) {
      console.error("[Settings env diagnostics]", e);
      alert("Could not load env diagnostics. Check API URL and that the backend is running.");
    } finally {
      setEnvAuditLoading(false);
    }
  };

  const saveApiUrl = async () => {
    const url = apiUrl.trim().replace(/\/$/, "").replace(/\/api$/i, "");
    if (url) {
      setApiBaseFallback(url);
      clearBackendUnavailable();
    } else {
      setApiBaseFallback("");
    }
    clearSupabaseConfigCache();
    window.dispatchEvent(new CustomEvent("kyn-api-base-changed"));
    await ensureSupabaseConfig();
  };

  useEffect(() => {
    const apiBase = getApiBase();
    if (!apiBase) return;
    getSessionToken().then((token) => {
      if (!token) return;
      fetch(`${apiBase}/api/users/me/limits`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: Limits | null) => data && setLimits(data))
        .catch(() => {});
    });
  }, []);

  const saveStripePriceId = () => {
    if (typeof window === "undefined") return;
    localStorage.setItem(KEY_STRIPE_PRICE_ID, stripePriceId.trim());
  };

  const copyDns = (type: "A" | "CNAME") => {
    const value = type === "A" ? VERCEL_DNS.A : VERCEL_DNS.CNAME;
    navigator.clipboard.writeText(value);
    setDnsCopied(type);
    setTimeout(() => setDnsCopied(null), 2000);
  };

  const handleVerifyDomain = () => {
    setDomainVerified(true);
    setDomainVerifiedState(true);
  };

  const connectGitHub = async () => {
    let supabase = getSupabaseAuthClient();
    if (!supabase) {
      // In case config fetch on app load hasn't completed yet, try once more.
      await ensureSupabaseConfig();
      supabase = getSupabaseAuthClient();
    }
    if (!supabase) {
      alert("Cannot connect: Supabase auth is not configured yet. Check Settings → API URL, then reload and try again.");
      return;
    }
    const redirectTo = `${window.location.origin}/auth/callback`;
    supabase.auth.signInWithOAuth({ provider: "github", options: { redirectTo } });
  };

  const connectGoogle = async () => {
    let supabase = getSupabaseAuthClient();
    if (!supabase) {
      await ensureSupabaseConfig();
      supabase = getSupabaseAuthClient();
    }
    if (!supabase) {
      alert("Cannot connect: Supabase auth is not configured yet. Check Settings → API URL, then reload and try again.");
      return;
    }
    const redirectTo = `${window.location.origin}/auth/callback`;
    supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  };

  const openManageSubscription = async () => {
    const apiBase = getApiBase();
    const token = await getSessionToken();
    if (!apiBase || !token) {
      alert("Please sign in first.");
      return;
    }
    setBillingLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/billing-portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) window.location.href = data.url;
      else alert(data.error ?? "Couldn’t open billing. Try again.");
    } catch {
      alert("Could not open billing");
    } finally {
      setBillingLoading(false);
    }
  };

  // In open mode we use KEY_OPEN_MODE_USER_ID; never blank the page. Otherwise require sign-in.
  if (typeof window !== "undefined" && !isOpenMode() && !localStorage.getItem(KEY_USER_ID)) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-white p-6 md:p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <h1 className="text-2xl font-semibold text-white">Settings</h1>

        <section className="space-y-2">
          <h2 className="text-lg font-medium text-white">API URL</h2>
          <p className="text-sm text-muted mb-2">
            Only needed if Login or projects don’t load. Set this to the URL of your backend (e.g. <code className="bg-sidebar-bg px-1">https://your-api.vercel.app</code>). Leave empty if the app and API are on the same host.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="url"
              placeholder="https://your-backend.example.com"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              className="flex-1 min-w-[200px] px-3 py-2 bg-editor-bg border border-border rounded text-sm text-white placeholder-muted"
            />
            <button type="button" onClick={saveApiUrl} className="px-3 py-2 bg-primary text-white rounded text-sm">
              Save
            </button>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-medium text-white">Login</h2>
          <p className="text-sm text-muted mb-3">Sign in with your account to sync projects and deploy.</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={connectGitHub} className="px-4 py-2 bg-primary/80 hover:bg-primary/90 text-white text-sm rounded transition-colors">
              Connect GitHub
            </button>
            <button type="button" onClick={connectGoogle} className="px-4 py-2 bg-primary/80 hover:bg-primary/90 text-white text-sm rounded transition-colors">
              Connect Google
            </button>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-medium text-white">Secrets</h2>
          <p className="text-sm text-muted mb-2">
            Stored in this browser (localStorage). When set, they are sent to your backend as secure headers so chat, voice,
            TTS, and Stitch UI generation can work even if the host env is empty. For production, mirror the same keys in Vercel /
            Railway / Render environment variables — use <strong>Refresh env check</strong> below to compare.
          </p>
          <button
            type="button"
            onClick={() => setSecretsOpen((o) => !o)}
            className="flex items-center gap-2 text-sm text-white hover:text-primary"
          >
            {secretsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            {secretsOpen ? "Hide" : "Show"} secret fields
          </button>
          {secretsOpen && (
            <>
              <p className="text-sm text-muted mb-2 mt-2">
                Optional overrides. <code className="bg-sidebar-bg px-1">XAI_API_KEY</code> / <code className="bg-sidebar-bg px-1">GROK_API_KEY</code> are the same family (xAI console).
              </p>
              <div className="space-y-3 max-w-xl">
                {SECRET_KEYS.map((key) => (
                  <div key={key} className="flex flex-wrap items-center gap-2">
                    <label className="text-sm font-medium text-white w-56 shrink-0">{key}</label>
                    <input
                      type="password"
                      placeholder="optional"
                      value={secretValues[key] ?? ""}
                      onChange={(e) => setSecret(key, e.target.value)}
                      className="flex-1 min-w-[200px] px-3 py-2 bg-editor-bg border border-border rounded text-sm text-white placeholder-muted"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => saveSecret(key)}
                      className="px-3 py-2 bg-primary text-white rounded text-sm shrink-0"
                    >
                      {secretSaved === key ? "Saved" : "Save"}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="space-y-2 border border-border rounded-lg p-4 bg-sidebar-bg/30">
          <h2 className="text-lg font-medium text-white">Environment &amp; production parity</h2>
          <p className="text-sm text-muted mb-2">
            Backend reads your server&apos;s <code className="bg-editor-bg px-1">.env</code> / host variables and compares which
            keys are set vs this browser&apos;s Secrets. It cannot read Vercel or Supabase dashboards directly — copy values
            from those UIs into your host env, then redeploy.
          </p>
          <div className="flex flex-wrap gap-2 mb-2">
            <button
              type="button"
              onClick={() => {
                setEnvDiagOpen(true);
                void refreshEnvDiagnostics();
              }}
              disabled={envAuditLoading}
              className="px-3 py-2 bg-primary text-white rounded text-sm disabled:opacity-50"
            >
              {envAuditLoading ? "Loading…" : "Refresh env check"}
            </button>
            <button
              type="button"
              onClick={() => setEnvDiagOpen((o) => !o)}
              className="px-3 py-2 border border-border text-white rounded text-sm"
            >
              {envDiagOpen ? "Hide details" : "Show details"}
            </button>
          </div>
          {coreConfigured === false && coreMissing.length > 0 ? (
            <p className="text-sm text-amber-400 mb-2">
              Core env missing on server: {coreMissing.join(", ")} — add these on your host for production.
            </p>
          ) : null}
          {coreConfigured === true ? (
            <p className="text-sm text-green-500/90 mb-2">Core Supabase variables are set on this backend.</p>
          ) : null}
          {integrationsSummary ? (
            <div className="mb-3 p-3 rounded-lg bg-editor-bg/50 border border-border text-sm space-y-2">
              <h3 className="font-medium text-white text-sm">Backend-first integrations (one Git / one API)</h3>
              {integrationsSummary.description ? (
                <p className="text-xs text-muted">{integrationsSummary.description}</p>
              ) : null}
              {integrationsSummary.strictServerSecretsOnly ? (
                <p className="text-xs text-amber-200">
                  <code className="bg-sidebar-bg px-1">STRICT_SERVER_API_KEYS</code> — Grok/Stitch keys only from server env
                  (browser header overrides off).
                </p>
              ) : null}
              {(() => {
                const s = integrationsSummary.services;
                if (!s) return null;
                const supOk = s.supabase?.url && s.supabase?.publishableKey && s.supabase?.secretKey;
                const v = s.vercel;
                const proj = v?.project && typeof v.project === "object" ? v.project : null;
                const projName = proj && "name" in proj ? String((proj as { name?: string }).name) : null;
                const projErr = proj && "error" in proj ? String((proj as { error?: string }).error) : null;
                return (
                  <ul className="text-xs text-muted space-y-1 font-mono">
                    <li>Grok (xAI): {s.grok?.configured ? "✓ configured" : "— missing"}</li>
                    <li>Supabase: {supOk ? "✓ url + publishable + secret" : "— incomplete"}</li>
                    <li>Google Stitch: {s.stitch?.configured ? "✓ configured" : "— missing"}</li>
                    <li>
                      Stripe:{" "}
                      {s.stripe?.secretKey || s.stripe?.webhookSecret
                        ? `✓ ${[s.stripe?.secretKey && "secret", s.stripe?.webhookSecret && "webhook"].filter(Boolean).join(", ")}`
                        : "— optional / missing"}
                    </li>
                    <li>
                      Vercel:{" "}
                      {v?.runningOnVercel ? "running on Vercel" : "not this runtime"}
                      {v?.deploymentUrl ? ` · ${v.deploymentUrl}` : ""}
                      {v?.apiLinked && projName ? ` · project ${projName}` : ""}
                      {projErr ? ` · API: ${projErr.slice(0, 80)}` : ""}
                      {!v?.apiLinked && v?.hint ? ` · ${v.hint}` : ""}
                    </li>
                  </ul>
                );
              })()}
            </div>
          ) : null}
          {envDiagOpen && (
            <div className="space-y-4 mt-3 text-sm">
              {secretsRuntime ? (
                <p className="text-muted">
                  Runtime: NODE_ENV=<span className="text-white">{secretsRuntime.nodeEnv}</span>
                  {secretsRuntime.vercel ? (
                    <span className="text-white"> · Vercel</span>
                  ) : null}
                </p>
              ) : null}
              {productionChecklist.length > 0 ? (
                <div>
                  <h3 className="font-medium text-white mb-1">Production checklist</h3>
                  <ul className="list-disc pl-5 text-muted space-y-1">
                    {productionChecklist.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {secretsAuditItems.length > 0 ? (
                <div className="overflow-x-auto">
                  <h3 className="font-medium text-white mb-1">Server env (names only)</h3>
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border text-muted">
                        <th className="py-1 pr-2">Key</th>
                        <th className="py-1 pr-2">Category</th>
                        <th className="py-1">Set</th>
                      </tr>
                    </thead>
                    <tbody>
                      {secretsAuditItems.map((row) => (
                        <tr key={row.key} className="border-b border-border/60">
                          <td className="py-1 pr-2 font-mono text-[#9cdcfe]">
                            {row.key}
                            {row.aliases?.length ? (
                              <span className="text-muted"> ({row.aliases.join(", ")})</span>
                            ) : null}
                          </td>
                          <td className="py-1 pr-2 text-muted">{row.category}</td>
                          <td className="py-1">{row.configured ? "✓" : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {alignmentRows.length > 0 ? (
                <div className="overflow-x-auto">
                  <h3 className="font-medium text-white mb-1">Server vs this browser (Secrets)</h3>
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border text-muted">
                        <th className="py-1 pr-2">Key</th>
                        <th className="py-1 pr-2">Server</th>
                        <th className="py-1 pr-2">Browser</th>
                        <th className="py-1 pr-2">Same pattern</th>
                        <th className="py-1">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alignmentRows.map((row) => (
                        <tr key={row.key} className="border-b border-border/60">
                          <td className="py-1 pr-2 font-mono text-[#9cdcfe]">{row.key}</td>
                          <td className="py-1 pr-2">{row.serverConfigured ? "✓" : "—"}</td>
                          <td className="py-1 pr-2">{row.browserConfigured ? "✓" : "—"}</td>
                          <td className="py-1 pr-2">{row.aligned ? "✓" : "⚠"}</td>
                          <td className="py-1 text-muted max-w-xs">{row.hint}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-medium text-white">Stripe setup</h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Stripe Price ID"
              value={stripePriceId}
              onChange={(e) => setStripePriceId(e.target.value)}
            className="px-3 py-2 bg-sidebar-bg border border-border rounded text-sm text-white placeholder-muted max-w-xs"
            />
            <button type="button" onClick={saveStripePriceId} className="px-3 py-2 bg-primary hover:bg-primary/90 text-white text-sm rounded">
              Save
            </button>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-medium text-white">Subscription</h2>
          {limits?.isPro && (
            <p className="text-sm text-muted mb-2">Pro</p>
          )}
          {limits?.paidUntil != null && new Date(limits.paidUntil) <= new Date() && (
            <div className="mb-3 p-3 bg-amber-500/15 border border-amber-500/40 rounded-lg text-sm text-amber-200">
              Pro expired — upgrade to continue
            </div>
          )}
          <button
            type="button"
            onClick={openManageSubscription}
            disabled={billingLoading}
            className="px-3 py-2 bg-primary hover:bg-primary/90 text-white text-sm rounded disabled:opacity-50 transition-colors"
          >
            {billingLoading ? "Opening…" : "Manage Subscription"}
          </button>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-medium text-white">Domain / DNS</h2>
          <p className="text-sm text-muted mb-2">
            Add these records at your DNS provider to use a custom domain. Backend handles deployment.
          </p>
          {domainVerified ? (
            <p className="text-sm text-green-500 flex items-center gap-1">
              <Check size={14} /> Verified
            </p>
          ) : (
            <>
              <div className="space-y-2 mb-2">
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-2 py-1.5 bg-editor-bg rounded text-white text-xs">
                    A @ {VERCEL_DNS.A}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyDns("A")}
                    className="p-1.5 rounded hover:bg-border text-muted hover:text-white"
                    title="Copy"
                  >
                    {dnsCopied === "A" ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-2 py-1.5 bg-editor-bg rounded text-white text-xs">
                    CNAME www {VERCEL_DNS.CNAME}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyDns("CNAME")}
                    className="p-1.5 rounded hover:bg-border text-muted hover:text-white"
                    title="Copy"
                  >
                    {dnsCopied === "CNAME" ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
              <div className="flex gap-3 text-xs mb-2">
                <a href={GODADDY} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  GoDaddy
                </a>
                <a href={CLOUDFLARE} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  Cloudflare
                </a>
              </div>
              <button
                type="button"
                onClick={handleVerifyDomain}
                className="text-xs text-primary hover:underline"
              >
                Mark as verified
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

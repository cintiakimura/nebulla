import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Check, ChevronDown, ChevronRight } from "lucide-react";
import { getSupabaseAuthClient, getSessionToken } from "../lib/supabaseAuth";
import { getApiBase, setApiBaseFallback, clearBackendUnavailable } from "../lib/api";
import { isOpenMode } from "../lib/auth";
import { SECRET_KEYS, getStoredSecret, setStoredSecret, type SecretKey } from "../lib/storedSecrets";
import { getConnectedServices, setDomainVerified } from "../lib/setupStorage";

const KEY_USER_ID = "kyn_user_id";
const KEY_STRIPE_PRICE_ID = "stripe_price_id";
const VERCEL_DNS = { A: "76.76.21.21", CNAME: "cname.vercel-dns.com" };
const GODADDY = "https://www.godaddy.com/domains";
const CLOUDFLARE = "https://dash.cloudflare.com";

type Limits = { isPro?: boolean; paidUntil?: string };

export default function Settings() {
  const navigate = useNavigate();
  const [backendUrl, setBackendUrl] = useState("");
  const [stripePriceId, setStripePriceId] = useState("");
  const [limits, setLimits] = useState<Limits | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [secretSaved, setSecretSaved] = useState<string | null>(null);
  const [secretsOpen, setSecretsOpen] = useState(false);
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
    const base = getApiBase();
    setBackendUrl(base || "");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isOpenMode()) return;
    if (!localStorage.getItem(KEY_USER_ID)) {
      navigate("/login", { replace: true });
      return;
    }
    setStripePriceId(localStorage.getItem(KEY_STRIPE_PRICE_ID) ?? "");
    setDomainVerifiedState(getConnectedServices().domainVerified);
  }, [navigate]);

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

  const saveBackendUrl = () => {
    const url = backendUrl.trim().replace(/\/$/, "").replace(/\/api$/i, "");
    if (url) {
      setApiBaseFallback(url);
      clearBackendUnavailable();
    } else {
      setApiBaseFallback("");
    }
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

  const connectGitHub = () => {
    const supabase = getSupabaseAuthClient();
    if (supabase) {
      supabase.auth.signInWithOAuth({ provider: "github" });
    }
  };

  const connectGoogle = () => {
    const supabase = getSupabaseAuthClient();
    if (supabase) {
      supabase.auth.signInWithOAuth({ provider: "google" });
    }
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

  if (typeof window !== "undefined" && !localStorage.getItem(KEY_USER_ID)) {
    return null;
  }

  return (
    <div>
      <div>
        <h1>Settings</h1>

        <section>
          <h2>Backend URL</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            URL where your <strong>backend</strong> runs (server.ts), e.g. <code className="bg-background/30 px-1">https://api.yourdomain.com</code> or <code className="bg-background/30 px-1">https://your-app.onrender.com</code>. Not your frontend site (e.g. www.cintiakimura.eu) — the API must be served by a separate backend. Do not paste API keys here.
          </p>
          <input
            type="url"
            placeholder="https://your-backend.example.com"
            value={backendUrl}
            onChange={(e) => setBackendUrl(e.target.value)}
            className="w-full max-w-md px-3 py-2 bg-[#1e1e1e] border border-[#333] rounded text-sm text-white placeholder-gray-500"
          />
          <button type="button" onClick={saveBackendUrl} className="ml-2 px-3 py-2 bg-[#00BFFF] text-white rounded text-sm">
            Save
          </button>
        </section>

        <section>
          <h2>API keys & secrets</h2>
          <button
            type="button"
            onClick={() => setSecretsOpen((o) => !o)}
            className="flex items-center gap-2 text-sm text-vs-foreground hover:text-vs-accent"
          >
            {secretsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            {secretsOpen ? "Hide" : "Show"} secrets
          </button>
          {secretsOpen && (
            <>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 mt-2">
                Optional. Values here override server .env. Stored in this browser only (localStorage).
              </p>
              <div className="space-y-3 max-w-xl">
                {SECRET_KEYS.map((key) => (
                  <div key={key} className="flex flex-wrap items-center gap-2">
                    <label className="text-sm font-medium text-vs-foreground w-56 shrink-0">{key}</label>
                    <input
                      type="password"
                      placeholder="optional"
                      value={secretValues[key] ?? ""}
                      onChange={(e) => setSecret(key, e.target.value)}
                      className="flex-1 min-w-[200px] px-3 py-2 bg-vs-bg border border-vs-border rounded text-sm text-vs-foreground placeholder-gray-500"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => saveSecret(key)}
                      className="px-3 py-2 bg-vs-accent text-vs-accent-foreground rounded text-sm shrink-0"
                    >
                      {secretSaved === key ? "Saved" : "Save"}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section>
          <h2>Domain / DNS</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
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
                  <code className="flex-1 px-2 py-1.5 bg-[#1e1e1e] rounded text-gray-300 text-xs">
                    A @ {VERCEL_DNS.A}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyDns("A")}
                    className="p-1.5 rounded hover:bg-[#37373d] text-gray-400 hover:text-white"
                    title="Copy"
                  >
                    {dnsCopied === "A" ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-2 py-1.5 bg-[#1e1e1e] rounded text-gray-300 text-xs">
                    CNAME www {VERCEL_DNS.CNAME}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyDns("CNAME")}
                    className="p-1.5 rounded hover:bg-[#37373d] text-gray-400 hover:text-white"
                    title="Copy"
                  >
                    {dnsCopied === "CNAME" ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
              <div className="flex gap-3 text-xs mb-2">
                <a href={GODADDY} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                  GoDaddy
                </a>
                <a href={CLOUDFLARE} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                  Cloudflare
                </a>
              </div>
              <button
                type="button"
                onClick={handleVerifyDomain}
                className="text-xs text-blue-400 hover:underline"
              >
                Mark as verified
              </button>
            </>
          )}
        </section>

        <section>
          <h2>Stripe setup</h2>
          <input
            type="text"
            placeholder="Stripe Price ID"
            value={stripePriceId}
            onChange={(e) => setStripePriceId(e.target.value)}
          />
          <button type="button" onClick={saveStripePriceId}>
            Save
          </button>
        </section>

        <section>
          <h2>GitHub</h2>
          <button type="button" onClick={connectGitHub}>
            Connect GitHub
          </button>
        </section>

        <section>
          <h2>Google</h2>
          <button type="button" onClick={connectGoogle}>
            Connect Google
          </button>
        </section>

        <section>
          <h2>Subscription</h2>
          {limits?.isPro && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Pro</p>
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
            className="text-[#00BFFF] hover:underline disabled:opacity-50"
          >
            {billingLoading ? "Opening…" : "Manage Subscription"}
          </button>
        </section>
      </div>
    </div>
  );
}

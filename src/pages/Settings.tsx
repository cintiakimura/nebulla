import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabaseAuthClient, getSessionToken } from "../lib/supabaseAuth";
import { getApiBase } from "../lib/api";
import { isOpenMode } from "../lib/auth";

const KEY_USER_ID = "kyn_user_id";
const KEY_SUPABASE_URL = "supabase_url";
const KEY_SUPABASE_ANON_KEY = "supabase_anon_key";
const KEY_STRIPE_PRICE_ID = "stripe_price_id";

const VERCEL_ENV_VARS = ["GROK_API_KEY", "BUILDER_PRIVATE_KEY", "STRIPE_PRICE_ID"] as const;
const VERCEL_DASHBOARD_URL = "https://vercel.com/dashboard";

type Limits = { isPro?: boolean; paidUntil?: string };

export default function Settings() {
  const navigate = useNavigate();
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseAnonKey, setSupabaseAnonKey] = useState("");
  const [stripePriceId, setStripePriceId] = useState("");
  const [copiedVar, setCopiedVar] = useState<string | null>(null);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isOpenMode()) return;
    if (!localStorage.getItem(KEY_USER_ID)) {
      navigate("/login", { replace: true });
      return;
    }
    setSupabaseUrl(localStorage.getItem(KEY_SUPABASE_URL) ?? "");
    setSupabaseAnonKey(localStorage.getItem(KEY_SUPABASE_ANON_KEY) ?? "");
    setStripePriceId(localStorage.getItem(KEY_STRIPE_PRICE_ID) ?? "");
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

  const saveSupabase = () => {
    if (typeof window === "undefined") return;
    localStorage.setItem(KEY_SUPABASE_URL, supabaseUrl.trim());
    localStorage.setItem(KEY_SUPABASE_ANON_KEY, supabaseAnonKey.trim());
  };

  const saveStripePriceId = () => {
    if (typeof window === "undefined") return;
    localStorage.setItem(KEY_STRIPE_PRICE_ID, stripePriceId.trim());
  };

  const copyEnvVar = (name: string) => {
    navigator.clipboard.writeText(name);
    setCopiedVar(name);
    setTimeout(() => setCopiedVar(null), 2000);
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
      alert("Sign in required");
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
      else alert(data.error ?? "Could not open billing");
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
          <h2>Supabase setup</h2>
          <input
            type="url"
            placeholder="Supabase URL"
            value={supabaseUrl}
            onChange={(e) => setSupabaseUrl(e.target.value)}
          />
          <input
            type="password"
            placeholder="Anon Key"
            value={supabaseAnonKey}
            onChange={(e) => setSupabaseAnonKey(e.target.value)}
          />
          <button type="button" onClick={saveSupabase}>
            Save
          </button>
        </section>

        <section>
          <h2>Vercel setup</h2>
          <ul>
            {VERCEL_ENV_VARS.map((name) => (
              <li key={name}>
                {name}
                <button type="button" onClick={() => copyEnvVar(name)}>
                  {copiedVar === name ? "Copied" : "Copy"}
                </button>
              </li>
            ))}
          </ul>
          <a href={VERCEL_DASHBOARD_URL} target="_blank" rel="noopener noreferrer">
            Go to Vercel to add these
          </a>
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
            className="text-blue-600 hover:underline disabled:opacity-50"
          >
            {billingLoading ? "Opening…" : "Manage Subscription"}
          </button>
        </section>
      </div>
    </div>
  );
}

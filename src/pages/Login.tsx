import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, Lock } from "lucide-react";
import { setUserIdAfterLogin } from "../lib/auth";
import { getApiBase, setBackendUnavailable, clearBackendUnavailable } from "../lib/api";
import { getSupabaseAuthClient, isSupabaseAuthConfigured } from "../lib/supabaseAuth";

export default function Login() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const useSupabase = isSupabaseAuthConfigured();

  const handleOneClickSignIn = async () => {
    setError(null);
    setLoading(true);
    const apiBase = getApiBase();
    try {
      const res = await fetch(`${apiBase || ""}/api/auth/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        clearBackendUnavailable();
        const data = (await res.json()) as { userId?: string };
        const userId = data?.userId ?? crypto.randomUUID();
        setUserIdAfterLogin(userId);
        navigate("/dashboard", { replace: true });
      } else {
        setBackendUnavailable();
        setError("Backend not reachable. Run the server (npm run dev) or add VITE_API_URL in Vercel → Project → Settings → Environment Variables.");
      }
    } catch (_e) {
      setBackendUnavailable();
      setError("Backend not reachable. Run the server (npm run dev) or add VITE_API_URL in Vercel.");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    const supabase = getSupabaseAuthClient();
    if (!supabase) {
      handleOneClickSignIn();
      return;
    }
    setLoading(true);
    try {
      // Magic link: ensure Supabase → Authentication → Providers → Email is enabled,
      // "Confirm email" is OFF, and Redirect URLs include this origin + /auth/callback.
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { data, error: err } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo },
      });
      if (err) {
        console.error("[kyn login] Magic link error:", err.message, err);
        setError(err.message);
        setLoading(false);
        return;
      }
      if (data?.user && data?.session) {
        const uid = (data as { user: { id: string }; session: unknown }).user?.id;
        if (uid) {
          setUserIdAfterLogin(uid);
          navigate("/dashboard", { replace: true });
          return;
        }
      }
      setMagicLinkSent(true);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sign in failed.";
      console.error("[kyn login] Magic link exception:", e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGitHubSignIn = () => {
    const supabase = getSupabaseAuthClient();
    if (!supabase) return;
    setError(null);
    supabase.auth.signInWithOAuth({ provider: "github" });
  };

  const handleForgotPassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    const supabase = getSupabaseAuthClient();
    if (!supabase) return;
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: `${window.location.origin}/login`,
      });
      if (err) {
        console.error("[kyn forgot password]", err.message, err);
        setError(err.message);
      } else {
        setForgotSent(true);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to send reset email.";
      console.error("[kyn forgot password]", e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-6 text-gray-300 font-sans">
      <button
        onClick={() => navigate("/")}
        className="absolute top-8 left-8 text-gray-500 hover:text-white flex items-center gap-2 transition-colors"
      >
        <ArrowLeft size={20} />
        Back
      </button>

      <div className="w-full max-w-md bg-[#111] border border-[#222] rounded-2xl p-8 shadow-2xl">
        <div className="text-3xl font-bold text-white tracking-tighter mb-2">kyn.</div>
        <p className="text-gray-400 mb-6">Sign in to your account</p>

        {useSupabase ? (
          showForgotPassword ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">Enter your email and we&apos;ll send a reset link.</p>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-lg text-white placeholder-gray-500 focus:border-blue-500 outline-none"
                  autoComplete="email"
                />
                {error && <p className="text-xs text-amber-500/90">{error}</p>}
                {forgotSent && <p className="text-xs text-green-500">Check your email for the reset link.</p>}
                <button
                  type="submit"
                  disabled={loading || !forgotEmail.trim()}
                  className="w-full py-3 px-4 bg-white text-black font-medium rounded-lg hover:bg-gray-200 disabled:opacity-60"
                >
                  {loading ? "…" : "Send reset link"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForgotPassword(false); setError(null); setForgotSent(false); setForgotEmail(""); }}
                  className="w-full text-sm text-gray-500 hover:text-gray-400"
                >
                  Back to sign in
                </button>
              </form>
            </div>
          ) : (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            {magicLinkSent && (
              <p className="text-xs text-green-500">Check your email for the sign-in link. If you don&apos;t see it, check spam.</p>
            )}
            <div>
              <label className="block text-left text-sm text-gray-500 mb-1">Email</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                  autoComplete="email"
                />
              </div>
            </div>
            <div>
              <label className="block text-left text-sm text-gray-500 mb-1">Password</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                />
              </div>
              <div className="text-right mt-1">
                <button
                  type="button"
                  onClick={() => { setShowForgotPassword(true); setError(null); setForgotSent(false); }}
                  className="text-xs text-gray-500 hover:text-gray-400"
                >
                  Forgot password?
                </button>
              </div>
            </div>
            {error && <p className="text-xs text-amber-500/90">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-white text-black font-medium rounded-lg hover:bg-gray-200 disabled:opacity-60 transition-colors"
            >
              {loading ? "…" : isSignUp ? "Create account" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={handleGitHubSignIn}
              disabled={loading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg disabled:opacity-60 transition-colors"
            >
              Sign in with GitHub
            </button>
            <button
              type="button"
              onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
              className="w-full text-sm text-gray-500 hover:text-gray-400"
            >
              {isSignUp ? "Already have an account? Sign in" : "No account? Create one"}
            </button>
          </form>
          )
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">
              Backend not reached. Set <strong>VITE_API_URL</strong> to your backend URL in Vercel → Project → Environment Variables, then <strong>redeploy</strong>. Or set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for email sign-in.
            </p>
            {error && <p className="text-xs text-amber-500/90 mb-4">{error}</p>}
            <button
              onClick={handleOneClickSignIn}
              disabled={loading}
              className="w-full py-3 px-4 bg-white text-black font-medium rounded-lg hover:bg-gray-200 disabled:opacity-60"
            >
              {loading ? "…" : "Sign in (no backend)"}
            </button>
            <p className="mt-3 text-center">
              <button
                type="button"
                onClick={() => navigate("/settings")}
                className="text-xs text-gray-500 hover:text-gray-400"
              >
                Login with email
              </button>
            </p>
          </>
        )}

        <p className="mt-6 text-xs text-gray-600">
          Email/password uses Supabase Auth — no redirect URLs. Enable Email in Supabase → Authentication → Providers if needed.
        </p>
      </div>
    </div>
  );
}

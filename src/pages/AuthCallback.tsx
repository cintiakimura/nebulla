import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ensureSupabaseConfig, getSupabaseAuthClient } from "../lib/supabaseAuth";
import { setUserIdAfterLogin } from "../lib/auth";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let subscription: { unsubscribe: () => void } | null = null;
    let timeoutId = 0;

    const clearAuthTimeout = () => {
      if (timeoutId !== 0) {
        window.clearTimeout(timeoutId);
        timeoutId = 0;
      }
    };

    (async () => {
      try {
        await ensureSupabaseConfig();
      } catch (_) {
        /* non-fatal */
      }

      const supabase = getSupabaseAuthClient();
      if (!supabase) {
        console.error("[kyn auth callback] Supabase client not configured");
        if (!cancelled) {
          setErrorMsg("Supabase auth is not configured. Check Settings → API URL and reload.");
          setStatus("error");
        }
        return;
      }

      const finishSuccess = (userId: string) => {
        if (cancelled) return;
        clearAuthTimeout();
        setUserIdAfterLogin(userId);
        setStatus("done");
        setErrorMsg(null);
        navigate("/builder", { replace: true });
      };

      // Start timeout before PKCE exchange + getSession so a fast success always clears a real timer
      // (no setState after unmount / leak from a timer created only after navigate).
      timeoutId = window.setTimeout(() => {
        if (!cancelled) {
          setStatus((s) => (s === "loading" ? "error" : s));
          setErrorMsg((m) => m ?? "Auth timed out.");
        }
      }, 12000);

      const { data: { subscription: sub } } = supabase.auth.onAuthStateChange((event, sess) => {
        if (cancelled) return;
        if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
          const uid = sess?.user?.id;
          if (uid) finishSuccess(uid);
        }
      });
      subscription = sub;

      // OAuth (PKCE): Supabase redirects with ?code= — exchange before reading session.
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      if (code) {
        const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeErr) {
          console.error("[kyn auth callback] exchangeCodeForSession:", exchangeErr.message);
          clearAuthTimeout();
          if (!cancelled) {
            setErrorMsg(exchangeErr.message);
            setStatus("error");
          }
          return;
        }
        window.history.replaceState({}, document.title, url.pathname + url.hash);
      }

      const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
      if (cancelled) return;

      if (sessionErr) {
        console.error("[kyn auth callback] getSession error:", sessionErr.message, sessionErr);
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled) return;
        const uid = user?.id;
        if (uid) {
          finishSuccess(uid);
          return;
        }
        clearAuthTimeout();
        if (!cancelled) {
          setStatus("error");
          setErrorMsg("Could not resolve user from Supabase session.");
        }
        return;
      }

      const uid = session?.user?.id;
      if (uid) {
        finishSuccess(uid);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      const userId = user?.id;
      if (userId) {
        finishSuccess(userId);
        return;
      }

      clearAuthTimeout();
      if (!cancelled) {
        setStatus("error");
        setErrorMsg("Supabase returned no user. Try signing in again.");
      }
    })();

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
      if (timeoutId !== 0) window.clearTimeout(timeoutId);
    };
  }, [navigate]);

  if (status === "error") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-white font-sans">
        <p className="text-amber-400 mb-4">Sign-in could not be completed.</p>
        {errorMsg ? <p className="text-sm text-[#9cdcfe] mb-4 text-center px-3">{errorMsg}</p> : null}
        <button
          onClick={() => navigate("/login")}
          className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors"
        >
          Back to login
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-[#9cdcfe] font-sans">
      <p>Completing sign-in…</p>
    </div>
  );
}

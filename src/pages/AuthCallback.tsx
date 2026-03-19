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

    const bootstrap = async () => {
      let supabase = getSupabaseAuthClient();
      if (!supabase) {
        try {
          await ensureSupabaseConfig();
          supabase = getSupabaseAuthClient();
        } catch (_) {}
      }

      if (!supabase) {
        console.error("[kyn auth callback] Supabase client not configured");
        if (!cancelled) {
          setErrorMsg("Supabase auth is not configured. Check Settings → API URL and reload.");
          setStatus("error");
        }
        return;
      }

      const applyUserId = (userId: string) => {
        if (cancelled) return;
      setUserIdAfterLogin(userId);
        setStatus("done");
        setErrorMsg(null);
      navigate("/builder", { replace: true });
      };

      supabase.auth.getSession().then(({ data: { session }, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[kyn auth callback] getSession error:", error.message, error);
          // Try to fetch the user anyway (timing/clock skew).
          setErrorMsg(error.message);
          supabase.auth
            .getUser()
            .then(({ data: { user } }) => {
              const uid = user?.id;
              if (uid) applyUserId(uid);
              else {
                setStatus("error");
                setErrorMsg("Could not resolve user from Supabase session.");
              }
            })
            .catch((e) => {
              console.error("[kyn auth callback] getUser error:", e);
              setStatus("error");
              setErrorMsg("Could not resolve user from Supabase.");
            });
          return;
        }
        const uid = session?.user?.id;
        if (uid) applyUserId(uid);
        else {
          // Session present but user missing. Fetch explicitly.
          supabase.auth
            .getUser()
            .then(({ data: { user } }) => {
              const userId = user?.id;
              if (userId) applyUserId(userId);
              else {
                setStatus("error");
                setErrorMsg("Supabase returned a session without a user id.");
              }
            })
            .catch((e) => {
              console.error("[kyn auth callback] getUser error:", e);
              setStatus("error");
              setErrorMsg("Supabase user lookup failed.");
            });
        }
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (cancelled) return;
        if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
          const uid = session?.user?.id;
          if (uid) applyUserId(uid);
        }
      });

      const timeout = window.setTimeout(() => {
        if (!cancelled) {
          setStatus((s) => (s === "loading" ? "error" : s));
          setErrorMsg((m) => m ?? "Auth timed out.");
        }
      }, 5000);

      // Cleanup
      return () => {
        cancelled = true;
        subscription.unsubscribe();
        window.clearTimeout(timeout);
      };
    };

    let cleanup: (() => void) | null = null;
    bootstrap().then((fn) => {
      cleanup = typeof fn === "function" ? fn : null;
    });

    return () => {
      cancelled = true;
      cleanup?.();
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

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabaseAuthClient } from "../lib/supabaseAuth";
import { setUserIdAfterLogin } from "../lib/auth";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");

  useEffect(() => {
    const supabase = getSupabaseAuthClient();
    if (!supabase) {
      console.error("[kyn auth callback] Supabase client not configured");
      setStatus("error");
      return;
    }

    let cancelled = false;

    const applyUserId = (userId: string) => {
      if (cancelled) return;
      setUserIdAfterLogin(userId);
      setStatus("done");
      navigate("/builder", { replace: true });
    };

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (cancelled) return;
      if (error) {
        console.error("[kyn auth callback] getSession error:", error.message, error);
        // If the session check fails due to clock skew or URL timing, try to fetch the user anyway.
        supabase.auth
          .getUser()
          .then(({ data: { user } }) => {
            const uid = user?.id;
            if (uid) applyUserId(uid);
            else setStatus("error");
          })
          .catch(() => setStatus("error"));
        return;
      }
      const uid = session?.user?.id;
      if (uid) applyUserId(uid);
      else {
        // Session present but user missing (rare but can happen with URL parsing). Fetch user explicitly.
        supabase.auth
          .getUser()
          .then(({ data: { user } }) => {
            const userId = user?.id;
            if (userId) applyUserId(userId);
            else setStatus("error");
          })
          .catch(() => setStatus("error"));
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
      if (!cancelled) setStatus((s) => (s === "loading" ? "error" : s));
    }, 5000);
    return () => {
      cancelled = true;
      subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, [navigate]);

  if (status === "error") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-white font-sans">
        <p className="text-amber-400 mb-4">Sign-in could not be completed.</p>
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

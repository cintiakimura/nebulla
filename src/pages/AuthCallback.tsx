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

    const applySession = (session: { user?: { id?: string } } | null) => {
      if (cancelled) return;
      if (session?.user?.id) {
        setUserIdAfterLogin(session.user.id);
        setStatus("done");
        navigate("/dashboard", { replace: true });
      } else {
        setStatus("error");
      }
    };

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (cancelled) return;
      if (error) {
        console.error("[kyn auth callback] getSession error:", error.message, error);
        setStatus("error");
        return;
      }
      applySession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        applySession(session);
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
      <div className="min-h-screen bg-[#000000] flex flex-col items-center justify-center p-6 text-[#E0E0E0] font-sans">
        <p className="text-amber-500 mb-4">Sign-in could not be completed.</p>
        <button
          onClick={() => navigate("/login")}
          className="px-4 py-2 bg-[#00BFFF] hover:bg-[#40d4ff] text-black hover:scale-105 rounded-lg transition-all"
        >
          Back to login
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000] flex flex-col items-center justify-center p-6 text-[#E0E0E0] font-sans">
      <p className="text-[#9ca3af]">Completing sign-in…</p>
    </div>
  );
}

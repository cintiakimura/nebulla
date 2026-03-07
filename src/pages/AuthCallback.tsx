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
      setStatus("error");
      return;
    }
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        setStatus("error");
        return;
      }
      if (session?.user?.id) {
        setUserIdAfterLogin(session.user.id);
        setStatus("done");
        navigate("/dashboard", { replace: true });
      } else {
        setStatus("error");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.id) {
        setUserIdAfterLogin(session.user.id);
        setStatus("done");
        navigate("/dashboard", { replace: true });
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  if (status === "error") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-6 text-gray-300 font-sans">
        <p className="text-amber-500 mb-4">Sign-in could not be completed.</p>
        <button
          onClick={() => navigate("/login")}
          className="px-4 py-2 bg-[#333] hover:bg-[#444] text-white rounded-lg"
        >
          Back to login
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-6 text-gray-300 font-sans">
      <p className="text-gray-400">Completing sign-in…</p>
    </div>
  );
}

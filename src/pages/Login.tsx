import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Github, Mail, ArrowLeft } from "lucide-react";
import { setUserIdAfterLogin } from "../lib/auth";
import { getApiBase, isBackendAvailable, setBackendUnavailable } from "../lib/api";

export default function Login() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setError(null);
    let userId: string = crypto.randomUUID();
    if (isBackendAvailable()) {
      const apiBase = getApiBase();
      try {
        const res = await fetch(`${apiBase}/api/auth/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (res.ok) {
          try {
            const data = (await res.json()) as { userId?: string };
            if (data?.userId) userId = data.userId;
          } catch {
            setError("Server responded but not JSON. Using demo session.");
          }
        } else {
          setBackendUnavailable();
          setError("No backend at this URL. Using demo session.");
        }
      } catch (_e) {
        setBackendUnavailable();
        setError("Could not reach server. Using demo session.");
      }
    }
    setUserIdAfterLogin(userId);
    navigate("/dashboard", { replace: true });
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

      <div className="w-full max-w-md bg-[#111] border border-[#222] rounded-2xl p-8 text-center shadow-2xl">
        <div className="text-3xl font-bold text-white tracking-tighter mb-2">kyn.</div>
        <p className="text-gray-400 mb-8">Sign in to your account</p>

        <div className="space-y-4">
          <button 
            onClick={handleSignIn}
            className="w-full py-3 px-4 bg-[#24292e] hover:bg-[#2f363d] text-white rounded-lg font-medium flex items-center justify-center gap-3 transition-colors"
          >
            <Github size={20} />
            Continue with GitHub
          </button>
          
          <div className="relative py-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#333]"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-[#111] text-gray-500">or</span>
            </div>
          </div>

          <button 
            onClick={handleSignIn}
            className="w-full py-3 px-4 bg-white text-black hover:bg-gray-200 rounded-lg font-medium flex items-center justify-center gap-3 transition-colors"
          >
            <Mail size={20} />
            Continue with Google
          </button>
        </div>

        {error && (
          <p className="mt-4 text-xs text-amber-500/90">{error}</p>
        )}
        
        <p className="mt-8 text-xs text-gray-600">
          One click → Dashboard. No password. Demo session if server is unavailable.
        </p>
      </div>
    </div>
  );
}

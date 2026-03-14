import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getApiBase } from "../lib/api";
import { setFirstLoginDone } from "../lib/supabaseAuth";

export default function SimpleStart() {
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = getApiBase();
  const apiUrl = base ? `${base}/api/users/open-dev-user/projects` : "/api/users/open-dev-user/projects";

  const handleStart = () => setModalOpen(true);

  const handleGo = async () => {
    const projectName = name.trim() || "My first project";
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: projectName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message || `Failed to create project (${res.status})`);
      }
      setFirstLoginDone();
      navigate("/dashboard", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans flex flex-col items-center justify-center px-4">
      <h1 className="text-4xl md:text-5xl font-light tracking-tight text-center mb-8">
        Kyn. Let&apos;s build.
      </h1>
      <button
        type="button"
        onClick={handleStart}
        className="px-10 py-4 text-lg font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
      >
        Start
      </button>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => !loading && setModalOpen(false)}>
          <div className="bg-[#1a1a1a] border border-white/10 rounded-xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-white text-lg mb-4">Name your first project?</p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGo()}
              placeholder="My first project"
              className="w-full px-4 py-3 rounded-lg bg-black/50 border border-white/20 text-white placeholder:text-white/50 focus:outline-none focus:border-blue-500 mb-4"
              autoFocus
            />
            {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => !loading && setModalOpen(false)} className="px-4 py-2 text-white/80 hover:text-white">
                Cancel
              </button>
              <button type="button" onClick={handleGo} disabled={loading} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50">
                {loading ? "…" : "Go"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

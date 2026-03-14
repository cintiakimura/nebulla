import { useNavigate } from "react-router-dom";
import { setFirstLoginDone } from "../lib/supabaseAuth";

export default function SimpleStart() {
  const navigate = useNavigate();

  const handleStart = () => {
    setFirstLoginDone();
    navigate("/dashboard", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background text-text font-sans flex flex-col items-center justify-center px-4">
      <h1 className="text-4xl md:text-5xl font-light tracking-tight text-center mb-8">
        Kyn. Let&apos;s build.
      </h1>
      <button
        type="button"
        onClick={handleStart}
        className="px-10 py-4 text-lg font-medium rounded-lg bg-primary hover:opacity-90 text-background hover:scale-105 transition-colors"
      >
        Start
      </button>
    </div>
  );
}

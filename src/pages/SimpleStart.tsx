import { useNavigate } from "react-router-dom";
import { NebullaLogo } from "../components/NebullaLogo";
import { setFirstLoginDone } from "../lib/supabaseAuth";

export default function SimpleStart() {
  const navigate = useNavigate();

  const handleStart = () => {
    setFirstLoginDone();
    navigate("/builder", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background text-white font-sans flex flex-col items-center justify-center px-4">
      <NebullaLogo size={88} className="mb-6" />
      <h1 className="text-4xl md:text-5xl font-light tracking-tight text-center mb-8 text-white">
        Nebulla. Let&apos;s build.
      </h1>
      <button
        type="button"
        onClick={handleStart}
        className="px-10 py-4 text-lg font-medium rounded-lg bg-primary hover:bg-primary/90 text-white transition-colors"
      >
        Start
      </button>
    </div>
  );
}

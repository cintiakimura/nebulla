import { useState, useEffect } from "react";
import { AlertTriangle, X, BookOpen } from "lucide-react";
import { runHealthCheck } from "../lib/healthCheck";
import { getApiBase } from "../lib/api";
import { useHelpWidgetOptional } from "../context/HelpWidgetContext";

type BannerState = "idle" | "checking" | "missing" | "ok" | "dismissed";

/**
 * Shown when VITE_API_URL (and fallback) are missing or health check fails.
 * Offers "Open Setup Wizard" to fix. Non-intrusive; can dismiss.
 */
export default function BackendMissingBanner() {
  const ctx = useHelpWidgetOptional();
  const [state, setState] = useState<BannerState>("idle");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const runCheck = () => {
      const apiBase = getApiBase();
      if (apiBase) {
        setState("checking");
        runHealthCheck(() => getApiBase()).then((result) => {
          if (!cancelled) setState(result.apiOk ? "ok" : "missing");
        });
      } else {
        setState("missing");
      }
    };
    runCheck();
    const onApiBaseChanged = () => runCheck();
    window.addEventListener("kyn-api-base-changed", onApiBaseChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("kyn-api-base-changed", onApiBaseChanged);
    };
  }, []);

  const show = state === "missing" && !dismissed;
  if (!show) return null;

  const openWizard = () => {
    ctx?.setOpen(true);
    ctx?.setActiveTab("setup");
    ctx?.setWizardStep("railway-backend");
  };

  return (
    <div
      role="banner"
      aria-live="polite"
      className="flex items-center justify-between gap-4 px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-amber-200 text-sm"
    >
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle size={18} className="flex-shrink-0" />
        <span>
          Backend not configured. Add your API URL in the Setup Wizard (or set <code className="bg-black/20 px-1 rounded">VITE_API_URL</code> and redeploy).
        </span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={openWizard}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white font-medium"
        >
          <BookOpen size={16} />
          Open Setup Wizard
        </button>
        <button
          type="button"
          aria-label="Dismiss banner"
          onClick={() => setDismissed(true)}
          className="p-1.5 rounded hover:bg-amber-500/20 text-amber-200"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

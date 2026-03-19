/**
 * Right-side Settings drawer: API keys (Stripe, Builder) + general toggles.
 * Supabase/Vercel are backend-only (profile set). Grok/XAI key is backend-only (XAI_API_KEY in env).
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, ChevronDown, ChevronRight, HelpCircle } from "lucide-react";
import {
  getStoredSecret,
  hasStoredSecret,
  setStoredSecret,
  SECRET_KEYS,
  type SecretKey,
} from "../lib/storedSecrets";

const KEY_USE_LOCAL_FIRST = "kyn_use_local_keys_first";
const KEY_DEBUG_MODE = "kyn_debug_mode";
const GROK_LABEL = "Grok / XAI API Key";
const GROK_HELPER = "Backend-only: set `XAI_API_KEY` (or `GROK_API_KEY`) in your server .env. This UI is kept for compatibility.";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Shown when drawer opens without a Grok key (first-time prompt). */
  initialMessage?: string;
  /** Called after Grok key is saved and validated, so parent can retry the failed action. */
  onRetry?: () => void;
};

export default function SettingsDrawer({ open, onClose, initialMessage, onRetry }: Props) {
  const [grokInput, setGrokInput] = useState("");
  const [grokStatus, setGrokStatus] = useState<"idle" | "saving" | "valid" | "invalid">("idle");
  const [grokError, setGrokError] = useState("");
  const [toast, setToast] = useState<"saved" | "invalid" | null>(null);
  const [otherKeysOpen, setOtherKeysOpen] = useState(false);
  const [generalOpen, setGeneralOpen] = useState(false);
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [useLocalFirst, setUseLocalFirst] = useState(true);
  const [debugMode, setDebugMode] = useState(false);

  const handleSaveGrok = () => {
    // Grok keys are expected to be set server-side; keep client flow non-destructive.
    // We still persist to localStorage for local dev compatibility, but backend won’t use it.
    setGrokStatus("saving");
    try {
      setStoredSecret("GROK_API_KEY", grokInput);
      setGrokStatus(hasStoredSecret("GROK_API_KEY") ? "valid" : "invalid");
      setGrokError(hasStoredSecret("GROK_API_KEY")
        ? "Saved locally, but you still need to set XAI_API_KEY/GROK_API_KEY in the backend .env."
        : "Grok key looks empty.");
      setToast(hasStoredSecret("GROK_API_KEY") ? "saved" : "invalid");
    } finally {
      setTimeout(() => onRetry?.(), 0);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    setUseLocalFirst(localStorage.getItem(KEY_USE_LOCAL_FIRST) !== "false");
    setDebugMode(localStorage.getItem(KEY_DEBUG_MODE) === "true");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    SECRET_KEYS.forEach((k) => {
      next[k] = getStoredSecret(k) ? "••••••••" : "";
    });
    setSecretValues(next);
  }, [open]);

  const setSecret = (key: SecretKey, value: string) => {
    setSecretValues((prev) => ({ ...prev, [key]: value }));
  };

  const saveSecret = (key: SecretKey) => {
    const raw = secretValues[key] ?? "";
    const toSave = raw === "••••••••" ? getStoredSecret(key) : raw.trim();
    setStoredSecret(key, toSave);
    setSecretValues((prev) => ({ ...prev, [key]: getStoredSecret(key) ? "••••••••" : "" }));
  };

  const handleUseLocalFirst = (v: boolean) => {
    setUseLocalFirst(v);
    localStorage.setItem(KEY_USE_LOCAL_FIRST, v ? "true" : "false");
  };

  const handleDebugMode = (v: boolean) => {
    setDebugMode(v);
    localStorage.setItem(KEY_DEBUG_MODE, v ? "true" : "false");
  };

  const handleClearAll = () => {
    if (typeof window === "undefined") return;
    if (!confirm("Clear all local data (keys, preferences) and reload?")) return;
    localStorage.clear();
    window.location.reload();
  };

  return (
    <AnimatePresence>
      {open && (
      <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-background/80"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "tween", duration: 0.25 }}
        className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-vs-editor border-l border-vs-border shadow-xl z-[101] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-vs-border flex-shrink-0">
          <h2 className="text-lg font-semibold text-vs-foreground">Settings & API Keys</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-md hover:bg-vs-hover text-vs-muted hover:text-vs-foreground"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-6">
          {initialMessage && (
            <div className="rounded-lg bg-vs-accent/15 border border-vs-accent/40 px-3 py-2 text-sm text-vs-foreground">
              {initialMessage}
            </div>
          )}

          {/* Grok API Key */}
          <section>
            <label className="block text-sm font-medium text-vs-foreground mb-1">{GROK_LABEL}</label>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder={hasStoredSecret("GROK_API_KEY") ? "••••••••" : "xai-…"}
                value={grokInput}
                onChange={(e) => setGrokInput(e.target.value)}
                className="flex-1 px-3 py-2 bg-vs-bg border border-vs-border rounded text-sm text-vs-foreground placeholder-gray-500"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={handleSaveGrok}
                disabled={grokStatus === "saving"}
                className="px-4 py-2 rounded bg-[#00BFFF] hover:bg-[#40d4ff] text-white text-sm font-medium disabled:opacity-50 shrink-0"
              >
                {grokStatus === "saving" ? "…" : "Save Key"}
              </button>
            </div>
            {grokStatus === "valid" && (
              <span className="inline-block mt-2 text-xs font-medium text-green-500">Valid</span>
            )}
            {grokError && <p className="mt-2 text-xs text-amber-500">{grokError}</p>}
            <p className="mt-2 text-xs text-vs-muted flex items-start gap-1">
              <HelpCircle size={14} className="shrink-0 mt-0.5" aria-label="Stored only in your browser (localStorage)." />
              {GROK_HELPER}
            </p>
          </section>

          {/* Other Keys (expandable) */}
          <section>
            <button
              type="button"
              onClick={() => setOtherKeysOpen((o) => !o)}
              className="flex items-center gap-2 text-sm font-medium text-vs-foreground w-full"
            >
              {otherKeysOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              Other keys (optional)
            </button>
            {otherKeysOpen && (
              <div className="mt-3 space-y-3 pl-4 border-l border-vs-border">
                {SECRET_KEYS.map((key) => (
                  <div key={key} className="flex flex-wrap items-center gap-2">
                    <label className="text-xs text-vs-muted w-40 shrink-0">{key}</label>
                    <input
                      type="password"
                      placeholder="optional"
                      value={secretValues[key] ?? ""}
                      onChange={(e) => setSecret(key, e.target.value)}
                      className="flex-1 min-w-[120px] px-2 py-1.5 bg-vs-bg border border-vs-border rounded text-xs text-vs-foreground"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => saveSecret(key)}
                      className="px-2 py-1.5 rounded bg-vs-hover text-vs-foreground text-xs shrink-0"
                    >
                      Save
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* General Settings */}
          <section>
            <button
              type="button"
              onClick={() => setGeneralOpen((o) => !o)}
              className="flex items-center gap-2 text-sm font-medium text-vs-foreground w-full"
            >
              {generalOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              General
            </button>
            {generalOpen && (
              <div className="mt-3 space-y-3 pl-4 border-l border-vs-border">
                <label className="flex items-center gap-2 text-sm text-vs-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useLocalFirst}
                    onChange={(e) => handleUseLocalFirst(e.target.checked)}
                    className="rounded border-vs-border"
                  />
                  Always use local keys first
                </label>
                <label className="flex items-center gap-2 text-sm text-vs-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={debugMode}
                    onChange={(e) => handleDebugMode(e.target.checked)}
                    className="rounded border-vs-border"
                  />
                  Enable debug mode (extra console logs)
                </label>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-sm text-amber-500 hover:text-amber-400"
                >
                  Clear all local data
                </button>
              </div>
            )}
          </section>
        </div>
      </motion.aside>
      </>
      )}
    </AnimatePresence>
  );
}

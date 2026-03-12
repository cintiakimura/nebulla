import { motion, AnimatePresence } from "motion/react";
import { X, BookOpen, AlertCircle, Zap, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useHelpWidget } from "../context/HelpWidgetContext";
import type { HelpTab } from "../lib/helpWidgetStorage";
import SetupGuideWizard from "./SetupGuideWizard";
import { clsx } from "clsx";

const TABS: { id: HelpTab; label: string; icon: typeof BookOpen }[] = [
  { id: "setup", label: "Setup Wizard", icon: BookOpen },
  { id: "troubleshooting", label: "Troubleshooting", icon: AlertCircle },
  { id: "quick-actions", label: "Quick Actions", icon: Zap },
  { id: "docs", label: "Docs Links", icon: FileText },
];

export default function HelpWidgetPanel() {
  const navigate = useNavigate();
  const { open, setOpen, activeTab, setActiveTab, wizardStep, setHiddenForever, hiddenForever } = useHelpWidget();
  if (hiddenForever) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9997] bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          {/* Panel */}
          <motion.div
            role="dialog"
            aria-label="Setup guide and help"
            aria-modal="true"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
            className="fixed top-0 right-0 bottom-0 z-[9999] w-full max-w-md flex flex-col bg-[#252526] border-l border-[#333333] shadow-2xl"
          >
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-[#333333]">
              <h2 className="text-sm font-semibold text-white">Help & Setup</h2>
              <button
                type="button"
                aria-label="Close help panel"
                onClick={() => setOpen(false)}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#37373d] transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex-shrink-0 flex border-b border-[#333333] overflow-x-auto">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={clsx(
                    "flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                    activeTab === id
                      ? "border-[#007acc] text-white bg-[#1e1e1e]"
                      : "border-transparent text-gray-400 hover:text-white hover:bg-[#2d2d2d]"
                  )}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 flex flex-col">
              {activeTab === "setup" && <SetupGuideWizard />}
              {activeTab === "troubleshooting" && (
                <div className="p-4 overflow-y-auto text-sm text-gray-400 space-y-4">
                  <h3 className="text-white font-medium">Common issues</h3>
                  <details className="rounded-lg bg-[#1e1e1e] border border-[#333333] p-3">
                    <summary className="cursor-pointer font-medium text-gray-300">CORS / 404 on API</summary>
                    <p className="mt-2 text-xs">Set VITE_API_URL to your backend URL. Set ALLOWED_ORIGIN on backend to your Vercel domain.</p>
                  </details>
                  <details className="rounded-lg bg-[#1e1e1e] border border-[#333333] p-3">
                    <summary className="cursor-pointer font-medium text-gray-300">Supabase "forbid secret"</summary>
                    <p className="mt-2 text-xs">Use anon key in the browser, never service_role. Check VITE_SUPABASE_ANON_KEY.</p>
                  </details>
                  <details className="rounded-lg bg-[#1e1e1e] border border-[#333333] p-3">
                    <summary className="cursor-pointer font-medium text-gray-300">GitHub OAuth redirect</summary>
                    <p className="mt-2 text-xs">Callback URL must be exactly: https://YOUR_REF.supabase.co/auth/v1/callback. Add it in GitHub OAuth App and Supabase Auth URL config.</p>
                  </details>
                </div>
              )}
              {activeTab === "quick-actions" && (
                <div className="p-4 overflow-y-auto text-sm text-gray-400 space-y-3">
                  <h3 className="text-white font-medium">Quick actions</h3>
                  <button
                    type="button"
                    onClick={() => { setOpen(false); navigate("/setup"); }}
                    className="w-full text-left p-3 rounded-lg bg-[#1e1e1e] border border-[#333333] text-gray-300 hover:border-[#007acc] hover:text-white transition-colors"
                  >
                    Open full Setup page
                  </button>
                  <button
                    type="button"
                    onClick={() => { setOpen(false); navigate("/settings"); }}
                    className="w-full text-left p-3 rounded-lg bg-[#1e1e1e] border border-[#333333] text-gray-300 hover:border-[#007acc] hover:text-white transition-colors"
                  >
                    Settings (Supabase, Stripe, GitHub)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setOpen(false); navigate("/dashboard"); }}
                    className="w-full text-left p-3 rounded-lg bg-[#1e1e1e] border border-[#333333] text-gray-300 hover:border-[#007acc] hover:text-white transition-colors"
                  >
                    Dashboard
                  </button>
                </div>
              )}
              {activeTab === "docs" && (
                <div className="p-4 overflow-y-auto text-sm text-gray-400 space-y-3">
                  <h3 className="text-white font-medium">Docs & links</h3>
                  <a href="https://github.com/cintiakimura/kyn#readme" target="_blank" rel="noopener noreferrer" className="block text-blue-400 hover:underline">
                    kyn README
                  </a>
                  <a href="https://supabase.com/docs" target="_blank" rel="noopener noreferrer" className="block text-blue-400 hover:underline">
                    Supabase Docs
                  </a>
                  <a href="https://vercel.com/docs" target="_blank" rel="noopener noreferrer" className="block text-blue-400 hover:underline">
                    Vercel Docs
                  </a>
                  <a href="https://vercel.com/docs" target="_blank" rel="noopener noreferrer" className="block text-blue-400 hover:underline">
                    Vercel Docs
                  </a>
                </div>
              )}
            </div>

            {/* Footer: Hide forever when on Done step */}
            {activeTab === "setup" && wizardStep === "done" && (
              <div className="flex-shrink-0 px-4 py-3 border-t border-[#333333]">
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== "undefined" && window.confirm("Hide this help widget until you clear site data?")) {
                      setHiddenForever(true);
                      setOpen(false);
                    }
                  }}
                  className="text-xs text-gray-500 hover:text-gray-400"
                >
                  Hide this widget forever
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

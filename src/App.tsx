import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect, useState } from "react";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import Pricing from "./pages/Pricing";
import Dashboard from "./pages/Dashboard";
import Onboarding from "./pages/Onboarding";
import Builder from "./pages/Builder";
import Setup from "./pages/Setup";
import Settings from "./pages/Settings";
import MasterPlanBrainstorming from "./pages/MasterPlanBrainstorming";
import { HelpWidgetProvider } from "./context/HelpWidgetContext";
import HelpWidget from "./components/HelpWidget";
import { ensureSupabaseConfig } from "./lib/supabaseAuth";

export default function App() {
  const [configReady, setConfigReady] = useState(false);

  useEffect(() => {
    ensureSupabaseConfig()
      .then(() => setConfigReady(true))
      .catch(() => setConfigReady(true)); // proceed even on failure so env/wizard fallback can be used
  }, []);

  if (!configReady) {
    return (
      <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center text-gray-400 font-sans">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <HelpWidgetProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-[#1e1e1e] text-gray-300 font-sans selection:bg-blue-500/30">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/builder" element={<Builder />} />
            <Route path="/builder/:projectId" element={<Builder />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/master-plan-brainstorming" element={<MasterPlanBrainstorming />} />
          </Routes>
          <HelpWidget />
        </div>
      </BrowserRouter>
    </HelpWidgetProvider>
  );
}


import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import Landing from "./pages/Landing";
import SimpleStart from "./pages/SimpleStart";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import Pricing from "./pages/Pricing";
import Onboarding from "./pages/Onboarding";
import Builder from "./pages/Builder";
import Setup from "./pages/Setup";
import Settings from "./pages/Settings";
import MasterPlanBrainstorming from "./pages/MasterPlanBrainstorming";
import LockedSummary from "./pages/LockedSummary";
import { ensureSupabaseConfig } from "./lib/supabaseAuth";
import { isOpenMode } from "./lib/auth";

function RootRedirect() {
  return isOpenMode() ? <SimpleStart /> : <Landing />;
}

export default function App() {
  const [configReady, setConfigReady] = useState(false);

  useEffect(() => {
    ensureSupabaseConfig()
      .then(() => setConfigReady(true))
      .catch(() => setConfigReady(true));
  }, []);

  if (!configReady) {
    return (
      <div className="min-h-screen flex items-center justify-center font-sans bg-background text-white">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen font-sans bg-background text-white selection:bg-primary/30">
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/landing" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/pricing" element={isOpenMode() ? <Navigate to="/builder" replace /> : <Pricing />} />
          <Route path="/dashboard" element={<Navigate to="/builder" replace />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/builder" element={<Builder />} />
          <Route path="/builder/:projectId" element={<Builder />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/master-plan-brainstorming" element={<MasterPlanBrainstorming />} />
          <Route path="/project/:projectId/locked-summary" element={<LockedSummary />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}


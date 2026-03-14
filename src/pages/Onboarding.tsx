import { useState, ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ArrowLeft, CheckCircle, Download, LayoutTemplate } from "lucide-react";
import MindMap from "../components/MindMap";
import { getUserId } from "../lib/auth";
import { getApiBase, setBackendUnavailable } from "../lib/api";
import { getSessionToken } from "../lib/supabaseAuth";

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    objective: "",
    usersRoles: "",
    dataModels: "",
    constraints: "",
    branding: "",
    pagesNav: "",
    integrations: "",
    doneState: "",
  });

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleNext = () => setStep(s => Math.min(s + 1, 3));
  const handlePrev = () => setStep(s => Math.max(s - 1, 1));

  const handleExport = () => {
    const spec = JSON.stringify(formData, null, 2);
    const blob = new Blob([spec], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tech-spec.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOpenInBuilder = async () => {
    const api = getApiBase();
    if (!api) {
      navigate("/builder");
      return;
    }
    try {
      const userId = await getUserId();
      const token = await getSessionToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${api}/api/users/${userId}/projects`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "New project" }),
      });
      if (res.ok) {
        const project = await res.json();
        navigate(`/builder/${project.id}`);
        return;
      }
      if (res.status === 403) {
        const data = await res.json().catch(() => ({}));
        if ((data as { error?: string }).error === "free_project_limit_reached") {
          navigate("/builder");
          return;
        }
      }
      setBackendUnavailable();
      navigate("/builder");
    } catch (_) {
      setBackendUnavailable();
      navigate("/builder");
    }
  };

  return (
    <div className="flex h-screen bg-[#1e1e1e] text-gray-300">
      <div className="flex-1 flex flex-col max-w-5xl mx-auto p-8">
        
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-white mb-2">New Project Setup</h1>
          <div className="flex items-center gap-4 text-sm mt-4">
            <div className={`flex items-center gap-2 ${step >= 1 ? 'text-blue-400' : 'text-gray-500'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center border ${step >= 1 ? 'border-blue-400 bg-blue-400/10' : 'border-gray-500'}`}>1</div>
              <span>Architecture</span>
            </div>
            <div className="w-12 h-px bg-gray-700"></div>
            <div className={`flex items-center gap-2 ${step >= 2 ? 'text-blue-400' : 'text-gray-500'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center border ${step >= 2 ? 'border-blue-400 bg-blue-400/10' : 'border-gray-500'}`}>2</div>
              <span>Mind Map</span>
            </div>
            <div className="w-12 h-px bg-gray-700"></div>
            <div className={`flex items-center gap-2 ${step >= 3 ? 'text-blue-400' : 'text-gray-500'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center border ${step >= 3 ? 'border-blue-400 bg-blue-400/10' : 'border-gray-500'}`}>3</div>
              <span>Export & Build</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-[#252526] border border-[#333333] rounded-xl p-8 shadow-2xl">
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl text-white font-medium mb-4">Define Architecture</h2>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">Objective (What's the app for? Who wins?)</label>
                  <textarea name="objective" value={formData.objective} onChange={handleChange} className="w-full h-24 bg-[#1e1e1e] border border-[#333] rounded-md p-3 text-white focus:border-[#00BFFF] focus:ring-1 focus:ring-[#00BFFF] outline-none resize-none" placeholder="e.g. A SaaS for teachers to manage grades..." />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">Users & Roles (Student/Teacher/Admin)</label>
                  <textarea name="usersRoles" value={formData.usersRoles} onChange={handleChange} className="w-full h-24 bg-[#1e1e1e] border border-[#333] rounded-md p-3 text-white focus:border-[#00BFFF] focus:ring-1 focus:ring-[#00BFFF] outline-none resize-none" placeholder="e.g. Admin (full access), Teacher (edit grades), Student (read only)" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">Data & Models (Tables, relations)</label>
                  <textarea name="dataModels" value={formData.dataModels} onChange={handleChange} className="w-full h-24 bg-[#1e1e1e] border border-[#333] rounded-md p-3 text-white focus:border-[#00BFFF] focus:ring-1 focus:ring-[#00BFFF] outline-none resize-none" placeholder="e.g. Users, Classes, Grades. Users 1:N Grades." />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">Constraints (Budget, GDPR, offline)</label>
                  <textarea name="constraints" value={formData.constraints} onChange={handleChange} className="w-full h-24 bg-[#1e1e1e] border border-[#333] rounded-md p-3 text-white focus:border-[#00BFFF] focus:ring-1 focus:ring-[#00BFFF] outline-none resize-none" placeholder="e.g. Must be GDPR compliant, mobile-first." />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">Branding (Colors, fonts, tone)</label>
                  <textarea name="branding" value={formData.branding} onChange={handleChange} className="w-full h-24 bg-[#1e1e1e] border border-[#333] rounded-md p-3 text-white focus:border-[#00BFFF] focus:ring-1 focus:ring-[#00BFFF] outline-none resize-none" placeholder="e.g. Dark mode, blue accents, professional tone." />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">Pages & Navigation (Core screens)</label>
                  <textarea name="pagesNav" value={formData.pagesNav} onChange={handleChange} className="w-full h-24 bg-[#1e1e1e] border border-[#333] rounded-md p-3 text-white focus:border-[#00BFFF] focus:ring-1 focus:ring-[#00BFFF] outline-none resize-none" placeholder="e.g. /login, /dashboard, /settings. Sidebar nav." />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">Integrations (Stripe, Calendar)</label>
                  <textarea name="integrations" value={formData.integrations} onChange={handleChange} className="w-full h-24 bg-[#1e1e1e] border border-[#333] rounded-md p-3 text-white focus:border-[#00BFFF] focus:ring-1 focus:ring-[#00BFFF] outline-none resize-none" placeholder="e.g. Stripe for payments, Google Calendar." />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">Done State (Live URL, zero crashes)</label>
                  <textarea name="doneState" value={formData.doneState} onChange={handleChange} className="w-full h-24 bg-[#1e1e1e] border border-[#333] rounded-md p-3 text-white focus:border-[#00BFFF] focus:ring-1 focus:ring-[#00BFFF] outline-none resize-none" placeholder="e.g. Deployed to Vercel, 0 console errors." />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="h-full flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl text-white font-medium">Auto-Generated Mind Map</h2>
                <p className="text-sm text-gray-400">Drag nodes to rearrange. AI watches changes.</p>
              </div>
              <div className="flex-1 min-h-[500px]">
                <MindMap />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
              <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center text-green-400 mb-4">
                <CheckCircle size={40} />
              </div>
              <h2 className="text-3xl text-white font-medium">Architecture Complete</h2>
              <p className="text-gray-400 max-w-md">
                Your tech spec and mind map are ready. You can download the spec or proceed directly to the builder.
              </p>
              <div className="flex gap-4 mt-8">
                <button 
                  onClick={handleExport}
                  className="px-6 py-3 bg-[#333] hover:bg-[#444] text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <Download size={20} />
                  Download Tech Spec
                </button>
                <button 
                  onClick={handleOpenInBuilder}
                  className="px-6 py-3 bg-[#00BFFF] hover:bg-[#40d4ff] text-black rounded-lg font-medium hover:scale-105 transition-all flex items-center gap-2"
                >
                  <LayoutTemplate size={20} />
                  Open in Builder
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-8 flex justify-between items-center">
          <button 
            onClick={step === 1 ? () => navigate("/builder") : handlePrev}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors flex items-center gap-2"
          >
            <ArrowLeft size={18} />
            {step === 1 ? "Cancel" : "Back"}
          </button>
          
          {step < 3 && (
            <button 
              onClick={handleNext}
              className="px-6 py-2 bg-[#00BFFF] hover:bg-[#40d4ff] text-black rounded-md hover:scale-105 font-medium transition-colors flex items-center gap-2"
            >
              Next Step
              <ArrowRight size={18} />
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

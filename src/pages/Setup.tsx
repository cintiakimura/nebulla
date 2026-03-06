import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileCode, Layout, Settings, Wrench } from "lucide-react";
import SetupWizard from "../components/SetupWizard";

export default function Setup() {
  const navigate = useNavigate();
  const [chatMessages] = useState<{ id: string; role: "user" | "assistant"; content: string }[]>([]);

  const handleSetupComplete = () => {
    navigate("/builder");
  };

  return (
    <div className="flex h-screen bg-[#1e1e1e] text-gray-300 overflow-hidden font-sans">
      {/* Activity Bar */}
      <div className="w-12 bg-[#333333] flex flex-col items-center py-4 border-r border-[#252526] z-10">
        <button
          onClick={() => navigate("/builder")}
          className="p-2 text-gray-400 hover:text-white hover:bg-[#444] rounded-md mb-4"
          title="Explorer"
        >
          <FileCode size={24} strokeWidth={1.5} />
        </button>
        <button
          onClick={() => navigate("/dashboard")}
          className="p-2 text-gray-400 hover:text-white hover:bg-[#444] rounded-md mb-4"
          title="Deploy"
        >
          <Layout size={24} strokeWidth={1.5} />
        </button>
        <div className="mt-auto flex flex-col gap-4">
          <button
            className="p-2 text-white bg-[#444] rounded-md"
            title="Setup (connect tools)"
          >
            <Wrench size={24} strokeWidth={1.5} />
          </button>
          <button className="p-2 text-gray-400 hover:text-white hover:bg-[#444] rounded-md" title="Settings">
            <Settings size={24} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Sidebar (Explorer) - minimal when on setup */}
      <div className="w-64 bg-[#252526] border-r border-[#333333] flex flex-col">
        <div className="p-3 text-xs font-semibold tracking-wider text-gray-400 uppercase">
          Setup
        </div>
        <div className="flex-1 overflow-auto px-3 text-sm text-gray-500">
          Connect your tools once. Change them later from here or Dashboard → Project Settings.
        </div>
      </div>

      {/* Center: Setup wizard only, no terminal */}
      <div className="flex-1 flex flex-col min-w-0 w-full overflow-hidden">
        <SetupWizard onComplete={handleSetupComplete} isTweaks />
      </div>

      {/* Chat Panel - same width as Explorer */}
      <div className="w-64 bg-[#252526] border-l border-[#333333] flex flex-col flex-shrink-0">
        <div className="p-3 text-xs font-semibold tracking-wider text-gray-400 uppercase border-b border-[#333333]">
          Chat
        </div>
        <div className="flex-1 overflow-auto p-3 text-sm text-gray-500">
          {chatMessages.length === 0 ? (
            <p>Voice and chat here once you’re building.</p>
          ) : (
            chatMessages.map((msg) => (
              <div key={msg.id} className="mb-2">
                <div className="text-xs text-gray-500">{msg.role === "user" ? "You" : "Assistant"}</div>
                <div className="text-gray-300">{msg.content}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

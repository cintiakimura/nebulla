import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Settings, LogOut, FolderOpen, Trash2, Globe, Clock, Github, Cloud, X } from "lucide-react";

export default function Dashboard() {
  const navigate = useNavigate();
  const [showSettings, setShowSettings] = useState(false);
  const [projects, setProjects] = useState([
    { id: "1", name: "E-commerce Admin", status: "Deployed", url: "https://admin-demo.netlify.app", lastEdited: "2h ago" },
    { id: "2", name: "HR Portal", status: "Draft", url: null, lastEdited: "1d ago" },
  ]);

  const handleDelete = (id: string) => {
    setProjects(projects.filter(p => p.id !== id));
  };

  const handleMockOAuth = (provider: string) => {
    console.log(`[Mock] Redirecting to ${provider} OAuth...`);
    setTimeout(() => {
      console.log(`[Mock] Successfully connected to ${provider}`);
      setShowSettings(false);
    }, 1000);
  };

  return (
    <div className="flex h-screen bg-[#1e1e1e]">
      {/* Sidebar */}
      <div className="w-16 flex flex-col items-center py-4 bg-[#252526] border-r border-[#333333]">
        <div className="flex-1 flex flex-col gap-6">
          <button className="p-3 text-white bg-blue-600 rounded-xl hover:bg-blue-500 transition-colors" title="New Project" onClick={() => navigate("/onboarding")}>
            <Plus size={24} />
          </button>
          <button className="p-3 text-gray-400 hover:text-white transition-colors" title="Recent Projects">
            <Clock size={24} />
          </button>
        </div>
        <div className="flex flex-col gap-6">
          <button 
            className="p-3 text-gray-400 hover:text-white transition-colors" 
            title="Settings"
            onClick={() => setShowSettings(true)}
          >
            <Settings size={24} />
          </button>
          <button className="p-3 text-gray-400 hover:text-white transition-colors" title="Logout">
            <LogOut size={24} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-10 overflow-auto relative">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-end mb-10">
            <div>
              <h1 className="text-3xl font-semibold text-white mb-2">Projects</h1>
              <p className="text-gray-400">Manage your SaaS applications</p>
            </div>
            <button 
              onClick={() => navigate("/onboarding")}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md font-medium transition-colors flex items-center gap-2"
            >
              <Plus size={18} />
              New Project
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <div key={project.id} className="bg-[#252526] border border-[#333333] rounded-lg p-6 hover:border-[#444] transition-colors group">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-medium text-white">{project.name}</h3>
                  <span className={`text-xs px-2 py-1 rounded-full ${project.status === 'Deployed' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                    {project.status}
                  </span>
                </div>
                
                <div className="text-sm text-gray-500 mb-6 flex items-center gap-2">
                  <Clock size={14} />
                  Edited {project.lastEdited}
                </div>

                <div className="flex items-center justify-between mt-auto">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => navigate("/builder")}
                      className="p-2 bg-[#333333] hover:bg-[#444] text-white rounded-md transition-colors flex items-center gap-2 text-sm"
                    >
                      <FolderOpen size={16} />
                      Open
                    </button>
                    {project.url && (
                      <a 
                        href={project.url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="p-2 bg-[#333333] hover:bg-[#444] text-white rounded-md transition-colors flex items-center gap-2 text-sm"
                      >
                        <Globe size={16} />
                        Live
                      </a>
                    )}
                  </div>
                  <button 
                    onClick={() => handleDelete(project.id)}
                    className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Settings Modal (Mock OAuth) */}
        {showSettings && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-[#252526] border border-[#333333] rounded-xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-white">Integrations</h2>
                <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white">
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="p-4 bg-[#1e1e1e] border border-[#333] rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Github size={24} className="text-white" />
                    <div>
                      <div className="text-white font-medium">GitHub</div>
                      <div className="text-xs text-gray-500">For repository sync</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleMockOAuth('GitHub')}
                    className="px-3 py-1.5 bg-[#333] hover:bg-[#444] text-white text-sm rounded transition-colors"
                  >
                    Connect
                  </button>
                </div>

                <div className="p-4 bg-[#1e1e1e] border border-[#333] rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Cloud size={24} className="text-blue-400" />
                    <div>
                      <div className="text-white font-medium">Netlify</div>
                      <div className="text-xs text-gray-500">For auto-deployments</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleMockOAuth('Netlify')}
                    className="px-3 py-1.5 bg-[#333] hover:bg-[#444] text-white text-sm rounded transition-colors"
                  >
                    Connect
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

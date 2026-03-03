import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Play, Square, Terminal as TerminalIcon, Layout, 
  Mic, MicOff, Settings, FileCode, Github, Cloud,
  X, Maximize2, Minimize2
} from "lucide-react";
import Editor from "@monaco-editor/react";
import {
  SandpackProvider,
  SandpackPreview,
  useSandpack,
} from "@codesandbox/sandpack-react";
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';

// A component to sync Monaco with Sandpack
const MonacoSync = ({ code, setCode }: { code: string, setCode: (c: string) => void }) => {
  const { sandpack } = useSandpack();
  
  useEffect(() => {
    sandpack.updateFile("/App.tsx", code);
  }, [code]);

  return null;
};

export default function Builder() {
  const navigate = useNavigate();
  const [code, setCode] = useState(`export default function App() {
  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>Hello from kyn Builder</h1>
      <p>Start editing to see some magic happen!</p>
    </div>
  );
}`);
  
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [logs, setLogs] = useState<string[]>(["[kyn] Builder initialized.", "[kyn] Ready for VETR loop (Verify, Explain, Trace, Repair)."]);
  
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition
  } = useSpeechRecognition();

  const handleMicToggle = () => {
    if (listening) {
      SpeechRecognition.stopListening();
      if (transcript) {
        addLog(`[Voice Input]: ${transcript}`);
        addLog(`[Grok AI]: Analyzing request...`);
        // Mock AI response
        setTimeout(() => {
          addLog(`[Grok AI]: I've updated the code based on your request.`);
          setCode(`export default function App() {
  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif', background: '#1e1e1e', color: 'white', height: '100vh' }}>
      <h1>Updated by Voice Command</h1>
      <p>The AI processed: "${transcript}"</p>
    </div>
  );
}`);
          resetTranscript();
        }, 1500);
      }
    } else {
      resetTranscript();
      SpeechRecognition.startListening({ continuous: true });
      addLog(`[System]: Listening for voice commands...`);
    }
  };

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, msg]);
  };

  const handleDeploy = async (type: 'github' | 'netlify') => {
    addLog(`[Deploy]: Initiating ${type} deployment...`);
    try {
      const endpoint = type === 'github' ? '/api/deploy' : '/api/netlify/hook';
      const res = await fetch(endpoint, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        addLog(`[Deploy Success]: ${data.message}`);
      } else {
        addLog(`[Deploy Error]: ${data.error}`);
      }
    } catch (e) {
      addLog(`[Deploy Failed]: Network error.`);
    }
  };

  return (
    <div className="flex h-screen bg-[#1e1e1e] text-gray-300 overflow-hidden font-sans">
      
      {/* Activity Bar (VS Code style) */}
      <div className="w-12 bg-[#333333] flex flex-col items-center py-4 border-r border-[#252526] z-10">
        <button className="p-2 text-white hover:bg-[#444] rounded-md mb-4" title="Explorer">
          <FileCode size={24} strokeWidth={1.5} />
        </button>
        <button className="p-2 text-gray-400 hover:text-white hover:bg-[#444] rounded-md mb-4" title="Deploy" onClick={() => navigate("/dashboard")}>
          <Layout size={24} strokeWidth={1.5} />
        </button>
        <div className="mt-auto flex flex-col gap-4">
          <button className="p-2 text-gray-400 hover:text-white hover:bg-[#444] rounded-md" title="Settings">
            <Settings size={24} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Sidebar (Explorer) */}
      <div className="w-64 bg-[#252526] border-r border-[#333333] flex flex-col">
        <div className="p-3 text-xs font-semibold tracking-wider text-gray-400 uppercase">Explorer</div>
        <div className="flex-1 overflow-auto">
          <div className="px-3 py-1 text-sm bg-[#37373d] text-white cursor-pointer flex items-center gap-2">
            <FileCode size={14} className="text-blue-400" />
            App.tsx
          </div>
          <div className="px-3 py-1 text-sm text-gray-400 hover:bg-[#2a2d2e] cursor-pointer flex items-center gap-2">
            <FileCode size={14} className="text-yellow-400" />
            package.json
          </div>
        </div>
        
        {/* Deploy Actions */}
        <div className="p-4 border-t border-[#333333] space-y-3">
          <div className="text-xs font-semibold tracking-wider text-gray-400 uppercase mb-2">Deploy</div>
          <button 
            onClick={() => handleDeploy('github')}
            className="w-full py-2 px-3 bg-[#333] hover:bg-[#444] text-white text-sm rounded flex items-center justify-center gap-2 transition-colors"
          >
            <Github size={16} />
            Push to GitHub
          </button>
          <button 
            onClick={() => handleDeploy('netlify')}
            className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded flex items-center justify-center gap-2 transition-colors"
          >
            <Cloud size={16} />
            Auto-Deploy
          </button>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Tabs */}
        <div className="h-9 bg-[#252526] flex items-center border-b border-[#333333]">
          <div className="px-4 h-full bg-[#1e1e1e] border-t-2 border-blue-500 flex items-center gap-2 text-sm text-white min-w-[120px] border-r border-[#333333]">
            <FileCode size={14} className="text-blue-400" />
            App.tsx
            <button className="ml-auto hover:bg-[#333] rounded p-0.5"><X size={14} /></button>
          </div>
          
          <div className="ml-auto px-4 flex items-center gap-3">
            <button 
              onClick={handleMicToggle}
              className={`flex items-center gap-2 px-3 py-1 rounded text-sm transition-colors ${listening ? 'bg-red-500/20 text-red-400' : 'bg-[#333] text-gray-300 hover:bg-[#444]'}`}
            >
              {listening ? <MicOff size={14} /> : <Mic size={14} />}
              {listening ? 'Listening...' : 'Voice AI'}
            </button>
          </div>
        </div>

        {/* Editor & Preview Split */}
        <div className="flex-1 flex min-h-0">
          <SandpackProvider 
            template="react-ts" 
            theme="dark"
            files={{
              "/App.tsx": code,
            }}
            customSetup={{
              dependencies: {
                "lucide-react": "latest",
                "tailwindcss": "latest"
              }
            }}
          >
            <MonacoSync code={code} setCode={setCode} />
            
            {/* Monaco Editor */}
            <div className="flex-1 border-r border-[#333333] relative">
              <Editor
                height="100%"
                defaultLanguage="typescript"
                theme="vs-dark"
                value={code}
                onChange={(val) => setCode(val || "")}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  wordWrap: "on",
                  padding: { top: 16 },
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                }}
              />
            </div>

            {/* Sandpack Preview */}
            <div className="flex-1 bg-white relative">
              <div className="absolute top-0 left-0 right-0 h-8 bg-[#252526] border-b border-[#333333] flex items-center px-4 z-10">
                <span className="text-xs text-gray-400 font-medium">Live Preview</span>
              </div>
              <div className="pt-8 h-full">
                <SandpackPreview 
                  showOpenInCodeSandbox={false}
                  showRefreshButton={true}
                  style={{ height: '100%' }}
                />
              </div>
            </div>
          </SandpackProvider>
        </div>

        {/* Terminal Panel */}
        {terminalOpen && (
          <div className="h-48 bg-[#1e1e1e] border-t border-[#333333] flex flex-col">
            <div className="h-9 flex items-center px-4 border-b border-[#333333] justify-between">
              <div className="flex items-center gap-4">
                <button className="text-xs text-white border-b border-blue-500 pb-1 uppercase tracking-wider">Terminal</button>
                <button className="text-xs text-gray-500 hover:text-gray-300 pb-1 uppercase tracking-wider">Output</button>
                <button className="text-xs text-gray-500 hover:text-gray-300 pb-1 uppercase tracking-wider">Problems</button>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setTerminalOpen(false)} className="text-gray-400 hover:text-white p-1 rounded hover:bg-[#333]">
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="flex-1 p-4 font-mono text-sm overflow-auto text-gray-300">
              {logs.map((log, i) => (
                <div key={i} className={`mb-1 ${log.includes('Error') || log.includes('Failed') ? 'text-red-400' : log.includes('Success') ? 'text-green-400' : log.includes('AI') ? 'text-blue-400' : ''}`}>
                  <span className="text-gray-500 mr-2">$</span>
                  {log}
                </div>
              ))}
              {listening && transcript && (
                <div className="text-gray-500 italic mt-2">
                  <span className="mr-2">~</span>
                  {transcript}...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Status Bar */}
        <div className="h-6 bg-[#007acc] text-white text-xs flex items-center px-3 justify-between">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1"><Github size={12} /> main*</span>
            <span className="flex items-center gap-1"><X size={12} className="text-red-300" /> 0</span>
          </div>
          <div className="flex items-center gap-4">
            <span>Ln 1, Col 1</span>
            <span>Spaces: 2</span>
            <span>UTF-8</span>
            <span>TypeScript React</span>
            <button onClick={() => setTerminalOpen(!terminalOpen)} className="hover:bg-white/20 px-1 rounded">
              <TerminalIcon size={12} />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

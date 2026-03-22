import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage, Type } from '@google/genai';
import ReactMarkdown from 'react-markdown';

let nextPlayTime = 0;

function playPcmChunk(base64Data: string, audioCtx: AudioContext) {
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const int16Array = new Int16Array(bytes.buffer);
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / 32768.0;
  }
  const buffer = audioCtx.createBuffer(1, float32Array.length, 24000);
  buffer.getChannelData(0).set(float32Array);
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(audioCtx.destination);
  
  const currentTime = audioCtx.currentTime;
  if (nextPlayTime < currentTime) {
    nextPlayTime = currentTime + 0.05;
  }
  source.start(nextPlayTime);
  nextPlayTime += buffer.duration;
}

export function AssistantSidebar({ width = 320 }: { width?: number }) {
  const [isLive, setIsLive] = useState(false);
  const [isMicOpen, setIsMicOpen] = useState(false);
  const [messages, setMessages] = useState<{role: string, text: string}[]>([
    { role: 'model', text: 'System initialized. Ready to collaborate.' }
  ]);
  const [inputText, setInputText] = useState('');
  const [buildQueue, setBuildQueue] = useState<string[]>([]);
  
  const sessionRef = useRef<any>(null);
  const chatSessionRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const captureStreamRef = useRef<MediaStream | null>(null);
  const captureProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const captureAudioCtxRef = useRef<AudioContext | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isMicOpenRef = useRef(isMicOpen);

  useEffect(() => {
    isMicOpenRef.current = isMicOpen;
  }, [isMicOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startAudioCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        sampleRate: 16000, channelCount: 1, echoCancellation: true, autoGainControl: true, noiseSuppression: true
      } });
      const audioCtx = new AudioContext({ sampleRate: 16000 });
      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        if (!isMicOpenRef.current) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          let s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        const bytes = new Uint8Array(pcm16.buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        
        if (sessionRef.current) {
          sessionRef.current.sendRealtimeInput({ audio: { mimeType: 'audio/pcm;rate=16000', data: btoa(binary) } });
        }
      };
      
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 0;
      source.connect(processor);
      processor.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      captureStreamRef.current = stream;
      captureAudioCtxRef.current = audioCtx;
      captureProcessorRef.current = processor;
      setIsMicOpen(true);
    } catch (err) {
      console.error("Failed to start audio capture", err);
    }
  };

  const stopAudioCapture = () => {
    setIsMicOpen(false);
    if (captureProcessorRef.current) {
      captureProcessorRef.current.disconnect();
      captureProcessorRef.current = null;
    }
    if (captureStreamRef.current) {
      captureStreamRef.current.getTracks().forEach(t => t.stop());
      captureStreamRef.current = null;
    }
    if (captureAudioCtxRef.current) {
      captureAudioCtxRef.current.close();
      captureAudioCtxRef.current = null;
    }
  };

  const connectLive = async () => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        setMessages(prev => [...prev, { role: 'system', text: 'Error: GEMINI_API_KEY is not set. Please check your environment variables.' }]);
        return;
      }

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      audioCtxRef.current = new AudioContext({ sampleRate: 24000 });
      nextPlayTime = audioCtxRef.current.currentTime;

      const sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } } },
          systemInstruction: `You are Nebula, a supportive and expert AI dev partner. 
Your goal is to help the user build their application.
When the user requests a feature or change:
1. Repeat the request back to them to verify you understood correctly.
2. Ask if they want you to build it.
3. If they agree, say "Switching to build mode" and use the 'startBuilding' tool to queue the task.
Keep the conversation open and natural. Be concise and friendly.`,
          tools: [{
            functionDeclarations: [{
              name: 'startBuilding',
              description: 'Trigger this when the user confirms they want you to build the requested feature.',
              parameters: {
                type: Type.OBJECT,
                properties: { taskDescription: { type: Type.STRING, description: 'The detailed description of what to build.' } },
                required: ['taskDescription']
              }
            }]
          }],
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsLive(true);
            startAudioCapture();
            sessionPromise.then(session => {
              session.sendRealtimeInput({ text: "Hi, I just connected. Please greet me as my dev partner." });
            });
          },
          onmessage: (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && audioCtxRef.current) playPcmChunk(base64Audio, audioCtxRef.current);
            
            const parts = message.serverContent?.modelTurn?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.text) setMessages(prev => [...prev, { role: 'model', text: part.text }]);
              }
            }
            
            const toolCall = message.serverContent?.modelTurn?.parts[0]?.functionCall;
            if (toolCall && toolCall.name === 'startBuilding') {
              const task = (toolCall.args as any).taskDescription;
              setBuildQueue(prev => [...prev, task]);
              setMessages(prev => [...prev, { role: 'system', text: `Queued build task: ${task}` }]);
              
              sessionPromise.then(session => {
                session.sendToolResponse({
                  functionResponses: [{
                    name: 'startBuilding',
                    response: { status: 'success', message: 'Task queued successfully.' }
                  }]
                });
              });
            }
          },
          onclose: () => { setIsLive(false); stopAudioCapture(); },
          onerror: (err: any) => { 
            console.error("Live API Error:", err); 
            setIsLive(false); 
            stopAudioCapture(); 
            let errorMsg = 'Error connecting to Live API.';
            if (err?.status === 403) errorMsg = 'Error: API Key is invalid or missing required scopes.';
            setMessages(prev => [...prev, { role: 'system', text: errorMsg }]);
          }
        }
      });
      
      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      console.error("Failed to connect to Live API", err);
      let errorMsg = 'Failed to connect to Live API.';
      if (err?.status === 403) errorMsg = 'Error: API Key is invalid or missing required scopes.';
      setMessages(prev => [...prev, { role: 'system', text: errorMsg }]);
    }
  };

  const disconnectLive = () => {
    if (sessionRef.current) { sessionRef.current.close(); sessionRef.current = null; }
    setIsLive(false);
    stopAudioCapture();
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
  };

  const toggleLive = () => isLive ? disconnectLive() : connectLive();

  const handleSendText = async () => {
    if (!inputText.trim()) return;
    const textToSend = inputText;
    setMessages(prev => [...prev, { role: 'user', text: textToSend }]);
    setInputText('');

    if (isLive && sessionRef.current) {
      sessionRef.current.sendRealtimeInput({ text: textToSend });
    } else {
      try {
        if (!process.env.GEMINI_API_KEY) {
          setMessages(prev => [...prev, { role: 'system', text: 'Error: GEMINI_API_KEY is not set. Please check your environment variables.' }]);
          return;
        }

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        if (!chatSessionRef.current) {
          chatSessionRef.current = ai.chats.create({
            model: "gemini-3.1-pro-preview",
            config: {
              systemInstruction: "You are Nebula, an expert AI dev partner. Help the user build their application, write code, and design systems. Be concise and helpful."
            }
          });
        }
        
        setMessages(prev => [...prev, { role: 'model', text: '' }]);
        
        const responseStream = await chatSessionRef.current.sendMessageStream({ message: textToSend });
        let currentText = '';
        
        for await (const chunk of responseStream) {
          currentText += chunk.text;
          setMessages(prev => {
            const newMsgs = [...prev];
            newMsgs[newMsgs.length - 1] = { role: 'model', text: currentText };
            return newMsgs;
          });
        }
      } catch (error: any) {
        console.error("Gemini API Error:", error);
        let errorMsg = 'Error connecting to Gemini API.';
        if (error?.status === 403) {
          errorMsg = 'Error: API Key is invalid or missing required scopes.';
        } else if (error instanceof TypeError && error.message === 'Failed to fetch') {
          errorMsg = 'Error: Failed to fetch. This usually means your GEMINI_API_KEY is invalid, missing, or blocked by CORS due to an invalid key.';
        } else if (error?.message?.includes('Failed to fetch')) {
          errorMsg = 'Error: Failed to fetch. Please verify your GEMINI_API_KEY is correct and has the necessary permissions.';
        }
        setMessages(prev => [...prev, { role: 'system', text: errorMsg }]);
      }
    }
  };

  return (
    <aside className="flex flex-col border-l border-white/5 bg-[#040f1a]/40 backdrop-blur-md shrink-0" style={{ width }}>
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-13 font-headline text-slate-300 no-bold">Nebula Partner</span>
          {isLive && <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-pulse"></span>}
        </div>
      </div>
      
      {buildQueue.length > 0 && (
        <div className="px-4 py-2 bg-cyan-900/20 border-b border-cyan-500/20 flex flex-col gap-1">
          <span className="text-[10px] text-cyan-400 font-headline uppercase tracking-wider">Build Queue ({buildQueue.length})</span>
          <span className="text-xs text-slate-300 truncate">{buildQueue[buildQueue.length - 1]}</span>
        </div>
      )}

      <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`p-3 rounded-xl max-w-[90%] border ${
            msg.role === 'user' 
              ? 'bg-white/5 rounded-tr-none self-end border-white/5 text-slate-300' 
              : msg.role === 'system'
              ? 'bg-cyan-900/20 rounded-xl self-center border-cyan-500/20 text-cyan-300 text-xs text-center w-full'
              : 'bg-secondary-container/10 rounded-tl-none self-start border-secondary-dim/10 text-secondary'
          }`}>
            {msg.role === 'model' ? (
              <div className="text-13 no-bold prose prose-invert prose-sm max-w-none prose-pre:bg-black/40 prose-pre:border prose-pre:border-white/10 prose-pre:p-2 prose-pre:rounded-md">
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-13 no-bold whitespace-pre-wrap">{msg.text}</p>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-white/5 flex flex-col gap-3">
        <div className="relative flex flex-col gap-2">
          <textarea 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(); } }}
            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-13 no-bold focus:outline-none focus:border-cyan-500/50 resize-none h-20 placeholder:text-slate-600 transition-all" 
            placeholder={isLive ? "Listening or type here..." : "Start a call or type here..."}
          />
          <div className="absolute bottom-2 right-2 flex gap-2">
            <button onClick={handleSendText} className="w-7 h-7 flex items-center justify-center rounded-full bg-primary-container/20 text-primary hover:shadow-[0_0_15px_rgba(0,255,255,0.2)] transition-all">
              <span className="material-symbols-outlined text-18">send</span>
            </button>
          </div>
        </div>
        
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => { if(isLive) setIsMicOpen(true); }}
              className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${isMicOpen ? 'bg-cyan-500/20 text-cyan-400 shadow-[0_0_10px_rgba(0,255,255,0.2)]' : 'hover:bg-white/5 text-slate-500 hover:text-cyan-300'}`}
              title="Open Mic (Stays Open)"
            >
              <span className="material-symbols-outlined text-18">graphic_eq</span>
            </button>
            <button 
              onClick={() => setIsMicOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/5 text-slate-500 hover:text-red-400 transition-all"
              title="Close Mic"
            >
              <span className="material-symbols-outlined text-18">mic_off</span>
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/5 text-slate-500 hover:text-cyan-300 transition-all" title="Record Clip">
              <span className="material-symbols-outlined text-18">mic</span>
            </button>
          </div>
          <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/5 text-slate-500 hover:text-cyan-300 transition-all" title="Upload File">
            <span className="material-symbols-outlined text-18">attach_file</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

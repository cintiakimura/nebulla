import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { getApiBase } from "../lib/api";
import { getUserId } from "../lib/auth";
import { getBackendSecretHeaders } from "../lib/storedSecrets";

function userWantsStitchMockup(text: string): boolean {
  const t = text.toLowerCase();
  if (/\bcreate\s+mockup\b/.test(t)) return true;
  if (/\b(create|make|generate)\s+(a\s+)?(ui\s+)?mockup\b/.test(t)) return true;
  if (/\bgenerate\s+ui\b/.test(t)) return true;
  if (/\bmake\s+ui\b/.test(t)) return true;
  if (/\b(create|make|generate)\s+(the\s+)?(ui\s+)?(screen|design)\b/.test(t) && /\bui\b/.test(t)) return true;
  if (/\b(stitch|google\s*stitch)\b/.test(t) && /\b(mockup|ui|svg|screen|design|generate)\b/.test(t)) return true;
  return false;
}

type AssistantProps = {
  width?: number;
  onRequestStitchMockup?: () => void;
};

export function NebullaWorkspaceAssistant({ width = 320, onRequestStitchMockup }: AssistantProps) {
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([
    { role: "model", text: "System initialized. Ready to collaborate." },
  ]);
  const [inputText, setInputText] = useState("");
  const [pending, setPending] = useState(false);
  const [isRecordingText, setIsRecordingText] = useState(false);
  const recognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "webkitSpeechRecognition" in window) {
      const SR = (window as unknown as { webkitSpeechRecognition: new () => { continuous: boolean; interimResults: boolean; onresult: (e: unknown) => void; onend: () => void; onerror: () => void; start: () => void; stop: () => void } }).webkitSpeechRecognition;
      const r = new SR();
      r.continuous = false;
      r.interimResults = false;
      r.onresult = (event: unknown) => {
        const ev = event as { results: { 0: { 0: { transcript: string } } } };
        const transcript = ev.results[0][0].transcript;
        setInputText((prev) => (prev ? `${prev} ${transcript}` : transcript));
      };
      r.onend = () => setIsRecordingText(false);
      r.onerror = () => setIsRecordingText(false);
      recognitionRef.current = r;
    }
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const toggleVoiceAppend = () => {
    const r = recognitionRef.current;
    if (!r) return;
    if (isRecordingText) {
      r.stop();
      setIsRecordingText(false);
    } else {
      r.start();
      setIsRecordingText(true);
    }
  };

  const send = async () => {
    const text = inputText.trim();
    if (!text || pending) return;

    if (userWantsStitchMockup(text) && onRequestStitchMockup) {
      const apiBase = getApiBase() || "";
      setInputText("");
      setMessages((m) => [
        ...m,
        { role: "user", text },
        {
          role: "model",
          text:
            (apiBase ? "" : "Set **API URL** in Settings so the host can call Google Stitch. ") +
            "Opening **UI mockup (Stitch)** — **POST /api/stitch/mockup** with your Master Plan and Mind Map. Use **Create Mockup** / **Regenerate** (up to **3** variants), then **Lock this design** to save and apply the style app-wide.",
        },
      ]);
      onRequestStitchMockup();
      return;
    }

    const apiBase = getApiBase() || "";
    if (!apiBase) {
      setMessages((m) => [...m, { role: "user", text }, { role: "model", text: "Set API URL in Settings." }]);
      setInputText("");
      return;
    }
    setInputText("");
    setMessages((m) => [...m, { role: "user", text }]);
    setPending(true);
    try {
      const userId = await getUserId();
      const res = await fetch(`${apiBase}/api/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getBackendSecretHeaders() },
        body: JSON.stringify({
          messages: [{ role: "user", content: text }],
          userId,
          interactionMode: "talk",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: { content?: string }; error?: string };
      const reply =
        typeof data.message?.content === "string"
          ? data.message.content
          : data.error || `Error ${res.status}`;
      setMessages((m) => [...m, { role: "model", text: reply }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "model", text: e instanceof Error ? e.message : "Request failed" }]);
    } finally {
      setPending(false);
    }
  };

  const handleSendText = () => void send();

  return (
    <aside
      className="flex flex-col border-l border-white/5 bg-[#040f1a]/40 backdrop-blur-md shrink-0 h-full min-h-0"
      style={{ width }}
    >
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-13 font-headline text-slate-300 no-bold">Nebula Partner</span>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4 min-h-0">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`p-3 rounded-xl max-w-[90%] border ${
              msg.role === "user"
                ? "bg-white/5 rounded-tr-none self-end border-white/5 text-slate-300"
                : msg.role === "system"
                  ? "bg-cyan-900/20 rounded-xl self-center border-cyan-500/20 text-cyan-300 text-xs text-center w-full"
                  : "bg-secondary-container/10 rounded-tl-none self-start border-secondary-dim/10 text-secondary"
            }`}
          >
            {msg.role === "model" ? (
              <div className="text-13 no-bold prose prose-invert prose-sm max-w-none prose-pre:bg-black/40 prose-pre:border prose-pre:border-white/10 prose-pre:p-2 prose-pre:rounded-md">
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-13 no-bold whitespace-pre-wrap">{msg.text}</p>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="p-4 border-t border-white/5 flex flex-col gap-3 shrink-0">
        <div className="relative flex flex-col gap-2">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendText();
              }
            }}
            disabled={pending}
            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-13 no-bold focus:outline-none focus:border-cyan-500/50 resize-none h-20 placeholder:text-slate-600 transition-all disabled:opacity-50"
            placeholder="Start a call or type here..."
          />
          <div className="absolute bottom-2 right-2 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={handleSendText}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-primary-container/20 text-primary hover:shadow-[0_0_15px_rgba(0,255,255,0.2)] transition-all disabled:opacity-50"
              title="Send"
            >
              <span className="material-symbols-outlined text-18">send</span>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleVoiceAppend}
              className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${
                isRecordingText
                  ? "bg-red-500/20 text-red-400 shadow-[0_0_10px_rgba(255,0,0,0.2)]"
                  : "hover:bg-white/5 text-slate-500 hover:text-cyan-300"
              }`}
              title={isRecordingText ? "Stop Recording" : "Dictate Text"}
            >
              <span className="material-symbols-outlined text-18">mic</span>
            </button>
            <button
              type="button"
              className="w-8 h-8 flex items-center justify-center rounded-full transition-all hover:bg-white/5 text-slate-500 hover:text-cyan-300"
              title="Voice session"
            >
              <span className="material-symbols-outlined text-18">headset_mic</span>
            </button>
            <button
              type="button"
              className="w-8 h-8 flex items-center justify-center rounded-full transition-all hover:bg-white/5 text-slate-500 hover:text-cyan-300"
              title="Mute"
            >
              <span className="material-symbols-outlined text-18">mic_off</span>
            </button>
          </div>
          <button
            type="button"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/5 text-slate-500 hover:text-cyan-300 transition-all"
            title="Upload File"
          >
            <span className="material-symbols-outlined text-18">attach_file</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

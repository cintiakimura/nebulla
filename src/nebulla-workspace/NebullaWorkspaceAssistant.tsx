import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { getApiBase } from "../lib/api";
import { getUserId } from "../lib/auth";
import { getBackendSecretHeaders } from "../lib/storedSecrets";

export function NebullaWorkspaceAssistant({ width = 320 }: { width?: number }) {
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

  return (
    <aside
      className="flex flex-col border-l border-white/5 bg-[#040f1a]/40 backdrop-blur-md shrink-0 h-full min-h-0"
      style={{ width }}
    >
      <div className="h-12 px-4 flex items-center justify-between border-b border-white/5 bg-white/5 shrink-0">
        <div className="flex items-center gap-2 text-cyan-300">
          <span className="material-symbols-outlined nebulla-ws-text-18">smart_toy</span>
          <span className="font-display text-xs tracking-widest uppercase">Nebulla Partner</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}
          >
            <div
              className={`max-w-[95%] rounded-lg px-3 py-2 text-sm nebulla-ws-no-bold ${
                msg.role === "user"
                  ? "bg-cyan-500/15 text-cyan-100 border border-cyan-500/20"
                  : "bg-white/5 text-slate-300 border border-white/10"
              }`}
            >
              {msg.role === "model" ? (
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
              ) : (
                msg.text
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="p-3 border-t border-white/5 shrink-0 space-y-2">
        <div className="flex gap-1.5 flex-wrap">
          <button
            type="button"
            title="Microphone (browser STT)"
            onClick={toggleVoiceAppend}
            className={`p-2 rounded-md border transition-colors ${
              isRecordingText
                ? "bg-red-500/20 border-red-500/40 text-red-300"
                : "bg-white/5 border-white/10 text-slate-400 hover:text-cyan-300"
            }`}
          >
            <span className="material-symbols-outlined nebulla-ws-text-18">mic</span>
          </button>
          <button
            type="button"
            title="Voice session"
            className="p-2 rounded-md border bg-white/5 border-white/10 text-slate-400 hover:text-cyan-300 transition-colors"
          >
            <span className="material-symbols-outlined nebulla-ws-text-18">headset_mic</span>
          </button>
          <button
            type="button"
            title="Mute"
            className="p-2 rounded-md border bg-white/5 border-white/10 text-slate-400 hover:text-cyan-300 transition-colors"
          >
            <span className="material-symbols-outlined nebulla-ws-text-18">mic_off</span>
          </button>
          <button
            type="button"
            title="Attach"
            className="p-2 rounded-md border bg-white/5 border-white/10 text-slate-400 hover:text-cyan-300 transition-colors"
          >
            <span className="material-symbols-outlined nebulla-ws-text-18">attach_file</span>
          </button>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void send()}
            placeholder="Start a call or type here…"
            disabled={pending}
            className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-cyan-500/40"
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => void send()}
            className="px-3 py-2 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 disabled:opacity-50 font-display text-sm shrink-0"
            title="Send"
          >
            <span className="material-symbols-outlined nebulla-ws-text-18">send</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

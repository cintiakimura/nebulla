import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getApiBase } from "../lib/api";
import { getUserId } from "../lib/auth";
import { getSessionToken } from "../lib/supabaseAuth";

const TABS = [
  "Objective",
  "Users & Roles",
  "Data & Models",
  "Constraints & Edges",
  "Branding System",
  "Pages & Navigation",
  "Integrations/APIs",
  "Done State",
] as const;
type TabId = (typeof TABS)[number];

const OPENING_LINE =
  "Ready to brainstorm your app? We'll front-load architecture in 7–8 steps so Grok can generate clean Next.js + Supabase code, Sandpack preview, and one-click Vercel deploy. This locks rules for all future code—no guesswork.";

const QUESTIONS: { tab: TabId; text: string }[] = [
  { tab: "Objective", text: "What's the app purpose and core flows? (e.g. login → dashboard → main action.)" },
  { tab: "Users & Roles", text: "Who are the actors? What dashboards and permissions do they need? (We'll auto-generate RLS.)" },
  { tab: "Data & Models", text: "What tables and relations? Any sensitive data (PII, payments)?" },
  { tab: "Constraints & Edges", text: "Limits: offline support, GDPR, budget, max users, copyright, or other constraints?" },
  { tab: "Branding System", text: "Branding: colors, fonts, vibe. (Later: upload assets → auto-Tailwind config.)" },
  { tab: "Pages & Navigation", text: "Core screens and nav style? Mobile-first or desktop-first?" },
  { tab: "Integrations/APIs", text: "Integrations: Stripe, Google Calendar, etc.? (We'll stub env vars.)" },
  { tab: "Done State", text: "Success criteria: live URL, test users, zero crashes—anything else?" },
];

const MASTER_PLAN_PROJECT_NAME = "Master Plan";
const MASTER_PLAN_INSTRUCTION =
  "You are in master-plan mode for a SaaS prototype builder. Input is a structured wizard (7–8 steps). Output will be full Next.js + Supabase code, Sandpack preview, and Vercel deploy. After the user answers each step, summarize in 1–3 sentences and end with: So, [summary]. Lock this? If they say yes, reply briefly confirming. If they say no, skip, or I don't know, reply: No problem—I'll auto-generate when coding. If they say Generate, fill in missing bits from prior answers. When all steps are locked, say: Everything locked. Ready to build?";

export default function MasterPlanBrainstorming() {
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [specs, setSpecs] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<TabId>("Objective");
  const [content, setContent] = useState("");
  const [messages, setMessages] = useState<{ id: string; role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [awaitingLock, setAwaitingLock] = useState(false);
  const [pendingSummary, setPendingSummary] = useState("");
  const [showGrokKeyModal, setShowGrokKeyModal] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Get or create project and load specs + chat
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const userId = await getUserId();
      const apiBase = getApiBase();
      const token = await getSessionToken();
      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      try {
        setLoadError(null);
        const listRes = await fetch(`${apiBase || ""}/api/users/${userId}/projects`, { headers });
        if (!listRes.ok) {
          setLoadError(`Could not load projects (HTTP ${listRes.status}). Check Backend URL in Settings.`);
          return;
        }
        const list = (await listRes.json().catch(() => [])) as { id: string; name: string }[];
        let pid = list.find((p) => p.name === MASTER_PLAN_PROJECT_NAME)?.id;
        if (!pid) {
          const createHeaders: Record<string, string> = { "Content-Type": "application/json" };
          if (token) createHeaders["Authorization"] = `Bearer ${token}`;
          const createRes = await fetch(`${apiBase || ""}/api/users/${userId}/projects`, {
            method: "POST",
            headers: createHeaders,
            body: JSON.stringify({ name: MASTER_PLAN_PROJECT_NAME }),
          });
          if (createRes.status === 201) {
            const data = (await createRes.json()) as { id: string };
            pid = data.id;
          } else {
            const err = (await createRes.json().catch(() => ({}))) as { error?: string };
            setLoadError(err.error ?? `Could not create project (HTTP ${createRes.status}).`);
            return;
          }
        }
        if (cancelled || !pid) return;
        setProjectId(pid);
        const getRes = await fetch(`${apiBase || ""}/api/users/${userId}/projects/${pid}`, { headers });
        if (!getRes.ok) {
          setLoadError(`Could not load project (HTTP ${getRes.status}).`);
          return;
        }
        const project = (await getRes.json()) as { specs?: string; chat_messages?: string | unknown[] };
        const rawSpecs = project.specs;
        if (typeof rawSpecs === "string") {
          try {
            setSpecs(JSON.parse(rawSpecs || "{}"));
          } catch (_) {
            setSpecs({});
          }
        }
        const rawChat = project.chat_messages;
        const parsedChat = typeof rawChat === "string" ? (() => { try { return JSON.parse(rawChat || "[]"); } catch { return []; } })() : rawChat;
        if (Array.isArray(parsedChat) && parsedChat.length > 0) {
          setMessages(
            parsedChat.map((m: { role?: string; content?: string }) => ({
              id: crypto.randomUUID(),
              role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
              content: typeof m.content === "string" ? m.content : "",
            }))
          );
        } else {
          setMessages([
            { id: crypto.randomUUID(), role: "assistant", content: OPENING_LINE },
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: QUESTIONS[0]?.text ?? "What's your app idea? Who are the main users? What are the goals? How many roles? Any constraints?",
            },
          ]);
        }
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Failed to load. Check Backend URL in Settings.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setContent(specs[activeTab] ?? "");
  }, [activeTab, specs]);

  const saveSpecsToProject = (nextSpecs: Record<string, string>) => {
    if (!projectId) return;
    (async () => {
      const userId = await getUserId();
      const apiBase = getApiBase();
      const token = await getSessionToken();
      if (!apiBase) return;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      fetch(`${apiBase}/api/users/${userId}/projects/${projectId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ specs: nextSpecs }),
      });
    })();
  };
  const saveProject = async (nextSpecs: Record<string, string>, nextMessages: typeof messages) => {
    if (!projectId) return;
    const userId = await getUserId();
    const apiBase = getApiBase();
    const token = await getSessionToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    await fetch(`${apiBase || ""}/api/users/${userId}/projects/${projectId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        specs: nextSpecs,
        chat_messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
  };

  const sendToGrok = async (userContent: string) => {
    const apiBase = getApiBase();
    const nextMessages: typeof messages = [...messages, { id: crypto.randomUUID(), role: "user", content: userContent }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    try {
      const apiMessages = [
        { role: "user" as const, content: MASTER_PLAN_INSTRUCTION },
        ...nextMessages.map((m) => ({ role: m.role, content: m.content })),
      ];
      const res = await fetch(`${apiBase || ""}/api/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 503) setShowGrokKeyModal(true);
      const reply = res.ok && data?.message?.content ? data.message.content : res.status === 503 ? "Grok isn’t available right now." : "Sorry, I couldn’t reply.";
      const withReply = [...nextMessages, { id: crypto.randomUUID(), role: "assistant" as const, content: reply }];
      setMessages(withReply);
      setAwaitingLock(reply.toLowerCase().includes("lock this?"));
      setPendingSummary(reply);
      await saveProject(specs, withReply);
    } finally {
      setLoading(false);
    }
  };

  const handleLock = (action: "yes" | "no" | "skip" | "generate") => {
    const tab = QUESTIONS[stepIndex]?.tab ?? "Objective";
    if (action === "yes" && pendingSummary) {
      const summary = pendingSummary.replace(/\s*So,?\s*/i, "").replace(/\s*Lock this\?.*/i, "").trim();
      const nextSpecs = { ...specs };
      nextSpecs[tab] = (nextSpecs[tab] || "") + (nextSpecs[tab] ? "\n\n" : "") + summary;
      setSpecs(nextSpecs);
      setAwaitingLock(false);
      setPendingSummary("");
      setStepIndex((i) => Math.min(i + 1, QUESTIONS.length));
      saveSpecsToProject(nextSpecs);
      const nextMessages = [
        ...messages,
        { id: crypto.randomUUID(), role: "user" as const, content: "yes" },
        { id: crypto.randomUUID(), role: "assistant" as const, content: "Locked." },
      ];
      if (stepIndex + 1 < QUESTIONS.length) {
        nextMessages.push({
          id: crypto.randomUUID(),
          role: "assistant",
          content: QUESTIONS[stepIndex + 1]?.text ?? "",
        });
      } else {
        nextMessages.push({ id: crypto.randomUUID(), role: "assistant", content: "Everything locked. Ready to build?" });
      }
      setMessages(nextMessages);
      saveProject(nextSpecs, nextMessages);
      return;
    }
    if (action === "no" || action === "skip") {
      sendToGrok(action === "no" ? "no" : "skip");
      return;
    }
    if (action === "generate") {
      sendToGrok("Generate");
    }
  };

  const handleSend = () => {
    const t = input.trim().toLowerCase();
    if (awaitingLock && (t === "yes" || t === "no" || t === "skip" || t === "i don't know")) {
      if (t === "yes") handleLock("yes");
      else if (t === "no") handleLock("no");
      else handleLock("skip");
      return;
    }
    if (t === "generate") {
      handleLock("generate");
      return;
    }
    if (!t) return;
    sendToGrok(input.trim());
  };

  const visibleTabs = TABS.filter((tab) => (specs[tab] ?? "").trim() !== "");

  if (loadError) {
    return (
      <div style={{ padding: 24, background: "#1E1E1E", color: "#D4D4D4", fontFamily: "Segoe UI, system-ui, sans-serif" }}>
        <p style={{ color: "#f59e0b" }}>{loadError}</p>
        <p style={{ marginTop: 8, fontSize: 14 }}>Check Settings → Backend URL and try again.</p>
      </div>
    );
  }
  if (!projectId) {
    return (
      <div style={{ padding: 24, background: "#1E1E1E", color: "#D4D4D4", fontFamily: "Segoe UI, system-ui, sans-serif" }}>
        Loading…
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "#1E1E1E",
        color: "#D4D4D4",
        fontFamily: "Segoe UI, system-ui, sans-serif",
      }}
    >
      <aside
        style={{
          width: "6%",
          minWidth: 48,
          maxWidth: 80,
          background: "#252526",
          borderRight: "1px solid #333",
          overflow: "auto",
          padding: 8,
        }}
      >
        {(visibleTabs.length > 0 ? visibleTabs : TABS).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "8px 12px",
              marginBottom: 4,
              cursor: "pointer",
              background: activeTab === tab ? "#2A2D2E" : "transparent",
              color: "#D4D4D4",
              border: "none",
            }}
          >
            {tab}
          </button>
        ))}
      </aside>
      <main
        style={{
          flex: "1 1 55%",
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          background: "#1E1E1E",
        }}
      >
        <textarea
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setSpecs((s) => ({ ...s, [activeTab]: e.target.value }));
          }}
          onBlur={() => {
            const next = { ...specs, [activeTab]: content };
            setSpecs(next);
            saveSpecsToProject(next);
          }}
          placeholder={`Content for ${activeTab}`}
          style={{
            flex: 1,
            padding: 12,
            resize: "none",
            background: "#252526",
            color: "#D4D4D4",
            border: "none",
            fontFamily: "Consolas, Menlo, Monaco, monospace",
            fontSize: 13,
          }}
        />
      </main>
      <aside
        style={{
          width: "35%",
          minWidth: 320,
          background: "#252526",
          borderLeft: "1px solid #333",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ flex: 1, overflow: "auto", padding: 12, color: "#D4D4D4" }}>
          {messages.map((m) => (
            <div key={m.id} style={{ marginBottom: 12 }}>
              <strong style={{ color: m.role === "user" ? "#D4D4D4" : "#007ACC" }}>
                {m.role === "user" ? "You" : "Grok"}:
              </strong>
              <div style={{ whiteSpace: "pre-wrap", marginTop: 4, color: "#D4D4D4" }}>{m.content}</div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        {awaitingLock && (
          <div style={{ padding: 8, borderTop: "1px solid #333", background: "#252526" }}>
            <button type="button" onClick={() => handleLock("yes")} style={{ marginRight: 8, padding: "6px 12px", background: "#007ACC", color: "#fff", border: "none", cursor: "pointer" }}>
              Lock
            </button>
            <button type="button" onClick={() => handleLock("no")} style={{ marginRight: 8, padding: "6px 12px", background: "#2A2D2E", color: "#D4D4D4", border: "none", cursor: "pointer" }}>
              Edit
            </button>
            <button type="button" onClick={() => handleLock("skip")} style={{ marginRight: 8, padding: "6px 12px", background: "#2A2D2E", color: "#D4D4D4", border: "none", cursor: "pointer" }}>
              Skip
            </button>
            <button type="button" onClick={() => handleLock("generate")} style={{ padding: "6px 12px", background: "#2A2D2E", color: "#D4D4D4", border: "none", cursor: "pointer" }}>
              Generate
            </button>
          </div>
        )}
        <div style={{ padding: 8, borderTop: "1px solid #333", background: "#252526" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Reply or yes / no / skip / Generate"
            style={{
              width: "100%",
              padding: 8,
              marginBottom: 8,
              background: "#1E1E1E",
              color: "#D4D4D4",
              border: "1px solid #333",
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={loading}
            style={{ padding: "8px 16px", background: "#007ACC", color: "#fff", border: "none", cursor: loading ? "not-allowed" : "pointer" }}
          >
            {loading ? "…" : "Send"}
          </button>
        </div>
      </aside>

      {showGrokKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80" onClick={() => setShowGrokKeyModal(false)}>
          <div className="bg-[#252536] border border-[#3d3d4d] rounded-lg p-4 w-80 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-[#d4d4d4] mb-3">Add your Grok API key in Settings to use chat.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowGrokKeyModal(false)} className="px-3 py-2 rounded border border-[#3d3d4d] text-[#d4d4d4] text-sm">Close</button>
              <button type="button" onClick={() => { setShowGrokKeyModal(false); navigate("/settings"); }} className="px-3 py-2 rounded bg-[#007ACC] text-white text-sm">Open Settings</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

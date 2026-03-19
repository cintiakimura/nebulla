import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Map, X, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { getApiBase } from "../lib/api";
import { getUserId } from "../lib/auth";
import { getSessionToken } from "../lib/supabaseAuth";
import { getBackendSecretHeaders } from "../lib/storedSecrets";
import MindMapFromPlan, { type MindMapData } from "../components/MindMapFromPlan";

const TABS = [
  "Objective (Goal + Scope)",
  "Users & Roles (Actor + Access)",
  "Data & Models (Database Shape)",
  "Constraints & Edges",
  "Branding System (Full Upload)",
  "Pages & Navigation",
  "Competition Analysis (optional)",
  "Pricing (Suggest how to price – optional)",
] as const;
type TabId = (typeof TABS)[number];

const OPENING_LINE =
  "Ready to brainstorm your app? We'll front-load architecture in 7–8 steps so Grok can generate clean Next.js + Supabase code, Sandpack preview, and one-click Vercel deploy. This locks rules for all future code—no guesswork.";

const QUESTIONS: { tab: TabId; text: string }[] = [
  { tab: "Objective (Goal + Scope)", text: "What's the app really for? Who wins? E.g., 'Students check grades, book tutors—nothing else.' Include must-have flows: login → dashboard → action." },
  { tab: "Users & Roles (Actor + Access)", text: "List every person: Student, Teacher, Admin... For each: What dashboard? What pages can they see/edit? (e.g., Student: own grades only, no approvals.)" },
  { tab: "Data & Models (Database Shape)", text: "What things exist? Tables: Users, Courses, Grades... Relations? (one-to-many?) Sensitive stuff? (PII? Payments?)" },
  { tab: "Constraints & Edges", text: "Any killers? Offline mode? GDPR? Budget under $50/mo? Max users? Copyrighted content?" },
  { tab: "Branding System (Full Upload)", text: "Let's define the look & feel. Preferred layout style (minimal, dashboard-heavy, playful…)? Main colors, fonts, tone of voice, logo variants, image style?\nYou can upload files now (logo, brand kit, inspirations — up to 100MB total) or I can generate solid branding suggestions later based on the objective, vibe, and industry once we finish brainstorming.\nNo problem — I can generate a solid branding system later using the app objective, vibe, and industry once we finish brainstorming." },
  { tab: "Pages & Navigation", text: "Core screens: Login, Dashboard X, Reports... Public/private? Nav bar or sidebar? Mobile-first?" },
  { tab: "Competition Analysis (optional)", text: "Would you like me to do a quick competition analysis? I can look up similar apps: number of users, estimated revenue/year, pricing models, etc." },
  { tab: "Pricing (Suggest how to price – optional)", text: "Do you want pricing suggestions? I can recommend tiers based on industry standards — tell me: what similar solutions charge, what features go in each tier, target customer budget… Then I'll propose what feels accurate. Agree?" },
];

const MASTER_PLAN_PROJECT_NAME = "Master Plan";
const MASTER_PLAN_INSTRUCTION =
  "You are in master-plan mode for a SaaS prototype builder. Input is a structured wizard (7–8 steps). After the user answers each step, summarize in 1–3 sentences and end with: So, [summary]. Lock this? If they say yes, reply briefly confirming. If they say no, skip, or I don't know, reply: No problem—I'll auto-generate when coding. If they say Generate, fill in missing bits from prior answers. When all steps are locked (or after optional steps are skipped), summarize everything in a single clean locked-spec markdown and end with: Does this capture your vision? Any final changes before we lock it?";

export default function MasterPlanBrainstorming() {
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [specs, setSpecs] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<TabId>("Objective (Goal + Scope)");
  const [content, setContent] = useState("");
  const [messages, setMessages] = useState<{ id: string; role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [awaitingLock, setAwaitingLock] = useState(false);
  const [pendingSummary, setPendingSummary] = useState("");
  const [showGrokKeyModal, setShowGrokKeyModal] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mindMapOpen, setMindMapOpen] = useState(false);
  const [mindMapData, setMindMapData] = useState<MindMapData | null>(null);
  const [mindMapLoading, setMindMapLoading] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const MIND_MAP_PROMPT = `Based on our planning conversation and the summarized document sections (objective, users, data, constraints, branding, pages, competition, pricing), output a mind map as a single JSON object with this exact shape (no other text):
{"nodes":[{"id":"1","label":"App Idea","type":"central"},{"id":"2","label":"Objective","type":"branch"},{"id":"3","label":"Users","type":"branch"}],"edges":[{"source":"1","target":"2"},{"source":"1","target":"3"}]}
Use one central node "App Idea" and branch nodes for each planning theme we covered. Label branches with short titles. Output only the JSON.`;

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

  const sendToGrok = async (
    userContent: string,
    baseMessagesOverride?: typeof messages,
    specsOverride?: Record<string, string>
  ) => {
    const apiBase = getApiBase();
    const base = baseMessagesOverride ?? messages;
    const nextMessages: typeof messages = [...base, { id: crypto.randomUUID(), role: "user", content: userContent }];
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
        body: JSON.stringify({ messages: apiMessages, projectId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 503) setShowGrokKeyModal(true);
      const reply = res.ok && data?.message?.content ? data.message.content : res.status === 503 ? "Grok isn’t available right now." : "Sorry, I couldn’t reply.";
      const withReply = [...nextMessages, { id: crypto.randomUUID(), role: "assistant" as const, content: reply }];
      setMessages(withReply);
      const replyLower = reply.toLowerCase();
      const shouldAwaitLock =
        replyLower.includes("lock this?") ||
        replyLower.includes("does this capture your vision") ||
        replyLower.includes("before we lock it");
      setAwaitingLock(shouldAwaitLock);
      setPendingSummary(reply);
      await saveProject(specsOverride ?? specs, withReply);
    } finally {
      setLoading(false);
    }
  };

  const handleLock = (action: "yes" | "no" | "skip" | "generate") => {
    const tab = QUESTIONS[stepIndex]?.tab ?? "Objective (Goal + Scope)";
    if (action === "yes" && pendingSummary) {
      const pendingLower = pendingSummary.toLowerCase();
      const isFinalVisionLock =
        pendingLower.includes("does this capture your vision") || pendingLower.includes("before we lock it");

      // Stage 2: user confirms final "lock the whole spec".
      if (isFinalVisionLock) {
        const lockedMd = pendingSummary
          .replace(/\s*does this capture your vision[\s\S]*/i, "")
          .replace(/\s*before we lock it[\s\S]*/i, "")
          .trim();

        (async () => {
          const userId = await getUserId();
          const apiBase = getApiBase();
          const token = await getSessionToken();
          if (!apiBase || !projectId) return;
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          if (token) headers["Authorization"] = `Bearer ${token}`;

          const nextSpecs = {
            ...specs,
            __locked_summary_md: lockedMd || pendingSummary,
            __brainstorm_complete: true,
          } as unknown as Record<string, string>;

          const nextMessages = [
            ...messages,
            { id: crypto.randomUUID(), role: "user" as const, content: "yes" },
            { id: crypto.randomUUID(), role: "assistant" as const, content: "Locked. Ready to build." },
          ];

          await fetch(`${apiBase}/api/users/${userId}/projects/${projectId}`, {
            method: "PUT",
            headers,
            body: JSON.stringify({
              locked_summary_md: lockedMd || pendingSummary,
              brainstorm_complete: true,
              specs: nextSpecs,
              chat_messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
            }),
          });

          setMessages(nextMessages);
          setAwaitingLock(false);
          setPendingSummary("");
        })();

        return;
      }

      // Stage 1: lock the answer for the current step.
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

      // If we just locked the last step, ask Grok for the final spec confirmation.
      if (stepIndex + 1 >= QUESTIONS.length) {
        sendToGrok(
          "All steps are now locked. Summarize everything in clean locked-spec markdown and end with: Does this capture your vision? Any final changes before we lock it?",
          nextMessages,
          nextSpecs
        );
        return;
      }

      nextMessages.push({
        id: crypto.randomUUID(),
        role: "assistant",
        content: QUESTIONS[stepIndex + 1]?.text ?? "",
      });

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
  const hasAnyDocContent = TABS.some((tab) => (specs[tab] ?? "").trim() !== "");

  const handleShowMindMap = async () => {
    const api = getApiBase();
    if (!api) {
      setMindMapData(null);
      setMindMapOpen(true);
      return;
    }
    setMindMapLoading(true);
    setMindMapOpen(true);
    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const context = hasAnyDocContent
        ? `\nDocument summaries per section:\n${TABS.map((t) => `${t}: ${(specs[t] ?? "").trim().slice(0, 200)}`).join("\n")}`
        : "";
      const res = await fetch(`${api}/api/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getBackendSecretHeaders() },
        body: JSON.stringify({
          messages: [...history, { role: "user" as const, content: MIND_MAP_PROMPT + context }],
          userId: await getUserId(),
          projectId,
        }),
      });
      if (res.status === 503) setShowGrokKeyModal(true);
      const data = (await res.json().catch(() => ({}))) as { message?: { content?: string } };
      const content = data.message?.content ?? "";
      const jsonMatch = content.match(/\{[\s\S]*"nodes"[\s\S]*"edges"[\s\S]*\}/) || content.match(/\{[\s\S]*\}/);
      const raw = jsonMatch ? jsonMatch[0] : content;
      let parsed: MindMapData | null = null;
      try {
        parsed = JSON.parse(raw) as MindMapData;
        if (!parsed?.nodes || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) parsed = null;
      } catch (_) {}
      setMindMapData(parsed);
    } catch (_) {
      setMindMapData(null);
    } finally {
      setMindMapLoading(false);
    }
  };

  if (loadError) {
    return (
      <div style={{ padding: 24, background: "#06061F", color: "#ffffff", fontFamily: "Segoe UI, system-ui, sans-serif" }}>
        <p style={{ color: "#f59e0b" }}>{loadError}</p>
        <p style={{ marginTop: 8, fontSize: 14 }}>Check Settings → Backend URL and try again.</p>
      </div>
    );
  }
  if (!projectId) {
    return (
      <div style={{ padding: 24, background: "#06061F", color: "#ffffff", fontFamily: "Segoe UI, system-ui, sans-serif" }}>
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
        background: "#06061F",
        color: "#ffffff",
        fontFamily: "Segoe UI, system-ui, sans-serif",
      }}
    >
      {/* Left: question tabs (one per subject) — toggleable */}
      {sectionsOpen ? (
        <aside
          style={{
            width: 180,
            flexShrink: 0,
            background: "#06061F",
            borderRight: "1px solid #2d3f4f",
            overflow: "auto",
            padding: "12px 0",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#6F748A", textTransform: "uppercase", letterSpacing: "0.05em" }}>Sections</span>
            <button
              type="button"
              onClick={() => setSectionsOpen(false)}
              style={{ padding: 4, background: "transparent", border: "none", color: "#6F748A", cursor: "pointer", borderRadius: 4 }}
              title="Hide sections"
            >
              <PanelLeftClose size={14} />
            </button>
          </div>
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                display: "flex",
                alignItems: "center",
                width: "100%",
                textAlign: "left",
                padding: "10px 16px",
                cursor: "pointer",
                background: activeTab === tab ? "#094771" : "transparent",
                borderLeft: activeTab === tab ? "3px solid #007acc" : "3px solid transparent",
                color: activeTab === tab ? "#fff" : "#d4d4d4",
                borderTop: "none",
                borderBottom: "none",
                borderRight: "none",
                fontSize: 13,
              }}
            >
              {tab}
              {(specs[tab] ?? "").trim() !== "" && (
                <span style={{ marginLeft: 6, color: "#4ec9b0", fontSize: 10 }}>●</span>
              )}
            </button>
          ))}
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => setSectionsOpen(true)}
          style={{
            width: 28,
            flexShrink: 0,
            background: "#06061F",
            borderRight: "1px solid #2d3f4f",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#6F748A",
            cursor: "pointer",
            border: "none",
          }}
          title="Show sections"
        >
          <PanelLeftOpen size={16} />
        </button>
      )}
      {/* Center: Google Docs–style document (one tab = one section) */}
      <main
        style={{
          flex: "1 1 55%",
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          background: "#06061F",
        }}
      >
        {/* Toolbar */}
        <div
          style={{
            flexShrink: 0,
            height: 48,
            padding: "0 16px",
            background: "#06061F",
            borderBottom: "1px solid #2d3f4f",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <FileText size={18} style={{ color: "#007acc" }} />
            <span style={{ fontSize: 14, color: "#ffffff", fontWeight: 500 }}>Brainstorming doc</span>
            <button
              type="button"
              onClick={() => setSectionsOpen((o) => !o)}
              style={{
                padding: "4px 8px",
                background: sectionsOpen ? "#2d3f4f" : "transparent",
                border: "1px solid #2d3f4f",
                borderRadius: 4,
                color: "#6F748A",
                cursor: "pointer",
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
              title={sectionsOpen ? "Hide sections" : "Show sections"}
            >
              {sectionsOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
              Sections
            </button>
            <button
              type="button"
              onClick={() => setChatOpen((o) => !o)}
              style={{
                padding: "4px 8px",
                background: chatOpen ? "#2d3f4f" : "transparent",
                border: "1px solid #2d3f4f",
                borderRadius: 4,
                color: "#6F748A",
                cursor: "pointer",
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
              title={chatOpen ? "Hide chat" : "Show chat"}
            >
              {chatOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
              Chat
            </button>
          </div>
          <button
            type="button"
            onClick={handleShowMindMap}
            disabled={mindMapLoading || messages.length === 0}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              background: messages.length > 0 ? "#007acc" : "#2d3f4f",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              fontSize: 13,
              cursor: messages.length > 0 && !mindMapLoading ? "pointer" : "not-allowed",
              opacity: mindMapLoading ? 0.7 : 1,
            }}
          >
            <Map size={16} />
            {mindMapLoading ? "Generating…" : "Open mind map"}
          </button>
          {projectId && activeTab === "Branding System (Full Upload)" ? (
            <button
              type="button"
              onClick={() => navigate(`/project/${projectId}/locked-summary`)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                background: "#2d3f4f",
                color: "#fff",
                border: "1px solid #2d3f4f",
                borderRadius: 4,
                fontSize: 13,
                cursor: "pointer",
              }}
              title="Upload branding assets (logos, brand kit, inspiration files)"
            >
              <FileText size={16} />
              Upload Branding
            </button>
          ) : null}
        </div>
        {/* Document body */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "24px 48px 48px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 720,
              minHeight: 400,
              background: "#06061F",
              borderRadius: 4,
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              padding: "32px 40px",
            }}
          >
            <h1
              style={{
                fontSize: 22,
                fontWeight: 400,
                color: "#e8e8e8",
                marginBottom: 24,
                fontFamily: "Georgia, 'Times New Roman', serif",
                borderBottom: "1px solid #2d3f4f",
                paddingBottom: 12,
              }}
            >
              {activeTab}
            </h1>
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
              placeholder={
                (specs[activeTab] ?? "").trim() === ""
                  ? `Answer here. When Grok summarises and you lock this section, the summary will appear here for future reference during code.`
                  : "Add or edit notes…"
              }
              style={{
                width: "100%",
                minHeight: 280,
                padding: 0,
                resize: "none",
                background: "transparent",
                color: "#e8e8e8",
                border: "none",
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontSize: 15,
                lineHeight: 1.6,
                outline: "none",
              }}
            />
          </div>
        </div>
      </main>
      {/* Right: Chat — toggleable */}
      {chatOpen ? (
        <aside
          style={{
            width: "35%",
            minWidth: 320,
            flexShrink: 0,
            background: "#06061F",
            borderLeft: "1px solid #2d3f4f",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ flexShrink: 0, padding: "8px 12px", borderBottom: "1px solid #2d3f4f", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#6F748A", textTransform: "uppercase", letterSpacing: "0.05em" }}>Chat</span>
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              style={{ padding: 4, background: "transparent", border: "none", color: "#6F748A", cursor: "pointer", borderRadius: 4 }}
              title="Hide chat"
            >
              <PanelRightClose size={14} />
            </button>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: 12, color: "#ffffff" }}>
            {messages.map((m) => (
              <div key={m.id} style={{ marginBottom: 12 }}>
                <strong style={{ color: m.role === "user" ? "#ffffff" : "#007ACC" }}>
                  {m.role === "user" ? "You" : "Grok"}:
                </strong>
                <div style={{ whiteSpace: "pre-wrap", marginTop: 4, color: "#ffffff" }}>{m.content}</div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          {awaitingLock && (
            <div style={{ padding: 8, borderTop: "1px solid #2d3f4f", background: "#06061F" }}>
              <button type="button" onClick={() => handleLock("yes")} style={{ marginRight: 8, padding: "6px 12px", background: "#007ACC", color: "#fff", border: "none", cursor: "pointer", borderRadius: 4 }}>
                Lock
              </button>
              <button type="button" onClick={() => handleLock("no")} style={{ marginRight: 8, padding: "6px 12px", background: "#2d3f4f", color: "#ffffff", border: "none", cursor: "pointer", borderRadius: 4 }}>
                Edit
              </button>
              <button type="button" onClick={() => handleLock("skip")} style={{ marginRight: 8, padding: "6px 12px", background: "#2d3f4f", color: "#ffffff", border: "none", cursor: "pointer", borderRadius: 4 }}>
                Skip
              </button>
              <button type="button" onClick={() => handleLock("generate")} style={{ padding: "6px 12px", background: "#2d3f4f", color: "#ffffff", border: "none", cursor: "pointer", borderRadius: 4 }}>
                Generate
              </button>
            </div>
          )}
          <div style={{ padding: 8, borderTop: "1px solid #2d3f4f", background: "#06061F" }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder="Reply or yes / no / skip / Generate"
              style={{
                width: "100%",
                padding: 8,
                marginBottom: 8,
                background: "#06061F",
                color: "#ffffff",
                border: "1px solid #2d3f4f",
                borderRadius: 4,
              }}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={loading}
              style={{ padding: "8px 16px", background: "#007ACC", color: "#fff", border: "none", cursor: loading ? "not-allowed" : "pointer", borderRadius: 4 }}
            >
              {loading ? "…" : "Send"}
            </button>
          </div>
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          style={{
            width: 28,
            flexShrink: 0,
            background: "#06061F",
            borderLeft: "1px solid #2d3f4f",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#6F748A",
            cursor: "pointer",
            border: "none",
          }}
          title="Show chat"
        >
          <PanelRightOpen size={16} />
        </button>
      )}

      {/* Mind map modal */}
      {mindMapOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.85)",
            padding: 24,
          }}
          onClick={() => setMindMapOpen(false)}
        >
          <div
            style={{
              width: "90vw",
              maxWidth: 900,
              height: "80vh",
              background: "#06061F",
              borderRadius: 8,
              border: "1px solid #2d3f4f",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                flexShrink: 0,
                padding: "12px 16px",
                borderBottom: "1px solid #2d3f4f",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#06061F",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 500, color: "#ffffff" }}>Interactive mind map</span>
              <button
                type="button"
                onClick={() => setMindMapOpen(false)}
                style={{
                  padding: 6,
                  background: "transparent",
                  border: "none",
                  color: "#6F748A",
                  cursor: "pointer",
                  borderRadius: 4,
                }}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {mindMapLoading ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#6F748A" }}>
                  Generating mind map…
                </div>
              ) : (
                <MindMapFromPlan data={mindMapData} className="w-full h-full" />
              )}
            </div>
          </div>
        </div>
      )}

      {showGrokKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80" onClick={() => setShowGrokKeyModal(false)}>
          <div className="bg-sidebar-bg border border-border rounded-lg p-4 w-80 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-muted mb-3">Add your Grok API key in Settings to use chat.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowGrokKeyModal(false)} className="px-3 py-2 rounded border border-border text-muted text-sm">Close</button>
              <button type="button" onClick={() => { setShowGrokKeyModal(false); navigate("/settings"); }} className="px-3 py-2 rounded bg-[#007ACC] text-white text-sm">Open Settings</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

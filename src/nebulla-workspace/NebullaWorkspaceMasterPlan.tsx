import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getApiBase } from "../lib/api";
import { getUserId } from "../lib/auth";
import { getBackendSecretHeaders } from "../lib/storedSecrets";

export const NEBULLA_PLAN_SECTION_ORDER = [
  "objective",
  "roles",
  "data",
  "constraints",
  "branding",
  "pages",
  "competition",
  "pricing",
  "kpis",
] as const;

export type NebullaPlanSectionId = (typeof NEBULLA_PLAN_SECTION_ORDER)[number];

export type NebullaMasterPlanSlice = {
  v: 1;
  sections: Partial<Record<NebullaPlanSectionId, { locked: boolean; summary: string }>>;
};

export function defaultNebullaMasterPlanSlice(): NebullaMasterPlanSlice {
  return { v: 1, sections: {} };
}

const STATIC_SECTIONS: { id: NebullaPlanSectionId; title: string; content: string }[] = [
  {
    id: "objective",
    title: "Objective & Goal & Scope",
    content: `OBJECTIVE & GOAL & SCOPE

Construct Nebulla: a voice-friendly builder that starts from architecture (mind map + master plan), not raw code.

GOAL:
Rapid UI prototyping with Grok, Google Stitch for UI generation, Supabase for auth/data, Vercel for deploy.

SCOPE:
- Grok chat + optional multi-agent pipeline
- Stitch to React preview in Builder
- Supabase multi-tenant projects + optional SQLite fallback
- Vercel REST manager (deploy, domains, blob) from host env`,
  },
  {
    id: "roles",
    title: "User Roles",
    content: `USER ROLES

- Owner: full project + secrets on host / Settings.
- Collaborator: read/write projects when RBAC is enabled (future).
- Open mode: demo user on trusted origins (localhost / configured host).`,
  },
  {
    id: "data",
    title: "Data & Models",
    content: `DATA & MODELS

- User (Supabase Auth)
- Project (code, specs, plan, chat, branding assets)
- Env secrets: host-only (XAI, Stitch, Supabase service, Vercel token)`,
  },
  {
    id: "constraints",
    title: "Constraints & Edges",
    content: `CONSTRAINTS

- LLM and Stitch rate limits; free-tier Grok daily cap unless Pro.
- Preview iframe / CORS: set ALLOWED_ORIGIN on API.
- STRICT_SERVER_API_KEYS: optional — force keys from server only.`,
  },
  {
    id: "branding",
    title: "Branding System",
    content: `BRANDING

Celestial Fluidity: midnight surfaces, cyan primary, glass panels, Space Grotesk + Manrope.`,
  },
  {
    id: "pages",
    title: "Pages & Navigation",
    content: "",
  },
  {
    id: "competition",
    title: "Competition Analysis",
    content: `COMPETITION ANALYSIS

COMPETITORS: Cursor, Copilot, v0.

DIFFERENTIATORS: architecture-first flow, Stitch-backed UI generation, Grok VETR loop in Builder.`,
  },
  {
    id: "pricing",
    title: "Pricing",
    content: `PRICING STRATEGY

(Draft / TBD)

- Free Tier: limited projects and Grok usage.
- Pro Tier: unlimited projects, export, integrations.`,
  },
  {
    id: "kpis",
    title: "KPIs",
    content: `KEY PERFORMANCE INDICATORS (KPIs)

- Time from idea to first preview
- Voice intent accuracy
- Deploy success on Vercel`,
  },
];

const VOICE_PROMPTS: Record<NebullaPlanSectionId, string> = {
  objective: "State the product objective, goal, and scope in your own words.",
  roles: "Who are the user roles and what can each one do?",
  data: "What data entities and relationships matter for this product?",
  constraints: "What technical or product constraints should we never violate?",
  branding: "Describe the visual and voice branding you want.",
  pages: "Review the Pages & Navigation list. Say lock in when it matches your intent.",
  competition: "Who competes with this product and how are you different?",
  pricing: "Outline pricing tiers or constraints.",
  kpis: "Which KPIs will you measure first?",
};

type WkRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (e: Event) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
};

function parseRepeatSummary(raw: string): { repeat: string; summary: string } {
  const m = raw.match(/REPEAT:\s*([^\n]+)\s*\n+SUMMARY:\s*([\s\S]+)/i);
  if (m) return { repeat: m[1].trim(), summary: m[2].trim() };
  const lines = raw.trim().split("\n").filter(Boolean);
  return { repeat: lines[0] ?? raw.trim(), summary: lines.slice(1).join("\n").trim() || raw.trim() };
}

export function NebullaWorkspaceMasterPlan({
  onClose,
  pagesText,
  planSlice,
  onPlanSliceChange,
}: {
  onClose: () => void;
  pagesText: string;
  planSlice: NebullaMasterPlanSlice;
  onPlanSliceChange: (next: NebullaMasterPlanSlice) => void;
}) {
  const PLAN_SECTIONS = useMemo(() => {
    return STATIC_SECTIONS.map((s) =>
      s.id === "pages" ? { ...s, content: pagesText || "(No pages yet — add nodes on the Mind Map.)" } : s
    );
  }, [pagesText]);

  const [activeTab, setActiveTab] = useState<NebullaPlanSectionId>(NEBULLA_PLAN_SECTION_ORDER[0]);
  const [voicePhase, setVoicePhase] = useState<"idle" | "answer" | "repeat" | "lock">("idle");
  const [lastTranscript, setLastTranscript] = useState("");
  const [repeatLine, setRepeatLine] = useState("");
  const [draftSummary, setDraftSummary] = useState("");
  const [voiceErr, setVoiceErr] = useState<string | null>(null);
  const [holding, setHolding] = useState(false);
  const transcriptBuf = useRef("");
  const recRef = useRef<WkRec | null>(null);
  const voiceBusy = useRef(false);
  const draftSummaryRef = useRef("");
  const voicePhaseRef = useRef(voicePhase);
  const planSliceRef = useRef(planSlice);
  const pagesTextRef = useRef(pagesText);
  const onPlanSliceChangeRef = useRef(onPlanSliceChange);
  voicePhaseRef.current = voicePhase;
  planSliceRef.current = planSlice;
  pagesTextRef.current = pagesText;
  onPlanSliceChangeRef.current = onPlanSliceChange;

  const firstUnlockedId = useMemo((): NebullaPlanSectionId | null => {
    for (const id of NEBULLA_PLAN_SECTION_ORDER) {
      if (!planSlice.sections[id]?.locked) return id;
    }
    return null;
  }, [planSlice.sections]);

  const voiceTargetId = firstUnlockedId;

  const handleSpeechEndRef = useRef<(text: string) => void>(() => {});

  useEffect(() => {
    if (typeof window === "undefined" || !("webkitSpeechRecognition" in window)) return;
    const Ctor = (window as unknown as { webkitSpeechRecognition: new () => WkRec }).webkitSpeechRecognition;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    r.onresult = (ev: Event) => {
      const e = ev as unknown as {
        resultIndex: number;
        results: { length: number; item: (i: number) => { 0: { transcript: string } } };
      };
      let t = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        t += e.results.item(i)[0].transcript;
      }
      transcriptBuf.current = (transcriptBuf.current + " " + t).trim();
    };
    r.onend = () => {
      setHolding(false);
      const text = transcriptBuf.current.trim();
      transcriptBuf.current = "";
      void handleSpeechEndRef.current(text);
    };
    r.onerror = () => {
      setHolding(false);
      setVoiceErr("Speech recognition error");
      voiceBusy.current = false;
    };
    recRef.current = r;
  }, []);

  const runGrokRepeatSummary = useCallback(async (sectionId: NebullaPlanSectionId, spoken: string) => {
    const api = getApiBase() || "";
      if (!api) {
      setRepeatLine(`You said: ${spoken}`);
      draftSummaryRef.current = spoken;
      setDraftSummary(spoken);
      setVoicePhase("repeat");
      voiceBusy.current = false;
      return;
    }
    const userId = await getUserId();
    const headers = { "Content-Type": "application/json", ...getBackendSecretHeaders() } as Record<string, string>;
    const title = STATIC_SECTIONS.find((s) => s.id === sectionId)?.title ?? sectionId;
    const res = await fetch(`${api}/api/agent/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content:
              `Master plan section: "${title}". User said:\n"""${spoken}"""\n\n` +
              `Reply with exactly two lines and nothing else:\n` +
              `REPEAT: one short sentence paraphrasing them (start with "You want to").\n` +
              `SUMMARY: plain text only, no markdown, no bold — a tight paragraph to store as the locked section text.`,
          },
        ],
        userId,
        interactionMode: "talk",
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: { content?: string }; error?: string };
    const raw = typeof data.message?.content === "string" ? data.message.content : data.error || spoken;
    const { repeat, summary } = parseRepeatSummary(raw);
    setRepeatLine(repeat);
    setDraftSummary(summary || spoken);
    setVoicePhase("repeat");
    voiceBusy.current = false;
  }, []);

  const handleSpeechEnd = useCallback(
    async (text: string) => {
      if (!text || voiceBusy.current) return;
      const phase = voicePhaseRef.current;
      const slice = planSliceRef.current;
      const ptext = pagesTextRef.current;
      const firstOpen = NEBULLA_PLAN_SECTION_ORDER.find((id) => !slice.sections[id]?.locked) ?? null;
      if (!firstOpen) return;
      const tid = firstOpen;
      setLastTranscript(text);
      setVoiceErr(null);

      if (phase === "idle" || phase === "answer") {
        if (tid === "pages") {
          setRepeatLine("Pages & Navigation is taken from the mind map (sorted left to right).");
          draftSummaryRef.current = ptext;
          setDraftSummary(ptext);
          setVoicePhase("repeat");
          return;
        }
        voiceBusy.current = true;
        setVoicePhase("answer");
        await runGrokRepeatSummary(tid, text);
        return;
      }

      if (phase === "repeat") {
        if (/lock\s*in/i.test(text)) {
          const summaryVal = tid === "pages" ? ptext : draftSummary || text;
          const next: NebullaMasterPlanSlice = {
            ...slice,
            v: 1,
            sections: {
              ...slice.sections,
              [tid]: { locked: true, summary: summaryVal },
            },
          };
          onPlanSliceChangeRef.current(next);
          setVoicePhase("idle");
          setRepeatLine("");
          setDraftSummary("");
          setLastTranscript("");
        } else {
          setVoiceErr('Say "lock in" clearly to save this section and move on.');
        }
      }
    },
    [runGrokRepeatSummary]
  );

  handleSpeechEndRef.current = handleSpeechEnd;

  const startHold = () => {
    const r = recRef.current;
    if (!r) {
      setVoiceErr("Speech recognition not supported in this browser.");
      return;
    }
    setVoiceErr(null);
    transcriptBuf.current = "";
    setHolding(true);
    try {
      r.start();
    } catch {
      setHolding(false);
      setVoiceErr("Could not start microphone.");
    }
  };

  const endHold = () => {
    const r = recRef.current;
    if (!r) return;
    try {
      r.stop();
    } catch {
      setHolding(false);
    }
  };

  const activeSection = PLAN_SECTIONS.find((s) => s.id === activeTab);
  const displayBody =
    activeTab === "pages"
      ? pagesText || "(No pages yet — add nodes on the Mind Map.)"
      : planSlice.sections[activeTab]?.locked && planSlice.sections[activeTab]?.summary
        ? planSlice.sections[activeTab]!.summary
        : activeSection?.content ?? "";

  return (
    <div className="flex flex-col h-full glass-panel rounded-md border border-white/5 overflow-hidden shadow-2xl">
      <div className="h-12 px-4 flex items-center justify-between border-b border-white/5 bg-white/5 shrink-0">
        <div className="flex items-center gap-3 text-cyan-300">
          <span className="material-symbols-outlined text-18">menu_book</span>
          <span className="font-headline text-sm tracking-wide">Master Plan</span>
          <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/20 flex items-center gap-1">
            <span className="material-symbols-outlined" style={{ fontSize: "12px" }}>
              lock
            </span>
            SOURCE OF TRUTH
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-px h-4 bg-white/10" />
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-slate-400 hover:text-red-400 transition-colors"
          >
            <span className="material-symbols-outlined text-18">close</span>
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden flex-col md:flex-row">
        <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-white/5 bg-black/20 p-3 flex flex-col gap-1 overflow-y-auto shrink-0 max-h-[40vh] md:max-h-none">
          {PLAN_SECTIONS.map((section) => {
            const locked = planSlice.sections[section.id]?.locked === true;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveTab(section.id)}
                className={`text-left px-3 py-2.5 rounded-md text-13 transition-all font-headline tracking-wide border ${
                  activeTab === section.id
                    ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/20 shadow-[inset_2px_0_0_0_rgba(0,255,255,0.5)]"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200 border-transparent"
                }`}
              >
                <span className="no-bold">
                  {locked ? "✓ " : ""}
                  {section.title}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 flex flex-col min-h-0 bg-[#020810]">
          <div className="flex-1 p-6 md:p-8 overflow-y-auto min-h-0">
            <div className="max-w-3xl mx-auto bg-white/[0.02] border border-white/5 rounded-xl p-8 min-h-full shadow-lg">
              <pre className="font-mono text-13 text-slate-300 leading-relaxed whitespace-pre-wrap outline-none font-normal no-bold">
                {displayBody}
              </pre>
            </div>
          </div>

          <div className="border-t border-white/5 bg-black/30 p-4 shrink-0 space-y-3">
            <div className="text-[11px] text-slate-500 font-mono uppercase tracking-wide">Voice (sequential)</div>
            {!voiceTargetId ? (
              <p className="text-13 text-emerald-400/90">All sections are locked. Plan is complete.</p>
            ) : (
              <>
                <p className="text-13 text-slate-400">
                  Next section:{" "}
                  <span className="text-cyan-300">{STATIC_SECTIONS.find((s) => s.id === voiceTargetId)?.title}</span>
                  {voicePhase === "idle" || voicePhase === "answer" ? (
                    <> — {VOICE_PROMPTS[voiceTargetId]}</>
                  ) : (
                    <> — Confirm, then say &quot;lock in&quot; to save.</>
                  )}
                </p>
                {voicePhase === "repeat" && repeatLine ? (
                  <div className="rounded-md border border-cyan-500/20 bg-cyan-500/5 p-3 space-y-2 text-13 text-slate-300">
                    <div>
                      <span className="text-slate-500">Repeat back: </span>
                      {repeatLine}
                    </div>
                    {draftSummary && voiceTargetId !== "pages" ? (
                      <pre className="font-mono text-xs text-slate-400 whitespace-pre-wrap font-normal">{draftSummary}</pre>
                    ) : null}
                  </div>
                ) : null}
                {lastTranscript && voicePhase !== "repeat" ? (
                  <p className="text-12 text-slate-500 font-mono">Heard: {lastTranscript}</p>
                ) : null}
                {voiceErr ? <p className="text-12 text-amber-400">{voiceErr}</p> : null}
                <button
                  type="button"
                  className={`w-full md:w-auto px-6 py-3 rounded-lg border-2 font-headline text-13 transition-colors ${
                    holding
                      ? "bg-emerald-500/20 border-emerald-400 text-emerald-200"
                      : "bg-cyan-500/10 border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/20"
                  }`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    startHold();
                  }}
                  onPointerUp={(e) => {
                    e.preventDefault();
                    endHold();
                  }}
                  onPointerLeave={() => holding && endHold()}
                >
                  {holding ? "Listening… (release to send)" : "Hold to speak"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from "react";

const MASTER_PLAN_STORAGE_KEY = "nebulla_workspace_master_plan_v1";

type MasterPlanStored = {
  v: 1;
  pagesText: string;
  expandedId: string | null;
  savedAt: string;
};

const STATIC_SECTIONS = [
  {
    id: "objective",
    title: "1. Objective & Goal & Scope",
    content: `OBJECTIVE & GOAL & SCOPE

Construct Nebulla: a voice-friendly builder that starts from architecture (mind map + master plan), not raw code.

GOAL:
Rapid UI prototyping with Grok, Google Stitch for UI generation, Supabase for auth/data, Vercel for deploy.

SCOPE:
- Grok chat + optional multi-agent pipeline
- Stitch → React preview in Builder
- Supabase multi-tenant projects + optional SQLite fallback
- Vercel REST manager (deploy, domains, blob) from host env`,
  },
  {
    id: "roles",
    title: "2. User Roles",
    content: `USER ROLES

- Owner: full project + secrets on host / Settings.
- Collaborator: read/write projects when RBAC is enabled (future).
- Open mode: demo user on trusted origins (localhost / configured host).`,
  },
  {
    id: "data",
    title: "3. Data & Models",
    content: `DATA & MODELS

- User (Supabase Auth)
- Project (code, specs, plan, chat, branding assets)
- Env secrets: host-only (XAI, Stitch, Supabase service, Vercel token)`,
  },
  {
    id: "constraints",
    title: "4. Constraints & Edges",
    content: `CONSTRAINTS

- LLM and Stitch rate limits; free-tier Grok daily cap unless Pro.
- Preview iframe / CORS: set ALLOWED_ORIGIN on API.
- STRICT_SERVER_API_KEYS: optional — force keys from server only.`,
  },
  {
    id: "branding",
    title: "5. Branding System",
    content: `BRANDING

Celestial Fluidity: midnight surfaces, cyan primary, glass panels, Space Grotesk + Manrope.`,
  },
  {
    id: "competition",
    title: "7. Competition Analysis",
    content: `COMPETITORS: Cursor, Copilot, v0.

DIFFERENTIATORS: architecture-first flow, Stitch-backed UI generation, Grok VETR loop in Builder.`,
  },
  {
    id: "pricing",
    title: "8. Pricing",
    content: `Free tier limits on projects/Grok; Pro for unlimited (see product config).`,
  },
  {
    id: "kpis",
    title: "9. KPIs",
    content: `KPIs (draft)

- Time from idea → first preview
- Stitch regen → lock rate
- Deploy success on Vercel`,
  },
];

export function NebullaWorkspaceMasterPlan({
  onClose,
  pagesText,
}: {
  onClose: () => void;
  pagesText: string;
}) {
  const PLAN_SECTIONS = useMemo(
    () => [
      ...STATIC_SECTIONS.slice(0, 5),
      { id: "pages", title: "6. Pages & Navigation", content: pagesText },
      ...STATIC_SECTIONS.slice(5),
    ],
    [pagesText]
  );

  const sectionIds = useMemo(() => new Set(PLAN_SECTIONS.map((s) => s.id)), [PLAN_SECTIONS]);

  const [expandedId, setExpandedId] = useState<string | null>(PLAN_SECTIONS[0]?.id ?? null);
  const [isSaved, setIsSaved] = useState(false);
  const lastSavedPagesTextRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(MASTER_PLAN_STORAGE_KEY);
      if (!raw) {
        lastSavedPagesTextRef.current = null;
        setIsSaved(false);
        return;
      }
      const p = JSON.parse(raw) as Partial<MasterPlanStored>;
      if (p.v !== 1 || typeof p.pagesText !== "string") {
        lastSavedPagesTextRef.current = null;
        setIsSaved(false);
        return;
      }
      lastSavedPagesTextRef.current = p.pagesText;
      setIsSaved(p.pagesText === pagesText);
      if (p.expandedId === null || (typeof p.expandedId === "string" && sectionIds.has(p.expandedId))) {
        setExpandedId(p.expandedId);
      }
    } catch {
      lastSavedPagesTextRef.current = null;
      setIsSaved(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once from localStorage; pagesText sync below
  }, []);

  useEffect(() => {
    const last = lastSavedPagesTextRef.current;
    if (last === null) {
      setIsSaved(false);
      return;
    }
    setIsSaved(pagesText === last);
  }, [pagesText]);

  const handleSave = () => {
    const payload: MasterPlanStored = {
      v: 1,
      pagesText,
      expandedId,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(MASTER_PLAN_STORAGE_KEY, JSON.stringify(payload));
      lastSavedPagesTextRef.current = pagesText;
      setIsSaved(true);
    } catch {
      setIsSaved(false);
    }
  };

  const toggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const activeContent = PLAN_SECTIONS.find((s) => s.id === expandedId)?.content ?? "";

  return (
    <div className="flex flex-col h-full nebulla-ws-glass-panel rounded-md border border-white/5 overflow-hidden shadow-2xl">
      <div className="h-12 px-4 flex items-center justify-between border-b border-white/5 bg-white/5 shrink-0">
        <div className="flex items-center gap-3 text-cyan-300">
          <span className="material-symbols-outlined nebulla-ws-text-18">menu_book</span>
          <span className="font-display text-sm tracking-wide">Master Plan</span>
          <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/20 flex items-center gap-1">
            <span className="material-symbols-outlined" style={{ fontSize: "12px" }}>
              lock
            </span>
            SOURCE OF TRUTH
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaved}
            className="flex items-center gap-1 px-4 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-200 rounded text-xs transition-colors border border-cyan-500/20 font-display disabled:opacity-50 disabled:pointer-events-none"
          >
            <span className="material-symbols-outlined nebulla-ws-text-14">save</span>
            {isSaved ? "Saved" : "Save"}
          </button>
          <div className="w-px h-4 bg-white/10" />
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-slate-400 hover:text-red-400 transition-colors"
          >
            <span className="material-symbols-outlined nebulla-ws-text-18">close</span>
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden flex-col md:flex-row">
        <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-white/5 bg-black/20 p-3 flex flex-col gap-1 overflow-y-auto shrink-0 max-h-[40vh] md:max-h-none">
          {PLAN_SECTIONS.map((section) => {
            const open = expandedId === section.id;
            return (
              <div key={section.id} className="rounded-md border border-white/5 overflow-hidden bg-black/10">
                <button
                  type="button"
                  onClick={() => toggle(section.id)}
                  className={`w-full text-left px-3 py-2.5 nebulla-ws-text-13 transition-all font-display tracking-wide flex items-center justify-between gap-2 ${
                    open
                      ? "bg-cyan-500/10 text-cyan-300 border-b border-cyan-500/20"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                  }`}
                >
                  <span className="flex-1 min-w-0">{section.title}</span>
                  <span className={`material-symbols-outlined nebulla-ws-text-14 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}>
                    expand_more
                  </span>
                </button>
                {open ? (
                  <div className="md:hidden px-3 py-2 border-t border-white/5 max-h-48 overflow-y-auto">
                    <pre className="font-mono nebulla-ws-text-13 text-slate-400 whitespace-pre-wrap">{section.content}</pre>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="flex-1 bg-[#020810] p-6 md:p-8 overflow-y-auto min-h-0 hidden md:block">
          <div className="max-w-3xl mx-auto bg-white/[0.02] border border-white/5 rounded-xl p-8 min-h-full shadow-lg">
            <pre className="font-mono nebulla-ws-text-13 text-slate-300 leading-relaxed whitespace-pre-wrap outline-none">
              {activeContent}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

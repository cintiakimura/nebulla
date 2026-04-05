import React, { useState, useEffect, useRef, useCallback } from "react";
import { getApiBase } from "../lib/api";
import { getUserId } from "../lib/auth";
import { getBackendSecretHeaders } from "../lib/storedSecrets";

const MAX_VARIANTS = 3;
const LOCKED_LS_KEY = "nebulla_locked_ui_design_v1";
const LOCKED_ROOT_CLASS = "nebulla-stitch-locked";

function sanitizeSvgForInline(svg: string): string {
  let s = svg.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  s = s.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  return s;
}

function fingerprintWorkspacePlan(planText: string): string {
  let h = 0;
  for (let i = 0; i < planText.length; i++) {
    h = (Math.imul(31, h) + planText.charCodeAt(i)) | 0;
  }
  return String(h);
}

function persistLockedDesign(svg: string, planText: string): void {
  try {
    localStorage.setItem(
      LOCKED_LS_KEY,
      JSON.stringify({
        v: 1,
        svg,
        lockedAt: new Date().toISOString(),
        planFingerprint: fingerprintWorkspacePlan(planText),
      })
    );
  } catch {
    /* quota */
  }
}

function applyLockedDesignToApp(): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.add(LOCKED_ROOT_CLASS);
}

export function syncStitchLockedRootFromStorage(): void {
  if (typeof document === "undefined") return;
  try {
    const raw = localStorage.getItem(LOCKED_LS_KEY);
    if (!raw) {
      document.documentElement.classList.remove(LOCKED_ROOT_CLASS);
      return;
    }
    const p = JSON.parse(raw) as { v?: number; svg?: string };
    if (p.v === 1 && typeof p.svg === "string" && p.svg.trim()) {
      document.documentElement.classList.add(LOCKED_ROOT_CLASS);
    } else {
      document.documentElement.classList.remove(LOCKED_ROOT_CLASS);
    }
  } catch {
    document.documentElement.classList.remove(LOCKED_ROOT_CLASS);
  }
}

export type StitchMockupPanelProps = {
  pagesText: string;
  mindMapSummary: string;
  generationNonce: number;
  onClose?: () => void;
};

function buildContext(pagesText: string, mindMapSummary: string): string {
  return (
    `MASTER PLAN / PAGES\n\n${pagesText.trim()}\n\n` +
    `MIND MAP\n\n${mindMapSummary.trim() || "(no nodes)"}`
  );
}

export function StitchMockupPanel({ pagesText, mindMapSummary, generationNonce, onClose }: StitchMockupPanelProps) {
  const [busy, setBusy] = useState(false);
  const [variants, setVariants] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const prevNonceRef = useRef(generationNonce);
  const fetchIdRef = useRef(0);
  const contextRef = useRef(buildContext(pagesText, mindMapSummary));
  contextRef.current = buildContext(pagesText, mindMapSummary);

  const fetchSvg = useCallback(async (): Promise<string> => {
    const apiBase = getApiBase() || "";
    if (!apiBase) throw new Error("Set API URL in Settings (host runs Stitch with STITCH_API_KEY).");
    const res = await fetch(`${apiBase}/api/stitch/mockup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getBackendSecretHeaders() },
      body: JSON.stringify({ context: contextRef.current, userId: await getUserId() }),
    });
    const data = (await res.json().catch(() => ({}))) as { svg?: string; error?: string };
    if (!res.ok) {
      throw new Error(typeof data.error === "string" && data.error.trim() ? data.error : `Request failed (${res.status})`);
    }
    const raw = data.svg;
    if (typeof raw !== "string" || !raw.includes("<svg")) {
      throw new Error("No SVG from server. Check STITCH_API_KEY or try again.");
    }
    return sanitizeSvgForInline(raw);
  }, []);

  const run = useCallback(
    async (mode: "replace" | "append") => {
      const id = ++fetchIdRef.current;
      setBusy(true);
      setError("");
      if (mode === "replace") {
        setVariants([]);
        setIndex(0);
      }
      try {
        const svg = await fetchSvg();
        if (fetchIdRef.current !== id) return;
        if (mode === "replace") {
          setVariants([svg]);
          setIndex(0);
        } else {
          setVariants((prev) => {
            if (prev.length >= MAX_VARIANTS) return prev;
            const next = [...prev, svg];
            setIndex(next.length - 1);
            return next;
          });
        }
      } catch (e) {
        if (fetchIdRef.current !== id) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (fetchIdRef.current === id) setBusy(false);
      }
    },
    [fetchSvg]
  );

  useEffect(() => {
    if (prevNonceRef.current === generationNonce) return;
    prevNonceRef.current = generationNonce;
    if (generationNonce === 0) return;
    void run("replace");
  }, [generationNonce, run]);

  const svg = variants[index] ?? "";
  const hasVariants = variants.length > 0;

  return (
    <div className="flex flex-col items-center justify-center h-full w-full p-6 sm:p-8 min-h-0 gap-6">
      {busy && (
        <div className="flex flex-col items-center gap-6">
          <div className="w-16 h-16 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
          <p className="text-sm text-slate-500 nebulla-ws-no-bold text-center">Stitch mockup…</p>
        </div>
      )}

      {!busy && !hasVariants && (
        <div className="flex flex-col items-center gap-5 max-w-md text-center">
          {error ? (
            <p className="text-sm text-red-400/95 nebulla-ws-no-bold border border-red-500/25 bg-red-500/10 rounded-lg px-4 py-3">{error}</p>
          ) : (
            <p className="text-sm text-slate-500 nebulla-ws-no-bold">From Master Plan + Mind Map via POST /api/stitch/mockup.</p>
          )}
          <button
            type="button"
            onClick={() => void run("replace")}
            className="px-8 py-3 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-display nebulla-ws-no-bold hover:bg-cyan-500/30 transition-colors"
          >
            Create Mockup
          </button>
        </div>
      )}

      {!busy && hasVariants && (
        <div className="flex flex-col items-center w-full max-w-5xl gap-6 min-h-0">
          <div className="w-full rounded-xl border border-white/10 bg-black/40 overflow-hidden shadow-2xl flex flex-col min-h-[240px] max-h-[min(56vh,520px)]">
            <div className="px-3 py-2 border-b border-white/10 bg-white/5 flex justify-between shrink-0">
              <span className="text-[11px] text-slate-500 font-display uppercase tracking-wider nebulla-ws-no-bold">Preview</span>
              <span className="text-[11px] text-cyan-500/80 nebulla-ws-no-bold">
                {index + 1} / {variants.length}
              </span>
            </div>
            <div
              className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-4 bg-[#020810]"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <button
              type="button"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              className="w-12 h-12 rounded-full bg-[#040f1a] border border-cyan-500/35 text-cyan-200 flex items-center justify-center hover:bg-cyan-500/15 disabled:opacity-30 disabled:pointer-events-none transition-all"
              title="Previous"
            >
              <span className="material-symbols-outlined">chevron_left</span>
            </button>

            <button
              type="button"
              onClick={() => void run("append")}
              disabled={variants.length >= MAX_VARIANTS}
              className="w-14 h-14 rounded-full bg-cyan-400 text-[#020617] flex items-center justify-center hover:bg-cyan-300 disabled:opacity-35 disabled:pointer-events-none transition-all shadow-[0_0_24px_rgba(34,211,238,0.35)]"
              title={`Regenerate (${variants.length}/${MAX_VARIANTS})`}
              aria-label="Regenerate"
            >
              <span className="material-symbols-outlined text-2xl">refresh</span>
            </button>

            <button
              type="button"
              onClick={() => setIndex((i) => Math.min(variants.length - 1, i + 1))}
              disabled={index >= variants.length - 1}
              className="w-12 h-12 rounded-full bg-[#040f1a] border border-cyan-500/35 text-cyan-200 flex items-center justify-center hover:bg-cyan-500/15 disabled:opacity-30 disabled:pointer-events-none transition-all"
              title="Next"
            >
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!svg) return;
              persistLockedDesign(sanitizeSvgForInline(svg), contextRef.current);
              applyLockedDesignToApp();
              try {
                window.dispatchEvent(new CustomEvent("nebulla:stitch-locked"));
              } catch {
                /* ignore */
              }
              onClose?.();
            }}
            className="flex items-center gap-2 px-10 py-3 rounded-full border border-cyan-500/40 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20 transition-all font-display font-medium nebulla-ws-no-bold"
          >
            <span className="material-symbols-outlined nebulla-ws-text-18">lock</span>
            Lock this design
          </button>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useRef } from "react";
import { getApiBase } from "../lib/api";
import { getUserId } from "../lib/auth";
import { getBackendSecretHeaders } from "../lib/storedSecrets";

const MAX_VARIANTS = 3;

function extractSvgFromAssistantText(text: string): string {
  let t = text.trim();
  t = t.replace(/^```(?:xml|svg)?\s*/i, "").replace(/\s*```$/i, "");
  const svgMatch = t.match(/<svg[\s\S]*<\/svg>/i);
  return svgMatch ? svgMatch[0].trim() : t;
}

async function grokSvgMockup(apiBase: string, userId: string, pagesText: string): Promise<string> {
  const prompt = `You output ONE valid SVG document only (root element <svg>...</svg>), no markdown, no prose.
Use a dark cyan / glass UI mockup style inspired by a builder IDE. Base it ONLY on this plan:

${pagesText.slice(0, 12000)}`;

  const res = await fetch(`${apiBase}/api/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getBackendSecretHeaders() },
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      userId,
      interactionMode: "code",
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { message?: { content?: string }; error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Grok error (${res.status})`);
  }
  const content = data.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Empty response from Grok");
  }
  const svg = extractSvgFromAssistantText(content);
  if (!svg.includes("<svg")) {
    throw new Error("Model did not return SVG. Try Regenerate.");
  }
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function NebullaWorkspaceStitchMockup({
  onLock,
  pagesText,
}: {
  onLock: () => void;
  pagesText: string;
}) {
  const [step, setStep] = useState<"generating" | "review">("generating");
  const [generations, setGenerations] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState("");
  const hasStartedRef = useRef(false);

  const generateMockup = async () => {
    setStep("generating");
    setError("");
    const apiBase = getApiBase() || "";
    if (!apiBase) {
      setError("Set API URL (Settings) so Grok can run.");
      setStep("review");
      return;
    }
    try {
      const userId = await getUserId();
      const url = await grokSvgMockup(apiBase, userId, pagesText);
      setGenerations((prev) => {
        const next = [...prev, url];
        setCurrentIndex(next.length - 1);
        return next;
      });
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("review");
    }
  };

  useEffect(() => {
    if (!hasStartedRef.current && generations.length === 0) {
      hasStartedRef.current = true;
      void generateMockup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const handleRegenerate = () => {
    if (generations.length < MAX_VARIANTS) {
      void generateMockup();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full w-full p-8 min-h-0">
      {step === "generating" && (
        <div className="flex flex-col items-center gap-6">
          <div className="w-16 h-16 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
          <h2 className="text-xl font-display text-cyan-100">Grok → SVG mockup…</h2>
          <p className="text-sm text-slate-500 text-center max-w-md">
            Uses POST /api/agent/chat (same stack as Builder). Stitch HTML generation stays on /api/stitch/generate.
          </p>
        </div>
      )}

      {step === "review" && (
        <div className="flex flex-col items-center w-full max-w-5xl gap-6">
          {error ? <div className="text-red-400 mb-2 text-center text-sm">{error}</div> : null}

          {generations.length > 0 ? (
            <>
              <div className="relative w-full aspect-video bg-black/40 rounded-xl border border-white/10 overflow-hidden flex items-center justify-center shadow-2xl">
                <img
                  src={generations[currentIndex]}
                  alt={`Variant ${currentIndex + 1}`}
                  className="w-full h-full object-contain bg-[#020810]"
                />

                <div className="absolute inset-x-4 flex justify-between items-center pointer-events-none">
                  <button
                    type="button"
                    onClick={() => setCurrentIndex((p) => Math.max(0, p - 1))}
                    disabled={currentIndex === 0}
                    className="pointer-events-auto w-12 h-12 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-white hover:bg-cyan-500/20 hover:border-cyan-400/50 disabled:opacity-30 transition-all backdrop-blur-md"
                  >
                    <span className="material-symbols-outlined">chevron_left</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentIndex((p) => Math.min(generations.length - 1, p + 1))}
                    disabled={currentIndex === generations.length - 1}
                    className="pointer-events-auto w-12 h-12 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-white hover:bg-cyan-500/20 hover:border-cyan-400/50 disabled:opacity-30 transition-all backdrop-blur-md"
                  >
                    <span className="material-symbols-outlined">chevron_right</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-6 mt-4 flex-wrap justify-center">
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={generations.length >= MAX_VARIANTS}
                  className="flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-cyan-500 text-black hover:bg-cyan-400 disabled:opacity-30 disabled:hover:bg-cyan-500 transition-all font-display font-medium"
                >
                  <span className="material-symbols-outlined nebulla-ws-text-18">refresh</span>
                  Regenerate ({generations.length}/{MAX_VARIANTS})
                </button>

                <button
                  type="button"
                  onClick={onLock}
                  className="flex items-center justify-center gap-2 px-8 py-3 rounded-full bg-cyan-500 text-black hover:bg-cyan-400 hover:shadow-[0_0_20px_rgba(0,255,255,0.4)] transition-all font-display font-medium"
                >
                  <span className="material-symbols-outlined nebulla-ws-text-18">lock</span>
                  Lock selection
                </button>
              </div>
            </>
          ) : !error ? (
            <button
              type="button"
              onClick={() => void generateMockup()}
              className="px-6 py-3 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-display"
            >
              Generate
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
